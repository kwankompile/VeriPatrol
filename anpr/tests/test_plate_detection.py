"""Unit tests for padded crop plate detection and full-frame fallback."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from anpr import (
    ANPRProcessor,
    Detection,
    FramePacket,
    OCRReading,
    RuntimeMetrics,
    TrackState,
    associate_plates_to_vehicles,
    expand_bbox,
    filter_fallback_duplicate_plates,
    vehicle_crop_padding_ratio,
)
from config import Config


def _packet(frame_index: int = 0) -> FramePacket:
    return FramePacket(
        frame_index=frame_index,
        timestamp=1.0,
        image=np.zeros((200, 300, 3), dtype=np.uint8),
        source_type="image",
        source_path="samples/images/test.jpg",
        is_last=True,
    )


def _track(track_id: int, bbox: tuple[int, int, int, int]) -> TrackState:
    return TrackState(
        track_id=track_id,
        bbox=bbox,
        first_seen_at=0.0,
        last_seen_at=0.0,
        first_frame_index=0,
        last_frame_index=0,
    )


class TestExpandBbox:
    def test_expand_bbox_adds_padding(self):
        expanded = expand_bbox((50, 50, 100, 100), 300, 200, padding_ratio=0.20)
        assert expanded == (40, 40, 110, 110)

    def test_expand_bbox_clips_to_frame_bounds(self):
        expanded = expand_bbox((0, 0, 20, 20), 100, 100, padding_ratio=0.50)
        assert expanded == (0, 0, 30, 30)

    def test_expand_bbox_returns_none_for_degenerate_box(self):
        assert expand_bbox((10, 10, 10, 10), 100, 100) is None


class TestVehicleCropPadding:
    def test_motorcycle_uses_motorcycle_crop_padding(self):
        processor = ANPRProcessor(
            Config(
                vehicle_crop_padding_ratio=0.20,
                motorcycle_crop_padding_ratio=0.35,
            )
        )
        processor._models_loaded = True
        processor._plate_model = MagicMock()
        processor._plate_model.predict.return_value = []

        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        motorcycle = Detection(
            bbox=(10, 10, 60, 60),
            confidence=0.9,
            class_name="motorcycle",
        )
        car = Detection(bbox=(80, 10, 130, 60), confidence=0.9, class_name="car")

        with patch("anpr.expand_bbox", wraps=expand_bbox) as expand_mock:
            processor.detect_plates(frame, motorcycle, RuntimeMetrics(), source="crop")
            processor.detect_plates(frame, car, RuntimeMetrics(), source="crop")

        motorcycle_call = expand_mock.call_args_list[0]
        car_call = expand_mock.call_args_list[1]
        assert motorcycle_call.kwargs["padding_ratio"] == pytest.approx(0.35)
        assert car_call.kwargs["padding_ratio"] == pytest.approx(0.20)

    def test_vehicle_crop_padding_ratio_helper(self):
        motorcycle = Detection(bbox=(0, 0, 1, 1), confidence=1.0, class_name="motorcycle")
        car = Detection(bbox=(0, 0, 1, 1), confidence=1.0, class_name="car")
        assert vehicle_crop_padding_ratio(
            motorcycle, default_ratio=0.20, motorcycle_ratio=0.35
        ) == pytest.approx(0.35)
        assert vehicle_crop_padding_ratio(
            car, default_ratio=0.20, motorcycle_ratio=0.35
        ) == pytest.approx(0.20)


class TestPlateDetectionFallback:
    def _processor(self) -> ANPRProcessor:
        processor = ANPRProcessor(Config(source="image", runs_dir="runs"))
        processor._models_loaded = True
        processor._plate_model = MagicMock()
        return processor

    def test_fallback_runs_when_all_crop_detections_empty(self):
        processor = self._processor()
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        vehicle_a = Detection(bbox=(10, 10, 60, 60), confidence=0.9, class_name="motorcycle")
        vehicle_b = Detection(bbox=(80, 10, 130, 60), confidence=0.88, class_name="motorcycle")
        matched = [
            (_track(1, vehicle_a.bbox), vehicle_a),
            (_track(2, vehicle_b.bbox), vehicle_b),
        ]

        call_log: list[str] = []

        def fake_detect(frame_arg, vehicle, metrics_arg, *, source="crop"):
            del frame_arg, metrics_arg
            if vehicle is not None:
                call_log.append("crop")
                return []
            call_log.append("fallback")
            return [Detection(bbox=(20, 45, 50, 55), confidence=0.42)]

        processor.detect_plates = fake_detect  # type: ignore[method-assign]

        plates_by_track = processor._detect_plates_for_tracks(
            frame, matched, RuntimeMetrics()
        )

        assert call_log.count("crop") == 2
        assert call_log.count("fallback") == 1
        assert plates_by_track[1][0][0].confidence == pytest.approx(0.42)
        assert plates_by_track[1][0][1] == "fallback"

    def test_fallback_runs_when_one_crop_succeeds_and_another_track_missed(self):
        processor = self._processor()
        metrics = RuntimeMetrics()
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        vehicle_a = Detection(bbox=(10, 10, 60, 60), confidence=0.9, class_name="motorcycle")
        vehicle_b = Detection(bbox=(80, 10, 130, 60), confidence=0.88, class_name="motorcycle")
        matched = [
            (_track(1, vehicle_a.bbox), vehicle_a),
            (_track(2, vehicle_b.bbox), vehicle_b),
        ]
        crop_plate = Detection(bbox=(20, 45, 50, 55), confidence=0.55)
        fallback_plate = Detection(bbox=(85, 45, 110, 55), confidence=0.40)
        call_log: list[str] = []

        def fake_detect(frame_arg, vehicle, metrics_arg, *, source="crop"):
            del frame_arg, metrics_arg, source
            if vehicle is vehicle_a:
                call_log.append("crop_a")
                return [crop_plate]
            if vehicle is vehicle_b:
                call_log.append("crop_b")
                return []
            call_log.append("fallback")
            return [fallback_plate]

        processor.detect_plates = fake_detect  # type: ignore[method-assign]

        plates_by_track = processor._detect_plates_for_tracks(frame, matched, metrics)

        assert call_log.count("fallback") == 1
        assert plates_by_track[1] == [(crop_plate, "crop")]
        assert plates_by_track[2] == [(fallback_plate, "fallback")]
        assert metrics.plate_detection_full_frame_fallback_calls == 0

    def test_fallback_not_called_when_all_tracks_have_crop_plates(self):
        processor = self._processor()
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        vehicle = Detection(bbox=(10, 10, 60, 60), confidence=0.9, class_name="motorcycle")
        matched = [(_track(1, vehicle.bbox), vehicle)]
        crop_plate = Detection(bbox=(20, 45, 50, 55), confidence=0.55)

        def fake_detect(frame_arg, vehicle_arg, metrics_arg, *, source="crop"):
            del frame_arg, metrics_arg, source
            if vehicle_arg is not None:
                return [crop_plate]
            raise AssertionError("fallback should not run when all tracks have crop plates")

        processor.detect_plates = fake_detect  # type: ignore[method-assign]

        plates_by_track = processor._detect_plates_for_tracks(
            frame, matched, RuntimeMetrics()
        )

        assert plates_by_track[1] == [(crop_plate, "crop")]

    def test_fallback_assigned_only_to_missed_tracks(self):
        processor = self._processor()
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        vehicle_a = Detection(bbox=(10, 10, 60, 60), confidence=0.9, class_name="motorcycle")
        vehicle_b = Detection(bbox=(80, 10, 130, 60), confidence=0.88, class_name="motorcycle")
        matched = [
            (_track(1, vehicle_a.bbox), vehicle_a),
            (_track(2, vehicle_b.bbox), vehicle_b),
        ]
        crop_plate = Detection(bbox=(20, 45, 50, 55), confidence=0.55)
        fallback_plate = Detection(bbox=(85, 45, 110, 55), confidence=0.40)

        def fake_detect(frame_arg, vehicle, metrics_arg, *, source="crop"):
            del frame_arg, metrics_arg, source
            if vehicle is vehicle_a:
                return [crop_plate]
            if vehicle is vehicle_b:
                return []
            return [crop_plate, fallback_plate]

        processor.detect_plates = fake_detect  # type: ignore[method-assign]

        plates_by_track = processor._detect_plates_for_tracks(
            frame, matched, RuntimeMetrics()
        )

        assert plates_by_track[1] == [(crop_plate, "crop")]
        assert plates_by_track[2] == [(fallback_plate, "fallback")]

    def test_fallback_duplicate_filtering_prevents_crop_plate_reassignment(self):
        shared_plate = Detection(bbox=(20, 45, 50, 55), confidence=0.55)
        filtered = filter_fallback_duplicate_plates(
            [shared_plate],
            [shared_plate],
        )
        assert filtered == []

    def test_associate_plates_prefers_vehicle_containing_plate_center(self):
        vehicle_a = Detection(bbox=(10, 10, 60, 60), confidence=0.9)
        vehicle_b = Detection(bbox=(80, 10, 130, 60), confidence=0.9)
        matched = [
            (_track(1, vehicle_a.bbox), vehicle_a),
            (_track(2, vehicle_b.bbox), vehicle_b),
        ]
        plate = Detection(bbox=(85, 45, 110, 55), confidence=0.4)

        associated = associate_plates_to_vehicles(
            [plate],
            matched,
            frame_width=160,
            frame_height=120,
        )

        assert associated[2] == [plate]
        assert associated[1] == []


class TestOcrRejectionDiagnostics:
    def _processor(self, run_dir: Path) -> ANPRProcessor:
        processor = ANPRProcessor(
            Config(
                source="image",
                runs_dir="runs",
                debug_detections=True,
                min_ocr_confidence=0.5,
            )
        )
        processor._run_dir = run_dir
        processor._ocr_engine = MagicMock()
        return processor

    def test_ocr_rejection_reason_metrics_are_recorded(self, tmp_path):
        processor = self._processor(tmp_path / "run_test")
        metrics = RuntimeMetrics()
        frame = np.zeros((80, 120, 3), dtype=np.uint8)
        frame[30:50, 40:80] = 255
        plate = Detection(bbox=(40, 30, 80, 50), confidence=0.8)
        vehicle = Detection(bbox=(10, 10, 100, 70), confidence=0.9)

        processor._ocr_engine.ocr.return_value = [
            [[None, ("AB", 0.2)]]
        ]

        result = processor._process_plate_detection(
            frame,
            plate,
            vehicle,
            metrics,
            track=_track(1, vehicle.bbox),
            timestamp=1.0,
            frame_index=0,
            source="crop",
        )

        assert result is None
        assert metrics.plate_candidates_rejected == 1
        assert metrics.plate_candidate_rejection_reasons == {"ocr_low_confidence": 1}

    def test_debug_ocr_jsonl_written_when_debug_enabled(self, tmp_path):
        processor = self._processor(tmp_path / "run_debug")
        metrics = RuntimeMetrics()
        frame = np.zeros((80, 120, 3), dtype=np.uint8)
        frame[30:50, 40:80] = 255
        plate = Detection(bbox=(40, 30, 80, 50), confidence=0.8)
        vehicle = Detection(bbox=(10, 10, 100, 70), confidence=0.9)

        processor._ocr_engine.ocr.return_value = [
            [[None, ("ABC", 0.95)]]
        ]

        processor._process_plate_detection(
            frame,
            plate,
            vehicle,
            metrics,
            track=_track(1, vehicle.bbox),
            timestamp=1.0,
            frame_index=3,
            source="fallback",
        )

        debug_path = processor._run_dir / "debug" / "plate_ocr_debug.jsonl"
        assert debug_path.is_file()
        row = json.loads(debug_path.read_text(encoding="utf-8").strip())
        assert row["frame_index"] == 3
        assert row["track_id"] == 1
        assert row["source"] == "fallback"
        assert row["raw_ocr_text"] == "ABC"
        assert row["normalized_text"] == "ABC"
        assert row["accepted"] is False
        assert row["rejection_reason"] == "invalid_too_short"
        rejected_dir = processor._run_dir / "debug" / "rejected_plates"
        assert any(rejected_dir.glob("*.jpg"))

    def test_empty_ocr_records_rejection_reason(self, tmp_path):
        processor = self._processor(tmp_path / "run_empty")
        metrics = RuntimeMetrics()
        frame = np.zeros((80, 120, 3), dtype=np.uint8)
        frame[30:50, 40:80] = 255
        plate = Detection(bbox=(40, 30, 80, 50), confidence=0.8)
        vehicle = Detection(bbox=(10, 10, 100, 70), confidence=0.9)
        processor._ocr_engine.ocr.return_value = None

        with patch.object(processor, "read_plate_text", return_value=None):
            processor._process_plate_detection(
                frame,
                plate,
                vehicle,
                metrics,
                track=_track(1, vehicle.bbox),
                timestamp=1.0,
                frame_index=0,
                source="crop",
            )

        assert metrics.plate_candidate_rejection_reasons == {"empty_ocr": 1}


class TestImageSourceFinalization:
    def test_image_source_can_finalize_with_one_valid_plate_vote(self):
        processor = ANPRProcessor(
            Config(source="image", min_plate_votes=2, runs_dir="runs")
        )
        processor._run_dir = Path("runs/test_run")
        processor._events_file = processor._run_dir / "events.jsonl"
        processor._events_file.parent.mkdir(parents=True, exist_ok=True)
        processor._events_file.write_text("", encoding="utf-8")
        processor._run_id = "test_run"
        processor._dry_run = True
        processor._ensure_evidence_dirs(processor._run_dir)

        track = _track(1, (10, 10, 60, 60))
        from anpr import PlateVote

        track.plate_votes.append(
            PlateVote(
                plate_text="JKE9900",
                raw_text="JKE9900",
                confidence=0.9,
                timestamp=1.0,
                frame_index=0,
                plate_bbox=(20, 45, 50, 55),
                vehicle_bbox=(10, 10, 60, 60),
            )
        )
        metrics = RuntimeMetrics()
        result = processor.finalize_track(track, "source_end", metrics)

        assert result is not None
        assert result.plate_number == "JKE9900"
        assert metrics.tracks_finalized_source_end == 1
        assert metrics.track_finalizations_rejected == 0
