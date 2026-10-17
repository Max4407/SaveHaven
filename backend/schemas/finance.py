from datetime import date, datetime

from pydantic import BaseModel, Field


class SnapshotAccount(BaseModel):
    source_account_id: str
    account_type: str
    nickname: str
    balance_cents: int


class SnapshotTransaction(BaseModel):
    source_account_id: str
    source_id: str
    occurred_at: date
    signed_amount_cents: int
    direction: str
    kind: str
    merchant_name: str | None = None
    category: str
    description: str = ""


class FinancialSnapshot(BaseModel):
    profile_id: str
    customer_id: str
    customer_display_name: str
    as_of: date
    accounts: list[SnapshotAccount]
    transactions: list[SnapshotTransaction]


class DemoProfileResponse(BaseModel):
    id: str
    display_name: str
    description: str
    income_pattern: str


class ConnectBankRequest(BaseModel):
    profile_id: str = Field(min_length=1, max_length=80)


class BankConnectionResponse(BaseModel):
    profile_id: str
    nessie_customer_id: str
    display_name: str
    data_source: str
    last_synced_at: datetime | None


class AccountResponse(BaseModel):
    source_account_id: str
    account_type: str
    nickname: str
    balance_cents: int


class TransactionResponse(BaseModel):
    source_account_id: str
    source_id: str
    occurred_at: date
    signed_amount_cents: int
    direction: str
    kind: str
    merchant_name: str | None
    category: str
    description: str


class SpendingCategoryResponse(BaseModel):
    category: str
    amount_cents: int


class DashboardSummaryResponse(BaseModel):
    as_of: date
    total_balance_cents: int
    checking_balance_cents: int
    savings_balance_cents: int
    income_last_30_days_cents: int
    spending_last_30_days_cents: int


class DashboardResponse(BaseModel):
    connection: BankConnectionResponse
    summary: DashboardSummaryResponse
    accounts: list[AccountResponse]
    recent_transactions: list[TransactionResponse]
    spending_by_category: list[SpendingCategoryResponse]
    forecast: None = None
    active_goal: None = None
