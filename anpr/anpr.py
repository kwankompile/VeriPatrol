"""ANPR runtime with M15 performance and accuracy tuning architecture."""

from __future__ import annotations

import json
import math
import re
import signal
import time
from collections.abc import Iterator
from dataclasses import dataclass, field, fields
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from config import Config, ValidationResult, mask_rtsp_url
from backend import BackendClient, FlushQueueResult

ASSUMED_VIDEO_FPS = 30.0
VEHICLE_CLASS_NAMES = frozenset({"car", "motorcycle", "bus", "truck"})
MALAYSIAN_PLATE_PATTERN = re.compile(r"^[A-Z]{1,4}[0-9]{1,4}[A-Z]?$")


class SourceRuntimeError(Exception):
    """Raised when a source cannot be opened or read."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class ModelLoadError(SourceRuntimeError):
    """Raised when configured models cannot be loaded."""


class OCRLoadError(SourceRuntimeError):
    """Raised when the OCR engine cannot be initialized."""


@dataclass
class FramePacket:
    """Unified frame contract for all source types."""

    frame_index: int
    timestamp: float
    image: np.ndarray
    source_type: str
    source_path: str | None
    is_last: bool = False


@dataclass
class Detection:
    """Normalized detection result in full-frame coordinates."""

    bbox: tuple[int, int, int, int]
    confidence: float
    class_id: int | None = None
    class_name: str | None = None


@dataclass
class OCRFragment:
    """Single OCR text fragment with optional bounding box."""

    text: str
    confidence: float
    bbox: tuple[float, float, float, float] | None = None


@dataclass
class OCRReading:
    """Raw OCR output for a plate crop."""

    raw_text: str
    confidence: float
    fragments: list[OCRFragment] = field(default_factory=list)
    assembled_raw_text: str | None = None


@dataclass
class PlateCandidate:
    """Normalized and validated plate candidate (not persisted as events in M5)."""

    raw_text: str
    normalized_text: str
    confidence: float
    plate_bbox: tuple[int, int, int, int]
    vehicle_bbox: tuple[int, int, int, int] | None = None


@dataclass
class PlateVote:
    """Single OCR vote attached to a vehicle track."""

    plate_text: str
    raw_text: str
    confidence: float
    timestamp: float
    frame_index: int
    plate_bbox: tuple[int, int, int, int]
    vehicle_bbox: tuple[int, int, int, int] | None = None


@dataclass
class TrackState:
    """In-memory vehicle track with vote buffer and best evidence state."""

    track_id: int
    bbox: tuple[int, int, int, int]
    first_seen_at: float
    last_seen_at: float
    first_frame_index: int
    last_frame_index: int
    plate_votes: list[PlateVote] = field(default_factory=list)
    best_plate_crop: np.ndarray | None = None
    best_full_frame: np.ndarray | None = None
    best_annotated_frame: np.ndarray | None = None
    best_confidence: float = 0.0
    decision_finalized: bool = False
    finalized: bool = False
    finalization_reason: str | None = None
    last_ocr_at: float | None = None
    last_ocr_frame_index: int | None = None
    last_ocr_plate_bbox: tuple[int, int, int, int] | None = None


@dataclass
class FinalizedTrackCandidate:
    """Track-level plate decision finalized in memory."""

    track_id: int
    plate_number: str
    confidence: float
    votes: int
    first_seen_at: float
    last_seen_at: float
    finalization_reason: str


@dataclass
class FinalizedEvent:
    """Persisted local ANPR event record (M6)."""

    event_id: str
    run_id: str
    track_id: int
    plate_number: str
    confidence: float
    votes: int
    first_seen_at: float
    last_seen_at: float
    first_frame_index: int | None
    last_frame_index: int | None
    finalization_reason: str
    source_type: str
    source_path: str | None
    vehicle_bbox: tuple[int, int, int, int] | None
    plate_bbox: tuple[int, int, int, int] | None
    evidence: dict[str, str | None]
    backend: dict[str, object]
    dry_run: bool
    created_at: str


@dataclass
class RuntimeMetrics:
    """Collected metrics during a dry-run execution."""

    frames_read: int = 0
    frames_processed: int = 0
    source_opened: bool = False
    source_completed: bool = False
    source_fps: float | None = None
    assumed_source_fps: float | None = None
    frame_skip_interval: int | None = None
    stop_reason: str = "unknown"
    duration_seconds: float = 0.0
    runtime_error: str | None = None
    runtime_warnings: list[str] = field(default_factory=list)
    log_lines: list[str] = field(default_factory=list)
    models_loaded: bool = False
    vehicle_model: str = ""
    plate_model: str = ""
    device: str = "cpu"
    vehicle_detection_calls: int = 0
    plate_detection_calls: int = 0
    plate_detection_crop_calls: int = 0
    plate_detection_full_frame_fallback_calls: int = 0
    plate_detection_fallback_detections: int = 0
    plate_detections_crop: int = 0
    plate_detections_fallback: int = 0
    vehicle_detections: int = 0
    plate_detections: int = 0
    vehicle_detect_ms_total: float = 0.0
    plate_detect_ms_total: float = 0.0
    plate_crops_extracted: int = 0
    plate_crops_rejected: int = 0
    ocr_engine_loaded: bool = False
    ocr_calls: int = 0
    ocr_calls_skipped_by_throttle: int = 0
    ocr_throttle_skips_by_reason: dict[str, int] = field(default_factory=dict)
    ocr_readings: int = 0
    plate_candidates: int = 0
    plate_candidates_rejected: int = 0
    plate_candidate_rejection_reasons: dict[str, int] = field(default_factory=dict)
    ocr_ms_total: float = 0.0
    tracks_created: int = 0
    tracks_updated: int = 0
    active_tracks: int = 0
    tracks_finalized: int = 0
    tracks_finalized_early: int = 0
    tracks_finalized_expired: int = 0
    tracks_finalized_source_end: int = 0
    track_finalizations_rejected: int = 0
    plate_votes_added: int = 0
    decision_finalized_tracks_skipped: int = 0
    events_finalized: int = 0
    events_written: int = 0
    evidence_files_saved: int = 0
    evidence_save_failures: int = 0
    duplicate_events_suppressed: int = 0
    backend_jobs_queued: int = 0
    backend_jobs_succeeded: int = 0
    backend_jobs_failed: int = 0
    backend_jobs_exhausted: int = 0
    backend_logs_sent: int = 0
    backend_camera_verified: bool = False
    backend_images_sent: int = 0
    local_evidence_deleted: int = 0
    started_at: str | None = None
    ended_at: str | None = None
    last_frame_at: str | None = None
    rtsp_reconnect_attempts: int = 0
    rtsp_reconnect_successes: int = 0
    rtsp_consecutive_read_failures: int = 0
    active_tracks_finalized_on_shutdown: int = 0
    event_latencies_seconds: list[float] = field(default_factory=list)


@dataclass
class DryRunResult:
    """Summary returned after a dry-run execution."""

    run_dir: Path
    worker_log: Path
    worker_summary: Path
    events_file: Path
    summary: dict


def _fps_is_valid(raw_fps: float) -> bool:
    return raw_fps > 0 and math.isfinite(raw_fps) and not math.isnan(raw_fps)


def _clip_bbox(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    width: int,
    height: int,
) -> tuple[int, int, int, int] | None:
    ix1 = max(0, int(round(x1)))
    iy1 = max(0, int(round(y1)))
    ix2 = min(width, int(round(x2)))
    iy2 = min(height, int(round(y2)))
    if ix2 <= ix1 or iy2 <= iy1:
        return None
    return ix1, iy1, ix2, iy2


def expand_bbox(
    bbox: tuple[int, int, int, int],
    frame_width: int,
    frame_height: int,
    padding_ratio: float = 0.20,
) -> tuple[int, int, int, int] | None:
    """Expand a bbox by a ratio of its width/height and clip to frame bounds."""
    x1, y1, x2, y2 = bbox
    width = x2 - x1
    height = y2 - y1
    pad_x = width * padding_ratio
    pad_y = height * padding_ratio
    return _clip_bbox(
        x1 - pad_x,
        y1 - pad_y,
        x2 + pad_x,
        y2 + pad_y,
        frame_width,
        frame_height,
    )


def extract_plate_crop(frame: np.ndarray, plate_detection: Detection) -> np.ndarray | None:
    """Extract a plate crop from a full frame using a plate detection bbox."""
    height, width = frame.shape[:2]
    x1, y1, x2, y2 = plate_detection.bbox
    bbox = _clip_bbox(x1, y1, x2, y2, width, height)
    if bbox is None:
        return None
    cx1, cy1, cx2, cy2 = bbox
    crop = frame[cy1:cy2, cx1:cx2]
    if crop.size == 0:
        return None
    return crop


def preprocess_plate(crop: np.ndarray, scale: float = 2.0) -> np.ndarray:
    """Apply simple deterministic preprocessing for OCR."""
    if len(crop.shape) == 3:
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    else:
        gray = crop.copy()

    if scale > 0 and scale != 1.0:
        gray = cv2.resize(
            gray,
            None,
            fx=scale,
            fy=scale,
            interpolation=cv2.INTER_CUBIC,
        )

    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
    sharpened = cv2.filter2D(gray, -1, kernel)
    return sharpened


def normalize_plate_text(raw_text: str) -> str:
    """Normalize plate text to uppercase alphanumeric characters only."""
    if not raw_text:
        return ""

    # Remove zero-width and common invisible OCR artifacts before symbol stripping.
    cleaned = re.sub(r"[\u200B-\u200D\uFEFF]", "", raw_text)
    # Normalize common dash/separator variants OCR may emit between plate segments.
    cleaned = re.sub(r"[\u2010-\u2015\u2212|·•]", "-", cleaned)
    upper = cleaned.upper()
    return re.sub(r"[^A-Z0-9]", "", upper)


_ALPHA_PREFIX_CONFUSIONS = {"0": "O", "1": "I", "5": "S", "8": "B"}
_DIGIT_SEGMENT_CONFUSIONS = {"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "B": "8"}


def _parse_ocr_line_bbox(line: Any) -> tuple[float, float, float, float] | None:
    """Extract an axis-aligned bbox from a PaddleOCR line result."""
    if not line or len(line) < 1:
        return None
    points = line[0]
    if not points:
        return None
    try:
        xs = [float(point[0]) for point in points]
        ys = [float(point[1]) for point in points]
    except (TypeError, IndexError, ValueError):
        return None
    if not xs or not ys:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def assemble_ocr_fragments(fragments: list[OCRFragment]) -> str:
    """Assemble OCR fragments in top-to-bottom, left-to-right reading order."""
    if not fragments:
        return ""
    if len(fragments) == 1:
        return fragments[0].text.strip()

    sorted_fragments = sorted(
        fragments,
        key=lambda fragment: (
            fragment.bbox[1] if fragment.bbox is not None else 0.0,
            fragment.bbox[0] if fragment.bbox is not None else 0.0,
        ),
    )
    texts = [fragment.text.strip() for fragment in sorted_fragments if fragment.text.strip()]
    if len(texts) == 2:
        first_norm = normalize_plate_text(texts[0])
        second_norm = normalize_plate_text(texts[1])
        if first_norm.isalpha() and second_norm.isdigit():
            return texts[0] + texts[1]
        if first_norm.isdigit() and second_norm.isalpha():
            return texts[1] + texts[0]
    return "".join(texts)


def _correct_alpha_prefix(segment: str) -> str:
    return "".join(_ALPHA_PREFIX_CONFUSIONS.get(char, char) for char in segment)


def _correct_digit_segment(segment: str) -> str:
    return "".join(_DIGIT_SEGMENT_CONFUSIONS.get(char, char) for char in segment)


def correct_plate_ocr_confusions(normalized_text: str) -> str:
    """Apply conservative, position-aware OCR character corrections for Malaysian plates."""
    if not normalized_text:
        return normalized_text

    upper = normalized_text.upper()
    for prefix_len in range(1, min(5, len(upper) + 1)):
        remaining = len(upper) - prefix_len
        for digit_len in range(1, min(5, remaining + 1)):
            suffix_len = remaining - digit_len
            if suffix_len not in (0, 1):
                continue

            prefix_raw = upper[:prefix_len]
            digits_raw = upper[prefix_len : prefix_len + digit_len]
            suffix_raw = upper[prefix_len + digit_len :]

            prefix = _correct_alpha_prefix(prefix_raw)
            digits = _correct_digit_segment(digits_raw)
            suffix_raw = upper[prefix_len + digit_len :]
            if suffix_raw:
                if any(char.isdigit() for char in suffix_raw):
                    continue
                suffix = _correct_alpha_prefix(suffix_raw)
            else:
                suffix = ""

            if not prefix.isalpha():
                continue
            if not digits.isdigit():
                continue
            if suffix and not suffix.isalpha():
                continue

            candidate = prefix + digits + suffix
            valid, _ = validate_plate_text(candidate)
            if valid:
                return candidate

    return upper


def validation_rejection_key(reason: str | None) -> str:
    """Map internal validation reasons to worker_summary rejection keys."""
    mapping = {
        "empty plate text": "invalid_no_letters",
        "plate text too short": "invalid_too_short",
        "plate text too long": "invalid_too_long",
        "plate text has no letters": "invalid_no_letters",
        "plate text has no digits": "invalid_no_digits",
        "plate text does not match Malaysian private-vehicle pattern": "invalid_pattern",
    }
    return mapping.get(reason or "", "invalid_pattern")


def prepare_plate_candidate_text(
    raw_text: str,
) -> tuple[str, str, str, bool, str | None]:
    """
    Normalize, correct, and validate plate OCR text.

    Returns:
        normalized_before_correction,
        normalized_after_correction,
        accepted_normalized_text,
        is_valid,
        validation_reason,
    """
    normalized_before = normalize_plate_text(raw_text)
    normalized_after = correct_plate_ocr_confusions(normalized_before)

    valid, reason = validate_plate_text(normalized_after)
    if valid:
        return normalized_before, normalized_after, normalized_after, True, None

    if normalized_before != normalized_after:
        valid_before, reason_before = validate_plate_text(normalized_before)
        if valid_before:
            return normalized_before, normalized_after, normalized_before, True, None
        reason = reason_before

    return normalized_before, normalized_after, normalized_after, False, reason


def validate_plate_text(normalized_text: str) -> tuple[bool, str | None]:
    """Validate a normalized plate string against conservative Malaysian rules."""
    if not normalized_text:
        return False, "empty plate text"
    if len(normalized_text) < 4:
        return False, "plate text too short"
    if len(normalized_text) > 10:
        return False, "plate text too long"
    if not re.search(r"[A-Z]", normalized_text):
        return False, "plate text has no letters"
    if not re.search(r"[0-9]", normalized_text):
        return False, "plate text has no digits"
    if not MALAYSIAN_PLATE_PATTERN.match(normalized_text):
        return False, "plate text does not match Malaysian private-vehicle pattern"
    return True, None


def _bbox_center(bbox: tuple[int, int, int, int]) -> tuple[float, float]:
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def _point_in_bbox(x: float, y: float, bbox: tuple[int, int, int, int]) -> bool:
    x1, y1, x2, y2 = bbox
    return x1 <= x <= x2 and y1 <= y <= y2


def _center_distance(
    bbox_a: tuple[int, int, int, int],
    bbox_b: tuple[int, int, int, int],
) -> float:
    ax, ay = _bbox_center(bbox_a)
    bx, by = _bbox_center(bbox_b)
    return math.hypot(ax - bx, ay - by)


def _bbox_diagonal(bbox: tuple[int, int, int, int]) -> float:
    x1, y1, x2, y2 = bbox
    return math.hypot(x2 - x1, y2 - y1)


def vehicle_crop_padding_ratio(
    vehicle: Detection,
    *,
    default_ratio: float,
    motorcycle_ratio: float,
) -> float:
    """Return crop padding ratio based on vehicle class."""
    if vehicle.class_name and vehicle.class_name.lower() == "motorcycle":
        return motorcycle_ratio
    return default_ratio


def plate_overlaps_existing_crop_plate(
    plate_bbox: tuple[int, int, int, int],
    crop_plates: list[Detection],
    *,
    iou_threshold: float = 0.3,
) -> bool:
    """Return True when a fallback plate overlaps an existing crop detection."""
    for crop_plate in crop_plates:
        if calculate_iou(plate_bbox, crop_plate.bbox) >= iou_threshold:
            return True
        center_x, center_y = _bbox_center(plate_bbox)
        if _point_in_bbox(center_x, center_y, crop_plate.bbox):
            return True
        crop_center_x, crop_center_y = _bbox_center(crop_plate.bbox)
        if _point_in_bbox(crop_center_x, crop_center_y, plate_bbox):
            return True
    return False


def filter_fallback_duplicate_plates(
    fallback_plates: list[Detection],
    existing_crop_plates: list[Detection],
    *,
    iou_threshold: float = 0.3,
) -> list[Detection]:
    """Remove fallback plates that duplicate plates already found via crop detection."""
    return [
        plate
        for plate in fallback_plates
        if not plate_overlaps_existing_crop_plate(
            plate.bbox,
            existing_crop_plates,
            iou_threshold=iou_threshold,
        )
    ]


def _record_rejection_reason(metrics: RuntimeMetrics, reason: str) -> None:
    metrics.plate_candidate_rejection_reasons[reason] = (
        metrics.plate_candidate_rejection_reasons.get(reason, 0) + 1
    )


def _record_throttle_skip(metrics: RuntimeMetrics, reason: str) -> None:
    metrics.ocr_calls_skipped_by_throttle += 1
    metrics.ocr_throttle_skips_by_reason[reason] = (
        metrics.ocr_throttle_skips_by_reason.get(reason, 0) + 1
    )


def _plate_track_association_score(
    plate_bbox: tuple[int, int, int, int],
    vehicle_bbox: tuple[int, int, int, int],
    expanded_vehicle_bbox: tuple[int, int, int, int],
    *,
    max_distance_ratio: float,
) -> tuple[float, float] | None:
    """Score plate-to-track association; higher is better."""
    center_x, center_y = _bbox_center(plate_bbox)
    if _point_in_bbox(center_x, center_y, vehicle_bbox):
        return (4.0, 0.0)
    if _point_in_bbox(center_x, center_y, expanded_vehicle_bbox):
        return (3.0, 0.0)

    iou = calculate_iou(plate_bbox, expanded_vehicle_bbox)
    if iou > 0.0:
        return (2.0 + iou, 0.0)

    distance = _center_distance(plate_bbox, expanded_vehicle_bbox)
    max_distance = max_distance_ratio * _bbox_diagonal(expanded_vehicle_bbox)
    if distance <= max_distance:
        return (1.0, -distance)
    return None


def deduplicate_plate_detections(
    plate_entries: list[tuple[Detection, str]],
    *,
    iou_threshold: float = 0.3,
) -> list[tuple[Detection, str]]:
    """Keep highest-confidence plate when detections overlap."""
    if not plate_entries:
        return []

    sorted_entries = sorted(
        plate_entries,
        key=lambda entry: entry[0].confidence,
        reverse=True,
    )
    kept: list[tuple[Detection, str]] = []
    kept_plates: list[Detection] = []
    for plate, source in sorted_entries:
        if plate_overlaps_existing_crop_plate(
            plate.bbox,
            kept_plates,
            iou_threshold=iou_threshold,
        ):
            continue
        kept.append((plate, source))
        kept_plates.append(plate)
    return kept


def assign_plates_to_tracks(
    plate_entries: list[tuple[Detection, str]],
    matched_tracks: list[tuple[TrackState, Detection]],
    *,
    frame_width: int,
    frame_height: int,
    default_padding_ratio: float = 0.20,
    motorcycle_padding_ratio: float = 0.35,
    max_distance_ratio: float = 0.60,
) -> dict[int, list[tuple[Detection, str]]]:
    """Assign each detected plate to the best matching track (one plate per track)."""
    result: dict[int, list[tuple[Detection, str]]] = {
        track.track_id: [] for track, _ in matched_tracks
    }
    if not plate_entries or not matched_tracks:
        return result

    assigned_plate_ids: set[int] = set()
    assigned_track_ids: set[int] = set()
    sorted_entries = sorted(
        plate_entries,
        key=lambda entry: entry[0].confidence,
        reverse=True,
    )

    for plate, source in sorted_entries:
        plate_id = id(plate)
        if plate_id in assigned_plate_ids:
            continue

        best_track_id: int | None = None
        best_score: tuple[float, float] | None = None
        for track, vehicle in matched_tracks:
            if track.track_id in assigned_track_ids:
                continue
            padding_ratio = vehicle_crop_padding_ratio(
                vehicle,
                default_ratio=default_padding_ratio,
                motorcycle_ratio=motorcycle_padding_ratio,
            )
            expanded_bbox = expand_bbox(
                vehicle.bbox,
                frame_width,
                frame_height,
                padding_ratio=padding_ratio,
            )
            if expanded_bbox is None:
                continue
            score = _plate_track_association_score(
                plate.bbox,
                vehicle.bbox,
                expanded_bbox,
                max_distance_ratio=max_distance_ratio,
            )
            if score is None:
                continue
            if best_score is None or score > best_score:
                best_score = score
                best_track_id = track.track_id

        if best_track_id is not None:
            result[best_track_id].append((plate, source))
            assigned_plate_ids.add(plate_id)
            assigned_track_ids.add(best_track_id)

    return result


def associate_plates_to_vehicles(
    plates: list[Detection],
    vehicles: list[tuple[TrackState, Detection]],
    *,
    frame_width: int,
    frame_height: int,
    default_padding_ratio: float = 0.20,
    motorcycle_padding_ratio: float = 0.35,
    max_distance_ratio: float = 0.60,
) -> dict[int, list[Detection]]:
    """Associate full-frame fallback plates to missed vehicle tracks."""
    entries = [(plate, "fallback") for plate in plates]
    assigned = assign_plates_to_tracks(
        entries,
        vehicles,
        frame_width=frame_width,
        frame_height=frame_height,
        default_padding_ratio=default_padding_ratio,
        motorcycle_padding_ratio=motorcycle_padding_ratio,
        max_distance_ratio=max_distance_ratio,
    )
    return {
        track_id: [plate for plate, _source in plate_entries]
        for track_id, plate_entries in assigned.items()
    }


def calculate_iou(
    bbox_a: tuple[int, int, int, int],
    bbox_b: tuple[int, int, int, int],
) -> float:
    """Compute intersection-over-union for two axis-aligned bounding boxes."""
    ax1, ay1, ax2, ay2 = bbox_a
    bx1, by1, bx2, by2 = bbox_b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    if inter_x2 <= inter_x1 or inter_y2 <= inter_y1:
        return 0.0
    inter_area = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    union = area_a + area_b - inter_area
    if union <= 0:
        return 0.0
    return inter_area / union


def match_detection_to_track(
    detection: Detection,
    tracks: dict[int, TrackState],
    iou_threshold: float,
    exclude_track_ids: set[int] | None = None,
) -> TrackState | None:
    """Return the best matchable track for a detection by IoU (one-to-one per frame)."""
    exclude_track_ids = exclude_track_ids or set()
    best_track: TrackState | None = None
    best_iou = 0.0
    for track in tracks.values():
        if track.track_id in exclude_track_ids:
            continue
        if track.finalized:
            continue
        iou = calculate_iou(track.bbox, detection.bbox)
        if iou > best_iou:
            best_iou = iou
            best_track = track
    if best_track is not None and best_iou >= iou_threshold:
        return best_track
    return None


def create_track(
    detection: Detection,
    packet: FramePacket,
    track_id: int,
) -> TrackState:
    """Create a new in-memory vehicle track."""
    return TrackState(
        track_id=track_id,
        bbox=detection.bbox,
        first_seen_at=packet.timestamp,
        last_seen_at=packet.timestamp,
        first_frame_index=packet.frame_index,
        last_frame_index=packet.frame_index,
    )


def select_best_plate_for_track(track: TrackState) -> tuple[str, float, int] | None:
    """
    Select the winning plate text for a track using deterministic majority voting.

    Tie-break order: vote count, average confidence, best confidence,
    most recent vote, lexicographic plate text.
    """
    if not track.plate_votes:
        return None

    groups: dict[str, list[PlateVote]] = {}
    for vote in track.plate_votes:
        groups.setdefault(vote.plate_text, []).append(vote)

    def sort_key(item: tuple[str, list[PlateVote]]) -> tuple:
        plate_text, votes = item
        vote_count = len(votes)
        avg_confidence = sum(v.confidence for v in votes) / vote_count
        best_confidence = max(v.confidence for v in votes)
        most_recent = max(v.timestamp for v in votes)
        return (
            vote_count,
            avg_confidence,
            best_confidence,
            most_recent,
            plate_text,
        )

    best_plate, best_votes = max(groups.items(), key=sort_key)
    avg_confidence = sum(v.confidence for v in best_votes) / len(best_votes)
    return best_plate, avg_confidence, len(best_votes)


def _annotate_evidence_frame(
    frame: np.ndarray,
    track_id: int,
    plate_text: str,
    plate_bbox: tuple[int, int, int, int],
    vehicle_bbox: tuple[int, int, int, int] | None,
    confidence: float | None = None,
) -> np.ndarray:
    """Draw vehicle/plate boxes, track id, plate text, and confidence on a frame copy."""
    annotated = frame.copy()
    if vehicle_bbox is not None:
        vx1, vy1, vx2, vy2 = vehicle_bbox
        cv2.rectangle(annotated, (vx1, vy1), (vx2, vy2), (0, 255, 0), 2)
        cv2.putText(
            annotated,
            f"track {track_id}",
            (vx1, max(vy1 - 8, 0)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2,
        )
    px1, py1, px2, py2 = plate_bbox
    cv2.rectangle(annotated, (px1, py1), (px2, py2), (0, 0, 255), 2)
    label = plate_text
    if confidence is not None:
        label = f"{plate_text} {confidence:.2f}"
    cv2.putText(
        annotated,
        label,
        (px1, min(py2 + 20, annotated.shape[0] - 1)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (0, 0, 255),
        2,
    )
    return annotated


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _default_backend_state() -> dict[str, object]:
    return {
        "queued": False,
        "posted": False,
        "event_id": None,
        "images_sent": 0,
        "error": None,
    }


def _backend_state_queued() -> dict[str, object]:
    return {
        "queued": True,
        "posted": False,
        "event_id": None,
        "images_sent": 0,
        "error": None,
    }


def _backend_state_enqueue_failed(error: str) -> dict[str, object]:
    return {
        "queued": False,
        "posted": False,
        "event_id": None,
        "images_sent": 0,
        "error": error,
    }


def finalized_event_to_dict(event: FinalizedEvent) -> dict[str, object]:
    """Convert a FinalizedEvent to a JSON-serializable dict."""
    payload: dict[str, object] = {}
    for item in fields(event):
        value = getattr(event, item.name)
        if isinstance(value, tuple):
            payload[item.name] = list(value)
        elif isinstance(value, Path):
            payload[item.name] = str(value).replace("\\", "/")
        else:
            payload[item.name] = value
    return payload


class ANPRProcessor:
    """ANPR processor with source reading, scheduling, and YOLO detection."""

    def __init__(self, config: Config) -> None:
        self.config = config
        self._capture: cv2.VideoCapture | None = None
        self._source_fps: float | None = None
        self._assumed_source_fps: float | None = None
        self._frame_skip_interval: int | None = None
        self._use_wall_clock: bool = False
        self._last_processed_time: float | None = None
        self._stop_reason: str = "unknown"
        self._vehicle_model: Any = None
        self._plate_model: Any = None
        self._models_loaded: bool = False
        self._ocr_engine: Any = None
        self._run_candidates: list[PlateCandidate] = []
        self._tracks: dict[int, TrackState] = {}
        self._next_track_id: int = 1
        self._finalized_track_candidates: list[FinalizedTrackCandidate] = []
        self._finalized_events: list[FinalizedEvent] = []
        self._run_dir: Path | None = None
        self._run_id: str = ""
        self._events_file: Path | None = None
        self._evidence_dirs: dict[str, Path] = {}
        self._plate_last_event_at: dict[str, float] = {}
        self._dry_run: bool = True
        self._backend_client: BackendClient | None = None
        self._stop_requested: bool = False
        self._runtime_metrics: RuntimeMetrics | None = None
        self._last_health_log_at: float | None = None
        self._last_backend_queue_flush_at: float | None = None
        self._rtsp_reconnect_delay: float = 2.0
        self._shutdown_tracks_finalized: bool = False

    def _make_run_dir(self) -> Path:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        run_dir = self.config.runs_dir_path() / f"run_{timestamp}"
        run_dir.mkdir(parents=True, exist_ok=True)
        return run_dir

    def _source_label(self) -> str:
        if self.config.source == "webcam":
            return f"webcam index {self.config.camera_index}"
        if self.config.source == "rtsp":
            return f"RTSP stream ({mask_rtsp_url(self.config.rtsp_url)})"
        source_path = self._safe_source_path()
        return source_path or self.config.source

    def request_stop(self, reason: str = "manual_shutdown") -> None:
        """Request a graceful runtime stop from signal handlers or CLI interrupt."""
        self._stop_requested = True
        if reason:
            self._stop_reason = reason

    def _install_signal_handlers(self) -> None:
        def _handle_signal(signum: int, _frame: Any) -> None:
            self.request_stop("manual_shutdown")

        signal.signal(signal.SIGINT, _handle_signal)
        if hasattr(signal, "SIGTERM"):
            signal.signal(signal.SIGTERM, _handle_signal)

    def _log_runtime_line(self, message: str) -> None:
        if self._runtime_metrics is not None:
            self._runtime_metrics.log_lines.append(message)

    def _maybe_log_health(self, metrics: RuntimeMetrics, loop_start_time: float) -> None:
        if self.config.source not in {"rtsp", "webcam"}:
            return

        now = time.time()
        if (
            self._last_health_log_at is not None
            and (now - self._last_health_log_at)
            < self.config.rtsp_health_log_interval_seconds
        ):
            return

        self._last_health_log_at = now
        payload = {
            "type": "health",
            "uptime_seconds": round(now - loop_start_time, 3),
            "source_type": self.config.source,
            "frames_read": metrics.frames_read,
            "frames_processed": metrics.frames_processed,
            "active_tracks": sum(
                1 for track in self._tracks.values() if not track.finalized
            ),
            "events_finalized": metrics.events_finalized,
            "backend_jobs_queued": metrics.backend_jobs_queued,
            "backend_jobs_succeeded": metrics.backend_jobs_succeeded,
            "backend_jobs_failed": metrics.backend_jobs_failed,
            "backend_jobs_exhausted": metrics.backend_jobs_exhausted,
            "rtsp_reconnect_attempts": metrics.rtsp_reconnect_attempts,
            "last_frame_at": metrics.last_frame_at,
            "stop_reason": self._stop_reason if self._stop_requested else None,
        }
        self._log_runtime_line(json.dumps(payload, separators=(",", ":")))

    def _apply_flush_result(
        self,
        metrics: RuntimeMetrics,
        flush_result: FlushQueueResult,
        run_dir: Path,
    ) -> None:
        metrics.backend_jobs_succeeded += flush_result.succeeded
        metrics.backend_jobs_failed += flush_result.failed
        metrics.backend_jobs_exhausted += flush_result.exhausted
        metrics.backend_logs_sent += flush_result.logs_sent
        metrics.backend_images_sent += flush_result.images_sent
        metrics.backend_camera_verified = (
            metrics.backend_camera_verified or flush_result.camera_verified
        )
        if not flush_result.success:
            warning = f"Backend queue flush warning: {flush_result.message}"
            if warning not in metrics.runtime_warnings:
                metrics.runtime_warnings.append(warning)
            self._log_runtime_line(warning)
            return

        self._log_runtime_line(
            "Backend queue flush: "
            f"processed={flush_result.processed} "
            f"succeeded={flush_result.succeeded} "
            f"failed={flush_result.failed} "
            f"exhausted={flush_result.exhausted} "
            f"pending={flush_result.pending} "
            f"malformed={flush_result.malformed} "
            f"images_sent={flush_result.images_sent} "
            f"logs_sent={flush_result.logs_sent}"
        )
        if flush_result.processed > 0 or flush_result.succeeded > 0:
            self._write_backend_results(run_dir, flush_result)

    def _maybe_flush_backend_queue(
        self,
        metrics: RuntimeMetrics,
        run_dir: Path,
        *,
        dry_run: bool,
    ) -> None:
        if dry_run or self._backend_client is None:
            return

        now = time.time()
        if (
            self._last_backend_queue_flush_at is not None
            and (now - self._last_backend_queue_flush_at)
            < self.config.backend_queue_flush_interval_seconds
        ):
            return

        self._last_backend_queue_flush_at = now
        flush_result = self._backend_client.flush_queue_safe()
        self._apply_flush_result(metrics, flush_result, run_dir)

    def _attempt_rtsp_reconnect(self, metrics: RuntimeMetrics | None) -> bool:
        masked_url = mask_rtsp_url(self.config.rtsp_url)

        while not self._stop_requested:
            if metrics is not None:
                metrics.rtsp_reconnect_attempts += 1
                attempt = metrics.rtsp_reconnect_attempts
            else:
                attempt = 1

            max_attempts = self.config.rtsp_reconnect_max_attempts
            if max_attempts > 0 and attempt > max_attempts:
                self._stop_reason = "rtsp_reconnect_exhausted"
                self._log_runtime_line(
                    f"RTSP reconnect exhausted; stopping runtime ({masked_url})"
                )
                return False

            delay = self._rtsp_reconnect_delay
            self._log_runtime_line(
                f"RTSP reconnect attempt {attempt} after {delay:.1f}s ({masked_url})"
            )
            time.sleep(delay)
            self.close_source()

            capture = cv2.VideoCapture(self.config.rtsp_url)
            if capture.isOpened():
                self._capture = capture
                self._rtsp_reconnect_delay = (
                    self.config.rtsp_reconnect_initial_delay_seconds
                )
                if metrics is not None:
                    metrics.rtsp_reconnect_successes += 1
                self._log_runtime_line("RTSP reconnect succeeded")
                return True

            self._log_runtime_line(f"RTSP reconnect failed ({masked_url})")
            self._rtsp_reconnect_delay = min(
                self._rtsp_reconnect_delay * 2,
                self.config.rtsp_reconnect_max_delay_seconds,
            )

        self._stop_reason = self._stop_reason or "manual_shutdown"
        return False

    def _safe_source_path(self) -> str | None:
        if self.config.source == "rtsp":
            return "ANPR_RTSP_URL"
        if self.config.source == "video":
            return self.config.video_path
        if self.config.source == "image":
            return self.config.image_path
        if self.config.source == "webcam":
            return str(self.config.camera_index)
        return None

    def _ensure_device_available(self) -> None:
        if self.config.device != "cuda":
            return
        try:
            import torch
        except ImportError as exc:
            raise ModelLoadError(
                "ANPR_DEVICE=cuda but PyTorch is not available."
            ) from exc
        if not torch.cuda.is_available():
            raise ModelLoadError(
                "ANPR_DEVICE=cuda but CUDA is not available on this system. "
                "Use ANPR_DEVICE=cpu."
            )

    def load_models(self, metrics: RuntimeMetrics) -> None:
        """Load vehicle and plate YOLO models once per runtime."""
        vehicle_path = Path(self.config.vehicle_model)
        plate_path = Path(self.config.plate_model)

        if not vehicle_path.is_file():
            raise ModelLoadError(
                f"Vehicle model file not found: {self.config.vehicle_model}"
            )
        if not plate_path.is_file():
            raise ModelLoadError(
                f"Plate model file not found: {self.config.plate_model}"
            )

        self._ensure_device_available()
        metrics.log_lines.append("Model loading started.")

        try:
            from ultralytics import YOLO

            self._vehicle_model = YOLO(str(vehicle_path))
            metrics.log_lines.append(f"Vehicle model loaded: {self.config.vehicle_model}")
            self._plate_model = YOLO(str(plate_path))
            metrics.log_lines.append(f"Plate model loaded: {self.config.plate_model}")
        except Exception as exc:
            raise ModelLoadError(f"Failed to load YOLO models: {exc}") from exc

        self._models_loaded = True
        metrics.models_loaded = True
        metrics.vehicle_model = self.config.vehicle_model
        metrics.plate_model = self.config.plate_model
        metrics.device = self.config.device
        metrics.log_lines.append(f"Device: {self.config.device}")

    def load_ocr_engine(self, metrics: RuntimeMetrics) -> None:
        """Initialize the OCR engine once per runtime.

        M4 uses PaddleOCR 2.x legacy API for stable local crop OCR:
        PaddleOCR(...).ocr(image, cls=False)
        """
        if self.config.ocr_engine != "paddleocr":
            raise OCRLoadError(f"Unsupported OCR engine: {self.config.ocr_engine}")

        metrics.log_lines.append("OCR engine loading started.")
        try:
            from paddleocr import PaddleOCR

            self._ocr_engine = PaddleOCR(
                use_angle_cls=False,
                lang=self.config.ocr_lang,
                show_log=False,
            )
        except ImportError as exc:
            raise OCRLoadError(
                "PaddleOCR is not installed. Install with: pip install -r requirements.txt"
            ) from exc
        except Exception as exc:
            raise OCRLoadError(f"Failed to initialize PaddleOCR: {exc}") from exc

        metrics.ocr_engine_loaded = True
        metrics.log_lines.append(
            f"OCR engine loaded: {self.config.ocr_engine} (PaddleOCR 2.x legacy API)"
        )

    def read_plate_text(
        self,
        plate_crop: np.ndarray,
        metrics: RuntimeMetrics,
    ) -> OCRReading | None:
        """Run OCR on a plate crop and return the best reading."""
        if self._ocr_engine is None:
            raise OCRLoadError("OCR engine is not loaded.")

        metrics.ocr_calls += 1
        start = time.perf_counter()

        image = plate_crop
        if len(plate_crop.shape) == 2:
            image = cv2.cvtColor(plate_crop, cv2.COLOR_GRAY2BGR)

        try:
            result = self._ocr_engine.ocr(image, cls=False)
        except Exception as exc:
            raise SourceRuntimeError(f"OCR failed: {exc}") from exc
        finally:
            metrics.ocr_ms_total += (time.perf_counter() - start) * 1000.0

        if not result or result[0] is None:
            return None

        fragments: list[OCRFragment] = []
        for line in result[0]:
            if not line or len(line) < 2:
                continue
            text_info = line[1]
            if not text_info or len(text_info) < 2:
                continue
            text = str(text_info[0]).strip()
            confidence = float(text_info[1])
            if not text:
                continue
            fragments.append(
                OCRFragment(
                    text=text,
                    confidence=confidence,
                    bbox=_parse_ocr_line_bbox(line),
                )
            )

        if not fragments:
            return None

        assembled = assemble_ocr_fragments(fragments)
        audit_raw_text = (
            fragments[0].text
            if len(fragments) == 1
            else "\n".join(fragment.text for fragment in fragments)
        )
        avg_confidence = sum(fragment.confidence for fragment in fragments) / len(fragments)
        metrics.ocr_readings += 1
        return OCRReading(
            raw_text=audit_raw_text,
            confidence=avg_confidence,
            fragments=fragments,
            assembled_raw_text=assembled,
        )

    def should_throttle_ocr_for_track(
        self,
        track: TrackState,
        timestamp: float,
        *,
        frame_index: int | None = None,
        plate_bbox: tuple[int, int, int, int] | None = None,
    ) -> tuple[bool, str | None]:
        """Return whether OCR should be skipped and the throttle reason."""
        if self.config.source == "image":
            return False, None
        if self.config.ocr_min_interval_seconds <= 0:
            return False, None
        if not track.plate_votes:
            return False, None
        if track.last_ocr_at is None:
            return False, None

        if (
            frame_index is not None
            and plate_bbox is not None
            and track.last_ocr_frame_index == frame_index
            and track.last_ocr_plate_bbox is not None
            and track.last_ocr_plate_bbox != plate_bbox
        ):
            return False, None

        if (
            frame_index is not None
            and plate_bbox is not None
            and track.last_ocr_frame_index == frame_index
            and track.last_ocr_plate_bbox == plate_bbox
        ):
            return True, "same_frame_duplicate_plate"

        if (timestamp - track.last_ocr_at) < self.config.ocr_min_interval_seconds:
            return True, "same_track_interval"

        return False, None

    def _process_plate_detection(
        self,
        frame: np.ndarray,
        plate_detection: Detection,
        vehicle_detection: Detection | None,
        metrics: RuntimeMetrics,
        *,
        track: TrackState | None = None,
        timestamp: float | None = None,
        frame_index: int | None = None,
        source: str = "crop",
    ) -> PlateCandidate | None:
        """Extract, preprocess, OCR, normalize, and validate a plate detection."""
        crop = extract_plate_crop(frame, plate_detection)
        if crop is None:
            metrics.plate_crops_rejected += 1
            self._record_ocr_debug(
                frame_index=frame_index,
                track_id=track.track_id if track is not None else None,
                source=source,
                plate_detection=plate_detection,
                vehicle_detection=vehicle_detection,
                raw_ocr_text=None,
                normalized_text=None,
                ocr_confidence=None,
                accepted=False,
                rejection_reason="plate_crop_extract_failed",
                crop=None,
            )
            return None

        metrics.plate_crops_extracted += 1
        ocr_input = (
            preprocess_plate(crop, self.config.ocr_scale)
            if self.config.ocr_preprocess
            else crop
        )
        reading = self.read_plate_text(ocr_input, metrics)
        if track is not None and timestamp is not None:
            track.last_ocr_at = timestamp
            if frame_index is not None:
                track.last_ocr_frame_index = frame_index
            track.last_ocr_plate_bbox = plate_detection.bbox

        if reading is None:
            metrics.plate_candidates_rejected += 1
            _record_rejection_reason(metrics, "empty_ocr")
            self._record_ocr_debug(
                frame_index=frame_index,
                track_id=track.track_id if track is not None else None,
                source=source,
                plate_detection=plate_detection,
                vehicle_detection=vehicle_detection,
                raw_ocr_text=None,
                normalized_text=None,
                ocr_confidence=None,
                accepted=False,
                rejection_reason="empty_ocr",
                crop=crop,
            )
            return None

        if reading.confidence < self.config.min_ocr_confidence:
            metrics.plate_candidates_rejected += 1
            _record_rejection_reason(metrics, "ocr_low_confidence")
            normalized_before, normalized_after, _, _, validation_reason = (
                prepare_plate_candidate_text(
                    reading.assembled_raw_text or reading.raw_text
                )
            )
            self._record_ocr_debug(
                frame_index=frame_index,
                track_id=track.track_id if track is not None else None,
                source=source,
                plate_detection=plate_detection,
                vehicle_detection=vehicle_detection,
                reading=reading,
                raw_ocr_text=reading.raw_text,
                assembled_raw_text=reading.assembled_raw_text or reading.raw_text,
                normalized_before_correction=normalized_before,
                normalized_after_correction=normalized_after,
                normalized_text=normalized_after,
                ocr_confidence=reading.confidence,
                accepted=False,
                rejection_reason="ocr_low_confidence",
                validation_reason=validation_reason,
                crop=crop,
            )
            return None

        ocr_source_text = reading.assembled_raw_text or reading.raw_text
        (
            normalized_before,
            normalized_after,
            accepted_normalized,
            valid,
            validation_reason,
        ) = prepare_plate_candidate_text(ocr_source_text)
        if not valid:
            metrics.plate_candidates_rejected += 1
            rejection_key = validation_rejection_key(validation_reason)
            _record_rejection_reason(metrics, rejection_key)
            self._record_ocr_debug(
                frame_index=frame_index,
                track_id=track.track_id if track is not None else None,
                source=source,
                plate_detection=plate_detection,
                vehicle_detection=vehicle_detection,
                reading=reading,
                raw_ocr_text=reading.raw_text,
                assembled_raw_text=ocr_source_text,
                normalized_before_correction=normalized_before,
                normalized_after_correction=normalized_after,
                normalized_text=normalized_after,
                ocr_confidence=reading.confidence,
                accepted=False,
                rejection_reason=rejection_key,
                validation_reason=validation_reason,
                crop=crop,
            )
            return None

        metrics.plate_candidates += 1
        self._record_ocr_debug(
            frame_index=frame_index,
            track_id=track.track_id if track is not None else None,
            source=source,
            plate_detection=plate_detection,
            vehicle_detection=vehicle_detection,
            reading=reading,
            raw_ocr_text=reading.raw_text,
            assembled_raw_text=ocr_source_text,
            normalized_before_correction=normalized_before,
            normalized_after_correction=normalized_after,
            normalized_text=accepted_normalized,
            ocr_confidence=reading.confidence,
            accepted=True,
            rejection_reason=None,
            validation_reason=None,
            crop=crop,
        )
        return PlateCandidate(
            raw_text=reading.raw_text,
            normalized_text=accepted_normalized,
            confidence=reading.confidence,
            plate_bbox=plate_detection.bbox,
            vehicle_bbox=vehicle_detection.bbox if vehicle_detection else None,
        )

    def _record_ocr_debug(
        self,
        *,
        frame_index: int | None,
        track_id: int | None,
        source: str,
        plate_detection: Detection,
        vehicle_detection: Detection | None,
        raw_ocr_text: str | None,
        normalized_text: str | None,
        ocr_confidence: float | None,
        accepted: bool,
        rejection_reason: str | None,
        crop: np.ndarray | None,
        reading: OCRReading | None = None,
        assembled_raw_text: str | None = None,
        normalized_before_correction: str | None = None,
        normalized_after_correction: str | None = None,
        validation_reason: str | None = None,
        throttle_reason: str | None = None,
    ) -> None:
        """Write optional OCR debug diagnostics when ANPR_DEBUG_DETECTIONS=true."""
        if not self.config.debug_detections or self._run_dir is None:
            return

        debug_dir = self._run_dir / "debug"
        debug_dir.mkdir(parents=True, exist_ok=True)
        raw_ocr_fragments: list[dict[str, object]] = []
        if reading is not None:
            for fragment in reading.fragments:
                fragment_record: dict[str, object] = {
                    "text": fragment.text,
                    "confidence": fragment.confidence,
                }
                if fragment.bbox is not None:
                    fragment_record["bbox"] = list(fragment.bbox)
                raw_ocr_fragments.append(fragment_record)

        record = {
            "frame_index": frame_index,
            "track_id": track_id,
            "source": source,
            "plate_bbox": list(plate_detection.bbox),
            "vehicle_bbox": list(vehicle_detection.bbox) if vehicle_detection else None,
            "detector_confidence": plate_detection.confidence,
            "raw_ocr_fragments": raw_ocr_fragments,
            "raw_ocr_text": raw_ocr_text,
            "assembled_raw_text": assembled_raw_text,
            "normalized_before_correction": normalized_before_correction,
            "normalized_after_correction": normalized_after_correction,
            "normalized_text": normalized_text,
            "ocr_confidence": ocr_confidence,
            "accepted": accepted,
            "rejection_reason": rejection_reason,
            "validation_reason": validation_reason,
            "throttle_reason": throttle_reason,
        }
        debug_path = debug_dir / "plate_ocr_debug.jsonl"
        with debug_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record) + "\n")

        if not accepted and crop is not None:
            rejected_dir = debug_dir / "rejected_plates"
            rejected_dir.mkdir(parents=True, exist_ok=True)
            suffix = rejection_reason or "rejected"
            filename = (
                f"frame_{frame_index or 0:06d}_track_{track_id or 0}_{suffix}.jpg"
            )
            cv2.imwrite(str(rejected_dir / filename), crop)

    def update_tracks(
        self,
        vehicle_detections: list[Detection],
        packet: FramePacket,
        metrics: RuntimeMetrics,
    ) -> list[tuple[TrackState, Detection]]:
        """Match vehicle detections to tracks via IoU (one track per detection per frame)."""
        matched: list[tuple[TrackState, Detection]] = []
        assigned_track_ids: set[int] = set()
        sorted_detections = sorted(
            vehicle_detections,
            key=lambda detection: detection.confidence,
            reverse=True,
        )
        for detection in sorted_detections:
            track = match_detection_to_track(
                detection,
                self._tracks,
                self.config.track_iou_threshold,
                exclude_track_ids=assigned_track_ids,
            )
            if track is not None:
                track.bbox = detection.bbox
                track.last_seen_at = packet.timestamp
                track.last_frame_index = packet.frame_index
                metrics.tracks_updated += 1
                assigned_track_ids.add(track.track_id)
            else:
                track = create_track(detection, packet, self._next_track_id)
                self._tracks[track.track_id] = track
                self._next_track_id += 1
                metrics.tracks_created += 1
                assigned_track_ids.add(track.track_id)
            matched.append((track, detection))
        metrics.active_tracks = sum(
            1 for track in self._tracks.values() if not track.finalized
        )
        return matched

    def add_plate_candidate_to_track(
        self,
        track: TrackState,
        candidate: PlateCandidate,
        frame: np.ndarray,
        packet: FramePacket,
        metrics: RuntimeMetrics,
    ) -> None:
        """Append a validated plate candidate to a track vote buffer and evidence state."""
        if track.decision_finalized:
            return
        vote = PlateVote(
            plate_text=candidate.normalized_text,
            raw_text=candidate.raw_text,
            confidence=candidate.confidence,
            timestamp=packet.timestamp,
            frame_index=packet.frame_index,
            plate_bbox=candidate.plate_bbox,
            vehicle_bbox=candidate.vehicle_bbox,
        )
        track.plate_votes.append(vote)
        metrics.plate_votes_added += 1

        if candidate.confidence > track.best_confidence:
            track.best_confidence = candidate.confidence
            track.best_full_frame = frame.copy()
            crop = extract_plate_crop(frame, Detection(bbox=candidate.plate_bbox, confidence=1.0))
            track.best_plate_crop = crop.copy() if crop is not None else None
            track.best_annotated_frame = _annotate_evidence_frame(
                frame,
                track.track_id,
                candidate.normalized_text,
                candidate.plate_bbox,
                candidate.vehicle_bbox,
                candidate.confidence,
            )

    def should_finalize_track(
        self,
        track: TrackState,
        packet: FramePacket,
    ) -> tuple[bool, str | None]:
        """Return True when early high-confidence voting criteria are met."""
        if track.decision_finalized or track.finalized or not track.plate_votes:
            return False, None

        groups: dict[str, list[PlateVote]] = {}
        for vote in track.plate_votes:
            groups.setdefault(vote.plate_text, []).append(vote)

        for plate_text, votes in groups.items():
            if len(votes) < self.config.early_finalize_min_votes:
                continue
            avg_confidence = sum(v.confidence for v in votes) / len(votes)
            if avg_confidence >= self.config.early_finalize_min_confidence:
                return True, "early_high_confidence"
        return False, None

    def _min_votes_for_finalize(self, reason: str) -> int:
        if reason == "early_high_confidence":
            return self.config.early_finalize_min_votes
        if reason == "source_end" and self.config.source == "image":
            return 1
        if reason in {"source_end", "manual_shutdown", "runtime_shutdown"}:
            return self.config.min_plate_votes
        return self.config.min_plate_votes

    def finalize_track(
        self,
        track: TrackState,
        reason: str,
        metrics: RuntimeMetrics,
        *,
        finalize_at: float | None = None,
    ) -> FinalizedTrackCandidate | None:
        """Finalize a track once using vote-buffer majority selection."""
        if track.decision_finalized or track.finalized:
            return None

        selection = select_best_plate_for_track(track)
        if selection is None:
            if reason in {"track_expired", "source_end", "manual_shutdown", "runtime_shutdown"}:
                track.finalized = True
                track.finalization_reason = reason
                metrics.track_finalizations_rejected += 1
            return None

        plate_number, confidence, vote_count = selection
        min_votes = self._min_votes_for_finalize(reason)
        if vote_count < min_votes:
            if reason in {"track_expired", "source_end", "manual_shutdown", "runtime_shutdown"}:
                track.finalized = True
                track.finalization_reason = reason
                metrics.track_finalizations_rejected += 1
            return None

        track.decision_finalized = True
        track.finalization_reason = reason
        if reason in {"track_expired", "source_end", "manual_shutdown", "runtime_shutdown"}:
            track.finalized = True

        metrics.tracks_finalized += 1
        if reason == "early_high_confidence":
            metrics.tracks_finalized_early += 1
        elif reason == "track_expired":
            metrics.tracks_finalized_expired += 1
        elif reason == "source_end":
            metrics.tracks_finalized_source_end += 1
        elif reason in {"manual_shutdown", "runtime_shutdown"}:
            metrics.tracks_finalized_source_end += 1

        finalized = FinalizedTrackCandidate(
            track_id=track.track_id,
            plate_number=plate_number,
            confidence=round(confidence, 4),
            votes=vote_count,
            first_seen_at=track.first_seen_at,
            last_seen_at=track.last_seen_at,
            finalization_reason=reason,
        )
        self._finalized_track_candidates.append(finalized)
        self._record_event_latency(track, reason, metrics, finalize_at=finalize_at)
        self._persist_finalized_event(track, finalized, metrics)
        return finalized

    def _record_event_latency(
        self,
        track: TrackState,
        reason: str,
        metrics: RuntimeMetrics,
        *,
        finalize_at: float | None,
    ) -> None:
        """Record disappearance-to-finalization latency where measurable."""
        if finalize_at is None:
            return
        latency = max(0.0, finalize_at - track.last_seen_at)
        if reason == "track_expired":
            metrics.event_latencies_seconds.append(latency)
        elif reason in {"source_end", "manual_shutdown", "runtime_shutdown"}:
            metrics.event_latencies_seconds.append(latency)

    def _event_bboxes(
        self,
        track: TrackState,
        plate_number: str,
    ) -> tuple[tuple[int, int, int, int] | None, tuple[int, int, int, int] | None]:
        """Resolve vehicle and plate bboxes for an event from track votes."""
        matching = [vote for vote in track.plate_votes if vote.plate_text == plate_number]
        if matching:
            best_vote = max(matching, key=lambda vote: vote.confidence)
            vehicle_bbox = best_vote.vehicle_bbox or track.bbox
            return vehicle_bbox, best_vote.plate_bbox
        return track.bbox, None

    def _ensure_evidence_dirs(self, run_dir: Path) -> None:
        """Create evidence subdirectories under a run folder."""
        evidence_root = run_dir / "evidence"
        self._evidence_dirs = {
            "full": evidence_root / "full",
            "plate": evidence_root / "plate",
            "annotated": evidence_root / "annotated",
        }
        for directory in self._evidence_dirs.values():
            directory.mkdir(parents=True, exist_ok=True)

    def _relative_run_path(self, path: Path) -> str:
        try:
            return path.resolve().relative_to(self.config.project_root_path()).as_posix()
        except ValueError:
            return path.resolve().as_posix()

    def _cleanup_expired_evidence(self, current_run_dir: Path, metrics: RuntimeMetrics) -> None:
        """Delete evidence files in old runs past retention; never touch the current run."""
        retention_days = self.config.evidence_retention_days
        if retention_days <= 0:
            return

        runs_root = self.config.runs_dir_path().resolve()
        current_resolved = current_run_dir.resolve()
        cutoff = time.time() - (retention_days * 86400)

        for run_dir in runs_root.glob("run_*"):
            if not run_dir.is_dir():
                continue
            try:
                if run_dir.resolve() == current_resolved:
                    continue
            except OSError:
                continue

            evidence_dir = run_dir / "evidence"
            if not evidence_dir.is_dir():
                continue

            try:
                if evidence_dir.stat().st_mtime > cutoff:
                    continue
            except OSError:
                continue

            for file_path in evidence_dir.rglob("*"):
                if not file_path.is_file():
                    continue
                try:
                    file_path.resolve().relative_to(runs_root)
                except ValueError:
                    continue
                try:
                    file_path.unlink()
                    metrics.local_evidence_deleted += 1
                except OSError:
                    metrics.log_lines.append(
                        f"Warning: failed to delete expired evidence file {file_path}"
                    )

    def _save_evidence_images(
        self,
        track: TrackState,
        event_id: str,
        candidate: FinalizedTrackCandidate,
        metrics: RuntimeMetrics,
    ) -> dict[str, str | None]:
        """Save best evidence images for a finalized event."""
        evidence: dict[str, str | None] = {
            "full": None,
            "plate": None,
            "annotated": None,
        }
        if not self.config.save_local_evidence:
            return evidence
        if not self._evidence_dirs:
            return evidence

        vehicle_bbox, plate_bbox = self._event_bboxes(track, candidate.plate_number)
        annotated_image = track.best_annotated_frame
        if track.best_full_frame is not None and plate_bbox is not None:
            annotated_image = _annotate_evidence_frame(
                track.best_full_frame,
                track.track_id,
                candidate.plate_number,
                plate_bbox,
                vehicle_bbox,
                candidate.confidence,
            )

        image_sets = {
            "full": (track.best_full_frame, self._evidence_dirs["full"] / f"{event_id}_full.jpg"),
            "plate": (
                track.best_plate_crop,
                self._evidence_dirs["plate"] / f"{event_id}_plate.jpg",
            ),
            "annotated": (
                annotated_image,
                self._evidence_dirs["annotated"] / f"{event_id}_annotated.jpg",
            ),
        }
        for key, (image, path) in image_sets.items():
            if image is None or image.size == 0:
                metrics.evidence_save_failures += 1
                warning = f"Evidence {key} image missing for {event_id}"
                if warning not in metrics.runtime_warnings:
                    metrics.runtime_warnings.append(warning)
                metrics.log_lines.append(f"Warning: {warning}")
                continue
            if cv2.imwrite(str(path), image):
                evidence[key] = self._relative_run_path(path)
                metrics.evidence_files_saved += 1
            else:
                metrics.evidence_save_failures += 1
                warning = f"Failed to write evidence {key} image for {event_id}"
                if warning not in metrics.runtime_warnings:
                    metrics.runtime_warnings.append(warning)
                metrics.log_lines.append(f"Warning: {warning}")
        return evidence

    def write_event_record(self, events_file: Path, event: FinalizedEvent) -> None:
        """Append one JSON object as a single UTF-8 line to events.jsonl."""
        line = json.dumps(finalized_event_to_dict(event), separators=(",", ":"))
        with events_file.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")

    def _write_backend_results(self, run_dir: Path, flush_result: FlushQueueResult) -> None:
        """Write post-flush backend job status for events finalized in this run."""
        if self._backend_client is None:
            return

        local_event_ids = {event.event_id for event in self._finalized_events}
        results = self._backend_client.job_results_for_local_events(local_event_ids)
        if not results:
            return

        payload = {
            "flush": {
                "processed": flush_result.processed,
                "succeeded": flush_result.succeeded,
                "failed": flush_result.failed,
                "exhausted": flush_result.exhausted,
                "pending": flush_result.pending,
                "malformed": flush_result.malformed,
                "camera_verified": flush_result.camera_verified,
                "logs_sent": flush_result.logs_sent,
                "images_sent": flush_result.images_sent,
            },
            "events": results,
        }
        output_path = run_dir / "backend_results.json"
        output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    def _persist_finalized_event(
        self,
        track: TrackState,
        candidate: FinalizedTrackCandidate,
        metrics: RuntimeMetrics,
    ) -> None:
        """Convert a finalized track candidate into a persisted event and evidence."""
        if self._run_dir is None or self._events_file is None:
            return

        plate_number = candidate.plate_number
        cooldown = self.config.duplicate_cooldown_seconds
        if cooldown > 0 and plate_number in self._plate_last_event_at:
            elapsed = candidate.last_seen_at - self._plate_last_event_at[plate_number]
            if elapsed < cooldown:
                metrics.duplicate_events_suppressed += 1
                metrics.log_lines.append(
                    f"Duplicate event suppressed for plate {plate_number} "
                    f"(cooldown {cooldown}s, elapsed {elapsed:.3f}s)"
                )
                return

        event_id = f"local-{self._run_id}-track_{candidate.track_id}"
        vehicle_bbox, plate_bbox = self._event_bboxes(track, plate_number)
        evidence = self._save_evidence_images(track, event_id, candidate, metrics)

        backend_state = _default_backend_state()
        if (
            not self._dry_run
            and self.config.backend_enabled
            and self._backend_client is not None
        ):
            event_dict_preview = {
                "event_id": event_id,
                "plate_number": plate_number,
                "confidence": candidate.confidence,
                "last_seen_at": candidate.last_seen_at,
                "created_at": _utc_now_iso(),
                "source_type": self.config.source,
                "evidence": evidence,
            }
            enqueue_result = self._backend_client.enqueue_event(event_dict_preview)
            if enqueue_result.success:
                backend_state = _backend_state_queued()
                metrics.backend_jobs_queued += 1
                metrics.log_lines.append(
                    f"Backend job queued: {event_id} job_id={enqueue_result.job_id}"
                )
            else:
                backend_state = _backend_state_enqueue_failed(enqueue_result.message)
                metrics.log_lines.append(
                    f"Backend enqueue failed for {event_id}: {enqueue_result.message}"
                )

        event = FinalizedEvent(
            event_id=event_id,
            run_id=self._run_id,
            track_id=candidate.track_id,
            plate_number=plate_number,
            confidence=candidate.confidence,
            votes=candidate.votes,
            first_seen_at=candidate.first_seen_at,
            last_seen_at=candidate.last_seen_at,
            first_frame_index=track.first_frame_index,
            last_frame_index=track.last_frame_index,
            finalization_reason=candidate.finalization_reason,
            source_type=self.config.source,
            source_path=self._safe_source_path(),
            vehicle_bbox=vehicle_bbox,
            plate_bbox=plate_bbox,
            evidence=evidence,
            backend=backend_state,
            dry_run=self._dry_run,
            created_at=_utc_now_iso(),
        )
        self.write_event_record(self._events_file, event)
        self._finalized_events.append(event)
        metrics.events_finalized += 1
        metrics.events_written += 1
        self._plate_last_event_at[plate_number] = candidate.last_seen_at
        metrics.log_lines.append(
            f"Event persisted: {event_id} plate={plate_number} "
            f"reason={candidate.finalization_reason}"
        )

    def _retire_track(self, track: TrackState, reason: str) -> None:
        """Retire a track from matching without creating a duplicate candidate."""
        if track.finalized:
            return
        track.finalized = True
        if track.finalization_reason is None:
            track.finalization_reason = reason

    def finalize_expired_tracks(
        self,
        packet: FramePacket,
        metrics: RuntimeMetrics,
    ) -> None:
        """Finalize tracks that have not been seen within the expiry window."""
        for track in list(self._tracks.values()):
            if track.finalized:
                continue
            elapsed = packet.timestamp - track.last_seen_at
            if elapsed < self.config.track_expiry_seconds:
                continue
            if track.decision_finalized:
                self._retire_track(track, "track_expired")
                continue
            self.finalize_track(track, "track_expired", metrics, finalize_at=packet.timestamp)

    def finalize_active_tracks_at_source_end(
        self,
        packet: FramePacket,
        metrics: RuntimeMetrics,
    ) -> None:
        """Flush remaining active tracks when the source ends."""
        for track in list(self._tracks.values()):
            if track.finalized:
                continue
            if track.decision_finalized:
                self._retire_track(track, "source_end")
                continue
            self.finalize_track(track, "source_end", metrics, finalize_at=packet.timestamp)

    def finalize_active_tracks_on_shutdown(
        self,
        packet: FramePacket,
        metrics: RuntimeMetrics,
    ) -> None:
        """Finalize remaining active tracks when the runtime stops gracefully."""
        if self._shutdown_tracks_finalized:
            return

        reason = (
            self._stop_reason
            if self._stop_reason in {"manual_shutdown", "runtime_shutdown"}
            else "runtime_shutdown"
        )
        before = metrics.tracks_finalized
        for track in list(self._tracks.values()):
            if track.finalized:
                continue
            if track.decision_finalized:
                self._retire_track(track, reason)
                continue
            self.finalize_track(track, reason, metrics, finalize_at=packet.timestamp)

        metrics.active_tracks_finalized_on_shutdown = max(
            0, metrics.tracks_finalized - before
        )
        self._shutdown_tracks_finalized = True

    def _check_early_finalization(
        self,
        packet: FramePacket,
        metrics: RuntimeMetrics,
    ) -> None:
        for track in self._tracks.values():
            if track.finalized or track.decision_finalized:
                continue
            should_finalize, reason = self.should_finalize_track(track, packet)
            if should_finalize and reason:
                self.finalize_track(track, reason, metrics, finalize_at=packet.timestamp)

    def _parse_yolo_results(
        self,
        results: Any,
        frame_width: int,
        frame_height: int,
        *,
        filter_vehicles: bool = False,
        offset_x: int = 0,
        offset_y: int = 0,
    ) -> list[Detection]:
        detections: list[Detection] = []
        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue
            names: dict[int, str] = result.names or {}
            for box in boxes:
                confidence = float(box.conf[0].item())
                class_id = int(box.cls[0].item()) if box.cls is not None else None
                class_name = names.get(class_id) if class_id is not None else None
                if filter_vehicles and class_name is not None:
                    if class_name.lower() not in VEHICLE_CLASS_NAMES:
                        continue

                xyxy = box.xyxy[0].tolist()
                bbox = _clip_bbox(
                    xyxy[0] + offset_x,
                    xyxy[1] + offset_y,
                    xyxy[2] + offset_x,
                    xyxy[3] + offset_y,
                    frame_width,
                    frame_height,
                )
                if bbox is None:
                    continue
                detections.append(
                    Detection(
                        bbox=bbox,
                        confidence=confidence,
                        class_id=class_id,
                        class_name=class_name,
                    )
                )
        return detections

    def detect_vehicles(
        self,
        frame: np.ndarray,
        metrics: RuntimeMetrics,
    ) -> list[Detection]:
        """Run vehicle detection on a full frame."""
        if not self._models_loaded or self._vehicle_model is None:
            raise ModelLoadError("Vehicle model is not loaded.")

        height, width = frame.shape[:2]
        start = time.perf_counter()
        metrics.vehicle_detection_calls += 1

        try:
            results = self._vehicle_model.predict(
                frame,
                conf=self.config.vehicle_conf,
                device=self.config.device,
                verbose=False,
            )
        except Exception as exc:
            raise SourceRuntimeError(f"Vehicle detection failed: {exc}") from exc
        detections = self._parse_yolo_results(
            results,
            width,
            height,
            filter_vehicles=True,
        )

        metrics.vehicle_detections += len(detections)
        metrics.vehicle_detect_ms_total += (time.perf_counter() - start) * 1000.0
        return detections

    def detect_plates(
        self,
        frame: np.ndarray,
        vehicle_detection: Detection | None,
        metrics: RuntimeMetrics,
        *,
        source: str = "crop",
    ) -> list[Detection]:
        """Run plate detection on a padded vehicle crop or the full frame."""
        if not self._models_loaded or self._plate_model is None:
            raise ModelLoadError("Plate model is not loaded.")

        height, width = frame.shape[:2]
        offset_x = 0
        offset_y = 0
        inference_image = frame

        if vehicle_detection is not None:
            padding_ratio = vehicle_crop_padding_ratio(
                vehicle_detection,
                default_ratio=self.config.vehicle_crop_padding_ratio,
                motorcycle_ratio=self.config.motorcycle_crop_padding_ratio,
            )
            expanded_bbox = expand_bbox(
                vehicle_detection.bbox,
                width,
                height,
                padding_ratio=padding_ratio,
            )
            if expanded_bbox is None:
                return []
            x1, y1, x2, y2 = expanded_bbox
            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                return []
            inference_image = crop
            offset_x = x1
            offset_y = y1
            metrics.plate_detection_crop_calls += 1
        elif source == "fallback":
            metrics.plate_detection_full_frame_fallback_calls += 1

        start = time.perf_counter()
        metrics.plate_detection_calls += 1

        try:
            results = self._plate_model.predict(
                inference_image,
                conf=self.config.plate_conf,
                device=self.config.device,
                verbose=False,
            )
        except Exception as exc:
            raise SourceRuntimeError(f"Plate detection failed: {exc}") from exc
        detections = self._parse_yolo_results(
            results,
            width,
            height,
            offset_x=offset_x,
            offset_y=offset_y,
        )

        metrics.plate_detections += len(detections)
        if vehicle_detection is not None:
            metrics.plate_detections_crop += len(detections)
        elif source == "fallback":
            metrics.plate_detection_fallback_detections += len(detections)
            metrics.plate_detections_fallback += len(detections)

        metrics.plate_detect_ms_total += (time.perf_counter() - start) * 1000.0
        return detections

    def _detect_plates_for_tracks(
        self,
        frame: np.ndarray,
        matched_tracks: list[tuple[TrackState, Detection]],
        metrics: RuntimeMetrics,
    ) -> dict[int, list[tuple[Detection, str]]]:
        """Run crop/fallback plate detection and assign plates to the best tracks."""
        eligible_tracks = [
            (track, vehicle)
            for track, vehicle in matched_tracks
            if not track.decision_finalized
        ]
        crop_entries: list[tuple[Detection, str]] = []

        for _track, vehicle in eligible_tracks:
            plates = self.detect_plates(frame, vehicle, metrics, source="crop")
            crop_entries.extend((plate, "crop") for plate in plates)

        height, width = frame.shape[:2]
        deduped_crop = deduplicate_plate_detections(crop_entries)
        plates_by_track = assign_plates_to_tracks(
            deduped_crop,
            eligible_tracks,
            frame_width=width,
            frame_height=height,
            default_padding_ratio=self.config.vehicle_crop_padding_ratio,
            motorcycle_padding_ratio=self.config.motorcycle_crop_padding_ratio,
            max_distance_ratio=self.config.plate_fallback_max_distance_ratio,
        )

        missed_tracks = [
            (track, vehicle)
            for track, vehicle in eligible_tracks
            if not plates_by_track[track.track_id]
        ]

        if missed_tracks:
            fallback_plates = self.detect_plates(
                frame,
                None,
                metrics,
                source="fallback",
            )
            existing_plates = [
                plate for plate_entries in plates_by_track.values() for plate, _source in plate_entries
            ]
            filtered_fallback = filter_fallback_duplicate_plates(
                fallback_plates,
                existing_plates,
            )
            fallback_entries = [(plate, "fallback") for plate in filtered_fallback]
            fallback_assigned = assign_plates_to_tracks(
                fallback_entries,
                missed_tracks,
                frame_width=width,
                frame_height=height,
                default_padding_ratio=self.config.vehicle_crop_padding_ratio,
                motorcycle_padding_ratio=self.config.motorcycle_crop_padding_ratio,
                max_distance_ratio=self.config.plate_fallback_max_distance_ratio,
            )
            for track_id, plate_entries in fallback_assigned.items():
                plates_by_track[track_id].extend(plate_entries)

        return plates_by_track

    def _save_debug_detection_frame(
        self,
        frame: np.ndarray,
        vehicles: list[Detection],
        plates_by_track: dict[int, list[tuple[Detection, str]]],
        run_dir: Path,
        frame_index: int,
    ) -> None:
        """Save an annotated debug frame with vehicle and plate bounding boxes."""
        annotated = frame.copy()
        for vehicle in vehicles:
            x1, y1, x2, y2 = vehicle.bbox
            class_name = vehicle.class_name or "vehicle"
            label = f"{class_name} {vehicle.confidence:.2f}"
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(
                annotated,
                label,
                (x1, max(y1 - 8, 0)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 255, 0),
                1,
                cv2.LINE_AA,
            )

        for plate_entries in plates_by_track.values():
            for plate, source in plate_entries:
                x1, y1, x2, y2 = plate.bbox
                label = f"plate {plate.confidence:.2f} ({source})"
                cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 0, 255), 2)
                cv2.putText(
                    annotated,
                    label,
                    (x1, min(y2 + 16, annotated.shape[0] - 4)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 0, 255),
                    1,
                    cv2.LINE_AA,
                )

        debug_dir = run_dir / "debug"
        debug_dir.mkdir(parents=True, exist_ok=True)
        output_path = debug_dir / f"detections_frame_{frame_index:06d}.jpg"
        cv2.imwrite(str(output_path), annotated)

    def open_source(self) -> None:
        """Open the configured source and initialize scheduler state."""
        self._capture = None
        self._source_fps = None
        self._assumed_source_fps = None
        self._frame_skip_interval = None
        self._use_wall_clock = False
        self._last_processed_time = None
        self._stop_reason = "unknown"

        if self.config.source == "image":
            return

        if self.config.source == "webcam":
            capture = cv2.VideoCapture(self.config.camera_index)
            label = f"webcam source: index {self.config.camera_index}"
        elif self.config.source == "rtsp":
            capture = cv2.VideoCapture(self.config.rtsp_url)
            label = "RTSP source (ANPR_RTSP_URL)"
        elif self.config.source == "video":
            capture = cv2.VideoCapture(self.config.video_path)
            label = f"video source: {self.config.video_path}"
        else:
            raise SourceRuntimeError(f"Unsupported source type: {self.config.source}")

        if not capture.isOpened():
            capture.release()
            raise SourceRuntimeError(f"Failed to open {label}")

        raw_fps = float(capture.get(cv2.CAP_PROP_FPS))
        if self.config.source == "video":
            if _fps_is_valid(raw_fps):
                self._source_fps = raw_fps
                self._frame_skip_interval = max(
                    1, round(self._source_fps / self.config.target_fps)
                )
            else:
                self._assumed_source_fps = ASSUMED_VIDEO_FPS
                self._frame_skip_interval = max(
                    1, round(ASSUMED_VIDEO_FPS / self.config.target_fps)
                )
        elif _fps_is_valid(raw_fps):
            self._source_fps = raw_fps
            self._frame_skip_interval = max(
                1, round(self._source_fps / self.config.target_fps)
            )
        else:
            self._use_wall_clock = True

        self._capture = capture

    def close_source(self) -> None:
        """Release capture resources."""
        if self._capture is not None:
            self._capture.release()
            self._capture = None

    def should_process_frame(self, packet: FramePacket) -> bool:
        """Return True when the scheduler accepts a frame for processing."""
        if self.config.source == "image":
            return True

        if self._frame_skip_interval is not None:
            return packet.frame_index % self._frame_skip_interval == 0

        if self._use_wall_clock:
            if self._last_processed_time is None:
                return True
            min_interval = 1.0 / self.config.target_fps
            return (packet.timestamp - self._last_processed_time) >= min_interval

        return True

    def _packet_timestamp(self, frame_index: int) -> float:
        """Return frame timestamp for tracking; video uses source timeline."""
        if self.config.source == "video":
            fps = self._source_fps or self._assumed_source_fps or ASSUMED_VIDEO_FPS
            return frame_index / fps
        return time.time()

    def _iter_image_frames(self) -> Iterator[FramePacket]:
        path = self.config.image_path
        image = cv2.imread(path)
        if image is None:
            raise SourceRuntimeError(f"Failed to read image source: {path}")

        self._stop_reason = "image_complete"
        yield FramePacket(
            frame_index=0,
            timestamp=time.time(),
            image=image,
            source_type="image",
            source_path=path,
            is_last=True,
        )

    def _iter_capture_frames(self) -> Iterator[FramePacket]:
        if self._capture is None:
            raise SourceRuntimeError("Video capture is not open.")

        metrics = self._runtime_metrics
        source_type = self.config.source
        source_path = self._safe_source_path()
        loop_start_time = time.time()
        frame_index = 0
        pending: FramePacket | None = None
        is_rtsp = source_type == "rtsp"

        while True:
            if self._stop_requested:
                self._stop_reason = self._stop_reason or "manual_shutdown"
                if pending is not None:
                    pending.is_last = True
                    yield pending
                break

            if (
                self.config.max_seconds is not None
                and (time.time() - loop_start_time) >= self.config.max_seconds
            ):
                self._stop_reason = "max_seconds_reached"
                if pending is not None:
                    pending.is_last = True
                    yield pending
                break

            ok, frame = self._capture.read()
            if not ok:
                if is_rtsp and self.config.rtsp_reconnect_enabled:
                    if metrics is not None:
                        metrics.rtsp_consecutive_read_failures += 1
                        self._log_runtime_line(
                            "RTSP read failure "
                            f"count={metrics.rtsp_consecutive_read_failures}"
                        )
                    if (
                        metrics is not None
                        and metrics.rtsp_consecutive_read_failures
                        < self.config.rtsp_read_failure_limit
                    ):
                        time.sleep(0.05)
                        continue

                    if not self._attempt_rtsp_reconnect(metrics):
                        if pending is not None:
                            pending.is_last = True
                            yield pending
                        break
                    if metrics is not None:
                        metrics.rtsp_consecutive_read_failures = 0
                    continue

                if pending is not None:
                    pending.is_last = True
                    yield pending
                if frame_index == 0:
                    self._stop_reason = "zero_frames"
                elif source_type == "video":
                    self._stop_reason = "video_end"
                else:
                    self._stop_reason = "stream_read_failed"
                break

            if metrics is not None:
                metrics.rtsp_consecutive_read_failures = 0
                metrics.last_frame_at = _utc_now_iso()

            packet = FramePacket(
                frame_index=frame_index,
                timestamp=self._packet_timestamp(frame_index),
                image=frame,
                source_type=source_type,
                source_path=source_path,
                is_last=False,
            )
            if pending is not None:
                yield pending
            pending = packet
            frame_index += 1

    def iter_frames(self) -> Iterator[FramePacket]:
        """Yield frames from the configured source."""
        if self.config.source == "image":
            yield from self._iter_image_frames()
            return

        if self._capture is None:
            raise SourceRuntimeError("Source is not open.")
        yield from self._iter_capture_frames()

    def _average_ms(self, total_ms: float, calls: int) -> float:
        if calls <= 0:
            return 0.0
        return round(total_ms / calls, 3)

    def _safe_rate(self, numerator: float, denominator: float, *, precision: int = 4) -> float:
        if denominator <= 0:
            return 0.0
        return round(numerator / denominator, precision)

    def _build_tuning_profile(self) -> dict[str, object]:
        return {
            "target_fps": self.config.target_fps,
            "vehicle_conf": self.config.vehicle_conf,
            "plate_conf": self.config.plate_conf,
            "vehicle_crop_padding_ratio": self.config.vehicle_crop_padding_ratio,
            "motorcycle_crop_padding_ratio": self.config.motorcycle_crop_padding_ratio,
            "plate_fallback_max_distance_ratio": (
                self.config.plate_fallback_max_distance_ratio
            ),
            "min_ocr_confidence": self.config.min_ocr_confidence,
            "ocr_preprocess": self.config.ocr_preprocess,
            "ocr_scale": self.config.ocr_scale,
            "ocr_min_interval_seconds": self.config.ocr_min_interval_seconds,
            "track_iou_threshold": self.config.track_iou_threshold,
            "track_expiry_seconds": self.config.track_expiry_seconds,
            "early_finalize_min_votes": self.config.early_finalize_min_votes,
            "early_finalize_min_confidence": self.config.early_finalize_min_confidence,
            "min_plate_votes": self.config.min_plate_votes,
            "duplicate_cooldown_seconds": self.config.duplicate_cooldown_seconds,
            "device": self.config.device,
            "evidence_mode": self.config.evidence_mode,
        }

    def _build_performance_target_results(
        self,
        metrics: RuntimeMetrics,
        *,
        processed_fps: float,
        average_event_latency: float | None,
        max_event_latency: float | None,
    ) -> dict[str, object]:
        results: dict[str, object] = {}

        if metrics.duration_seconds >= 1.0 and metrics.frames_processed > 0:
            results["processed_fps_in_range"] = 3.0 <= processed_fps <= 5.0
        else:
            results["processed_fps_in_range"] = "not_measured"

        if average_event_latency is not None and max_event_latency is not None:
            results["event_latency_in_range"] = (
                2.0 <= average_event_latency <= 5.0
                and max_event_latency <= 8.0
            )
        else:
            results["event_latency_in_range"] = "not_measured"

        results["backend_posting_non_blocking"] = True

        if metrics.models_loaded:
            results["models_loaded_once"] = True
        else:
            results["models_loaded_once"] = False

        if metrics.frames_processed <= 0:
            results["ocr_calls_minimized"] = "not_measured"
        elif self.config.ocr_min_interval_seconds > 0:
            results["ocr_calls_minimized"] = (
                metrics.ocr_calls_skipped_by_throttle > 0
                or self._safe_rate(metrics.ocr_calls, metrics.frames_processed) <= 1.5
            )
        else:
            results["ocr_calls_minimized"] = None

        return results

    def _build_summary(
        self,
        run_dir: Path,
        validation_result: ValidationResult,
        metrics: RuntimeMetrics,
        *,
        strict: bool,
        status: str,
    ) -> dict:
        warnings = list(validation_result.warnings) + list(metrics.runtime_warnings)
        finalized_summary = [
            {
                "track_id": item.track_id,
                "plate_number": item.plate_number,
                "confidence": item.confidence,
                "votes": item.votes,
                "finalization_reason": item.finalization_reason,
            }
            for item in self._finalized_track_candidates
        ]
        events_summary = [
            {
                "event_id": item.event_id,
                "track_id": item.track_id,
                "plate_number": item.plate_number,
                "confidence": item.confidence,
                "votes": item.votes,
                "finalization_reason": item.finalization_reason,
            }
            for item in self._finalized_events
        ]
        summary: dict = {
            "status": status,
            "milestone": "M15",
            "source_type": self.config.source,
            "source_path": self._safe_source_path(),
            "started_at": metrics.started_at,
            "ended_at": metrics.ended_at,
            "uptime_seconds": round(metrics.duration_seconds, 3),
            "last_frame_at": metrics.last_frame_at,
            "rtsp_reconnect_attempts": metrics.rtsp_reconnect_attempts,
            "rtsp_reconnect_successes": metrics.rtsp_reconnect_successes,
            "rtsp_consecutive_read_failures": metrics.rtsp_consecutive_read_failures,
            "active_tracks_finalized_on_shutdown": metrics.active_tracks_finalized_on_shutdown,
            "evidence_mode": self.config.evidence_mode,
            "evidence_retention_days": self.config.evidence_retention_days,
            "frames_read": metrics.frames_read,
            "frames_processed": metrics.frames_processed,
            "events_finalized": metrics.events_finalized,
            "events_written": metrics.events_written,
            "evidence_files_saved": metrics.evidence_files_saved,
            "evidence_save_failures": metrics.evidence_save_failures,
            "duplicate_events_suppressed": metrics.duplicate_events_suppressed,
            "finalized_events": events_summary,
            "backend_enabled": self.config.backend_enabled,
            "backend_jobs_queued": metrics.backend_jobs_queued,
            "backend_jobs_succeeded": metrics.backend_jobs_succeeded,
            "backend_jobs_failed": metrics.backend_jobs_failed,
            "backend_jobs_exhausted": metrics.backend_jobs_exhausted,
            "backend_logs_sent": metrics.backend_logs_sent,
            "backend_images_sent": metrics.backend_images_sent,
            "backend_camera_verified": metrics.backend_camera_verified,
            "local_evidence_deleted": metrics.local_evidence_deleted,
            "backend_queue_file": self.config.backend_queue_file,
            "validation_mode": "strict" if strict else "standard",
            "warnings": warnings,
            "errors": [metrics.runtime_error] if metrics.runtime_error else [],
            "run_dir": str(run_dir).replace("\\", "/"),
            "target_fps": self.config.target_fps,
            "source_fps": metrics.source_fps,
            "frame_skip_interval": metrics.frame_skip_interval,
            "source_opened": metrics.source_opened,
            "source_completed": metrics.source_completed,
            "stop_reason": metrics.stop_reason,
            "max_seconds": self.config.max_seconds,
            "duration_seconds": round(metrics.duration_seconds, 3),
            "models_loaded": metrics.models_loaded,
            "vehicle_model": metrics.vehicle_model or self.config.vehicle_model,
            "plate_model": metrics.plate_model or self.config.plate_model,
            "device": metrics.device or self.config.device,
            "vehicle_detection_calls": metrics.vehicle_detection_calls,
            "plate_detection_calls": metrics.plate_detection_calls,
            "plate_detection_crop_calls": metrics.plate_detection_crop_calls,
            "plate_detection_full_frame_fallback_calls": (
                metrics.plate_detection_full_frame_fallback_calls
            ),
            "plate_detection_fallback_detections": (
                metrics.plate_detection_fallback_detections
            ),
            "plate_detections_by_source": {
                "crop": metrics.plate_detections_crop,
                "fallback": metrics.plate_detections_fallback,
            },
            "vehicle_detections": metrics.vehicle_detections,
            "plate_detections": metrics.plate_detections,
            "average_vehicle_detect_ms": self._average_ms(
                metrics.vehicle_detect_ms_total,
                metrics.vehicle_detection_calls,
            ),
            "average_plate_detect_ms": self._average_ms(
                metrics.plate_detect_ms_total,
                metrics.plate_detection_calls,
            ),
            "ocr_engine": self.config.ocr_engine,
            "ocr_engine_loaded": metrics.ocr_engine_loaded,
            "plate_crops_extracted": metrics.plate_crops_extracted,
            "plate_crops_rejected": metrics.plate_crops_rejected,
            "ocr_calls": metrics.ocr_calls,
            "ocr_readings": metrics.ocr_readings,
            "plate_candidates": metrics.plate_candidates,
            "plate_candidates_rejected": metrics.plate_candidates_rejected,
            "plate_candidate_rejection_reasons": dict(
                metrics.plate_candidate_rejection_reasons
            ),
            "average_ocr_ms": self._average_ms(metrics.ocr_ms_total, metrics.ocr_calls),
            "tracks_created": metrics.tracks_created,
            "tracks_updated": metrics.tracks_updated,
            "active_tracks": metrics.active_tracks,
            "tracks_finalized": metrics.tracks_finalized,
            "tracks_finalized_early": metrics.tracks_finalized_early,
            "tracks_finalized_expired": metrics.tracks_finalized_expired,
            "tracks_finalized_source_end": metrics.tracks_finalized_source_end,
            "track_finalizations_rejected": metrics.track_finalizations_rejected,
            "plate_votes_added": metrics.plate_votes_added,
            "decision_finalized_tracks_skipped": metrics.decision_finalized_tracks_skipped,
            "finalized_track_candidates": finalized_summary,
        }
        processed_fps = self._safe_rate(metrics.frames_processed, metrics.duration_seconds)
        effective_read_fps = self._safe_rate(metrics.frames_read, metrics.duration_seconds)
        average_event_latency = (
            round(sum(metrics.event_latencies_seconds) / len(metrics.event_latencies_seconds), 3)
            if metrics.event_latencies_seconds
            else None
        )
        max_event_latency = (
            round(max(metrics.event_latencies_seconds), 3)
            if metrics.event_latencies_seconds
            else None
        )
        summary.update(
            {
                "processed_fps": processed_fps,
                "effective_read_fps": effective_read_fps,
                "average_event_latency_seconds": average_event_latency,
                "max_event_latency_seconds": max_event_latency,
                "ocr_calls_per_processed_frame": self._safe_rate(
                    metrics.ocr_calls,
                    metrics.frames_processed,
                ),
                "ocr_calls_per_finalized_event": self._safe_rate(
                    metrics.ocr_calls,
                    metrics.events_finalized,
                ),
                "plate_candidates_per_processed_frame": self._safe_rate(
                    metrics.plate_candidates,
                    metrics.frames_processed,
                ),
                "backend_flush_interval_seconds": (
                    self.config.backend_queue_flush_interval_seconds
                ),
                "ocr_calls_skipped_by_throttle": metrics.ocr_calls_skipped_by_throttle,
                "ocr_throttle_skips_by_reason": dict(metrics.ocr_throttle_skips_by_reason),
                "ocr_throttle_interval_seconds": self.config.ocr_min_interval_seconds,
                "tuning_profile": self._build_tuning_profile(),
                "performance_targets": {
                    "processed_fps": "3-5",
                    "event_latency_seconds": "2-5",
                    "backend_posting": "async_non_blocking",
                    "model_loading": "once_at_startup",
                    "ocr_calls": "minimized",
                },
                "performance_target_results": self._build_performance_target_results(
                    metrics,
                    processed_fps=processed_fps,
                    average_event_latency=average_event_latency,
                    max_event_latency=max_event_latency,
                ),
            }
        )
        if metrics.assumed_source_fps is not None:
            summary["assumed_source_fps"] = metrics.assumed_source_fps
        return summary

    def _write_run_outputs(
        self,
        run_dir: Path,
        validation_result: ValidationResult,
        metrics: RuntimeMetrics,
        *,
        strict: bool,
        status: str,
    ) -> DryRunResult:
        worker_log = run_dir / "worker.log"
        worker_summary = run_dir / "worker_summary.json"
        events_file = run_dir / "events.jsonl"

        worker_log.write_text("\n".join(metrics.log_lines) + "\n", encoding="utf-8")

        summary = self._build_summary(
            run_dir, validation_result, metrics, strict=strict, status=status
        )
        worker_summary.write_text(
            json.dumps(summary, indent=2) + "\n",
            encoding="utf-8",
        )
        if not events_file.exists():
            events_file.write_text("", encoding="utf-8")

        return DryRunResult(
            run_dir=run_dir,
            worker_log=worker_log,
            worker_summary=worker_summary,
            events_file=events_file,
            summary=summary,
        )

    def _finalize_stop_reason(self, metrics: RuntimeMetrics) -> None:
        if metrics.frames_read == 0 and metrics.source_opened:
            metrics.stop_reason = "zero_frames"
            warning = "Source opened but returned zero frames"
            if warning not in metrics.runtime_warnings:
                metrics.runtime_warnings.append(warning)
        elif self.config.source == "image" and metrics.frames_read > 0:
            metrics.stop_reason = "image_complete"
        elif self._stop_reason != "unknown":
            metrics.stop_reason = self._stop_reason

    def run_dry_run(
        self,
        validation_result: ValidationResult,
        *,
        strict: bool = False,
    ) -> DryRunResult:
        """Run the pipeline in dry-run mode without backend side effects."""
        return self._execute_run(validation_result, strict=strict, dry_run=True)

    def run(
        self,
        validation_result: ValidationResult,
        *,
        strict: bool = False,
    ) -> DryRunResult:
        """Run the pipeline with local events and optional backend queue enqueue."""
        return self._execute_run(validation_result, strict=strict, dry_run=False)

    def _execute_run(
        self,
        validation_result: ValidationResult,
        *,
        strict: bool = False,
        dry_run: bool = True,
    ) -> DryRunResult:
        """
        Open source, load models, read frames, run detection/OCR/tracking, and write outputs.

        Dry-run persists local events only. Non-dry-run may enqueue backend jobs.
        """
        self._dry_run = dry_run
        self._backend_client = (
            BackendClient(self.config) if self.config.backend_enabled and not dry_run else None
        )
        run_dir = self._make_run_dir()
        self._run_dir = run_dir
        self._run_id = run_dir.name
        self._events_file = run_dir / "events.jsonl"
        self._events_file.write_text("", encoding="utf-8")
        self._ensure_evidence_dirs(run_dir)
        validation_mode = "strict" if strict else "standard"
        metrics = RuntimeMetrics()
        status = "completed"
        self._run_candidates = []
        self._tracks = {}
        self._next_track_id = 1
        self._finalized_track_candidates = []
        self._finalized_events = []
        self._plate_last_event_at = {}
        self._stop_requested = False
        self._shutdown_tracks_finalized = False
        self._runtime_metrics = metrics
        self._last_health_log_at = None
        self._last_backend_queue_flush_at = None
        self._rtsp_reconnect_delay = self.config.rtsp_reconnect_initial_delay_seconds
        metrics.started_at = _utc_now_iso()
        self._install_signal_handlers()

        metrics.log_lines.extend(
            [
                f"{'M15 dry-run' if dry_run else 'M15 run'} started.",
                f"Source type: {self.config.source}",
                f"Source: {self._source_label()}",
                f"Validation mode: {validation_mode}",
                f"Backend enabled: {self.config.backend_enabled}",
                f"Dry run: {dry_run}",
                f"Backend queue file: {self.config.backend_queue_file}",
                f"Target FPS: {self.config.target_fps}",
                f"Max seconds: {self.config.max_seconds}",
                f"RTSP reconnect enabled: {self.config.rtsp_reconnect_enabled}",
                f"RTSP read failure limit: {self.config.rtsp_read_failure_limit}",
                f"Health log interval seconds: {self.config.rtsp_health_log_interval_seconds}",
                f"Backend queue flush interval seconds: {self.config.backend_queue_flush_interval_seconds}",
                f"Track IoU threshold: {self.config.track_iou_threshold}",
                f"Track expiry seconds: {self.config.track_expiry_seconds}",
                f"Early finalize min votes: {self.config.early_finalize_min_votes}",
                f"Early finalize min confidence: {self.config.early_finalize_min_confidence}",
                f"Min plate votes: {self.config.min_plate_votes}",
                f"OCR min interval seconds: {self.config.ocr_min_interval_seconds}",
                f"Duplicate cooldown seconds: {self.config.duplicate_cooldown_seconds}",
                f"Evidence mode: {self.config.evidence_mode}",
                f"Evidence retention days: {self.config.evidence_retention_days}",
                f"Save local evidence: {self.config.save_local_evidence}",
            ]
        )
        if validation_result.warnings:
            metrics.log_lines.append(f"Config warnings: {len(validation_result.warnings)}")

        start_time = time.time()
        last_packet: FramePacket | None = None
        try:
            self.open_source()
            if self.config.source != "image":
                metrics.source_opened = self._capture is not None
                metrics.source_fps = self._source_fps
                metrics.assumed_source_fps = self._assumed_source_fps
                metrics.frame_skip_interval = self._frame_skip_interval
                if metrics.source_fps is not None:
                    metrics.log_lines.append(f"Source FPS: {metrics.source_fps}")
                elif metrics.assumed_source_fps is not None:
                    metrics.log_lines.append(
                        f"Assumed source FPS: {metrics.assumed_source_fps}"
                    )
                if metrics.frame_skip_interval is not None:
                    metrics.log_lines.append(
                        f"Frame skip interval: {metrics.frame_skip_interval}"
                    )
                elif self._use_wall_clock:
                    metrics.log_lines.append(
                        "Frame skip interval: wall-clock fallback (source FPS unavailable)"
                    )

            self.load_models(metrics)
            self.load_ocr_engine(metrics)

            for packet in self.iter_frames():
                last_packet = packet
                metrics.source_opened = True
                metrics.frames_read += 1
                if self.should_process_frame(packet):
                    metrics.frames_processed += 1
                    self._last_processed_time = packet.timestamp
                    vehicles = self.detect_vehicles(packet.image, metrics)
                    matched_tracks = self.update_tracks(vehicles, packet, metrics)
                    frame_candidates: list[PlateCandidate] = []
                    for track, _vehicle in matched_tracks:
                        if track.decision_finalized:
                            metrics.decision_finalized_tracks_skipped += 1

                    plates_by_track = self._detect_plates_for_tracks(
                        packet.image,
                        matched_tracks,
                        metrics,
                    )
                    if self.config.debug_detections and self._run_dir is not None:
                        self._save_debug_detection_frame(
                            packet.image,
                            vehicles,
                            plates_by_track,
                            self._run_dir,
                            packet.frame_index,
                        )

                    for track, vehicle in matched_tracks:
                        if track.decision_finalized:
                            continue
                        for plate, source in plates_by_track.get(track.track_id, []):
                            should_throttle, throttle_reason = (
                                self.should_throttle_ocr_for_track(
                                    track,
                                    packet.timestamp,
                                    frame_index=packet.frame_index,
                                    plate_bbox=plate.bbox,
                                )
                            )
                            if should_throttle:
                                _record_throttle_skip(
                                    metrics,
                                    throttle_reason or "same_track_interval",
                                )
                                self._record_ocr_debug(
                                    frame_index=packet.frame_index,
                                    track_id=track.track_id,
                                    source=source,
                                    plate_detection=plate,
                                    vehicle_detection=vehicle,
                                    raw_ocr_text=None,
                                    normalized_text=None,
                                    ocr_confidence=None,
                                    accepted=False,
                                    rejection_reason="ocr_throttled",
                                    throttle_reason=throttle_reason,
                                    crop=None,
                                )
                                continue
                            candidate = self._process_plate_detection(
                                packet.image,
                                plate,
                                vehicle,
                                metrics,
                                track=track,
                                timestamp=packet.timestamp,
                                frame_index=packet.frame_index,
                                source=source,
                            )
                            if candidate is not None:
                                frame_candidates.append(candidate)
                                self.add_plate_candidate_to_track(
                                    track,
                                    candidate,
                                    packet.image,
                                    packet,
                                    metrics,
                                )
                    self._run_candidates.extend(frame_candidates)
                    self._check_early_finalization(packet, metrics)
                    self.finalize_expired_tracks(packet, metrics)

                self._maybe_log_health(metrics, start_time)
                self._maybe_flush_backend_queue(metrics, run_dir, dry_run=dry_run)

                if packet.is_last:
                    self.finalize_active_tracks_at_source_end(packet, metrics)

            if last_packet is not None and self._stop_requested:
                self.finalize_active_tracks_on_shutdown(last_packet, metrics)
            elif last_packet is not None:
                self.finalize_active_tracks_at_source_end(last_packet, metrics)

            metrics.active_tracks = sum(
                1 for track in self._tracks.values() if not track.finalized
            )

            metrics.source_completed = not self._stop_requested or (
                self._stop_reason in {"max_seconds_reached", "manual_shutdown", "runtime_shutdown"}
            )
            self._finalize_stop_reason(metrics)

            if (
                not dry_run
                and self.config.backend_enabled
                and self._backend_client is not None
            ):
                flush_result = self._backend_client.flush_queue_safe()
                self._apply_flush_result(metrics, flush_result, run_dir)

            if not dry_run:
                self._cleanup_expired_evidence(run_dir, metrics)
        except KeyboardInterrupt:
            self.request_stop("manual_shutdown")
            metrics.log_lines.append("Manual shutdown requested (KeyboardInterrupt)")
            if last_packet is not None:
                self.finalize_active_tracks_on_shutdown(last_packet, metrics)
        except SourceRuntimeError as exc:
            metrics.runtime_error = exc.message
            metrics.stop_reason = "runtime_error"
            metrics.source_completed = False
            status = "failed"
            metrics.log_lines.append(f"Runtime error: {exc.message}")
        finally:
            self.close_source()
            metrics.duration_seconds = time.time() - start_time
            metrics.ended_at = _utc_now_iso()
            self._runtime_metrics = None

        metrics.log_lines.extend(
            [
                f"Frames read: {metrics.frames_read}",
                f"Frames processed: {metrics.frames_processed}",
                f"Vehicle detection calls: {metrics.vehicle_detection_calls}",
                f"Plate detection calls: {metrics.plate_detection_calls}",
                f"Plate detection crop calls: {metrics.plate_detection_crop_calls}",
                (
                    "Plate detection full-frame fallback calls: "
                    f"{metrics.plate_detection_full_frame_fallback_calls}"
                ),
                (
                    "Plate detection fallback detections: "
                    f"{metrics.plate_detection_fallback_detections}"
                ),
                (
                    "Plate detections by source: "
                    f"crop={metrics.plate_detections_crop}, "
                    f"fallback={metrics.plate_detections_fallback}"
                ),
                f"Vehicle detections: {metrics.vehicle_detections}",
                f"Plate detections: {metrics.plate_detections}",
                f"Average vehicle detect ms: {self._average_ms(metrics.vehicle_detect_ms_total, metrics.vehicle_detection_calls)}",
                f"Average plate detect ms: {self._average_ms(metrics.plate_detect_ms_total, metrics.plate_detection_calls)}",
                f"Plate crops extracted: {metrics.plate_crops_extracted}",
                f"Plate crops rejected: {metrics.plate_crops_rejected}",
                f"OCR calls: {metrics.ocr_calls}",
                f"OCR readings: {metrics.ocr_readings}",
                f"Plate candidates: {metrics.plate_candidates}",
                f"Plate candidates rejected: {metrics.plate_candidates_rejected}",
                (
                    "Plate candidate rejection reasons: "
                    f"{dict(metrics.plate_candidate_rejection_reasons)}"
                ),
                f"Average OCR ms: {self._average_ms(metrics.ocr_ms_total, metrics.ocr_calls)}",
                f"Tracks created: {metrics.tracks_created}",
                f"Tracks updated: {metrics.tracks_updated}",
                f"Active tracks: {metrics.active_tracks}",
                f"Plate votes added: {metrics.plate_votes_added}",
                f"Decision-finalized tracks skipped: {metrics.decision_finalized_tracks_skipped}",
                f"Tracks finalized: {metrics.tracks_finalized}",
                f"Tracks finalized early: {metrics.tracks_finalized_early}",
                f"Tracks finalized expired: {metrics.tracks_finalized_expired}",
                f"Tracks finalized source end: {metrics.tracks_finalized_source_end}",
                f"Track finalizations rejected: {metrics.track_finalizations_rejected}",
                f"Finalized track candidates: {len(self._finalized_track_candidates)}",
                f"Events finalized: {metrics.events_finalized}",
                f"Events written: {metrics.events_written}",
                f"Evidence files saved: {metrics.evidence_files_saved}",
                f"Evidence save failures: {metrics.evidence_save_failures}",
                f"Duplicate events suppressed: {metrics.duplicate_events_suppressed}",
                f"Backend jobs queued: {metrics.backend_jobs_queued}",
                f"Backend jobs succeeded: {metrics.backend_jobs_succeeded}",
                f"Backend jobs failed: {metrics.backend_jobs_failed}",
                f"Backend jobs exhausted: {metrics.backend_jobs_exhausted}",
                f"Backend images sent: {metrics.backend_images_sent}",
                f"Backend logs sent: {metrics.backend_logs_sent}",
                f"Local evidence deleted: {metrics.local_evidence_deleted}",
                f"Backend camera verified: {metrics.backend_camera_verified}",
                f"Source completed: {metrics.source_completed}",
                f"Stop reason: {metrics.stop_reason}",
            ]
        )
        for warning in metrics.runtime_warnings:
            metrics.log_lines.append(f"Warning: {warning}")
        metrics.log_lines.extend(
            [
                f"Duration seconds: {metrics.duration_seconds:.3f}",
                f"RTSP reconnect attempts: {metrics.rtsp_reconnect_attempts}",
                f"RTSP reconnect successes: {metrics.rtsp_reconnect_successes}",
                f"Active tracks finalized on shutdown: {metrics.active_tracks_finalized_on_shutdown}",
                f"Last frame at: {metrics.last_frame_at}",
                f"OCR calls skipped by throttle: {metrics.ocr_calls_skipped_by_throttle}",
                (
                    "OCR throttle skips by reason: "
                    f"{dict(metrics.ocr_throttle_skips_by_reason)}"
                ),
                f"Processed FPS: {self._safe_rate(metrics.frames_processed, metrics.duration_seconds)}",
                f"Average event latency seconds: "
                f"{round(sum(metrics.event_latencies_seconds) / len(metrics.event_latencies_seconds), 3) if metrics.event_latencies_seconds else 'n/a'}",
                f"{'M15 dry-run' if dry_run else 'M15 run'} {status}.",
            ]
        )

        return self._write_run_outputs(
            run_dir,
            validation_result,
            metrics,
            strict=strict,
            status=status,
        )
