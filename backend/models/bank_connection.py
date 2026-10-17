from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class BankConnection(Base):
    __tablename__ = "bank_connections"
    __table_args__ = (UniqueConstraint("user_id", name="uq_bank_connections_user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    profile_id: Mapped[str] = mapped_column(String(80))
    nessie_customer_id: Mapped[str] = mapped_column(String(120))
    display_name: Mapped[str] = mapped_column(String(120))
    data_source: Mapped[str] = mapped_column(String(20), default="fixture")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
