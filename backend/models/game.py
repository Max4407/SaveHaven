from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class PlanPeriodEvaluation(Base):
    __tablename__ = "plan_period_evaluations"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_evaluation_user_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    accepted_plan_id: Mapped[int] = mapped_column(
        ForeignKey("accepted_savings_plans.id", ondelete="CASCADE")
    )
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    planned_savings_cents: Mapped[int] = mapped_column(Integer)
    actual_net_savings_cents: Mapped[int] = mapped_column(Integer)
    planned_discretionary_spending_cents: Mapped[int] = mapped_column(Integer)
    actual_discretionary_spending_cents: Mapped[int] = mapped_column(Integer)
    savings_ratio_basis_points: Mapped[int] = mapped_column(Integer)
    adherence_tier: Mapped[str] = mapped_column(String(24))
    exceptional_expense_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(24))
    idempotency_key: Mapped[str] = mapped_column(String(80))
    explanation: Mapped[str] = mapped_column(Text)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RewardEvent(Base):
    __tablename__ = "reward_events"
    __table_args__ = (
        UniqueConstraint("user_id", "source_key", "reward_type", name="uq_reward_source"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_period_id: Mapped[int | None] = mapped_column(
        ForeignKey("plan_period_evaluations.id", ondelete="CASCADE"), nullable=True
    )
    source_key: Mapped[str] = mapped_column(String(120))
    reward_type: Mapped[str] = mapped_column(String(40))
    coins_awarded: Mapped[int] = mapped_column(Integer)
    xp_awarded: Mapped[int] = mapped_column(Integer)
    previous_level: Mapped[int] = mapped_column(Integer)
    new_level: Mapped[int] = mapped_column(Integer)
    streak_weeks: Mapped[int] = mapped_column(Integer)
    explanation: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class GameWallet(Base):
    __tablename__ = "game_wallets"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    coin_balance: Mapped[int] = mapped_column(Integer)
    total_coins_earned: Mapped[int] = mapped_column(Integer)
    xp: Mapped[int] = mapped_column(Integer)
    level: Mapped[int] = mapped_column(Integer)
    streak_weeks: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PlacedBuilding(Base):
    __tablename__ = "placed_buildings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    catalog_item_id: Mapped[str] = mapped_column(String(80))
    grid_x: Mapped[int] = mapped_column(Integer)
    grid_y: Mapped[int] = mapped_column(Integer)
    facing: Mapped[str] = mapped_column(String(5), default="left", server_default="left")
    visual_variant: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    purchase_price_coins: Mapped[int] = mapped_column(Integer)
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DemoNessieRecord(Base):
    __tablename__ = "demo_nessie_records"
    __table_args__ = (
        UniqueConstraint("user_id", "resource", "remote_id", name="uq_demo_remote_record"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_period_id: Mapped[int | None] = mapped_column(
        ForeignKey("plan_period_evaluations.id", ondelete="SET NULL"), nullable=True
    )
    resource: Mapped[str] = mapped_column(String(24))
    remote_id: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
