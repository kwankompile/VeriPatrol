# VeriPatrol

**Project:** Blockchain-Based AI Surveillance with Geolocation and PWA Integration  
**Course:** 2608-CSP600  
**Student:** 2024692584 (06) Muhammad Ikhwan Arifi Bin Ismail

Setup, integration, prototype, database, and raw-data guide.

This repository contains the Final Year Project prototype for a high-security
surveillance platform with AI ANPR, patrol geolocation (PWA), and blockchain
tamper-evident proof.

## 1. Repository Structure

  frontend/                   React 19 + Vite 7 dashboard / PWA (VeriPatrol UI)
  backend/                    Laravel 13 API, MySQL, JWT auth, queues, Reverb
  anpr/                       Python AI ANPR runtime (YOLO + OCR -> Laravel)
  blockchain/                 Solidity EvidenceStore + Hardhat (hashes only)
  docs/                       Deployment and module documentation
  .gitignore                  Shared ignore rules for the monorepo

## 2. Prerequisites

  - PHP 8.3+, Composer
  - MySQL 8.0+
  - Node.js ^20.19.0 or >=22.12.0 (Node 22 LTS recommended)
  - Yarn 4.10.3 via Corepack (frontend), npm (blockchain)
  - Python 3.11 or 3.12 (AI ANPR)
  - Optional: Ganache (local blockchain) or Sepolia RPC (testnet)
  - Optional: PHP ext-gmp for Sepolia signed transactions
  - Optional: CUDA GPU for faster ANPR inference

## 3. Database Setup (Laravel / MySQL)

  1) Create a MySQL database, for example:

       CREATE DATABASE fyp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

  2) From the repository root, in backend/:

       cd backend
       copy .env.example .env
       composer install
       php artisan key:generate
       php artisan jwt:secret

  3) Set database credentials in .env:

       DB_CONNECTION=mysql
       DB_HOST=127.0.0.1
       DB_PORT=3306
       DB_DATABASE=fyp
       DB_USERNAME=<your_user>
       DB_PASSWORD=<your_password>

  4) Run migrations and seed base roles/users:

       php artisan migrate
       php artisan db:seed
       php artisan storage:link

  Default seeded accounts (initial password for all: password):
       admin@example.com     - Admin
       operator@example.com  - Security Operator
       guard@example.com     - Guard

  On first login, each seeded user must complete TOTP two-factor setup before
  an authenticated access token is issued.

  Optional demo seeders (zones, cameras, patrol, ANPR, blockchain) are listed
  in database/seeders/DatabaseSeeder.php and can be enabled if needed.

## 4. Backend Setup (API Prototype)

  From the repository root:

       cd backend

  Important .env settings for local linking:
       APP_URL=http://localhost:8000
       CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
       QUEUE_CONNECTION=database

  Start the API:

       php artisan serve

  API base URL: http://localhost:8000/api

  For Web Push / realtime / blockchain (optional):
       - Configure VAPID_* for push notifications
       - For realtime, set BROADCAST_CONNECTION=reverb and configure:
           REVERB_APP_ID=<local-app-id>
           REVERB_APP_KEY=<local-app-key>
           REVERB_APP_SECRET=<local-app-secret>
           REVERB_HOST=localhost
           REVERB_PORT=8080
           REVERB_SCHEME=http
       - Run: php artisan reverb:start
       - Run queue worker: php artisan queue:work
          (required when BLOCKCHAIN_ENABLED=true)

  Full deployment notes: docs/deploy-documentation.md

## 5. Frontend Setup (Dashboard / PWA)

  From the repository root, in a separate terminal:

       cd frontend
       corepack enable
       yarn install --immutable

  Copy .env.example to .env.local and link to the backend:

       VITE_APP_BASE_NAME=/
       VITE_API_BASE_URL=http://localhost:8000/api

  Optional realtime / push (must match backend):
       VITE_VAPID_PUBLIC_KEY=<same as backend VAPID_PUBLIC_KEY>
       VITE_REVERB_APP_KEY=<same as REVERB_APP_KEY>
       VITE_REVERB_HOST=localhost
       VITE_REVERB_PORT=8080
       VITE_REVERB_SCHEME=http

  Start the UI:

       yarn start

  Open: http://localhost:3000

  Login with a seeded account and complete first-login TOTP setup (Section 3).
  All authenticated roles can access the patrol flow. Guards primarily use the
  mobile/PWA patrol workflow. Admin and Security Operator can access patrol and
  ANPR monitoring; blockchain monitoring is Admin-only.

## 6. AI ANPR Setup and Backend Integration

  From the repository root, in a separate terminal:

       cd anpr

       py -3.12 -m venv .venv
       .\.venv\Scripts\activate
       python -m pip install -r requirements.txt

  Copy .env.example to .env.

  Model files are NOT committed. Place YOLO weights manually, for example:
       models/vehicle/yolo11s.pt
       models/plate/license-plate-finetune-v1s.pt

  Point .env at them:
       ANPR_VEHICLE_MODEL=models/vehicle/yolo11s.pt
       ANPR_PLATE_MODEL=models/plate/license-plate-finetune-v1s.pt

  Link to Laravel (camera machine identity, not a user login):
       ANPR_BACKEND_ENABLED=true
       ANPR_BACKEND_BASE_URL=http://localhost:8000/api
       ANPR_CAMERA_EMAIL=<camera email from Admin > Camera Management>
       ANPR_CAMERA_PASSWORD=<camera password>
       ANPR_RTSP_URL=<camera RTSP URL registered for that camera>
       ANPR_EVIDENCE_MODE=upload

  Dry-run (local only, no backend writes):
       python main.py run --source image --image samples/images/photo_6177158287829176211_w.jpg --dry-run --strict

  Backend-enabled run:
       python main.py run --source image --image samples/images/photo_6177158287829176211_w.jpg --strict
       python main.py run --source video --video samples/videos/document_6177158287369184218.mp4 --strict
       python main.py run --source rtsp --max-seconds 30 --strict

  Evidence flow (recommended upload mode):
       AI detects plate -> uploads evidence to Laravel -> Laravel stores under
       storage/app/anpr and shows events in Frontend ANPR Monitoring.

  For local metadata mode only, set ANPR_EVIDENCE_MODE=metadata and configure
  Laravel ANPR_IMAGE_ROOTS to the AI runs directory on this machine.

## 7. Blockchain Setup and Integration

  The chain stores HASHES ONLY (no images, plates, GPS, or personal data).
  Laravel owns anchoring; React and AI never call Ethereum directly.

  A) Local Ganache (prototype):
       1. Start Ganache (RPC e.g. http://127.0.0.1:7545, chain id 1337)
       2. From the repository root: cd blockchain
          npm ci
          npm run deploy:ganache
       3. Copy contract address from:
          deployments/ganache/EvidenceStore.json
       4. In backend/.env:
          BLOCKCHAIN_ENABLED=true
          BLOCKCHAIN_NETWORK=ganache
          BLOCKCHAIN_RPC_URL=http://127.0.0.1:7545
          BLOCKCHAIN_CONTRACT_ADDRESS=<deployed_address>
          BLOCKCHAIN_CONTRACT_ABI_PATH=../blockchain/deployments/ganache/EvidenceStore.json
       5. In a separate terminal, from the repository root:
          cd backend
          php artisan blockchain:check-config
          php artisan queue:work

  B) Sepolia testnet: see docs/blockchain-milestone/m9-sepolia-deployment.md

  Admin UI: /admin/blockchain-monitoring (Admin role only)

## 8. How the Prototype Modules Link Together

  React (frontend)
      |  HTTPS/JSON + JWT (+ optional Reverb WebSocket, Web Push)
      v
  Laravel API (backend)             <---- MySQL (source of truth)
      ^                                 |
      | camera JWT + evidence upload    | queue jobs (hashes)
      |                                 v
  AI ANPR (anpr)                   Ethereum EvidenceStore
                                  (blockchain / Ganache or Sepolia)

  Typical end-to-end demo path:
    1. Start MySQL + Laravel (serve + queue worker)
    2. Start React and log in as Admin
    3. Create/register a camera credential in Camera Management
    4. Configure anpr/.env with that camera and run detection
    5. View ANPR events in Admin ANPR Monitoring
    6. (Optional) Enable blockchain and view proofs in Blockchain Monitoring
    7. (Optional) Guard logs in on mobile PWA, runs patrol with geolocation,
       Admin views Patrol Monitoring

## 9. Raw Data / Sample Data

  AI ANPR samples currently included in the repository:
       anpr/samples/images/photo_6177158287829176211_w.jpg
       anpr/samples/images/photo_6177158287829176212_w.jpg
       anpr/samples/images/photo_6235330583311617544_y.jpg
       anpr/samples/videos/document_6177158287369184218.mp4

  AI run outputs (generated at runtime, not source data):
       anpr/runs/run_*/events.jsonl
       anpr/runs/run_*/evidence/
       anpr/runs/run_*/worker.log
       anpr/runs/run_*/worker_summary.json
       anpr/runs/run_*/backend_results.json  (backend-enabled runs)

  Backend-owned evidence after upload:
       backend/storage/app/anpr/

  Model weights (manual / external raw assets):
       anpr/models/vehicle/*.pt
       anpr/models/plate/*.pt
       (e.g. license-plate-finetune-v1s.pt used for plate detection)

  Database content:
       Created by migrations + seeders; operational data is produced by the
       running prototype (ANPR events, patrol sessions, blockchain_records).

  Do not commit secrets (.env, private keys, camera passwords, JWT secrets).

## 10. Quick Local Start Checklist

  [ ] MySQL running; database created
  [ ] backend: .env, composer install, migrate, seed, storage:link
  [ ] php artisan serve   (+ queue:work if blockchain enabled)
  [ ] frontend: corepack enable, yarn install --immutable, configure .env.local
  [ ] (Optional) anpr: venv, models, camera credentials, run detection
  [ ] (Optional) Ganache + deploy contract + BLOCKCHAIN_* in Laravel .env
