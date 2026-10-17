from typing import Any

import httpx

from integrations.nessie.normalize import normalize_nessie_snapshot
from schemas import FinancialSnapshot


class NessieRequestError(RuntimeError):
    pass


class NessieClient:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        timeout_seconds: float,
        http_client: httpx.Client | None = None,
    ) -> None:
        self._api_key = api_key
        self._owns_client = http_client is None
        self._client = http_client or httpx.Client(
            base_url=base_url.rstrip("/") + "/",
            timeout=timeout_seconds,
        )

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def fetch_snapshot(
        self,
        *,
        profile_id: str,
        customer_id: str,
    ) -> FinancialSnapshot:
        customer = self._get_object(f"customers/{customer_id}")
        accounts = self._get_list(f"customers/{customer_id}/accounts")
        transactions_by_account: dict[str, dict[str, list[dict[str, Any]]]] = {}

        for account in accounts:
            account_id = str(account.get("_id") or account.get("id") or "")
            if not account_id:
                continue
            transactions_by_account[account_id] = {
                "deposit": self._get_list(f"accounts/{account_id}/deposits"),
                "withdrawal": self._get_list(f"accounts/{account_id}/withdrawals"),
                "purchase": self._get_list(f"accounts/{account_id}/purchases"),
                "transfer": self._get_list(f"accounts/{account_id}/transfers"),
                "bill": self._get_list(f"accounts/{account_id}/bills"),
            }

        return normalize_nessie_snapshot(
            profile_id=profile_id,
            customer_id=customer_id,
            customer=customer,
            accounts=accounts,
            transactions_by_account=transactions_by_account,
        )

    def _get_object(self, path: str) -> dict[str, Any]:
        payload = self._get_json(path)
        if not isinstance(payload, dict):
            raise NessieRequestError(f"Nessie returned an unexpected object for {path}")
        return payload

    def _get_list(self, path: str) -> list[dict[str, Any]]:
        payload = self._get_json(path)
        if not isinstance(payload, list) or not all(isinstance(item, dict) for item in payload):
            raise NessieRequestError(f"Nessie returned an unexpected list for {path}")
        return payload

    def _get_json(self, path: str) -> Any:
        try:
            response = self._client.get(path, params={"key": self._api_key})
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise NessieRequestError(f"Nessie request failed for {path}") from error
