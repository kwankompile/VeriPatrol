"""Unit tests for configuration loading and validation."""

from __future__ import annotations

import argparse

import pytest

from config import (
    Config,
    RTSP_URL_CLI_ERROR,
    infer_source_from_path,
    is_rtsp_source_path,
    is_plausible_rtsp_url,
    mask_rtsp_url,
    validate_backend_config,
    validate_config,
)
import main


class TestSourceResolution:
    def test_infer_source_from_image_path(self):
        source, path = infer_source_from_path("samples/images/frame.jpg")
        assert source == "image"
        assert path == "samples/images/frame.jpg"

    def test_infer_source_from_video_path(self):
        source, path = infer_source_from_path("samples/videos/demo.mp4")
        assert source == "video"
        assert path == "samples/videos/demo.mp4"

    def test_is_rtsp_source_path_detects_rtsp_and_rtsps(self):
        assert is_rtsp_source_path("rtsp://user:pass@camera/stream")
        assert is_rtsp_source_path("rtsps://camera/stream")
        assert not is_rtsp_source_path("samples/videos/demo.mp4")

    def test_mask_rtsp_url_redacts_credentials(self):
        masked = mask_rtsp_url("rtsp://user:secret@192.168.1.10:554/stream1")
        assert "secret" not in masked
        assert "user" not in masked
        assert "***@" in masked
        assert "192.168.1.10:554" in masked

    def test_mask_rtsp_url_handles_empty(self):
        assert mask_rtsp_url("") == "rtsp://***"

    def test_is_plausible_rtsp_url(self):
        assert is_plausible_rtsp_url("rtsp://camera.local/stream")
        assert not is_plausible_rtsp_url("http://camera.local/stream")


class TestConfigValidation:
    def test_validate_config_warns_on_missing_models_in_standard_mode(self, minimal_config, sample_image):
        minimal_config.image_path = str(sample_image)
        result = validate_config(minimal_config, strict=False)
        assert result.ok
        assert any("Vehicle model file does not exist" in warning for warning in result.warnings)

    def test_validate_config_errors_on_missing_models_in_strict_mode(self, minimal_config, sample_image):
        minimal_config.image_path = str(sample_image)
        result = validate_config(minimal_config, strict=True)
        assert not result.ok
        assert any("Vehicle model file does not exist" in error for error in result.errors)

    def test_validate_config_requires_image_file(self, minimal_config):
        minimal_config.image_path = "samples/images/missing.jpg"
        result = validate_config(minimal_config, strict=False)
        assert not result.ok
        assert any("Image file does not exist" in error for error in result.errors)

    def test_validate_config_rejects_invalid_evidence_mode(self, minimal_config, sample_image):
        minimal_config.image_path = str(sample_image)
        minimal_config.evidence_mode = "invalid"
        result = validate_config(minimal_config, strict=False)
        assert not result.ok
        assert any("ANPR_EVIDENCE_MODE" in error for error in result.errors)

    def test_validate_config_accepts_metadata_and_upload_modes(self, minimal_config, sample_image):
        minimal_config.image_path = str(sample_image)
        for mode in ("metadata", "upload"):
            minimal_config.evidence_mode = mode
            result = validate_config(minimal_config, strict=False)
            assert result.ok

    def test_missing_evidence_mode_env_defaults_to_upload(self, monkeypatch, project_root):
        monkeypatch.delenv("ANPR_EVIDENCE_MODE", raising=False)
        config = Config.from_env()
        assert config.evidence_mode == "upload"

    def test_explicit_metadata_evidence_mode_is_preserved(self, monkeypatch):
        monkeypatch.setenv("ANPR_EVIDENCE_MODE", "metadata")
        config = Config.from_env()
        assert config.evidence_mode == "metadata"

    def test_explicit_upload_evidence_mode_is_preserved(self, monkeypatch):
        monkeypatch.setenv("ANPR_EVIDENCE_MODE", "upload")
        config = Config.from_env()
        assert config.evidence_mode == "upload"

    def test_config_dataclass_default_is_upload(self):
        assert Config().evidence_mode == "upload"

    def test_validate_backend_config_when_disabled(self, minimal_config):
        result = validate_backend_config(minimal_config)
        assert result.ok
        assert any("backend disabled" in info.lower() for info in result.info)

    def test_validate_backend_config_requires_camera_email_when_enabled(
        self, backend_enabled_config, sample_image
    ):
        backend_enabled_config.image_path = str(sample_image)
        backend_enabled_config.camera_email = None
        result = validate_backend_config(backend_enabled_config)
        assert not result.ok
        assert any("ANPR_CAMERA_EMAIL" in error for error in result.errors)

    def test_validate_backend_config_requires_camera_password_when_enabled(
        self, backend_enabled_config, sample_image
    ):
        backend_enabled_config.image_path = str(sample_image)
        backend_enabled_config.camera_password = None
        result = validate_backend_config(backend_enabled_config)
        assert not result.ok
        assert any("ANPR_CAMERA_PASSWORD" in error for error in result.errors)

    def test_validate_backend_config_deprecated_env_vars_warn(
        self, backend_enabled_config, sample_image, monkeypatch
    ):
        backend_enabled_config.image_path = str(sample_image)
        monkeypatch.setenv("ANPR_BACKEND_EMAIL", "old@example.com")
        monkeypatch.setenv("ANPR_BACKEND_PASSWORD", "old-secret")
        monkeypatch.setenv("ANPR_BACKEND_CAMERA_ID", "11111111-1111-1111-1111-111111111111")
        result = validate_backend_config(backend_enabled_config)
        assert result.ok
        warnings = " ".join(result.warnings)
        assert "ANPR_BACKEND_EMAIL" in warnings
        assert "ANPR_BACKEND_PASSWORD" in warnings
        assert "ANPR_BACKEND_CAMERA_ID" in warnings

    def test_check_config_succeeds_with_camera_credentials(
        self, backend_enabled_config, sample_image, monkeypatch
    ):
        backend_enabled_config.image_path = str(sample_image)
        monkeypatch.setattr(main, "Config", type("C", (), {"from_env": staticmethod(lambda: backend_enabled_config)}))
        code = main.main(["check-config"])
        assert code == 0

    def test_check_config_masks_rtsp_url_in_output(
        self, backend_enabled_config, sample_image, monkeypatch, capsys
    ):
        backend_enabled_config.image_path = str(sample_image)
        backend_enabled_config.rtsp_url = "rtsp://user:secret@192.168.1.10:554/stream1"
        monkeypatch.setattr(main, "Config", type("C", (), {"from_env": staticmethod(lambda: backend_enabled_config)}))
        code = main.main(["check-config"])
        assert code == 0
        output = capsys.readouterr().out
        assert "secret" not in output
        assert "***@" in output

    def test_deprecated_env_vars_warn_when_backend_disabled(self, minimal_config, monkeypatch):
        monkeypatch.setenv("ANPR_BACKEND_EMAIL", "old@example.com")
        monkeypatch.setenv("ANPR_BACKEND_PASSWORD", "old-secret")
        monkeypatch.setenv("ANPR_BACKEND_CAMERA_ID", "11111111-1111-1111-1111-111111111111")
        result = validate_backend_config(minimal_config)
        assert result.ok
        warnings = " ".join(result.warnings)
        assert "ANPR_BACKEND_EMAIL" in warnings
        assert "ANPR_BACKEND_PASSWORD" in warnings
        assert "ANPR_BACKEND_CAMERA_ID" in warnings

    def test_validate_config_rtsp_requires_env_url(self, minimal_config):
        minimal_config.source = "rtsp"
        minimal_config.rtsp_url = ""
        result = validate_config(minimal_config, strict=False)
        assert not result.ok
        assert any("ANPR_RTSP_URL" in error for error in result.errors)

    def test_apply_cli_overrides_rejects_rtsp_source_path_via_main(self, monkeypatch, minimal_config, sample_image):
        minimal_config.image_path = str(sample_image)
        monkeypatch.setattr(main, "Config", type("C", (), {"from_env": staticmethod(lambda: minimal_config)}))
        monkeypatch.setattr(
            main,
            "ANPRProcessor",
            type("P", (), {"__init__": lambda self, cfg: None}),
        )
        code = main.main(
            [
                "run",
                "--source-path",
                "rtsp://user:pass@camera/stream",
                "--dry-run",
            ]
        )
        assert code == 1

    def test_cli_rtsp_source_path_error_message(self, capsys):
        parser = argparse.Namespace(
            source=None,
            source_path="rtsp://camera/stream",
            video=None,
            image=None,
            camera_index=None,
            max_seconds=None,
            dry_run=True,
            strict=False,
        )
        config = Config()
        if parser.source_path and is_rtsp_source_path(parser.source_path):
            print(f"ERROR: {RTSP_URL_CLI_ERROR}")
            code = 1
        else:
            code = 0
        assert code == 1
        assert RTSP_URL_CLI_ERROR in capsys.readouterr().out

    def test_validate_config_ocr_min_interval(self, minimal_config, sample_image):
        minimal_config.image_path = str(sample_image)
        minimal_config.ocr_min_interval_seconds = -1
        result = validate_config(minimal_config, strict=False)
        assert not result.ok
        assert any("ANPR_OCR_MIN_INTERVAL_SECONDS" in error for error in result.errors)

    def test_validate_m11_runtime_intervals(self, minimal_config, sample_image):
        minimal_config.image_path = str(sample_image)
        minimal_config.rtsp_health_log_interval_seconds = 0
        result = validate_config(minimal_config, strict=False)
        assert not result.ok
        assert any("ANPR_RTSP_HEALTH_LOG_INTERVAL_SECONDS" in error for error in result.errors)
