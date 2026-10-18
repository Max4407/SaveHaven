from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class FinancialAccount(Base):
    __tablename__ = "financial_accounts"
    __table_args__ = (
        UniqueConstraint("user_id", "source_account_id", name="uq_account_user_source"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    source_account_id: Mapped[str] = mapped_column(String(120))
    account_type: Mapped[str] = mapped_column(String(40))
    nickname: Mapped[str] = mapped_column(String(120))
    balance_cents: Mapped[int] = mapped_column(Integer)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class NormalizedTransaction(Base):
    __tablename__ = "normalized_transactions"
    __table_args__ = (UniqueConstraint("user_id", "source_id", name="uq_transaction_user_source"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    source_account_id: Mapped[str] = mapped_column(String(120))
    source_id: Mapped[str] = mapped_column(String(160))
    occurred_at: Mapped[date] = mapped_column(Date)
    signed_amount_cents: Mapped[int] = mapped_column(Integer)
    direction: Mapped[str] = mapped_column(String(10))
    kind: Mapped[str] = mapped_column(String(30))
    merchant_name: Mapped[str | None] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(240), default="")
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SavingsGoal(Base):
    __tablename__ = "savings_goals"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    target_amount_cents: Mapped[int] = mapped_column(Integer)
    amount_already_saved_cents: Mapped[int] = mapped_column(Integer)
    starting_savings_balance_cents: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default="0",
    )
    target_date: Mapped[date] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AcceptedSavingsPlan(Base):
    __tablename__ = "accepted_savings_plans"
    __table_args__ = (UniqueConstraint("goal_id", name="uq_accepted_plan_goal"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("savings_goals.id", ondelete="CASCADE"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    weekly_income_cents: Mapped[int] = mapped_column(Integer)
    weekly_recurring_bills_cents: Mapped[int] = mapped_column(Integer)
    weekly_variable_spending_cents: Mapped[int] = mapped_column(Integer)
    safety_buffer_cents: Mapped[int] = mapped_column(Integer)
    weekly_savings_cents: Mapped[int] = mapped_column(Integer)
    safe_to_spend_cents: Mapped[int] = mapped_column(Integer)
    confidence: Mapped[str] = mapped_column(String(20))
    income_cadence: Mapped[str] = mapped_column(String(30))
    feasible: Mapped[bool] = mapped_column(Boolean)
    suggested_target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    explanation: Mapped[str] = mapped_column(Text)
    evidence_json: Mapped[str] = mapped_column(Text)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
