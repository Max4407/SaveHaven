from typing import Any

import httpx

from integrations.nessie.normalize import normalize_nessie_snapshot
from schemas import FinancialSnapshot


class NessieRequestError(RuntimeError):
    pass


class NessieResourceNotFoundError(NessieRequestError):
    pass


class NessieClient:
    _WRITABLE_RESOURCES = {"deposits", "withdrawals"}

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
                "deposit": self._get_list(
                    f"accounts/{account_id}/deposits", missing_is_empty=True
                ),
                "withdrawal": self._get_list(
                    f"accounts/{account_id}/withdrawals", missing_is_empty=True
                ),
                "purchase": self._get_list(
                    f"accounts/{account_id}/purchases", missing_is_empty=True
                ),
                "transfer": self._get_list(
                    f"accounts/{account_id}/transfers", missing_is_empty=True
                ),
                "bill": self._get_list(
                    f"accounts/{account_id}/bills", missing_is_empty=True
                ),
            }

        return normalize_nessie_snapshot(
            profile_id=profile_id,
            customer_id=customer_id,
            customer=customer,
            accounts=accounts,
            transactions_by_account=transactions_by_account,
        )

    def list_account_records(
        self, *, account_id: str, resource: str
    ) -> list[dict[str, Any]]:
        self._validate_writable_resource(resource)
        return self._get_list(f"accounts/{account_id}/{resource}", missing_is_empty=True)

    def create_account_record(
        self,
        *,
        account_id: str,
        resource: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._validate_writable_resource(resource)
        response = self._post_json(f"accounts/{account_id}/{resource}", payload)
        if not isinstance(response, dict):
            raise NessieRequestError(
                f"Nessie returned an unexpected object for accounts/{account_id}/{resource}"
            )
        return response

    def delete_account_record(self, *, resource: str, record_id: str) -> None:
        self._validate_writable_resource(resource)
        singular_resource = "withdrawal" if resource == "withdrawals" else "deposits"
        self._delete(f"{singular_resource}/{record_id}")

    def _validate_writable_resource(self, resource: str) -> None:
        if resource not in self._WRITABLE_RESOURCES:
            raise ValueError(f"Unsupported writable Nessie resource: {resource}")

    def _get_object(self, path: str) -> dict[str, Any]:
        payload = self._get_json(path)
        if not isinstance(payload, dict):
            raise NessieRequestError(f"Nessie returned an unexpected object for {path}")
        return payload

    def _get_list(
        self, path: str, *, missing_is_empty: bool = False
    ) -> list[dict[str, Any]]:
        try:
            payload = self._get_json(path)
        except NessieResourceNotFoundError:
            if missing_is_empty:
                return []
            raise
        if not isinstance(payload, list) or not all(isinstance(item, dict) for item in payload):
            raise NessieRequestError(f"Nessie returned an unexpected list for {path}")
        return payload

    def _get_json(self, path: str) -> Any:
        try:
            response = self._client.get(path, params={"key": self._api_key})
            if response.status_code == 404:
                raise NessieResourceNotFoundError(f"Nessie resource was not found for {path}")
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError):
            raise NessieRequestError(f"Nessie request failed for {path}") from None

    def _post_json(self, path: str, payload: dict[str, Any]) -> Any:
        try:
            response = self._client.post(path, params={"key": self._api_key}, json=payload)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError):
            raise NessieRequestError(f"Nessie request failed for {path}") from None

    def _delete(self, path: str) -> None:
        try:
            response = self._client.delete(path, params={"key": self._api_key})
            response.raise_for_status()
        except httpx.HTTPError:
            raise NessieRequestError(f"Nessie request failed for {path}") from None
