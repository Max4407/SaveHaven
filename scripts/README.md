# Scripts

Repository utilities such as demo-data seeding or asset-catalog generation belong here. Each script must document its inputs, outputs, and safe usage.

## Seed fictional Nessie profiles

`seed_nessie_profiles.py` reads `data/fixtures/nessie_profiles.json` and creates the same
fictional customers, accounts, deposits, and withdrawals in the Nessie sandbox. It never sends
real banking data. Purchases and bills are realized as withdrawals: purchase creation requires
external merchant records and is not exposed in the current reference, while bill objects model
payable schedules rather than completed historical charges. The fixture category and merchant are
preserved in each withdrawal description.

Use the backend virtual environment from the repository root. Start with a dry run, which makes no
network requests and does not require an API key:

```powershell
backend\.venv\Scripts\python.exe scripts\seed_nessie_profiles.py
```

Add `NESSIE_API_KEY` to `backend/.env`, then explicitly enable remote writes:

```powershell
backend\.venv\Scripts\python.exe scripts\seed_nessie_profiles.py --apply
```

Useful options:

```powershell
# Seed only one profile.
backend\.venv\Scripts\python.exe scripts\seed_nessie_profiles.py --apply --profile steady-paycheck

# Also replace that fixture profile's placeholder customer_id for live backend reads.
backend\.venv\Scripts\python.exe scripts\seed_nessie_profiles.py --apply `
  --profile steady-paycheck --update-fixture-ids
```

The apply run writes the created customer/account ID mapping to the ignored local file
`data/fixtures/nessie_seed_state.local.json`. Nessie's create responses do not include created IDs,
so the script resolves them by comparing the documented GET collections before and after each
POST. Re-running is supported: exact matching customers and accounts are reused, and transaction
descriptions contain stable fixture source-ID markers so completed work is skipped after a partial
failure.

Nessie v1 documents money fields as whole-dollar integers. The script rounds fixture cents to the
nearest dollar, half-up, and derives each account's opening balance so replaying completed history
lands on the rounded fixture balance. The API key is read only from the environment or
`backend/.env`; do not put it on the command line or commit that file.

## Run weekly demo events

Seed the selected profile first so `nessie_seed_state.local.json` contains its real customer and
account IDs. The five convenience scripts below are dry runs unless `--apply` is present, and they
accept only fictional whole-dollar amounts:

```powershell
# Move the profile's local demo date forward seven days.
backend\.venv\Scripts\python.exe scripts\advance_demo_week.py `
  --profile steady-paycheck --apply

# Add a normal purchase intended to stay within its category budget.
backend\.venv\Scripts\python.exe scripts\make_planned_purchase.py `
  --profile steady-paycheck --amount 45 --apply

# Add a larger discretionary purchase intended to demonstrate an off-plan week.
backend\.venv\Scripts\python.exe scripts\make_unplanned_purchase.py `
  --profile steady-paycheck --amount 150 --apply

# Move money from checking to savings.
backend\.venv\Scripts\python.exe scripts\move_money_to_savings.py `
  --profile steady-paycheck --amount 200 --apply

# Deposit the profile's default paycheck. Override it with --amount if needed.
backend\.venv\Scripts\python.exe scripts\receive_paycheck.py `
  --profile steady-paycheck --apply
```

Run any command without `--apply` first to inspect its date, amount, target account, and encoded
transaction description. Planned and unplanned purchase scripts also accept `--merchant`,
`--category`, and `--description`. The paycheck script accepts `--employer`; without explicit
values it uses the selected profile's most recent fixture income amount and source.

The current Nessie reference has no transfer-creation POST endpoint. The savings command therefore
creates an idempotent checking withdrawal and matching savings deposit. Both are normalized as
internal transfers, so they do not inflate dashboard income or spending. If the network fails
between the two requests, rerunning the command completes only the missing side.

`advance_demo_week.py` updates the ignored file
`data/fixtures/nessie_demo_state.local.json`; it does not attempt to change a global clock in
Nessie. Subsequent event scripts use that simulated date. After creating an event, synchronize the
connected profile in SaveHaven so FastAPI imports the new Nessie records.

The same operations are also available as subcommands of `scripts/nessie_demo.py`. Stable event
markers make remote writes resumable without duplicating a partially completed event. The API key
continues to be read only from the environment or `backend/.env`.
