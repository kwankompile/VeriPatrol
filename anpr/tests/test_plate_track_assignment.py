"""Unit tests for plate-to-track assignment and same-frame OCR throttling."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import numpy as np
import pytest

from anpr import (
    ANPRProcessor,
    Detection,
    FramePacket,
    OCRFragment,
    OCRReading,
    RuntimeMetrics,
    TrackState,
    assemble_ocr_fragments,
    assign_plates_to_tracks,
    deduplicate_plate_detections,
)
from config import Config


def _track(track_id: int, bbox: tuple[int, int, int, int]) -> TrackState:
    return TrackState(
        track_id=track_id,
        bbox=bbox,
        first_seen_at=0.0,
        last_seen_at=0.0,
        first_frame_index=0,
        last_frame_index=0,
    )


class TestPlateToTrackAssignment:
    def test_overlapping_crop_reassigns_plates_to_best_track(self):
        vehicle_a = Detection(
            bbox=(10, 10, 90, 70), confidence=0.9, class_name="motorcycle"
        )
        vehicle_b = Detection(
            bbox=(100, 10, 180, 70), confidence=0.88, class_name="motorcycle"
        )
        plate_jrk = Detection(bbox=(40, 45, 70, 58), confidence=0.8)
        plate_jwg = Detection(bbox=(130, 45, 160, 58), confidence=0.79)
        matched = [
            (_track(1, vehicle_a.bbox), vehicle_a),
            (_track(2, vehicle_b.bbox), vehicle_b),
        ]

        assigned = assign_plates_to_tracks(
            [(plate_jrk, "crop"), (plate_jwg, "crop")],
            matched,
            frame_width=200,
            frame_height=120,
        )

        assert assigned[1][0][0] is plate_jrk
        assert assigned[2][0][0] is plate_jwg

    def test_deduplicate_plate_detections_keeps_highest_confidence(self):
        plate_a = Detection(bbox=(40, 45, 70, 58), confidence=0.8)
        plate_b = Detection(bbox=(41, 46, 71, 59), confidence=0.6)
        deduped = deduplicate_plate_detections([(plate_a, "crop"), (plate_b, "crop")])
        assert len(deduped) == 1
        assert deduped[0][0] is plate_a


class TestSameFrameOcrThrottle:
    def test_image_source_never_throttles_ocr(self):
        processor = ANPRProcessor(Config(source="image", ocr_min_interval_seconds=0.35))
        track = _track(1, (10, 10, 90, 70))
        track.plate_votes.append(MagicMock())
        track.last_ocr_at = 1.0
        track.last_ocr_frame_index = 0
        track.last_ocr_plate_bbox = (40, 45, 70, 58)

        should_throttle, reason = processor.should_throttle_ocr_for_track(
            track,
            timestamp=1.1,
            frame_index=0,
            plate_bbox=(130, 45, 160, 58),
        )
        assert should_throttle is False
        assert reason is None

    def test_distinct_plate_boxes_same_frame_are_not_throttled(self):
        processor = ANPRProcessor(Config(source="video", ocr_min_interval_seconds=0.35))
        track = _track(1, (10, 10, 90, 70))
        track.plate_votes.append(MagicMock())
        track.last_ocr_at = 1.0
        track.last_ocr_frame_index = 0
        track.last_ocr_plate_bbox = (40, 45, 70, 58)

        should_throttle, reason = processor.should_throttle_ocr_for_track(
            track,
            timestamp=1.1,
            frame_index=0,
            plate_bbox=(130, 45, 160, 58),
        )
        assert should_throttle is False
        assert reason is None

    def test_same_plate_box_same_frame_is_throttled(self):
        processor = ANPRProcessor(Config(source="video", ocr_min_interval_seconds=0.35))
        track = _track(1, (10, 10, 90, 70))
        track.plate_votes.append(MagicMock())
        track.last_ocr_at = 1.0
        track.last_ocr_frame_index = 0
        track.last_ocr_plate_bbox = (40, 45, 70, 58)

        should_throttle, reason = processor.should_throttle_ocr_for_track(
            track,
            timestamp=1.1,
            frame_index=0,
            plate_bbox=(40, 45, 70, 58),
        )
        assert should_throttle is True
        assert reason == "same_frame_duplicate_plate"


class TestTwoMotorcycleImageFlow:
    def _processor(self, run_dir: Path) -> ANPRProcessor:
        processor = ANPRProcessor(
            Config(
                source="image",
                runs_dir="runs",
                min_plate_votes=1,
                debug_detections=True,
                min_ocr_confidence=0.3,
                ocr_min_interval_seconds=0.35,
            )
        )
        processor._models_loaded = True
        processor._plate_model = MagicMock()
        processor._run_dir = run_dir
        processor._events_file = run_dir / "events.jsonl"
        processor._events_file.parent.mkdir(parents=True, exist_ok=True)
        processor._events_file.write_text("", encoding="utf-8")
        processor._run_id = "test_run"
        processor._dry_run = True
        processor._ensure_evidence_dirs(run_dir)
        return processor

    def _reading(self, letters: str, digits: str) -> OCRReading:
        fragments = [
            OCRFragment(text=letters, confidence=0.95, bbox=(10.0, 5.0, 40.0, 20.0)),
            OCRFragment(text=digits, confidence=0.93, bbox=(10.0, 25.0, 50.0, 45.0)),
        ]
        assembled = assemble_ocr_fragments(fragments)
        return OCRReading(
            raw_text=f"{letters}\n{digits}",
            confidence=0.94,
            fragments=fragments,
            assembled_raw_text=assembled,
        )

    def test_two_motorcycle_plates_produce_two_events(self, tmp_path):
        processor = self._processor(tmp_path / "run_two_moto")
        metrics = RuntimeMetrics()
        frame = np.zeros((120, 200, 3), dtype=np.uint8)

        vehicle_a = Detection(
            bbox=(10, 10, 90, 70), confidence=0.9, class_name="motorcycle"
        )
        vehicle_b = Detection(
            bbox=(100, 10, 180, 70), confidence=0.88, class_name="motorcycle"
        )
        plate_jrk = Detection(bbox=(40, 45, 70, 58), confidence=0.8)
        plate_jwg = Detection(bbox=(130, 45, 160, 58), confidence=0.79)
        matched = [
            (_track(1, vehicle_a.bbox), vehicle_a),
            (_track(2, vehicle_b.bbox), vehicle_b),
        ]

        def fake_detect_plates(frame_arg, vehicle, metrics_arg, *, source="crop"):
            del frame_arg, metrics_arg, source
            if vehicle is vehicle_a:
                return [plate_jrk, plate_jwg]
            return []

        readings = iter([self._reading("JRK", "4027"), self._reading("JWG", "2405")])

        def fake_read_plate_text(_crop, metrics):
            metrics.ocr_calls += 1
            metrics.ocr_readings += 1
            return next(readings)

        processor.detect_plates = fake_detect_plates  # type: ignore[method-assign]
        processor.read_plate_text = fake_read_plate_text  # type: ignore[method-assign]
        processor._ocr_engine = MagicMock()

        plates_by_track = processor._detect_plates_for_tracks(frame, matched, metrics)
        plate_boxes = [plate for plates in plates_by_track.values() for plate, _ in plates]
        assert len(plate_boxes) == 2
        assert plate_boxes[0].bbox != plate_boxes[1].bbox
        packet = FramePacket(
            frame_index=0,
            timestamp=1.0,
            image=frame,
            source_type="image",
            source_path="samples/images/moto.jpg",
            is_last=True,
        )

        for track, vehicle in matched:
            for plate, source in plates_by_track.get(track.track_id, []):
                should_throttle, _reason = processor.should_throttle_ocr_for_track(
                    track,
                    packet.timestamp,
                    frame_index=packet.frame_index,
                    plate_bbox=plate.bbox,
                )
                assert should_throttle is False
                candidate = processor._process_plate_detection(
                    frame,
                    plate,
                    vehicle,
                    metrics,
                    track=track,
                    timestamp=packet.timestamp,
                    frame_index=packet.frame_index,
                    source=source,
                )
                assert candidate is not None
                processor.add_plate_candidate_to_track(
                    track,
                    candidate,
                    frame,
                    packet,
                    metrics,
                )

        assert metrics.ocr_calls == 2
        assert metrics.ocr_calls_skipped_by_throttle == 0
        assert metrics.plate_candidates == 2
        assert metrics.plate_votes_added == 2

        finalized = []
        for track, _vehicle in matched:
            result = processor.finalize_track(track, "source_end", metrics)
            assert result is not None
            finalized.append(result)

        assert metrics.tracks_finalized == 2
        assert metrics.events_finalized == 2
        assert {item.plate_number for item in finalized} == {"JRK4027", "JWG2405"}
