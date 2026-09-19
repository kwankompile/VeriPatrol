# AI ANPR Modules

## Current contract (2026-07-21)

| Area | Current behavior |
| ---- | ---------------- |
| Camera auth | `ANPR_CAMERA_EMAIL` + `ANPR_CAMERA_PASSWORD` + `ANPR_RTSP_URL` → `POST /api/camera-auth/login` |
| Camera identity | Derived from camera JWT and cached in `.cache/backend_token.json`; **do not** send `camera_id` in ANPR event payloads |
| Deprecated (ignored) | `ANPR_BACKEND_EMAIL`, `ANPR_BACKEND_PASSWORD`, `ANPR_BACKEND_CAMERA_ID` |
| Evidence mode | **`upload`** is the runtime default when `ANPR_EVIDENCE_MODE` is omitted; `metadata` remains valid for local dev |
| Queue migration | Jobs with a stored `evidence_mode` keep it; legacy jobs without a mode and with path-based evidence → `metadata`; otherwise use current config |

**Documentation audit:** Last aligned with implementation **2026-07-21**. Milestones **M0–M15** are implemented in `anpr/`. Prefer this file and [`README.md`](./README.md) over historical milestone docs when they describe placeholder or pre-M3 user-login behavior.

**Laravel ownership:** The AI runtime finalizes detections locally and posts to Laravel APIs. Laravel stores ANPR events, images, event logs, vehicle linking, and monitoring UI data. The Python project does not implement blockchain or frontend code.

## 1. Purpose

The goal is to design a clean, efficient, effective, practical ANPR system that can:

- Read from RTSP cameras.
- Read from sample video files.
- Read from single test images.
- Read from a webcam if needed.
- Detect vehicles.
- Detect license plates.
- OCR license plate text.
- Track vehicles across frames.
- Vote OCR results across multiple frames.
- Finalize one ANPR event per vehicle.
- Save evidence images.
- Send final ANPR event and evidence to a backend server.
- Run fast enough for demo and real-time monitoring.

The design follows a simple runtime philosophy:

```text
Load models once
Open source once
Process frames continuously
Keep temporary state in memory
Save only useful evidence
Send final results to backend asynchronously
```

---

## 2. Core Design Principles

### 2.1 Efficiency first

The system should not pass every frame through a long chain of folders and scripts. Most data should stay in memory while the vehicle is being tracked.

Only final evidence should be written to disk.

### 2.2 One runtime, multiple sources

The same pipeline should work for:

```text
RTSP camera
Video file
Single image
Webcam
```

This makes development and testing easier. Sample videos can be used when the physical camera is unavailable.

### 2.3 Backend owns final records

The AI module should detect, track, OCR, and prepare evidence. The backend should own final event records, image records, logs, and dashboard display.

The AI module may temporarily save evidence locally, but the final system should send the event and evidence to the backend.

### 2.4 Async backend communication

ANPR detection should not freeze just because the backend is slow.

The runtime should finalize an event, save evidence, enqueue a backend job, and continue processing frames.

### 2.5 Simple modules, clear responsibilities

Each module should do one job only.

Avoid huge files and avoid over-engineering.

### 2.6 GitHub reference approach

The new module may use the GitHub project `computervisioneng/automatic-number-plate-recognition-python-yolov8` as a **reference for simplicity**, not as code to copy blindly.

That project is useful because it demonstrates a compact ANPR flow:

```text
video frame
→ vehicle detection
→ vehicle tracking
→ license plate detection
→ OCR on plate crop
→ write simple output
```

The new module should learn from that style:

- Keep the runtime loop simple.
- Use one main processing file at first instead of many staged scripts.
- Support sample video testing from the beginning.
- Load models once.
- Process frames directly instead of writing every intermediate stage to folders.
- Save only final useful evidence.
- Keep output records compact and easy to inspect.

However, the new module should not copy the GitHub project exactly because this FYP system also needs:

- RTSP camera support.
- Backend API integration.
- Backend token caching.
- Async backend queue.
- Evidence upload or metadata creation.
- Configurable camera credentials (machine identity from backend login).
- Malaysian plate post-processing rules.
- Dashboard-ready event records.

So the GitHub project is a **runtime simplicity reference**, while this document remains the full design for the new module.

Reference repository:

```text
https://github.com/computervisioneng/automatic-number-plate-recognition-python-yolov8
```

---

## 3. High-Level Architecture

```text
Input Source
  RTSP / video / image / webcam
        |
        v
Source Reader
        |
        v
Frame Scheduler
  target FPS / frame skipping
        |
        v
Vehicle Detector
  YOLO vehicle detection
        |
        v
Vehicle Tracker
  track_id per vehicle
        |
        v
Plate Detector
  YOLO license plate detection
        |
        v
Plate Crop + Preprocessing
        |
        v
OCR Engine
        |
        v
Plate Text Normalizer
        |
        v
Per-Track Vote Buffer
        |
        v
Track Finalizer
        |
        v
Evidence Saver
        |
        v
Backend Queue
        |
        v
Backend API
  event + images + logs
```

---

## 4. Recommended Folder Structure

The first version should stay very small. Do not start with many `runtime/*.py` files. Keep the runtime logic in one clear `anpr.py` file, then split later only when the code becomes too large.

```text
new-ai-anpr/
├── README.md
├── requirements.txt
├── .env.example
├── .gitignore
├── main.py
├── config.py
├── anpr.py
├── backend.py
│
├── models/
│   ├── vehicle/
│   │   └── .gitkeep
│   └── plate/
│       └── .gitkeep
│
├── samples/
│   ├── videos/
│   │   └── .gitkeep
│   └── images/
│       └── .gitkeep
│
├── runs/
│   └── .gitkeep
│
└── .cache/
    └── .gitkeep
```

### Why this structure is smaller

The goal is to avoid recreating a large staged architecture. The first clean version should have only four real Python files:

| File | Responsibility |
|---|---|
| `main.py` | CLI commands and entry point |
| `config.py` | Load and validate `.env` settings |
| `anpr.py` | Main ANPR runtime: source reading, detection, tracking, OCR, voting, evidence, metrics |
| `backend.py` | Backend token cache, API client, async queue, event posting, image metadata/upload |

### When to split later

Do not split early. Split only when a section becomes difficult to maintain.

| If this part becomes too large | Split later into |
|---|---|
| Source reading grows | `source.py` |
| Detector wrappers grow | `detector.py` |
| Tracker grows | `tracker.py` |
| OCR/preprocessing grows | `ocr.py` |
| Voting/finalization grows | `plate_vote.py` |
| Evidence handling grows | `evidence.py` |
| Backend queue grows | `backend_queue.py` |

Initial rule:

```text
Start simple: main.py + config.py + anpr.py + backend.py.
Refactor later only when needed.
```

---

## 5. Module-by-Module Design

## 5.1 `main.py` — CLI Entry Point

### Responsibility

`main.py` exposes the commands used by the developer/operator.

It should not contain the full ANPR logic. It should only:

- Parse command-line arguments.
- Load config.
- Create the ANPR processor.
- Start the selected run mode.
- Print final summary.

### Required commands

```bash
python main.py check-config
python main.py run --source rtsp --dry-run
python main.py run --source video --video samples/videos/test_vehicle.mp4 --dry-run
python main.py run --source image --image samples/images/frame.jpg --dry-run
python main.py run --source webcam --camera-index 0 --dry-run
python main.py run --source-path samples/videos/test_vehicle.mp4 --dry-run
python main.py flush-backend-queue
```

### Design rule

Keep `main.py` thin. If logic starts growing, move it into `anpr.py` or `backend.py`.

---

## 5.2 `config.py` — Configuration Loader

### Responsibility

Loads `.env` and exposes typed settings to the rest of the module.

### Main settings

```env
ANPR_SOURCE=rtsp
ANPR_RTSP_URL=rtsp://user:password@camera-ip:554/stream1
ANPR_VIDEO_PATH=samples/videos/test_vehicle.mp4
ANPR_IMAGE_PATH=samples/images/frame.jpg
ANPR_CAMERA_INDEX=0

ANPR_VEHICLE_MODEL=models/vehicle/yolo11s.pt
ANPR_PLATE_MODEL=models/plate/license-plate-finetune-v1s.pt
ANPR_DEVICE=cpu

ANPR_TARGET_FPS=3
ANPR_VEHICLE_CONF=0.35
ANPR_PLATE_CONF=0.25
ANPR_TRACK_IOU_THRESHOLD=0.3
ANPR_TRACK_EXPIRY_SECONDS=2.0
ANPR_EARLY_FINALIZE_MIN_VOTES=3
ANPR_EARLY_FINALIZE_MIN_CONFIDENCE=0.90
ANPR_MIN_PLATE_VOTES=2
ANPR_MIN_OCR_CONFIDENCE=0.3
ANPR_OCR_MIN_INTERVAL_SECONDS=0.35

ANPR_BACKEND_ENABLED=false
ANPR_BACKEND_BASE_URL=http://localhost:8000/api
ANPR_CAMERA_EMAIL=
ANPR_CAMERA_PASSWORD=
ANPR_BACKEND_TOKEN_CACHE=.cache/backend_token.json
ANPR_BACKEND_QUEUE_FILE=.cache/backend_queue.jsonl
ANPR_BACKEND_RETRY_LIMIT=3
ANPR_BACKEND_TIMEOUT_SECONDS=10

ANPR_EVIDENCE_MODE=upload
ANPR_RUNS_DIR=runs
ANPR_SAVE_LOCAL_EVIDENCE=true
ANPR_DELETE_LOCAL_AFTER_UPLOAD=false
ANPR_EVIDENCE_RETENTION_DAYS=0

ANPR_RTSP_RECONNECT_ENABLED=true
ANPR_RTSP_RECONNECT_MAX_ATTEMPTS=0
ANPR_RTSP_HEALTH_LOG_INTERVAL_SECONDS=15.0
ANPR_BACKEND_QUEUE_FLUSH_INTERVAL_SECONDS=10.0
```

**Correction:** `ANPR_BACKEND_EMAIL`, `ANPR_BACKEND_PASSWORD`, and `ANPR_BACKEND_CAMERA_ID` are **deprecated and ignored**. Use `ANPR_CAMERA_EMAIL` / `ANPR_CAMERA_PASSWORD`; camera UUID comes from `POST /api/camera-auth/login`.

### Validation rules

- If source type is `rtsp`, `ANPR_RTSP_URL` must exist.
- If source type is `video`, the video path must exist.
- If source type is `image`, the image path must exist.
- Vehicle model must be configured.
- Plate model should be configured for best performance.
- Camera credentials (`ANPR_CAMERA_EMAIL`, `ANPR_CAMERA_PASSWORD`) are required only when backend is enabled.
- When backend is enabled, `ANPR_RTSP_URL` is also required (reported during camera login).
- `ANPR_EVIDENCE_MODE` defaults to **`upload`** when omitted; set `metadata` only for local dev when Laravel resolves paths via `ANPR_IMAGE_ROOTS`.

---

## 5.3 `anpr.py` — Main ANPR Runtime

### Responsibility

`anpr.py` contains the complete first-version ANPR loop.

It handles:

- Source reading.
- Target FPS scheduling.
- YOLO vehicle detection.
- YOLO plate detection.
- Plate crop preprocessing.
- OCR.
- Plate text normalization.
- Simple in-memory tracking.
- Per-track OCR voting.
- Track finalization.
- Local evidence saving.
- Runtime metrics.
- Enqueuing backend jobs through `backend.py`.

This is intentionally one file at first so the new module stays easy to understand.

### Internal components inside `anpr.py`

Use classes or small functions inside one file:

```python
class FramePacket: ...
class Detection: ...
class TrackState: ...
class FinalizedEvent: ...
class ANPRProcessor: ...
```

Suggested functions/classes:

| Component | Role |
|---|---|
| `open_source()` | Open RTSP/video/image/webcam source |
| `iter_frames()` | Yield frames from selected source |
| `should_process_frame()` | Apply target FPS/frame skipping |
| `load_models()` | Load vehicle model, plate model, OCR once |
| `detect_vehicles()` | Run YOLO vehicle detection |
| `detect_plates()` | Run YOLO plate detection on vehicle crops |
| `preprocess_plate()` | Basic grayscale/resize/denoise/sharpen if needed |
| `read_plate_text()` | OCR plate crop |
| `normalize_plate_text()` | Uppercase, remove symbols, validate plate format |
| `update_tracks()` | IoU-based tracking |
| `add_plate_candidate()` | Add OCR candidate to a track |
| `should_finalize_track()` | Check expiry/early-vote/source-end conditions |
| `finalize_track()` | Choose final plate and prepare event |
| `save_evidence()` | Save full, plate, and annotated evidence |
| `write_event_record()` | Append to `events.jsonl` |
| `write_summary()` | Save `worker_summary.json` |

### Source support

`anpr.py` should support:

| Source | Behavior |
|---|---|
| RTSP | Open stream once and read until stopped/max seconds |
| Video | Read frames until video ends; flush active tracks at the end |
| Image | Process one frame; finalize any detected track immediately |
| Webcam | Open webcam index and read until stopped/max seconds |

### Frame packet

```python
@dataclass
class FramePacket:
    frame_index: int
    timestamp: float
    image: np.ndarray
    source_type: str
    source_path: str | None
    is_last: bool = False
```

### Detection flow

```text
Frame
→ vehicle YOLO
→ vehicle crops
→ plate YOLO on vehicle crop
→ plate crop
→ preprocessing
→ OCR
→ normalized plate candidate
→ track vote buffer
```

### Track state

```python
@dataclass
class TrackState:
    track_id: int
    bbox: tuple[int, int, int, int]
    first_seen_at: float
    last_seen_at: float
    plate_votes: list
    best_plate_crop: np.ndarray | None
    best_full_frame: np.ndarray | None
    best_annotated_frame: np.ndarray | None
    finalized: bool = False
```

### Track finalization

Finalize synchronously when:

1. Track disappears for `ANPR_TRACK_EXPIRY_SECONDS`.
2. Same high-confidence plate reaches `ANPR_EARLY_FINALIZE_MIN_VOTES` and `ANPR_EARLY_FINALIZE_MIN_CONFIDENCE`.
3. Source ends.

After finalization:

- Choose final plate by majority/weighted confidence.
- Save local evidence immediately.
- Append event to `events.jsonl`.
- Enqueue backend job if backend is enabled.
- Mark track finalized to prevent duplicate posting.

Backend posting/upload should be async and should not block frame processing.

### Evidence output

```text
runs/
└── run_YYYYMMDD_HHMMSS/
    ├── events.jsonl
    ├── worker_summary.json
    └── evidence/
        ├── full/
        ├── plate/
        └── annotated/
```

### Final event record

```json
{
  "track_id": 1,
  "plate_number": "ABC1234",
  "confidence": 0.92,
  "votes": 3,
  "first_seen_at": "2026-06-21T10:00:00Z",
  "last_seen_at": "2026-06-21T10:00:04Z",
  "finalization_reason": "track_expired",
  "evidence": {
    "full": "runs/run_YYYYMMDD_HHMMSS/evidence/full/track_1_full.jpg",
    "plate": "runs/run_YYYYMMDD_HHMMSS/evidence/plate/track_1_plate.jpg",
    "annotated": "runs/run_YYYYMMDD_HHMMSS/evidence/annotated/track_1_annotated.jpg"
  },
  "backend": {
    "queued": true,
    "posted": false,
    "event_id": null,
    "images_linked": 0,
    "error": null
  },
  "dry_run": true
}
```

### Runtime metrics

`anpr.py` should collect lightweight metrics only:

- frames read
- frames processed
- active tracks
- finalized events
- average vehicle detection time
- average plate detection time
- average OCR time
- average event latency
- backend jobs queued/succeeded/failed

Heavy benchmark dashboards should be backend/admin future work, not part of the first ANPR runtime.

---

## 5.4 `backend.py` — Backend Client and Async Queue

### Responsibility

`backend.py` contains all backend-related logic:

- Camera JWT token cache (`POST /api/camera-auth/login` with `email`, `password`, `rtsp_url`).
- Camera identity (`camera_id`, `camera_name`) stored in token cache after login.
- Retry after token expiry (401 → re-login once).
- Posting ANPR events (`POST /api/anpr-events`) — **no `camera_id` in payload** (JWT supplies identity).
- Evidence delivery: metadata (`POST /api/anpr-images`) or upload (`POST /api/anpr-events/{id}/images/upload`).
- Event logs (`POST /api/anpr-event-logs`) at pipeline stages.
- JSONL queue (`.cache/backend_queue.jsonl`) with retry/exhausted/validation_failed states.
- `flush_queue()` / `flush_queue_safe()` — used at shutdown, periodic RTSP flush, and `flush-backend-queue` CLI.

Keeping this separate prevents network/backend code from cluttering the ANPR frame loop.

### Camera login (not user login)

```json
POST /api/camera-auth/login
{
  "email": "<ANPR_CAMERA_EMAIL>",
  "password": "<ANPR_CAMERA_PASSWORD>",
  "rtsp_url": "<ANPR_RTSP_URL>"
}
```

Response JWT is cached; `camera_id` is read from the login response and stored alongside the token. Legacy `ANPR_BACKEND_*` user/camera-ID env vars are ignored.

### Token cache

Use `.cache/backend_token.json`.

Behavior:

1. Load token from cache.
2. If token exists and is not expired, reuse it.
3. If missing/expired, login and save token.
4. If request returns 401, login again and retry once.
5. Do not login before every request.

Example cache:

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "expires_at": "2026-06-21T10:00:00Z",
  "camera_id": "uuid",
  "camera_name": "Gate Camera 1"
}
```

### Backend queue

Use `.cache/backend_queue.jsonl`.

A queued job should include:

```json
{
  "job_id": "uuid",
  "status": "pending",
  "attempts": 0,
  "event": {
    "plate_number": "ABC1234",
    "confidence": 0.92,
    "detection_time": "2026-06-21T10:00:00Z"
  },
  "evidence": {
    "full": "runs/.../full.jpg",
    "plate": "runs/.../plate.jpg",
    "annotated": "runs/.../annotated.jpg"
  }
}
```

### Backend event payload

Send only the fields the backend expects for camera-authenticated posting (`camera_id` is derived from the camera JWT):

```json
{
  "plate_number": "ABC1234",
  "confidence": 0.92,
  "detection_time": "2026-06-21T10:00:00Z",
  "is_valid": true,
  "latitude": null,
  "longitude": null
}
```

### Evidence modes

Both modes are **implemented** (M7 metadata, M9 upload). When `ANPR_EVIDENCE_MODE` is **omitted**, the runtime defaults to **`upload`** (same as `.env.example`).

**Upload (recommended for deployment — runtime default):**

```env
ANPR_EVIDENCE_MODE=upload
```

- AI uploads binary evidence via `POST /api/anpr-events/{id}/images/upload`.
- Laravel stores files under `storage/app/anpr`.
- Optional `ANPR_DELETE_LOCAL_AFTER_UPLOAD=true` removes local copies after successful upload.

**Metadata (local development):**

```env
ANPR_EVIDENCE_MODE=metadata
```

- AI saves evidence under `runs/`.
- AI creates backend image metadata rows (`POST /api/anpr-images`) with relative paths.
- Laravel must resolve paths via `ANPR_IMAGE_ROOTS` on the server.

### Local evidence retention

`ANPR_EVIDENCE_RETENTION_DAYS` (default `0`):

- `0` — keep local evidence in all runs indefinitely.
- `>0` — after each backend-enabled run, delete `evidence/` folders in **older** `runs/run_*` directories past the retention window (never the current run).

### Backend compatibility warning (metadata mode only)

If using metadata mode, the backend must be configured to read the new module evidence folder. For example:

```env
ANPR_IMAGE_ROOTS=D:/Degree CDCS251/ffyypp/Dev/new-ai-anpr
```

If this is not configured, backend image records may exist but image content endpoints can fail.

---

## 5.5 Dry-run vs backend-enabled runtime

| Mode | How to run | Backend effects |
| ---- | ---------- | ----------------- |
| **Dry-run** | `python main.py run ... --dry-run` | No login, no enqueue, no flush. Local `runs/`, `events.jsonl`, evidence only. |
| **Backend-enabled** | `ANPR_BACKEND_ENABLED=true` + `python main.py run ...` (no `--dry-run`) | Enqueue to `.cache/backend_queue.jsonl`; periodic flush on RTSP/webcam; shutdown flush; `backend_results.json` |

Non-dry-run **requires** `ANPR_BACKEND_ENABLED=true` (CLI error otherwise).

`python main.py flush-backend-queue` processes the queue without re-running detection (backend-only config validation).

---

## 6. CLI Commands

## 6.1 Check config

```bash
python main.py check-config
```

Checks:

- `.env` loaded.
- Source config valid.
- Model files exist.
- Backend config valid if enabled.
- Runs directory writable.

---

## 6.2 Run RTSP camera

```bash
python main.py run --source rtsp --dry-run
python main.py run --source rtsp --max-seconds 30 --dry-run
python main.py run --source rtsp --max-seconds 30
```

---

## 6.3 Run sample video

```bash
python main.py run --source video --video samples/videos/test_vehicle.mp4 --dry-run
```

This is important for development and FYP demonstration because the system can be tested without a live camera.

---

## 6.4 Run single image

```bash
python main.py run --source image --image samples/images/frame.jpg --dry-run
```

---

## 6.5 Run webcam

```bash
python main.py run --source webcam --camera-index 0 --dry-run
```

---

## 6.6 Auto source path

`--source-path` infers **image** or **video** from the file extension. **RTSP URLs are not accepted** on the CLI — use `ANPR_RTSP_URL` in `.env` with `--source rtsp`.

```bash
python main.py run --source-path samples/videos/test_vehicle.mp4 --dry-run
python main.py run --source-path samples/images/frame.jpg --dry-run
```

Passing `rtsp://...` to `--source-path` exits with an error directing you to `.env`.

---

## 6.7 Flush backend queue

```bash
python main.py flush-backend-queue
```

Sends pending backend jobs.

---

## 7. Backend Integration Design

## 7.1 Event payload

When a final plate is ready, send (no `camera_id` in body — backend derives it from the camera JWT):

```json
{
  "plate_number": "ABC1234",
  "confidence": 0.92,
  "detection_time": "2026-06-21T10:00:00Z",
  "is_valid": true,
  "latitude": null,
  "longitude": null
}
```

## 7.2 Image evidence payload

### Metadata mode

The AI sends image metadata/path:

```json
{
  "anpr_event_id": "event-uuid",
  "image_type": "plate",
  "file_path": "runs/run_20260621_100000/evidence/plate/event_001_plate.jpg",
  "file_size": 12345,
  "resolution": "320x80"
}
```

### Upload mode

The AI uploads the binary file:

```text
POST /api/anpr-events/{event_id}/images/upload
image_type=plate
image=@event_001_plate.jpg
```

Upload mode is the cleaner final architecture because backend owns final evidence.

## 7.3 Recommended evidence strategy

**Upload** is implemented and is the **runtime default** when `ANPR_EVIDENCE_MODE` is omitted. Use upload for deployment — AI sends binary evidence via `POST /api/anpr-events/{id}/images/upload` and Laravel stores files under `storage/app/anpr`.

Use **metadata** mode only for local development when Laravel is configured with `ANPR_IMAGE_ROOTS` pointing at this machine's `runs/` directory.

---

## 8. Hugging Face YOLOv11s Plate Model Plan

## 8.1 Recommended model

Use local plate detector weights:

```text
models/plate/license-plate-finetune-v1s.pt
```

Suggested source:

```text
Hugging Face: morsetechlab/yolov11-license-plate-detection
File: license-plate-finetune-v1s.pt
```

## 8.2 Setup steps

1. Download the `.pt` file manually.
2. Put it here:

```text
models/plate/license-plate-finetune-v1s.pt
```

3. Configure `.env`:

```env
ANPR_PLATE_MODEL=models/plate/license-plate-finetune-v1s.pt
ANPR_PLATE_CONFIDENCE=0.25
ANPR_PLATE_IMAGE_SIZE=640
```

4. Run:

```bash
python main.py check-config
python main.py run --source image --image samples/images/frame.jpg --dry-run
```

## 8.3 Rules

- Do not auto-download model during runtime.
- Do not require internet during runtime.
- Do not use hosted API for core detection.
- Keep `.pt` files ignored by Git.

---

## 9. Track Finalization Design

## 9.1 Why finalization is needed

A moving vehicle appears in multiple frames. OCR can produce different readings each time.

Instead of posting every OCR result, the system should collect candidates and post one final event.

## 9.2 Finalization triggers

```text
track disappeared
high-confidence early result
source ended
manual shutdown
```

## 9.3 Finalization process

```text
choose best plate by vote
freeze best evidence
save local evidence
append to events.jsonl
enqueue backend job
mark track finalized
```

## 9.4 Duplicate control

After a track finalizes, it should not post again.

Optional cooldown:

```env
ANPR_DUPLICATE_COOLDOWN_SECONDS=10
```

This prevents the same plate from being posted repeatedly if the same vehicle stays near the camera.

---

## 10. Evidence Design

## 10.1 Evidence saved per event

Each event should save:

```text
full frame
plate crop
annotated frame
```

## 10.2 Local evidence

Local evidence exists so the AI can upload or register images with backend.

It is not the final long-term storage unless metadata mode is used.

## 10.3 Backend evidence

Backend should be the final evidence source for dashboard display.

Recommended final flow:

```text
AI saves temp evidence
AI posts event
AI uploads evidence
Backend stores file
Backend creates image row
Frontend displays backend image URL
```

---

## 11. Runtime Flow Examples

## 11.1 RTSP live camera flow

```text
open RTSP
vehicle enters frame
vehicle detected as track 1
plate detected
OCR reads ABC1234
next frame OCR reads ABC1234 again
track disappears
finalize ABC1234
evidence saved
backend job queued
runtime continues reading camera
backend job posts event/images
frontend shows event
```

## 11.2 Sample video flow

```text
open sample video
process video frames at target FPS
track vehicle
vote plate text
video ends
flush active tracks
save events/evidence
print summary
```

## 11.3 Single image flow

```text
read one image
detect vehicle
detect plate
OCR plate
finalize immediately if valid
save evidence
print dry-run event
```

---

## 12. Output Files

Each run creates:

```text
runs/run_YYYYMMDD_HHMMSS/
├── events.jsonl
├── worker_summary.json
├── worker.log
└── evidence/
    ├── full/
    ├── plate/
    └── annotated/
```

## 12.1 `events.jsonl`

One JSON record per finalized event.

Example:

```json
{
  "event_id": "local-001",
  "track_id": 1,
  "plate_number": "ABC1234",
  "confidence": 0.92,
  "votes": 3,
  "vehicle_class": "car",
  "first_seen_at": "2026-06-21T10:00:01Z",
  "last_seen_at": "2026-06-21T10:00:05Z",
  "finalization_reason": "track_expired",
  "evidence": {
    "full": "runs/run_20260621_100000/evidence/full/event_001_full.jpg",
    "plate": "runs/run_20260621_100000/evidence/plate/event_001_plate.jpg",
    "annotated": "runs/run_20260621_100000/evidence/annotated/event_001_annotated.jpg"
  },
  "backend": {
    "queued": true,
    "posted": false,
    "event_id": null,
    "images_sent": 0,
    "error": null
  }
}
```

## 12.2 `worker_summary.json`

Example:

```json
{
  "status": "completed",
  "source_type": "video",
  "frames_read": 300,
  "frames_processed": 45,
  "events_finalized": 2,
  "backend_jobs_queued": 2,
  "backend_jobs_succeeded": 2,
  "backend_jobs_failed": 0,
  "average_vehicle_detect_ms": 100,
  "average_plate_detect_ms": 40,
  "average_ocr_ms": 150
}
```

---

## 13. Implementation Roadmap / Architecture Milestones

**Status (2026-07-09):** M0–M15 **complete** in this repository. Per-milestone detail lives under [`docs/`](./docs/). Sections below retain milestone structure for reference.

This implementation phase follows the architecture-by-architecture milestone roadmap. The first part starts from **Milestone 0** using `AI ANPR Architecture Milestones.pdf`. After **Milestone 11**, the roadmap follows the updated extension document `AI_ANPR_M12_M15_Final_Roadmap_Extension.pdf`, where Live ANPR Monitoring becomes Milestone 12, Linked Vehicle Records becomes Milestone 13, Testing becomes Milestone 14, and Performance and Accuracy Tuning becomes Milestone 15.

### Implementation Strategy

The system should be implemented in layers rather than as one large feature. Each milestone must pass its own acceptance criteria before moving to the next milestone.

```text
Foundation
-> Configuration
-> Source Processing
-> Detection
-> OCR
-> Tracking
-> Event Generation
-> Backend Integration
-> Backend Data Alignment
-> Evidence Delivery
-> Frontend Integration
-> Realtime Runtime
-> Live Monitoring
-> Linked Vehicle Records
-> Testing
-> Performance Tuning
-> Final Delivery
```

Core implementation rules:

- Load models once.
- Open source once per run.
- Keep runtime state in memory.
- Save only useful final evidence.
- Create one final ANPR event per vehicle.
- Send backend work asynchronously.
- Let Laravel own final ANPR records, images, logs, and vehicle records.
- Keep the first AI runtime small: `main.py`, `config.py`, `anpr.py`, and `backend.py`.

---

## M0 — Project Foundation Architecture

### Goal

Create the initial AI ANPR project shell and establish development conventions.

### Scope

Create the base project structure:

```text
new-ai-anpr/
├── README.md
├── requirements.txt
├── .env.example
├── .gitignore
├── main.py
├── config.py
├── anpr.py
├── backend.py
├── models/
│   ├── vehicle/
│   └── plate/
├── samples/
│   ├── videos/
│   └── images/
├── runs/
└── .cache/
```

Create the first runtime skeleton:

- `main.py`
- `config.py`
- `anpr.py`
- `backend.py`

Define the output structure:

```text
runs/run_YYYYMMDD_HHMMSS/
├── worker.log
├── worker_summary.json
└── events.jsonl
```

### Passing Criteria

- Folder structure matches the architecture design.
- `.pt` model files are ignored by Git.
- `runs/` is ignored by Git.
- `.cache/` is ignored by Git.
- Runtime skeleton files compile successfully.
- Dry execution creates a run directory.
- Project can be cloned and initialized without backend dependency.

---

## M1 — Configuration and CLI Architecture

### Goal

Build a stable entry point for all future runtime operations.

### Scope

Implement typed configuration loading for:

- `ANPR_SOURCE`
- `ANPR_RTSP_URL`
- `ANPR_VIDEO_PATH`
- `ANPR_IMAGE_PATH`
- `ANPR_CAMERA_INDEX`
- `ANPR_VEHICLE_MODEL`
- `ANPR_PLATE_MODEL`
- `ANPR_DEVICE`
- `ANPR_BACKEND_ENABLED`
- camera credentials (`ANPR_CAMERA_EMAIL`, `ANPR_CAMERA_PASSWORD`) and `ANPR_RTSP_URL` when backend is enabled

Support CLI commands:

```bash
python main.py check-config
python main.py run --source rtsp
python main.py run --source video
python main.py run --source image
python main.py run --source webcam
python main.py run --source-path <path>
python main.py flush-backend-queue
```

Define the runtime summary contract:

```json
{
  "status": "",
  "frames_read": 0,
  "frames_processed": 0,
  "events_finalized": 0
}
```

### Passing Criteria

- Invalid configuration fails immediately with clear errors.
- RTSP URL, video path, image path, model paths, and camera credentials (when backend enabled) are validated.
- All CLI commands parse correctly.
- Every run generates a summary.
- CLI and configuration become stable public interfaces.

---

## M2 — Source Reader and Frame Scheduler Architecture

### Goal

Create unified source handling for RTSP, video, image, and webcam input.

### Scope

Implement source resolution for:

- RTSP
- Video
- Image
- Webcam

Create the shared frame contract:

```python
@dataclass
class FramePacket:
    frame_index: int
    timestamp: float
    image: np.ndarray
    source_type: str
    source_path: str | None
    is_last: bool
```

Implement frame scheduling:

- `ANPR_TARGET_FPS`
- Frame skipping
- Source end detection
- Frame metrics

### Passing Criteria

- Correct source handler is selected automatically.
- All runtime processing uses `FramePacket`.
- 30 FPS video processes at the configured target FPS.
- Image, video, stream stop, and source completion are detected correctly.
- `frames_read` and `frames_processed` metrics are accurate.
- All sources produce `FramePacket` objects consistently.

---

## M3 — Model Loading and Detector Architecture

### Goal

Implement vehicle and plate detection architecture.

### Scope

Implement:

- Vehicle YOLO model loading once at startup.
- Plate YOLO model loading once at startup.
- `ANPR_DEVICE=cpu` and `ANPR_DEVICE=cuda` support.
- `detect_vehicles()` wrapper.
- `detect_plates()` wrapper.
- Detection timing metrics.

### Passing Criteria

- Vehicle model loads once at startup.
- Plate model loads from `models/plate/license-plate-finetune-v1s.pt`.
- Runtime uses the configured device.
- Vehicle detections return normalized results.
- Plate detections return normalized results.
- Vehicle and plate detection timing metrics are recorded.
- Vehicle and plate detections operate independently.

---

## M4 — OCR and Plate Normalization Architecture

### Goal

Convert plate crops into valid Malaysian plate candidates.

### Scope

Implement:

- Plate crop extraction.
- Optional crop preprocessing such as grayscale, resize, denoise, and sharpen.
- OCR wrapper through `read_plate_text()`.
- Plate normalization.
- Plate validation.
- OCR timing metrics.

Normalization example:

```text
abc 1234
-> ABC1234
```

### Passing Criteria

- Valid plate crops are generated.
- OCR input quality is improved where preprocessing helps.
- OCR returns text and confidence.
- Plate text is normalized consistently.
- Empty, invalid length, and invalid format candidates are rejected.
- Average OCR timing is recorded.
- System generates normalized plate candidates.

---

## M5 — Tracking and Vote Buffer Architecture

### Goal

Generate one final event per vehicle.

### Scope

Create `TrackState` to store:

- Vehicle bounding box.
- Plate votes.
- Best evidence.
- First seen timestamp.
- Last seen timestamp.

Implement:

- IoU tracking.
- Vote buffer.
- Best full frame state.
- Best plate crop state.
- Best annotated frame state.
- Track expiry using `ANPR_TRACK_EXPIRY_SECONDS`.
- Source-end finalization.
- Early finalization using:
  - `ANPR_EARLY_FINALIZE_MIN_VOTES`
  - `ANPR_EARLY_FINALIZE_MIN_CONFIDENCE`

### Passing Criteria

- Tracks persist across frames.
- The same vehicle retains the same track ID.
- Multiple OCR candidates are accumulated.
- Best evidence is available before finalization.
- Vehicle disappearance triggers finalization.
- Video and image runs flush active tracks at source end.
- High-confidence plate results can finalize early.
- One vehicle results in one finalized candidate.

---

## M6 — Final Event and Evidence Architecture

### Goal

Create finalized event records and evidence.

### Scope

Create the `FinalizedEvent` contract and evidence layout:

```text
evidence/
├── full/
├── plate/
└── annotated/
```

Implement:

- Annotated evidence with vehicle box, plate box, confidence, and plate text.
- `events.jsonl` writer.
- Optional duplicate prevention using `ANPR_DUPLICATE_COOLDOWN_SECONDS`.
- Dry-run support.

### Passing Criteria

- Final event structure is consistent.
- Full, plate, and annotated evidence files are saved.
- Annotations are readable.
- `events.jsonl` output is valid JSONL.
- Duplicate events are suppressed when cooldown is enabled.
- Dry-run has no backend side effects.
- Dry-run generates `events.jsonl`, evidence, and `worker_summary.json`.

---

## M7 — Backend Client and Queue Architecture

### Goal

Integrate backend safely without blocking ANPR detection.

### Scope

Implement:

- Token cache at `.cache/backend_token.json`.
- Backend login and token refresh.
- Automatic refresh when a request returns 401.
- Queue file at `.cache/backend_queue.jsonl`.
- Async event posting.
- Retry handling.
- Queue flush command.

Backend event payload (camera JWT supplies `camera_id` server-side):

```json
{
  "plate_number": "",
  "confidence": 0.0,
  "detection_time": "",
  "is_valid": true,
  "latitude": null,
  "longitude": null
}
```

### Passing Criteria

- Token is reused instead of logging in every request.
- 401 refreshes token automatically.
- Events are queued asynchronously.
- Backend creates an ANPR event.
- Retries obey the configured limit.
- Pending jobs can be resent through `flush-backend-queue`.
- Backend event posting is reliable and non-blocking.

---

## M8 — Backend ANPR Data Architecture Alignment

### Goal

Align AI outputs with Laravel ANPR modules.

### Scope

Implement or confirm:

- Camera identity via `POST /api/camera-auth/login` (M3; replaces manual camera UUID config)
- ANPR event contract compatibility.
- Unknown vehicle strategy.
- Image metadata integration.
- Event logs integration.
- API response handling.

### Passing Criteria

- Camera login succeeds and camera identity is cached.
- AI payload is accepted by backend.
- Unknown vehicles can still create ANPR events.
- Backend image records are created.
- Backend event logs are created.
- Validation and API errors are handled gracefully.
- Backend stores ANPR Event, ANPR Images, and ANPR Event Logs for every finalized detection.

---

## M9 — Evidence Delivery Architecture

### Goal

Deliver evidence to backend.

### Scope

**Implemented:**

- Metadata and **upload** evidence modes
- Image root compatibility (metadata) / Laravel-owned storage (upload)
- Evidence success/failure logging (`ai_evidence_delivered` stage)
- Local evidence retention policy (`ANPR_EVIDENCE_RETENTION_DAYS`)
- Optional `ANPR_DELETE_LOCAL_AFTER_UPLOAD`

### Passing Criteria

- Image metadata or upload records are created per evidence type
- Backend can resolve local evidence paths when metadata mode is used (with `ANPR_IMAGE_ROOTS`)
- Evidence success and failure are visible in logs and `backend_results.json`
- Evidence retention is configurable
- Backend event detail references all evidence

---

## M10 — Frontend ANPR Feature Architecture

### Goal

Expose ANPR events through the React frontend.

### Scope

Implement or align:

- `feature/anpr-monitoring/` module.
- Datasource layer.
- Repository layer.
- Controller layer.
- Event list page.
- Event detail page.
- Routing and permissions.
- Project UI conventions.

### Passing Criteria

- Frontend module matches existing feature structure.
- API integration is implemented.
- Responses are normalized before reaching the UI.
- State management is isolated in the controller layer.
- Event list displays detections.
- Event detail displays evidence and logs.
- Protected routes work.
- Existing project UI patterns are followed.
- Frontend displays ANPR detections end-to-end.

---

## M11 — Realtime RTSP Runtime Architecture

### Goal

Make the AI runtime production-ready for live RTSP deployment.

### Scope

Implement:

- Continuous RTSP processing.
- Reconnection handling.
- Queue-safe runtime behavior.
- Runtime health logs.
- Runtime summary after shutdown.
- Graceful shutdown.

### Passing Criteria

- Runtime processes RTSP stream continuously.
- Temporary RTSP failures recover automatically.
- Backend failures do not stop detection.
- Operational metrics are logged.
- Summary is generated after shutdown.
- Active tracks are finalized during shutdown.
- Stable RTSP deployment is possible.

---

## M12 — Live ANPR Monitoring Architecture

### Goal

Implement the live ANPR monitoring experience after the RTSP runtime is stable. This milestone connects the AI runtime, Laravel ANPR APIs, and React ANPR monitoring page so new detections appear in the frontend without manual browser refresh.

### Scope Clarification

This is not video livestreaming. It is live ANPR event monitoring: new detection rows, evidence availability, status feedback, and visible live update behavior in the React dashboard.

### Scope

Review existing skeletons:

- AI RTSP runtime.
- Backend queue flush.
- Event posting.
- Evidence delivery.
- Laravel ANPR event list endpoint.
- React `feature/anpr-monitoring` module.
- Existing realtime service conventions.

Add or confirm backend latest-event query support:

```text
GET /api/anpr-events?sort=detection_time&direction=desc
GET /api/anpr-events?since=<timestamp>
GET /api/anpr-events?per_page=10
```

Implement frontend live polling controller:

- `liveEnabled` state.
- `lastUpdatedAt` state.
- Polling interval, for example 5 seconds.
- No overlapping refresh requests.
- Stop polling on component unmount.
- Keep manual refresh.
- Reset pagination safely when filters change.

Implement live UI behavior:

- Red blinking LIVE indicator beside the ANPR table title.
- Tooltip text: `Live update`.
- Degraded state such as `RECONNECTING` when polling fails.
- New row highlighting for 3 to 5 seconds.

End-to-end flow:

```text
RTSP camera
-> AI detection
-> backend queue
-> Laravel ANPR event/images/logs
-> React ANPR list auto-refresh
-> LIVE indicator visible
```

### Passing Criteria

- Current codebase live-readiness is documented.
- Latest ANPR events can be fetched reliably.
- New detection appears in API response after AI backend queue posts it.
- API remains protected by existing auth and permission rules.
- Event list auto-refreshes while page is open.
- Manual refresh still works.
- Filters and pagination remain stable.
- No duplicate rows appear.
- Polling stops when leaving the page.
- Red blinking LIVE indicator is visible beside the table title.
- Tooltip shows `Live update`.
- New detections are visually noticeable.
- Evidence remains available in the detail page.
- Camera context remains available.
- Sensitive camera IP is not exposed.
- Backend/API errors are handled gracefully.

### Milestone Pass Condition

Live ANPR monitoring works end-to-end: while the AI RTSP runtime is running, new ANPR detections appear in the React ANPR monitoring table automatically, with a blinking red LIVE indicator beside the table title and tooltip text `Live update`.

---

## M13 — Linked Vehicle Record Architecture

### Goal

Automatically link every ANPR event to a vehicle record. If the detected plate exists in the `vehicles` table, link the event to that vehicle. If it does not exist, create a new vehicle record with `source = auto_detected`, then link the event.

### Architecture Direction

The backend owns vehicle lookup and creation. The AI module should send plate and detection details only. The AI module should not decide which vehicle record owns the event.

### Scope

Create a backend linking service such as `AnprVehicleLinker`:

```text
normalized plate number
-> find existing vehicle by plate_number
-> if missing, create vehicle
-> return vehicle id
```

Backend vehicle linking rules:

- Normalize plate number before lookup.
- Use a database transaction.
- Use `firstOrCreate` or equivalent safe logic.
- Do not overwrite existing owner, status, or notes.
- For new records, set:
  - `plate_number` = detected plate
  - `source` = `auto_detected`
  - `status` = `normal`
  - `owner_name` = `null`
  - `vehicle_type` = `null`
  - `notes` = `null`

Integrate linking into ANPR event storage:

```text
AI posts ANPR event
-> backend validates payload
-> backend normalizes plate
-> backend links or creates vehicle
-> backend creates ANPR event with vehicle_id
-> backend returns event with vehicle relation
```

Add admin vehicle management APIs:

```text
GET /api/vehicles
GET /api/vehicles/{vehicle}
PATCH /api/vehicles/{vehicle}
```

Field behavior:

| Field | Behavior |
|---|---|
| `plate_number` | Read-only and immutable |
| `owner_name` | Editable |
| `vehicle_type` | Editable |
| `status` | Editable: `normal`, `flagged`, `whitelist` |
| `notes` | Editable |
| `source` | System-owned: `manual` or `auto_detected` |

Create frontend vehicle management under admin/management:

```text
src/feature/management-vehicle/
├── VehicleList.jsx
├── VehicleEditDrawer.jsx
├── VehicleDetail.jsx
├── VehicleRepository.js
├── vehicleManagementService.js
└── useVehicleManagementController.js
```

Update ANPR event detail page to show linked vehicle information:

- Plate number.
- Owner name.
- Vehicle type.
- Status.
- Notes.
- Source.
- Link to vehicle management detail/edit page.

### Passing Criteria

- Existing vehicle is reused.
- Missing vehicle is created once.
- Duplicate vehicle rows cannot be created for the same plate.
- Existing manual vehicle metadata is preserved.
- Every new ANPR event has `vehicle_id`.
- Backend response includes vehicle data.
- Flagged vehicle status is reflected in event/resource behavior.
- Event creation still works for unknown plates.
- Admin can list, view, and edit vehicles.
- Plate number is read-only at API level and in the frontend.
- Unauthorized users cannot access management endpoints.
- Admin can navigate from ANPR event detail to vehicle record.

### Milestone Pass Condition

Every backend ANPR event is linked to a vehicle record. Existing vehicles are reused, unknown vehicles are created automatically, and admins can manage vehicle owner/type/status/notes under admin/management while plate number remains immutable.

---

## M14 — Testing Architecture

### Goal

Protect the completed AI/backend/frontend ANPR architecture from regressions, including live monitoring and linked vehicle records.

### AI ANPR Unit Tests

Test:

- Config validation.
- Source resolution.
- Plate normalization.
- Vote selection.
- Track expiry.
- Duplicate cooldown.
- Backend queue retry.
- Token cache refresh.
- RTSP reconnect counters and shutdown behavior.

Passing criteria:

- All unit tests pass locally.
- No real RTSP camera or real backend is required for unit tests.

### AI ANPR Integration Tests

Required command coverage:

```bash
python main.py check-config
python main.py run --source image --image samples/images/<sample>.jpg --dry-run --strict
python main.py run --source video --video samples/videos/<sample>.mp4 --dry-run --strict
python main.py flush-backend-queue
```

Test:

- Image flow.
- Video flow.
- Backend queue success/failure/retry.
- Upload mode or metadata mode behavior.
- Fake backend server where possible.

Passing criteria:

- Image flow creates event, evidence, and summary.
- Video flow creates event, evidence, and summary.
- Backend queue handles success, failure, and retry.
- Evidence mode remains verifiable.

### Laravel Backend Tests

Test:

- ANPR event creation.
- Image upload or metadata creation.
- Event logs.
- Vehicle auto-linking by plate number.
- Vehicle auto-creation for unknown plate.
- No duplicate vehicle for the same plate.
- Plate number immutability.
- Vehicle update permissions.
- ANPR list/latest query.
- Event resource includes vehicle relation.

Passing criteria:

- Existing ANPR tests still pass.
- New vehicle-linking tests pass.
- Unauthorized users are rejected.
- Validation errors are field-level and frontend-readable.

### React Frontend Tests

Test:

- ANPR list renders events.
- Manual refresh works.
- Live polling starts and stops.
- Blinking LIVE indicator appears.
- Tooltip shows `Live update`.
- New row highlight appears.
- Event detail shows evidence and vehicle.
- Vehicle management page edits allowed fields.
- Plate number input is disabled or read-only.

Passing criteria:

- Component/controller tests pass.
- Repository normalization handles missing vehicle/evidence safely.
- Live polling does not create duplicate rows.

### End-to-End Manual Test Matrix

| Manual Test Case | Expected Result |
|---|---|
| AI dry-run image | Local event/evidence/summary generated. |
| AI dry-run video | Video finalization generates expected records. |
| AI RTSP short run | Runtime reads camera and shuts down cleanly. |
| AI RTSP live backend-enabled run | Backend receives event and evidence. |
| Backend event creation | ANPR event is stored and retrievable. |
| Evidence display | Frontend detail displays images. |
| Frontend live ANPR list | New rows appear without browser refresh. |
| Vehicle auto-link | Existing plate links to existing vehicle. |
| Vehicle admin edit | Allowed fields update; plate stays immutable. |
| Flagged vehicle detection | Event reflects flagged context. |
| Queue retry after backend downtime | Queued job retries and eventually posts. |

### Milestone Pass Condition

AI, backend, frontend, and end-to-end tests cover the complete ANPR flow, including live frontend updates and linked vehicle records.

---

## M15 — Performance and Accuracy Tuning Architecture

### Goal

Tune runtime speed, detection reliability, OCR quality, backend responsiveness, and frontend live update efficiency after correctness is already stable.

### Initial Performance Targets

| Metric / Criterion | Target |
|---|---:|
| Target processed FPS | 3-5 FPS |
| Event latency after vehicle disappearance | 2-5 seconds |
| Frontend live update delay | Preferably <= 10 seconds when polling |
| Backend posting | Async and non-blocking |
| Model loading | Once at startup |
| OCR calls | Minimized |
| Duplicate event spam | Controlled |

### Scope

Tune AI runtime:

- `ANPR_TARGET_FPS`.
- Vehicle confidence.
- Plate confidence.
- OCR confidence.
- Frame skipping.
- Device selection.
- CPU/GPU deployment profile.

Tune detection and OCR accuracy:

- Plate detection confidence.
- Vehicle detection confidence.
- Malaysian plate normalization rules.
- OCR preprocessing.
- Minimum vote count.
- Early finalization confidence.
- Track expiry.

Tune duplicate and cooldown behavior:

- Duplicate cooldown.
- Track expiry.
- Re-entry behavior.
- Same-plate repeated detection handling.

Tune backend query performance:

- Latest-first ANPR event list query.
- Plate number search.
- Vehicle relation eager loading.
- Image/log loading strategy.
- Database index usage.

Tune frontend live update efficiency:

- Polling interval.
- Request cancellation.
- Duplicate row prevention.
- New event highlight duration.
- Error backoff.
- Optional future upgrade to broadcast, SSE, or WebSocket.

Document deployment profiles:

- CPU profile.
- GPU profile.
- RTSP camera settings.
- Backend queue flush interval.
- Frontend polling interval.
- Evidence mode.
- Retention policy.
- Known accuracy limitations.

### Passing Criteria

- RTSP runtime sustains 3-5 processed FPS on demo hardware.
- Model loads once at startup.
- Backend posting does not block frame processing.
- False positives are reduced.
- Valid Malaysian plates are retained.
- OCR noise does not dominate final vote.
- One vehicle normally creates one final event.
- Same stationary vehicle does not spam events.
- A genuinely new pass can still create a new event after cooldown.
- ANPR list page remains responsive with growing event volume.
- Vehicle lookup by plate is indexed and reliable.
- Event detail loads evidence and vehicle data without excessive queries.
- Live update appears within acceptable delay.
- UI remains smooth.
- Failed polling does not spam backend or user.
- Final documentation includes recommended `.env` values.
- Demo profile and production-like profile are clearly separated.
- Limitations are documented honestly.

### Milestone Pass Condition

The platform meets agreed speed, latency, reliability, and usability targets under demo RTSP conditions, with documented tuning values and known limitations.

---

## 14. Revised Final Delivery Criteria

The AI ANPR platform is complete when all criteria below are satisfied.

### 14.1 AI Runtime Completion

```text
RTSP / Video / Image / Webcam
-> Source Reader
-> Frame Scheduler
-> Vehicle Detection
-> Plate Detection
-> OCR
-> Plate Normalization
-> Vote Buffer
-> Track Finalization
-> Evidence Creation
-> Backend Queue
```

Completion criteria:

- Models load once.
- Source opens once per run.
- RTSP reconnects after transient failure.
- Runtime shuts down gracefully.
- Active tracks finalize on shutdown.
- Backend failure does not stop detection.
- `events.jsonl`, evidence, logs, and summary are generated.

### 14.2 Backend Completion

```text
Backend Queue
-> Laravel ANPR Event
-> Laravel ANPR Images
-> Laravel ANPR Logs
-> Linked Vehicle Record
```

Completion criteria:

- AI-created events are accepted.
- Evidence is stored or resolvable.
- Event logs are created.
- Vehicle is found by plate number or created automatically.
- Every ANPR event has a linked `vehicle_id`.
- Plate number is immutable after vehicle creation.
- Backend validation errors are field-level and clear.

### 14.3 Frontend Completion

```text
Laravel API
-> React ANPR Monitoring
-> Live Event Table
-> Event Detail
-> Evidence Display
-> Vehicle Link
```

Completion criteria:

- ANPR list displays latest detections.
- New detections appear without manual browser refresh.
- Blinking red LIVE indicator appears beside the table title.
- Hover tooltip says `Live update`.
- New event rows are noticeable.
- Event detail shows evidence, camera, logs, and linked vehicle.
- Sensitive camera IP is not exposed.

### 14.4 Vehicle Management Completion

```text
Admin
-> Management
-> Vehicles
-> Edit owner/type/status/notes
```

Completion criteria:

- Admin can list vehicles.
- Admin can edit owner name, vehicle type, status, and notes.
- Plate number remains read-only and cannot be changed.
- Auto-detected vehicles can be completed later by admin.
- Flagged/whitelist status is reflected in ANPR event context.

### 14.5 Testing Completion

- AI unit, integration, and manual tests pass.
- Laravel feature tests pass.
- React controller and component tests pass.
- Live ANPR behavior is tested.
- Vehicle linking and immutability are tested.
- Queue retry and backend downtime behavior are tested.

### 14.6 Performance Completion

| Metric / Criterion | Target |
|---|---:|
| Target processed FPS | 3-5 FPS |
| Event latency after vehicle disappearance | 2-5 seconds |
| Frontend live update delay | Acceptable for polling, preferably <= 10 seconds |
| Backend posting | Async and non-blocking |
| OCR calls | Minimized |
| Duplicate event spam | Controlled |
| Deployment and tuning profile | Documented |

### Final Completion Statement

The system is final-delivery ready when a vehicle passing an RTSP camera can be detected by the AI runtime, finalized into one ANPR event, delivered with evidence to Laravel, automatically linked to a vehicle record, displayed live in React with a blinking LIVE indicator, and managed by an admin through immutable-plate vehicle records, with tests and performance criteria passed.

### Recommended Implementation Order

1. Finish M11 RTSP runtime acceptance and documentation.
2. Implement M12 backend latest-event query and frontend live polling first.
3. Add the blinking red LIVE indicator and new-row highlight.
4. Implement M13 backend vehicle linker before frontend vehicle management.
5. Add admin vehicle routes, API resource, and frontend management page.
6. Run M14 tests across AI, backend, frontend, and manual end-to-end flows.
7. Complete M15 tuning only after correctness is stable.

---

## 16. What Not To Build Initially

Do not build these in the first phase:

- Complex benchmark report generator.
- Full dashboard.
- WebSocket server in Python.
- Cloud upload.
- Roboflow hosted API runtime.
- Huge multi-stage folder pipeline.
- Too many preprocessing variants.
- Multiple OCR engines at once.
- Complicated tracker unless simple tracker fails.

---

## 17. Final New AI ANPR Module List

The clean new AI ANPR system should start with only these main modules:

| Module | File | Main role |
|---|---|---|
| CLI | `main.py` | User commands and entry point |
| Config | `config.py` | Load and validate `.env` settings |
| ANPR Runtime | `anpr.py` | Source reading, detection, tracking, OCR, voting, finalization, evidence, metrics |
| Backend Client/Queue | `backend.py` | Token cache, backend posting, image metadata/upload, async queue |

Supporting folders:

| Folder | Purpose |
|---|---|
| `models/vehicle/` | Vehicle YOLO model files or placeholders |
| `models/plate/` | Local plate YOLO `.pt` model, for example Hugging Face YOLOv11s |
| `samples/videos/` | Test videos like GitHub-style ANPR demos |
| `samples/images/` | Test images for single-frame validation |
| `runs/` | Local event/evidence outputs |
| `.cache/` | Token cache and backend queue files |

Potential future split only if needed:

| Future file | Split from | Reason |
|---|---|---|
| `source.py` | `anpr.py` | Source handling becomes too large |
| `detector.py` | `anpr.py` | YOLO wrappers become complex |
| `tracker.py` | `anpr.py` | Tracking logic becomes complex |
| `ocr.py` | `anpr.py` | OCR/preprocessing options grow |
| `plate_vote.py` | `anpr.py` | Voting/finalization grows |
| `evidence.py` | `anpr.py` | Evidence handling needs more modes |
| `backend_queue.py` | `backend.py` | Queue/retry logic grows |

Initial rule:

```text
Do not split early. Keep the first version understandable.
```

---

## 18. Summary

This AI ANPR module should be simple, fast, and practical.

The most important design choices are:

```text
Use sample video support from day one
Use RTSP continuous reading for real camera
Load models once
Keep track state in memory
OCR only selected plate crops
Finalize one event per vehicle
Save useful evidence only
Send backend work asynchronously
Cache backend token
Keep benchmark/reporting outside the runtime
```

---

## 24. References

The module can refer to these public resources while keeping the implementation independent:

- GitHub ANPR reference: `computervisioneng/automatic-number-plate-recognition-python-yolov8`
  - Useful for simple video-loop structure, YOLO vehicle detection, plate detection, tracking, OCR-on-crop, and compact output flow.
- Hugging Face plate model reference: `morsetechlab/yolov11-license-plate-detection`
  - Useful for local YOLOv11 license plate `.pt` model planning.
- Ultralytics YOLO documentation
  - Useful for loading local `.pt` model files and running prediction from Python.
- PaddleOCR documentation
  - Useful for OCR engine setup and plate crop text recognition.

Do not make runtime depend on internet access. Any model file should be downloaded manually and stored locally under `models/`.