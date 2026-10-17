from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
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
