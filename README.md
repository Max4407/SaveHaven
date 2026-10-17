# SaveHaven

SaveHaven is a hackathon prototype that turns progress toward a fictional savings plan into
rewards for a decorative town-building game. The current backend first pass provides signed demo
sessions, selectable fictional Nessie profiles, normalized financial data, SQLite persistence,
and a dashboard summary. Forecasting, goals, plans, rewards, and town state are intentionally left
for their feature owners.

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

The frontend should send cookies with API calls (`credentials: "include"`). Money fields are
integer cents, and transaction amounts are signed: income is positive and spending is negative.

### Implemented routes

```text
GET  /health
POST /api/auth/demo-login
GET  /api/auth/session
POST /api/auth/logout
GET  /api/demo/nessie-profiles
POST /api/bank-connections
POST /api/bank-connections/sync
GET  /api/dashboard
```

Only `/health` and `/api/auth/demo-login` are public. The app never accepts bank credentials or
real account information.

### SQLite deployment assumptions

The hackathon deployment uses one application instance and one Uvicorn worker. Store the database
on the EC2 instance's EBS-backed filesystem, not inside a disposable container layer or on a
shared network filesystem. For example:

```dotenv
DATABASE_URL=sqlite:////var/lib/savehaven/savehaven.db
```

The application enables foreign-key enforcement, WAL journaling, and a five-second lock wait for
SQLite connections. Bind Uvicorn to `127.0.0.1:8000`, expose only HTTPS through the EC2 security
group, and have the public reverse proxy forward `/api/*` to FastAPI.

## Frontend setup

The frontend package currently records the intended libraries, but its Vite source scaffold and
scripts have not been added yet. The frontend owner should complete that scaffold before using
`npm run dev`.
