"""Unit tests for backend queue, token cache, and retry eligibility."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from backend import (
    BackendApiError,
    BackendClient,
    BackendQueueJob,
    BackendToken,
    FlushQueueResult,
    _is_retryable_job,
)
from config import Config


def _sample_job(**overrides) -> BackendQueueJob:
    payload = {
        "job_id": "job-1",
        "local_event_id": "local-evt-1",
        "status": "pending",
        "attempts": 0,
        "retry_limit": 2,
        "max_attempts": 3,
        "backend_event_id": None,
        "images_sent": 0,
        "logs_sent": 0,
        "last_error": None,
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
        "event": {
            "camera_id": "11111111-1111-1111-1111-111111111111",
            "plate_number": "ABC1234",
            "confidence": 0.9,
            "detection_time": "2026-01-01T00:00:00Z",
            "is_valid": True,
            "is_flagged": False,
        },
        "evidence": {"full": None, "plate": None, "annotated": None},
        "evidence_mode": "metadata",
    }
    payload.update(overrides)
    return BackendQueueJob.from_dict(payload)


class TestRetryEligibility:
    @pytest.mark.parametrize("status", ["pending", "failed"])
    def test_is_retryable_job_for_pending_and_failed(self, status):
        job = _sample_job(status=status)
        assert _is_retryable_job(job) is True

    def test_is_retryable_job_for_posting_with_backend_event_id(self):
        job = _sample_job(status="posting", backend_event_id="evt-backend-1")
        assert _is_retryable_job(job) is True

    def test_is_retryable_job_false_for_succeeded(self):
        job = _sample_job(status="succeeded")
        assert _is_retryable_job(job) is False


class TestBackendToken:
    def test_token_is_valid_within_buffer(self, backend_enabled_config, project_root):
        client = BackendClient(backend_enabled_config)
        expires = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        token = BackendToken(access_token="abc", token_type="bearer", expires_at=expires)
        assert client._token_is_valid(token) is True

    def test_token_is_invalid_when_expired(self, backend_enabled_config):
        client = BackendClient(backend_enabled_config)
        expires = (datetime.now(timezone.utc) - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        token = BackendToken(access_token="abc", token_type="bearer", expires_at=expires)
        assert client._token_is_valid(token) is False

    def test_save_and_load_token_roundtrip(self, backend_enabled_config):
        client = BackendClient(backend_enabled_config)
        token = BackendToken(
            access_token="token-value",
            token_type="bearer",
            expires_at="2099-01-01T00:00:00Z",
        )
        client.save_token(token)
        loaded = client.load_token()
        assert loaded is not None
        assert loaded.access_token == "token-value"


class TestBackendQueue:
    def test_flush_queue_when_backend_disabled(self, minimal_config):
        client = BackendClient(minimal_config)
        result = client.flush_queue()
        assert result.success is True
        assert result.processed == 0
        assert "disabled" in result.message.lower()

    def test_enqueue_and_read_queue_roundtrip(self, backend_enabled_config):
        client = BackendClient(backend_enabled_config)
        finalized_event = {
            "event_id": "local-run-track_1",
            "plate_number": "ABC1234",
            "confidence": 0.91,
            "last_seen_at": 1_700_000_000.0,
            "created_at": "2026-01-01T00:00:00Z",
            "source_type": "image",
            "evidence": {},
        }
        enqueue = client.enqueue_event(finalized_event)
        assert enqueue.success is True
        jobs, malformed = client.read_queue()
        assert malformed == 0
        assert len(jobs) == 1
        assert jobs[0].local_event_id == "local-run-track_1"

    def test_flush_queue_processes_successful_job(self, backend_enabled_config, monkeypatch):
        client = BackendClient(backend_enabled_config)
        enqueue = client.enqueue_event(
            {
                "event_id": "local-run-track_2",
                "plate_number": "PMK8811",
                "confidence": 0.88,
                "last_seen_at": 1_700_000_000.0,
                "created_at": "2026-01-01T00:00:00Z",
                "source_type": "video",
                "evidence": {},
            }
        )
        assert enqueue.success is True

        monkeypatch.setattr(client, "verify_camera_identity", lambda: None)
        monkeypatch.setattr(
            client,
            "_process_job",
            lambda job, all_jobs=None, job_index=None: _sample_job(
                job_id=job.job_id,
                local_event_id=job.local_event_id,
                status="succeeded",
                backend_event_id="backend-evt-1",
            ),
        )

        result = client.flush_queue()
        assert isinstance(result, FlushQueueResult)
        assert result.success is True
        assert result.succeeded == 1

    def test_flush_queue_marks_exhausted_jobs(self, backend_enabled_config, monkeypatch):
        client = BackendClient(backend_enabled_config)
        exhausted_job = _sample_job(status="failed", attempts=3, max_attempts=3)
        client.write_queue([exhausted_job])
        monkeypatch.setattr(client, "verify_camera_identity", lambda: None)

        result = client.flush_queue()
        assert result.exhausted == 1
        jobs, _ = client.read_queue()
        assert jobs[0].status == "exhausted"

    def test_flush_queue_skips_validation_failed_jobs(self, backend_enabled_config, monkeypatch):
        client = BackendClient(backend_enabled_config)
        client.write_queue([_sample_job(status="validation_failed")])
        monkeypatch.setattr(client, "verify_camera_identity", lambda: None)

        result = client.flush_queue()
        assert result.skipped == 1
        assert result.processed == 0

    def test_malformed_queue_line_is_quarantined(self, backend_enabled_config):
        client = BackendClient(backend_enabled_config)
        queue_path = Path(backend_enabled_config.backend_queue_file)
        queue_path.parent.mkdir(parents=True, exist_ok=True)
        queue_path.write_text("{not-json}\n", encoding="utf-8")

        jobs, malformed = client.read_queue()
        assert jobs == []
        assert malformed == 1
        assert client.bad_queue_path.is_file()

    def test_build_event_payload_does_not_include_vehicle_id(self, backend_enabled_config):
        client = BackendClient(backend_enabled_config)
        payload = client.build_event_payload(
            {
                "plate_number": "abc-1234",
                "confidence": 1.5,
                "created_at": "2026-01-01T00:00:00Z",
                "source_type": "image",
            }
        )
        assert "vehicle_id" not in payload
        assert "camera_id" not in payload
        assert "is_flagged" not in payload
        assert payload["plate_number"] == "ABC-1234"
        assert payload["confidence"] == 1.0

    def test_old_queued_job_matching_camera_id_is_stripped_and_posted(
        self, backend_enabled_config, monkeypatch
    ):
        client = BackendClient(backend_enabled_config)
        camera_id = "11111111-1111-1111-1111-111111111111"
        job = _sample_job()
        client.write_queue([job])

        monkeypatch.setattr(client, "verify_camera_identity", lambda: None)
        monkeypatch.setattr(client, "_authenticated_camera_id", lambda: camera_id)
        posted_events: list[dict] = []

        def fake_request(method, path, body, **kwargs):
            if path == "/anpr-events":
                posted_events.append(body)
                return {"data": {"id": "backend-evt-1"}}
            return {}

        monkeypatch.setattr(client, "_request", fake_request)

        result = client.flush_queue()
        assert result.succeeded == 1
        assert posted_events
        assert "camera_id" not in posted_events[0]

        jobs, _ = client.read_queue()
        assert "camera_id" not in jobs[0].event

    def test_old_queued_job_conflicting_camera_id_becomes_validation_failed(
        self, backend_enabled_config, monkeypatch
    ):
        client = BackendClient(backend_enabled_config)
        job = _sample_job(
            event={
                "camera_id": "22222222-2222-2222-2222-222222222222",
                "plate_number": "ABC1234",
                "confidence": 0.9,
                "detection_time": "2026-01-01T00:00:00Z",
                "is_valid": True,
            }
        )
        client.write_queue([job])

        monkeypatch.setattr(client, "verify_camera_identity", lambda: None)
        monkeypatch.setattr(
            client,
            "_authenticated_camera_id",
            lambda: "11111111-1111-1111-1111-111111111111",
        )
        post_called = {"value": False}

        def fake_request(method, path, body, **kwargs):
            if path == "/anpr-events":
                post_called["value"] = True
            return {"data": {"id": "backend-evt-1"}}

        monkeypatch.setattr(client, "_request", fake_request)

        result = client.flush_queue()
        assert post_called["value"] is False
        jobs, _ = client.read_queue()
        assert jobs[0].status == "validation_failed"
        assert "does not match authenticated camera" in (jobs[0].last_error or "")

    def test_existing_job_with_backend_event_id_does_not_repost_event(
        self, backend_enabled_config, monkeypatch
    ):
        client = BackendClient(backend_enabled_config)
        job = _sample_job(
            status="posting",
            backend_event_id="existing-backend-evt",
            images_sent=0,
            logs_sent=0,
        )
        client.write_queue([job])

        monkeypatch.setattr(client, "verify_camera_identity", lambda: None)
        post_called = {"value": False}

        def fake_request(method, path, body, **kwargs):
            if path == "/anpr-events":
                post_called["value"] = True
            return {"data": {"id": "ignored"}}

        monkeypatch.setattr(client, "_request", fake_request)
        monkeypatch.setattr(client, "_send_stage_log_if_pending", lambda *args, **kwargs: None)
        monkeypatch.setattr(client, "_send_pending_image_metadata", lambda *args, **kwargs: None)
        monkeypatch.setattr(client, "_pending_image_types", lambda job: [])
        monkeypatch.setattr(client, "_pending_log_stages", lambda job: [])

        client.flush_queue()
        assert post_called["value"] is False


class TestEvidenceModeMigration:
    def test_legacy_job_without_mode_and_path_evidence_becomes_metadata(self):
        payload = {
            "job_id": "legacy-1",
            "local_event_id": "local-1",
            "status": "pending",
            "attempts": 0,
            "retry_limit": 2,
            "max_attempts": 3,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "event": {"plate_number": "ABC1234", "confidence": 0.9},
            "evidence": {"full": "runs/run_1/evidence/full.jpg", "plate": None, "annotated": None},
        }
        job = BackendQueueJob.from_dict(payload)
        assert job.evidence_mode == "metadata"

    def test_legacy_job_without_mode_and_no_paths_uses_config_mode(
        self, backend_enabled_config
    ):
        backend_enabled_config.evidence_mode = "upload"
        payload = {
            "job_id": "legacy-2",
            "local_event_id": "local-2",
            "status": "pending",
            "attempts": 0,
            "retry_limit": 2,
            "max_attempts": 3,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "event": {"plate_number": "ABC1234", "confidence": 0.9},
            "evidence": {"full": None, "plate": None, "annotated": None},
        }
        job = BackendQueueJob.from_dict(payload, config=backend_enabled_config)
        assert job.evidence_mode == "upload"

    def test_explicit_metadata_mode_is_preserved(self):
        job = _sample_job(evidence_mode="metadata")
        assert job.evidence_mode == "metadata"

    def test_explicit_upload_mode_is_preserved(self):
        job = _sample_job(evidence_mode="upload")
        assert job.evidence_mode == "upload"

    def test_enqueue_uses_current_config_evidence_mode(self, backend_enabled_config):
        backend_enabled_config.evidence_mode = "upload"
        client = BackendClient(backend_enabled_config)
        enqueue = client.enqueue_event(
            {
                "event_id": "local-run-mode-1",
                "plate_number": "ABC1234",
                "confidence": 0.9,
                "created_at": "2026-01-01T00:00:00Z",
                "source_type": "image",
                "evidence": {},
            }
        )
        assert enqueue.success is True
        jobs, _ = client.read_queue()
        assert jobs[0].evidence_mode == "upload"

    def test_flush_uses_stored_mode_not_later_env_change(
        self, backend_enabled_config, monkeypatch
    ):
        client = BackendClient(backend_enabled_config)
        camera_id = "11111111-1111-1111-1111-111111111111"
        job = _sample_job(evidence_mode="metadata")
        client.write_queue([job])

        # Later .env would prefer upload; stored job mode must win.
        backend_enabled_config.evidence_mode = "upload"
        client.config = backend_enabled_config

        modes_seen: list[str] = []

        def fake_metadata(job, *args, **kwargs):
            modes_seen.append(job.evidence_mode)

        def fake_upload(job, *args, **kwargs):
            modes_seen.append(f"upload:{job.evidence_mode}")

        monkeypatch.setattr(client, "verify_camera_identity", lambda: None)
        monkeypatch.setattr(client, "_authenticated_camera_id", lambda: camera_id)
        monkeypatch.setattr(
            client,
            "_request",
            lambda method, path, body, **kwargs: {"data": {"id": "backend-evt-mode"}},
        )
        monkeypatch.setattr(client, "_send_stage_log_if_pending", lambda *args, **kwargs: None)
        monkeypatch.setattr(client, "_send_pending_image_metadata", fake_metadata)
        monkeypatch.setattr(client, "_send_pending_image_uploads", fake_upload)
        monkeypatch.setattr(client, "_pending_image_types", lambda job: [])
        monkeypatch.setattr(client, "_pending_log_stages", lambda job: [])
        monkeypatch.setattr(client, "_delete_local_evidence_if_configured", lambda job: None)

        result = client.flush_queue()
        assert result.succeeded == 1
        assert modes_seen == ["metadata"]
        jobs, _ = client.read_queue()
        assert jobs[0].evidence_mode == "metadata"
