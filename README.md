# SaveHaven

SaveHaven is a hackathon prototype that turns progress toward a fictional savings plan into
rewards for a decorative town-building game. The current backend first pass provides signed demo
sessions, selectable fictional Nessie profiles, normalized financial data, explainable savings
plans, a controlled Nessie event lab, and SQLite persistence. Rewards and town state remain
server-authoritative and separate from the financial-planning flow.

## Backend setup

From PowerShell:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
uvicorn main:app --reload
```

The API documentation is available at `http://127.0.0.1:8000/docs`. Run checks from `backend/`
with:

```powershell
pytest
ruff check .
```

### Configuration

- `SESSION_SECRET`: long random string used to sign demo-session cookies. Set this locally so
  sessions survive server reloads; it is required in production.
- `DATABASE_URL`: defaults to `sqlite:///./savehaven.db`.
- `FRONTEND_ORIGIN`: the only browser origin allowed to send credentialed requests.
- `NESSIE_DATA_MODE`: keep as `fixture` until live Nessie access has been verified; change to
  `live` when a key is available.
- `NESSIE_API_KEY`: server-only Nessie key. Never expose it to Vite or commit it.
- `NESSIE_BASE_URL`: defaults to `https://prod-api.nessieisreal.com`.
- `NESSIE_ALLOW_FIXTURE_FALLBACK`: when true, a failed live read uses the matching fixture.
- `DEMO_CONTROLS_ENABLED`: enables authenticated Nessie Lab mutation routes. Keep false outside
  the fictional sandbox demonstration.

The frontend should send cookies with API calls (`credentials: "include"`). Money fields are
integer cents, and transaction amounts are signed: income is positive and spending is negative.

### Implemented routes

```text
GET  /health
POST /api/auth/demo-login
GET  /api/auth/session
POST /api/auth/logout
GET  /api/demo/nessie-profiles
POST /api/demo/nessie-events
POST /api/bank-connections
POST /api/bank-connections/sync
GET  /api/dashboard
POST /api/goals
GET  /api/goals/{goal_id}/plan
POST /api/goals/{goal_id}/accept-plan
```

Only `/health` and `/api/auth/demo-login` are public API routes. The built frontend is public and
all other API routes require the signed demo session. The app never accepts bank credentials or
real account information.

## Railway hackathon deployment

The root `Dockerfile` builds the Vite application and packages its static output, the FastAPI
backend, and the fictional fixtures into one image. FastAPI serves both the React application and
`/api/*`, so production uses one origin and one secure session cookie. The image deliberately runs
one Uvicorn worker because the hackathon deployment uses SQLite.

Railway's [free trial](https://docs.railway.com/pricing/free-trial) is enough for the short-lived
shared demo in the expected case. Connect the existing GitHub account when signing up, monitor the
trial balance, and only upgrade if the credit is close to running out before judging.

### Create the service

1. In Railway, create a project from this GitHub repository and select the `main` branch. Railway
   detects the root `Dockerfile`; no custom build or start command is required.
2. Add a persistent volume to the service and mount it at `/data`.
3. Under **Networking**, generate the free `*.up.railway.app` domain. Railway provisions HTTPS for
   that domain automatically.
4. Add the variables below, replacing the placeholder values, and redeploy.
5. Set the health-check path to `/health`, keep the service at one replica, and leave the start
   command from the image unchanged.
6. After `.github/workflows/ci.yml` has run on `main`, enable **Wait for CI** on the Railway service.
   Railway will then deploy a new `main` commit only after the GitHub checks pass.

Use these Railway service variables:

```dotenv
APP_ENV=production
DATABASE_URL=sqlite:////data/savehaven.db
SESSION_SECRET=<generate-a-long-random-value>
SESSION_COOKIE_SECURE=true
FRONTEND_ORIGIN=https://<generated-domain>.up.railway.app
NESSIE_DATA_MODE=fixture
NESSIE_ALLOW_FIXTURE_FALLBACK=true
DEMO_CONTROLS_ENABLED=false
```

For the Nessie judge demo, first seed the fictional profiles as described in `scripts/README.md`,
commit only the resulting fixture customer IDs, then change the last variables to:

```dotenv
NESSIE_API_KEY=<sealed-server-side-key>
NESSIE_DATA_MODE=live
NESSIE_ALLOW_FIXTURE_FALLBACK=true
DEMO_CONTROLS_ENABLED=true
```

Do not put these production values in GitHub Actions or commit them to the repository. Railway
supplies `PORT` at runtime, and the image binds to it automatically. Keep fallback enabled for
judging, but verify the full path once with fallback disabled so a fixture cannot masquerade as a
successful live sync.

### Verify and shut down

After a successful deploy, check the generated HTTPS URL and verify:

- `GET /health` returns `status: ok`.
- Demo login creates a `Secure`, `HttpOnly`, `SameSite=Lax` cookie and authenticated API requests
  succeed.
- Refreshing a React route such as `/town` loads the application instead of returning 404.
- Town assets load and the SQLite state survives a redeploy.
- The dashboard badge reads `Live Nessie Sandbox`, each Nessie Lab event changes the normalized
  ledger after a resync, and fixture fallback is visibly labeled amber.
- A deliberately failing pull-request check does not update the healthy Railway deployment.

Record the backup demo before judging. Afterwards, export any SQLite state worth keeping, then
delete both the Railway service and its persistent volume so they cannot continue consuming trial
credit. A custom domain is unnecessary for the hackathon; if one is added later, follow Railway's
[custom-domain instructions](https://docs.railway.com/networking/public-networking) and update
`FRONTEND_ORIGIN` to its exact HTTPS origin. Verified students can also check the
[GitHub Student Developer Pack](https://education.github.com/pack) for current domain offers.

## Continuous integration

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`. It checks Ruff and pytest on
Python 3.12, then checks lint, Vitest, and the production build on Node 22. After both jobs pass, a
third job builds the deployable image and smoke-tests `/health` and the React route fallback. The
workflow builds only; Railway owns deployment and production secrets.

## Frontend setup

From a second PowerShell window:

```powershell
cd frontend
npm install
npm run dev
```

The Vite development server runs at `http://localhost:5173` and proxies `/api/*` and `/health` to
FastAPI at `http://127.0.0.1:8000`. API requests use relative URLs and include the signed session
cookie, so no frontend environment variable is required for local development or a same-origin
deployment. If the API is hosted on a separate allowed origin, set `VITE_API_BASE_URL` in
`frontend/.env.local` and set the backend's `FRONTEND_ORIGIN` to the frontend origin.

The Nessie flow covers demo login, fictional profile selection, live/fallback provenance, bank
sync, explainable goal plans, and the separate Nessie Lab without changing the game architecture
described in `docs/PLAN.md`.

Run checks from `frontend/` with:

```powershell
npm test
npm run lint
npm run build
```
