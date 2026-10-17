from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


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


class ImportSummaryResponse(BaseModel):
    account_count: int
    transaction_count: int
    transaction_types: list[str]


class ForecastResponse(BaseModel):
    weekly_income_cents: int
    weekly_recurring_bills_cents: int
    weekly_variable_spending_cents: int
    safety_buffer_cents: int
    income_cadence: str
    confidence: Literal["low", "medium", "high"]
    detected_deposit_count: int
    evidence: list[str]


class GoalResponse(BaseModel):
    id: int
    name: str
    target_amount_cents: int
    amount_already_saved_cents: int
    target_date: date


class SavingsPlanResponse(BaseModel):
    goal_id: int
    weekly_income_cents: int
    weekly_recurring_bills_cents: int
    weekly_variable_spending_cents: int
    safety_buffer_cents: int
    weekly_savings_cents: int
    safe_to_spend_cents: int
    confidence: Literal["low", "medium", "high"]
    income_cadence: str
    feasible: bool
    suggested_target_date: date | None
    explanation: str
    evidence: list[str]
    status: Literal["draft", "accepted"]
    accepted_at: datetime | None = None


class GoalPlanResponse(BaseModel):
    goal: GoalResponse
    forecast: ForecastResponse
    plan: SavingsPlanResponse


class CreateGoalRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    target_amount_cents: int = Field(gt=0, le=100_000_000)
    amount_already_saved_cents: int = Field(ge=0, le=100_000_000)
    target_date: date

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("goal name cannot be blank")
        return cleaned


class NessieEventRequest(BaseModel):
    event_type: Literal[
        "paycheck", "planned_purchase", "unplanned_purchase", "move_to_savings"
    ]
    amount_cents: int = Field(ge=100, le=1_000_000)
    idempotency_key: str = Field(pattern=r"^[a-z0-9_-]{8,80}$")

    @field_validator("amount_cents")
    @classmethod
    def require_whole_dollars(cls, value: int) -> int:
        if value % 100:
            raise ValueError("amount must use whole dollars")
        return value


class NessieEventResponse(BaseModel):
    event_type: str
    idempotency_key: str
    created_records: list[str]
    reused_records: list[str]
    remote_records: list["NessieRecordReference"] = Field(default_factory=list)
    dashboard: "DashboardResponse"


class NessieRecordReference(BaseModel):
    resource: Literal["deposits", "withdrawals"]
    record_id: str


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
    import_summary: ImportSummaryResponse
    forecast: ForecastResponse
    active_goal: GoalResponse | None = None
    current_plan: SavingsPlanResponse | None = None
