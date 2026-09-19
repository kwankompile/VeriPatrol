# AI ANPR v1

Python runtime for vehicle/plate detection, OCR, tracking, and asynchronous delivery of finalized ANPR events to **Laravel**. The AI module detects and prepares evidence locally; **Laravel owns final ANPR events, images, event logs, and vehicle linking**.

**Primary reference:** [`ai-anpr-modules.md`](./ai-anpr-modules.md)  
**Documentation audit:** aligned with implementation **2026-07-09** (M0–M15 complete).

## Environment setup

Recommended Python: **3.11** or **3.12**.

```powershell
cd anpr
py -3.12 -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
pip install -r requirements-dev.txt
python -m pytest -q
```

Optional GPU (install after base requirements):

```powershell
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126
```

Set `ANPR_DEVICE=cuda` in `.env` when using GPU.

## Model files (manual setup)

YOLO `.pt` weights are **not** committed or auto-downloaded. Place files manually, then point `.env` at them:

```env
ANPR_VEHICLE_MODEL=models/vehicle/yolo11s.pt
ANPR_PLATE_MODEL=models/plate/license-plate-finetune-v1s.pt
```

## Configuration

Copy [`.env.example`](./.env.example) to `.env` and adjust.

### Backend identity (camera-authenticated)

When `ANPR_BACKEND_ENABLED=true`, the runtime authenticates as a **camera machine identity** (not a user account):

| Variable | Purpose |
| -------- | ------- |
| `ANPR_CAMERA_EMAIL` | Camera credential email (from Laravel admin camera management) |
| `ANPR_CAMERA_PASSWORD` | Camera credential password |
| `ANPR_RTSP_URL` | **Required** when backend is enabled — sent to `POST /api/camera-auth/login` |
| `ANPR_BACKEND_BASE_URL` | Laravel API base (e.g. `http://localhost:8000/api`) |

**Deprecated (ignored):** `ANPR_BACKEND_EMAIL`, `ANPR_BACKEND_PASSWORD`, `ANPR_BACKEND_CAMERA_ID` — camera ID is derived from camera login and cached in `.cache/backend_token.json`.

### Evidence delivery

When `ANPR_EVIDENCE_MODE` is **omitted**, the runtime defaults to **`upload`** (same as `.env.example`).

| Mode | Behavior |
| ---- | -------- |
| `upload` (**recommended** for deployment; **runtime default**) | AI uploads evidence via `POST /api/anpr-events/{id}/images/upload`; Laravel stores under `storage/app/anpr` |
| `metadata` (local dev) | AI posts file paths via `POST /api/anpr-images`; Laravel must resolve paths via `ANPR_IMAGE_ROOTS` |

Other evidence settings:

- `ANPR_SAVE_LOCAL_EVIDENCE=true` — save full/plate/annotated images under `runs/run_*/evidence/`
- `ANPR_DELETE_LOCAL_AFTER_UPLOAD=false` — when `true` + `upload` mode, delete local evidence after successful upload
- `ANPR_EVIDENCE_RETENTION_DAYS=0` — `0` = keep local evidence indefinitely; `>0` deletes evidence in **older** runs (never the current run)

### Runtime tuning (M11/M15)

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `ANPR_OCR_MIN_INTERVAL_SECONDS` | `0.35` | OCR throttle per track (`0` = disabled) |
| `ANPR_BACKEND_QUEUE_FLUSH_INTERVAL_SECONDS` | `10.0` | Periodic queue flush during RTSP/webcam runs |
| `ANPR_RTSP_RECONNECT_ENABLED` | `true` | Reconnect on RTSP read failures |
| `ANPR_RTSP_HEALTH_LOG_INTERVAL_SECONDS` | `15.0` | RTSP health metrics in `worker.log` |

See `.env.example` for the full list.

## Dry-run vs backend-enabled runs

| Mode | Command | Backend side effects |
| ---- | ------- | -------------------- |
| **Dry-run** | `python main.py run ... --dry-run` | **None** — local `runs/`, `events.jsonl`, evidence only; no enqueue, no login |
| **Backend-enabled** | `ANPR_BACKEND_ENABLED=true` + `python main.py run ...` (no `--dry-run`) | Enqueues jobs to `.cache/backend_queue.jsonl`, periodic + shutdown flush to Laravel |

Non-dry-run **requires** `ANPR_BACKEND_ENABLED=true` (otherwise CLI exits with an error).

## CLI

```bash
python main.py check-config
python main.py check-config --strict

# Local only (no backend)
python main.py run --source image --image samples/images/photo_6177158287829176211_w.jpg --dry-run --strict
python main.py run --source image --image samples/images/photo_6177158287829176212_w.jpg --dry-run --strict
python main.py run --source video --video samples/videos/document_6177158287369184218.mp4 --dry-run --strict
python main.py run --source rtsp --max-seconds 30 --dry-run --strict

# Backend-enabled (set ANPR_BACKEND_ENABLED=true and camera credentials in .env)
python main.py run --source image --image samples/images/photo_6177158287829176211_w.jpg --strict
python main.py run --source image --image samples/images/photo_6177158287829176212_w.jpg --strict
python main.py run --source image --image samples/images/photo_6235330583311617544_y.jpg --strict # Motorcycle
python main.py run --source video --video samples/videos/document_6177158287369184218.mp4 --strict
python main.py run --source rtsp --max-seconds 30 --strict

# Retry pending queue jobs without re-running detection
python main.py flush-backend-queue
```

**RTSP URLs:** configure `ANPR_RTSP_URL` in `.env` only. Passing an RTSP URL via `--source-path` is **rejected** by the CLI.

**Auto source path** (`--source-path`) infers image/video from file extension only — not RTSP.

## Tests

```bash
python -m pytest -q
python -m pytest tests/test_config.py -q
python -m pytest tests/test_camera_auth.py -q
python -m pytest tests/test_m15_performance_tuning.py -q
```

Test modules: `test_config`, `test_plate_normalization`, `test_tracking_and_voting`, `test_backend_queue`, `test_camera_auth`, `test_runtime_rtsp_resilience`, `test_integration`, `test_m15_performance_tuning`.

Tests use mocks/fixtures — no real RTSP, YOLO weights, PaddleOCR, or live Laravel required in CI. Current suite: **92** tests (`python -m pytest -q`).

## Output

Each run creates `runs/run_YYYYMMDD_HHMMSS/`:

| File | Contents |
| ---- | -------- |
| `worker.log` | Runtime log (RTSP health, queue flush, reconnect) |
| `worker_summary.json` | M15 metrics (`processed_fps`, OCR throttle skips, performance targets, …) |
| `events.jsonl` | One JSON line per finalized local event |
| `evidence/` | `full`, `plate`, `annotated` images (when enabled) |
| `backend_results.json` | Post-flush job status (backend-enabled runs) |

Queue state: `.cache/backend_queue.jsonl`  
Token cache: `.cache/backend_token.json` (JWT + `camera_id` from login)

## Blockchain (out of scope)

AI ANPR does **not** implement blockchain. Laravel handles proof anchoring for applicable records. See [`../blockchain/blockchain-module.md`](../blockchain/blockchain-module.md).

## Known limitations

- Strict dry-run requires local YOLO `.pt` files and PaddleOCR installed.
- Metadata evidence mode requires Laravel `ANPR_IMAGE_ROOTS` aligned with this machine's `runs/` path.
- RTSP runs flush the backend queue periodically and at shutdown; use `flush-backend-queue` after backend downtime.
- Laravel owns vehicle auto-linking, flagged status, and dashboard display — AI sends plate/confidence/evidence only.
