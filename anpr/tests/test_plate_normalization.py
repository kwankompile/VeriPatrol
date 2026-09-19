"""Unit tests for plate normalization, OCR assembly, correction, and validation."""

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
    correct_plate_ocr_confusions,
    normalize_plate_text,
    prepare_plate_candidate_text,
    validate_plate_text,
    validation_rejection_key,
)
from config import Config


class TestPlateNormalization:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("abc 1234", "ABC1234"),
            ("WXY-5678", "WXY5678"),
            ("WXY\u20115678", "WXY5678"),
            ("pmk.8811", "PMK8811"),
            ("PMK\u00b78811", "PMK8811"),
            ("  jke_9900  ", "JKE9900"),
            ("a/b\\c1", "ABC1"),
            ("JWG 2405", "JWG2405"),
            ("JWG\n2405", "JWG2405"),
            ("JRK 4027", "JRK4027"),
            ("J R K 4027", "JRK4027"),
        ],
    )
    def test_normalize_plate_text_strips_separators(self, raw, expected):
        assert normalize_plate_text(raw) == expected

    def test_validate_plate_text_accepts_malaysian_pattern(self):
        ok, reason = validate_plate_text("ABC1234")
        assert ok is True
        assert reason is None

    @pytest.mark.parametrize(
        "plate",
        [
            "JWG2405",
            "JRK4027",
            "ABC1234",
            "W1234A",
        ],
    )
    def test_validate_accepts_motorcycle_and_private_plates(self, plate):
        ok, reason = validate_plate_text(plate)
        assert ok is True
        assert reason is None

    @pytest.mark.parametrize(
        ("plate", "reason_substring"),
        [
            ("", "empty"),
            ("AB1", "too short"),
            ("ABCDEFGHIJK", "too long"),
            ("1234", "no letters"),
            ("ABCD", "no digits"),
            ("ABCD12345", "does not match"),
        ],
    )
    def test_validate_plate_text_rejects_invalid(self, plate, reason_substring):
        ok, reason = validate_plate_text(plate)
        assert ok is False
        assert reason_substring in (reason or "")

    @pytest.mark.parametrize(
        ("reason", "expected_key"),
        [
            ("plate text has no digits", "invalid_no_digits"),
            ("plate text has no letters", "invalid_no_letters"),
            ("plate text too short", "invalid_too_short"),
            ("plate text too long", "invalid_too_long"),
            (
                "plate text does not match Malaysian private-vehicle pattern",
                "invalid_pattern",
            ),
        ],
    )
    def test_validation_rejection_key_mapping(self, reason, expected_key):
        assert validation_rejection_key(reason) == expected_key


class TestOcrFragmentAssembly:
    def test_assemble_two_line_plate_top_to_bottom(self):
        fragments = [
            OCRFragment(text="JWG", confidence=0.92, bbox=(10.0, 5.0, 50.0, 25.0)),
            OCRFragment(text="2405", confidence=0.90, bbox=(10.0, 30.0, 60.0, 55.0)),
        ]
        assert assemble_ocr_fragments(fragments) == "JWG2405"

    def test_assemble_two_line_plate_jrk_example(self):
        fragments = [
            OCRFragment(text="JRK", confidence=0.91, bbox=(12.0, 4.0, 48.0, 24.0)),
            OCRFragment(text="4027", confidence=0.89, bbox=(12.0, 28.0, 58.0, 52.0)),
        ]
        assert assemble_ocr_fragments(fragments) == "JRK4027"

    def test_assemble_reorders_digit_then_letter_lines(self):
        fragments = [
            OCRFragment(text="2405", confidence=0.90, bbox=(10.0, 5.0, 60.0, 25.0)),
            OCRFragment(text="JWG", confidence=0.92, bbox=(10.0, 30.0, 50.0, 55.0)),
        ]
        assert assemble_ocr_fragments(fragments) == "JWG2405"


class TestOcrConfusionCorrection:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("JWG24O5", "JWG2405"),
            ("JRK4O27", "JRK4027"),
            ("JWG24O5", "JWG2405"),
        ],
    )
    def test_correct_plate_ocr_confusions(self, raw, expected):
        normalized = normalize_plate_text(raw)
        assert correct_plate_ocr_confusions(normalized) == expected

    def test_prepare_plate_candidate_text_accepts_corrected_value(self):
        before, after, accepted, valid, reason = prepare_plate_candidate_text("JWG 24O5")
        assert valid is True
        assert reason is None
        assert accepted == "JWG2405"
        assert before == "JWG24O5"
        assert after == "JWG2405"

    def test_invalid_random_ocr_text_remains_rejected(self):
        before, after, accepted, valid, reason = prepare_plate_candidate_text("HELLO WORLD")
        assert valid is False
        assert reason is not None
        assert validation_rejection_key(reason) in {
            "invalid_no_digits",
            "invalid_pattern",
            "invalid_too_long",
        }


class TestMotorcyclePlateIntegration:
    def _processor(self, run_dir: Path) -> ANPRProcessor:
        processor = ANPRProcessor(
            Config(
                source="image",
                runs_dir="runs",
                min_plate_votes=1,
                debug_detections=True,
                min_ocr_confidence=0.3,
            )
        )
        processor._run_dir = run_dir
        processor._events_file = run_dir / "events.jsonl"
        processor._events_file.parent.mkdir(parents=True, exist_ok=True)
        processor._events_file.write_text("", encoding="utf-8")
        processor._run_id = "test_run"
        processor._dry_run = True
        processor._ensure_evidence_dirs(run_dir)
        processor._ocr_engine = MagicMock()
        return processor

    def _reading_for_plate(self, letters: str, digits: str) -> OCRReading:
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

    def test_two_detected_motorcycle_plates_finalize_two_events(self, tmp_path):
        processor = self._processor(tmp_path / "run_moto")
        metrics = RuntimeMetrics()
        frame = np.zeros((120, 200, 3), dtype=np.uint8)
        frame[30:50, 40:80] = 255
        frame[30:50, 120:160] = 255

        readings = iter(
            [
                self._reading_for_plate("JRK", "4027"),
                self._reading_for_plate("JWG", "2405"),
            ]
        )

        def fake_read_plate_text(_crop, _metrics):
            return next(readings)

        processor.read_plate_text = fake_read_plate_text  # type: ignore[method-assign]

        vehicles = [
            Detection(bbox=(10, 10, 90, 70), confidence=0.9, class_name="motorcycle"),
            Detection(bbox=(100, 10, 180, 70), confidence=0.88, class_name="motorcycle"),
        ]
        plates = [
            Detection(bbox=(40, 30, 80, 50), confidence=0.8),
            Detection(bbox=(120, 30, 160, 50), confidence=0.79),
        ]
        tracks = [
            TrackState(
                track_id=index + 1,
                bbox=vehicle.bbox,
                first_seen_at=0.0,
                last_seen_at=0.0,
                first_frame_index=0,
                last_frame_index=0,
            )
            for index, vehicle in enumerate(vehicles)
        ]

        packet = FramePacket(
            frame_index=0,
            timestamp=1.0,
            image=frame,
            source_type="image",
            source_path="samples/images/test.jpg",
            is_last=True,
        )

        for track, vehicle, plate in zip(tracks, vehicles, plates):
            candidate = processor._process_plate_detection(
                frame,
                plate,
                vehicle,
                metrics,
                track=track,
                timestamp=1.0,
                frame_index=0,
                source="crop",
            )
            assert candidate is not None
            processor.add_plate_candidate_to_track(
                track,
                candidate,
                frame,
                packet,
                metrics,
            )

        assert metrics.plate_candidates == 2
        assert metrics.plate_votes_added == 2

        finalized = []
        for track in tracks:
            result = processor.finalize_track(track, "source_end", metrics)
            assert result is not None
            finalized.append(result)

        assert metrics.events_finalized == 2
        assert {item.plate_number for item in finalized} == {"JRK4027", "JWG2405"}

        debug_path = processor._run_dir / "debug" / "plate_ocr_debug.jsonl"
        assert debug_path.is_file()
        rows = [json.loads(line) for line in debug_path.read_text(encoding="utf-8").splitlines()]
        assert len(rows) == 2
        assert rows[0]["assembled_raw_text"] in {"JRK4027", "JWG2405"}
        assert rows[0]["normalized_after_correction"] in {"JRK4027", "JWG2405"}
        assert rows[0]["accepted"] is True
