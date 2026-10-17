import json

import httpx

from integrations.nessie import NessieClient


def test_live_client_fetches_and_normalizes_customer_account_resources() -> None:
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(request.url.path)
        if request.url.path == "/accounts/checking-1/transfers":
            return httpx.Response(404, json={"message": "not found"})
        payloads = {
            "/customers/customer-1": {"first_name": "Jordan", "last_name": "Lee"},
            "/customers/customer-1/accounts": [
                {
                    "_id": "checking-1",
                    "type": "Checking",
                    "nickname": "Checking",
                    "balance": 1000,
                }
            ],
            "/accounts/checking-1/deposits": [
                {
                    "_id": "deposit-1",
                    "transaction_date": "2026-10-10",
                    "amount": 500,
                    "description": "Paycheck",
                }
            ],
            "/accounts/checking-1/withdrawals": [],
            "/accounts/checking-1/purchases": [],
            "/accounts/checking-1/bills": [],
        }
        return httpx.Response(200, json=payloads[request.url.path])

    http_client = httpx.Client(
        base_url="https://example.test/",
        transport=httpx.MockTransport(handler),
    )
    client = NessieClient(
        api_key="secret-test-key",
        base_url="https://unused.test",
        timeout_seconds=1,
        http_client=http_client,
    )

    snapshot = client.fetch_snapshot(profile_id="steady-paycheck", customer_id="customer-1")

    assert snapshot.customer_display_name == "Jordan Lee"
    assert snapshot.accounts[0].balance_cents == 100_000
    assert snapshot.transactions[0].signed_amount_cents == 50_000
    assert "/accounts/checking-1/bills" in requested


def test_live_client_supports_deposit_and_withdrawal_writes() -> None:
    writes: list[tuple[str, dict[str, object]]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, json=[])
        writes.append((request.url.path, json.loads(request.content)))
        return httpx.Response(201, json={"_id": "created-1"})

    client = NessieClient(
        api_key="secret-test-key",
        base_url="https://unused.test",
        timeout_seconds=1,
        http_client=httpx.Client(
            base_url="https://example.test/",
            transport=httpx.MockTransport(handler),
        ),
    )

    client.create_account_record(
        account_id="checking-1",
        resource="deposits",
        payload={"amount": 100},
    )
    client.create_account_record(
        account_id="checking-1",
        resource="withdrawals",
        payload={"amount": 25},
    )

    assert [path for path, _payload in writes] == [
        "/accounts/checking-1/deposits",
        "/accounts/checking-1/withdrawals",
    ]


def test_live_client_uses_nessie_delete_paths_for_demo_cleanup() -> None:
    deletes: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        deletes.append(request.url.path)
        return httpx.Response(204)

    client = NessieClient(
        api_key="secret-test-key",
        base_url="https://unused.test",
        timeout_seconds=1,
        http_client=httpx.Client(
            base_url="https://example.test/",
            transport=httpx.MockTransport(handler),
        ),
    )

    client.delete_account_record(resource="deposits", record_id="deposit-1")
    client.delete_account_record(resource="withdrawals", record_id="withdrawal-1")

    assert deletes == ["/deposits/deposit-1", "/withdrawal/withdrawal-1"]
