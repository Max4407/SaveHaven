# Repository Guidelines

## Plan

Reference `docs/PLAN.md` for SaveHaven's product goals, agreed scope, architecture, financial-planning rules, game economy, milestones, and definition of done. Always ask before modifying `docs/PLAN.md`.

## Stack

- Backend: FastAPI on Python 3.12, SQLAlchemy, and SQLite for the single-instance hackathon deployment.
- Frontend: React with TypeScript and Vite, Tailwind CSS for application styling, Recharts for financial charts, and Phaser for the town canvas.
- Data fetching: TanStack Query. Do not add another frontend state or data-fetching library without asking first.
- Auth: pre-seeded demo users with a signed server session cookie using `HttpOnly`, `Secure` in deployment, and `SameSite=Lax`.
- External data: Capital One Nessie sandbox, called only from the backend. Local normalized fixtures provide the demo fallback.
- Testing: pytest for the backend and Vitest with React Testing Library for the frontend.

## Project Structure & Module Organization

- `frontend/`
  - `public/assets/town/`: optimized runtime town assets and the building catalog.
  - `src/api/`: typed HTTP client functions and API response types.
  - `src/components/`: reusable, domain-neutral React components.
  - `src/features/`: feature code grouped by `auth`, `onboarding`, `dashboard`, `goals`, `spending_plan`, and `town`.
  - `src/features/town/catalog/`: catalog UI and catalog-specific helpers.
  - `src/features/town/scenes/`: Phaser scenes.
  - `src/features/town/objects/`: Phaser game objects and placement helpers.
  - `src/hooks/`: reusable React hooks.
  - `src/styles/`: global styles and design tokens not expressed through Tailwind configuration.
  - `tests/`: cross-feature frontend tests; colocate narrow component tests when clearer.
- `backend/`
  - `api/`: FastAPI route modules and HTTP-only concerns.
  - `services/`: finance, forecasting, planning, rewards, wallet, and placement business logic.
  - `repository/`: all database queries and persistence operations.
  - `models/`: SQLAlchemy models.
  - `schemas/`: Pydantic request, response, and domain-boundary schemas.
  - `integrations/nessie/`: Nessie HTTP client, response parsing, and normalization.
  - `auth/`: demo-session creation and authentication dependencies.
  - `database/`: engine, session, and database initialization.
  - `tests/`: mirrors the backend package structure.
  - `main.py`: application construction and router registration only.
- `assets/source/`: locally supplied source art when its license permits repository storage. Do not serve these files directly.
- `data/fixtures/`: sanitized, fictional Nessie-shaped or normalized demo fixtures.
- `docs/PLAN.md`: product and implementation plan.
- `scripts/`: one-off, documented repository utilities such as demo seeding or asset-manifest generation.

## Commands

- Backend dev server: `uvicorn main:app --reload` from `backend/`.
- Frontend dev server: `npm run dev` from `frontend/`.
- Backend tests: `pytest` from `backend/`.
- Backend lint: `ruff check .` from `backend/`.
- Frontend tests: `npm test` from `frontend/`.
- Frontend lint: `npm run lint` from `frontend/`.
- Frontend production check: `npm run build` from `frontend/`.

If a command is not available because its scaffold or configuration has not been created yet, say so rather than substituting an unrelated toolchain.

## Coding Style & Naming Conventions

Use UTF-8 files, final newlines, and spaces rather than tabs. Keep modules small and avoid unrelated refactors in focused changes.

- Python: `snake_case` for modules, functions, variables, and test names; `PascalCase` for classes and Pydantic/SQLAlchemy types; uppercase names for constants.
- TypeScript: `PascalCase` for React components, Phaser scenes, and types; `camelCase` for functions, hooks, variables, and object fields.
- Hooks begin with `use`.
- CSS class names and asset filenames use lowercase kebab-case. Documentation filenames use uppercase only for repository-standard files such as `README.md`, `AGENTS.md`, and `PLAN.md`.
- Prefer descriptive financial and game-domain names over abbreviations.
- Keep React UI state in React. Keep rendered-world interaction in Phaser. Communicate through the typed town bridge rather than sharing mutable objects.

## Testing Guidelines

- Mirror backend modules under `backend/tests/`; name files `test_<module>.py`.
- Cover happy-path, boundary, and failure cases. Every bug fix needs a regression test.
- Tests for forecasts and rewards must encode the product rule being protected, including sparse history, caps, essential-expense handling, and reward idempotency.
- Route tests must verify authentication and cross-user authorization, not just response shapes.
- Repository tests should use isolated test data and must not call the live Nessie API.
- Nessie integration tests use sanitized fixtures or an injected fake client.
- Frontend tests should cover critical forms, loading/error states, reward explanations, catalog purchases, and the React–Phaser bridge contract.
- Keep the narrowest relevant test suite fast enough to run before every merge.

## Commit & Pull Request Guidelines

Use short, imperative commit subjects, optionally following Conventional Commits, such as `feat: add recurring-income forecast` or `fix: prevent duplicate weekly rewards`. Keep each commit coherent.

Pull requests should explain the problem and solution, list verification performed, and link related issues. Include screenshots or recordings for financial UI or town changes. Call out environment variables, fixture changes, database migrations, asset-license implications, and compatibility impacts. Keep pull requests reviewable and ensure relevant checks pass before requesting review.

## Security & Configuration

- Never commit credentials, Nessie API keys, session secrets, real banking information, or personal financial data.
- Store local settings in ignored environment files and provide a sanitized `.env.example`.
- Document every required environment variable in `README.md`.
- The browser must never receive the Nessie API key.
- Do not log authenticated Nessie URLs, cookies, secrets, or full financial payloads.
- Do not request or accept real online-banking usernames, passwords, routing numbers, full account numbers, payment-card numbers, or Social Security numbers.
- Use only fictional data in fixtures, screenshots, recordings, and presentations.
- Verify the purchased asset pack's redistribution license before committing source art to a public repository.
- Authentication and authorization are enforced on the server. Do not treat hidden UI controls as access control.

## Conventions

- All FastAPI routes go in `backend/api/`, not directly in `backend/main.py`.
- HTTP-specific validation and status mapping stay in route modules; reusable business rules live in `backend/services/`.
- Database access goes through `backend/repository/`; services do not embed ad hoc SQL queries.
- All Nessie requests and Nessie-specific parsing live in `backend/integrations/nessie/`.
- Routes other than `POST /api/auth/demo-login` and `GET /health` require the shared demo-session dependency unless the plan explicitly identifies another public route.
- The finance domain never directly mutates game state. It creates a completed plan-period evaluation, and the reward service translates that evaluation into a game event.
- Reward processing must be idempotent for a user, plan period, and reward type.
- Wallet balances, purchases, placement validity, and ownership are server-authoritative.
- The building catalog is data-driven. Adding a decorative building should require an asset and catalog record, not a new code path.
- Keep the catalog, fixture, and API schemas stable once frontend and backend integration begins; coordinate intentional changes with both owners.
- Do not introduce a new frontend framework, state library, database, authentication system, or service boundary without asking first.
- Do not modify `docs/PLAN.md` without explicit user approval.

## Non-goals

- Do not connect to real banks or move real money.
- Do not build production financial advice, identity verification, or know-your-customer workflows.
- Do not add production multi-user authentication, password recovery, email verification, or multifactor authentication during the hackathon.
- Do not add multiplayer, trading, town visits, leaderboards, or chat.
- Do not add citizens, combat, pathfinding, resource-production chains, or complex building simulation.
- Do not add a large machine-learning model or separate machine-learning service.
- Do not add native mobile applications.
- Do not add microservices, WebSockets, distributed queues, or speculative abstractions.

## Rule 1 — Think Before Coding

State assumptions explicitly. Ask rather than guess.

Push back when a simpler approach exists. Stop when confused.

## Rule 2 — Simplicity First

Minimum code that solves the problem. Nothing speculative.

No abstractions for single-use code.

## Rule 3 — Surgical Changes

Touch only what you must. Don't improve adjacent code.

Match existing style. Don't refactor what isn't broken.

## Rule 4 — Goal-Driven Execution

Define success criteria before implementation. Verify with the narrowest relevant check. If verification cannot run, say exactly why.

## Rule 5 — Surface conflicts, don't average them

If two patterns contradict, pick one (more recent / more tested).

Explain why. Flag the other for cleanup.

Don't blend conflicting patterns.

## Rule 6 — Read before you write

Before adding code, read exports, immediate callers, shared utilities.

If unsure why existing code is structured a certain way, ask.

## Rule 7 — Tests verify intent, not just behavior

Tests must encode WHY behavior matters, not just WHAT it does.

A test that can't fail when business logic changes is wrong.

## Rule 8 — Match the codebase's conventions, even if you disagree

Conformance > taste inside the codebase.

If you think a convention is harmful, surface it. Don't fork it silently.

## Rule 9 — (IMPORTANT) Pushback when appropriate

If a prompt has an idea that may be bad or fundamental misunderstanding, push back freely and explain reasoning. 

It is better to raise concerns than to implement fault or inefficient features.
