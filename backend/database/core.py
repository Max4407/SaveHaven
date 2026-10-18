from collections.abc import Iterator

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


class Database:
    def __init__(self, database_url: str) -> None:
        engine_kwargs: dict[str, object] = {}
        if database_url.startswith("sqlite"):
            engine_kwargs["connect_args"] = {
                "check_same_thread": False,
                "timeout": 5,
            }
        if database_url.endswith(":memory:"):
            engine_kwargs["poolclass"] = StaticPool

        self.engine = create_engine(database_url, **engine_kwargs)
        if database_url.startswith("sqlite"):
            event.listen(self.engine, "connect", _configure_sqlite_connection)
        self.session_factory = sessionmaker(
            bind=self.engine,
            autoflush=False,
            expire_on_commit=False,
        )

    def create_schema(self) -> None:
        import models  # noqa: F401

        Base.metadata.create_all(self.engine)
        self._migrate_sqlite_schema()

    def _migrate_sqlite_schema(self) -> None:
        if self.engine.dialect.name != "sqlite":
            return

        with self.engine.begin() as connection:
            placed_building_columns = {
                column["name"]
                for column in inspect(connection).get_columns("placed_buildings")
            }
            if "facing" not in placed_building_columns:
                connection.execute(
                    text(
                        "ALTER TABLE placed_buildings "
                        "ADD COLUMN facing VARCHAR(5) NOT NULL DEFAULT 'left'"
                    )
                )

            savings_goal_columns = {
                column["name"]
                for column in inspect(connection).get_columns("savings_goals")
            }
            if "starting_savings_balance_cents" not in savings_goal_columns:
                connection.execute(
                    text(
                        "ALTER TABLE savings_goals ADD COLUMN "
                        "starting_savings_balance_cents INTEGER NOT NULL DEFAULT 0"
                    )
                )
                connection.execute(
                    text(
                        """
                        UPDATE savings_goals
                        SET starting_savings_balance_cents = COALESCE(
                            (
                                SELECT SUM(financial_accounts.balance_cents)
                                FROM financial_accounts
                                WHERE financial_accounts.user_id = savings_goals.user_id
                                  AND financial_accounts.account_type = 'savings'
                            ),
                            amount_already_saved_cents
                        )
                        """
                    )
                )
            if columns and "visual_variant" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE placed_buildings "
                    "ADD COLUMN visual_variant INTEGER NOT NULL DEFAULT 0"
                )

    def session(self) -> Iterator[Session]:
        with self.session_factory() as session:
            yield session


def _configure_sqlite_connection(dbapi_connection: object, _connection_record: object) -> None:
    cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA journal_mode=WAL")
    finally:
        cursor.close()
