from pathlib import Path

from sqlalchemy import inspect, text

import models  # noqa: F401
from database import Base, Database


def test_file_database_enforces_integrity_and_waits_for_short_writes(tmp_path: Path) -> None:
    database_path = tmp_path / "savehaven-test.db"
    database = Database(f"sqlite:///{database_path.as_posix()}")

    try:
        with database.engine.connect() as connection:
            foreign_keys = connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one()
            busy_timeout = connection.exec_driver_sql("PRAGMA busy_timeout").scalar_one()
            journal_mode = connection.exec_driver_sql("PRAGMA journal_mode").scalar_one()

        assert foreign_keys == 1
        assert busy_timeout == 5000
        assert journal_mode == "wal"
    finally:
        database.engine.dispose()


def test_create_schema_adds_facing_to_an_existing_sqlite_town(tmp_path: Path) -> None:
    database = Database(f"sqlite:///{tmp_path / 'legacy-town.db'}")
    with database.engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE placed_buildings (id INTEGER PRIMARY KEY)"
        )
        connection.exec_driver_sql("INSERT INTO placed_buildings (id) VALUES (1)")

    database.create_schema()

    with database.engine.connect() as connection:
        columns = {
            row[1]: row for row in connection.exec_driver_sql(
                "PRAGMA table_info(placed_buildings)"
            )
        }
        facing = connection.exec_driver_sql(
            "SELECT facing FROM placed_buildings WHERE id = 1"
        ).scalar_one()

    assert columns["facing"][3] == 1
    assert facing == "left"
def test_schema_upgrade_preserves_existing_goal_and_records_its_savings_baseline(
    tmp_path: Path,
) -> None:
    database = Database(f"sqlite:///{(tmp_path / 'old-savehaven.db').as_posix()}")
    with database.engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE savings_goals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id VARCHAR(64) NOT NULL,
                    name VARCHAR(80) NOT NULL,
                    target_amount_cents INTEGER NOT NULL,
                    amount_already_saved_cents INTEGER NOT NULL,
                    target_date DATE NOT NULL,
                    is_active BOOLEAN NOT NULL,
                    created_at DATETIME NOT NULL
                )
                """
            )
        )
    Base.metadata.create_all(database.engine)
    with database.engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (id, display_name, created_at) "
                "VALUES ('demo-player', 'Jordan Lee', '2026-10-18 12:00:00')"
            )
        )
        connection.execute(
            text(
                """
                INSERT INTO financial_accounts (
                    user_id, source_account_id, account_type, nickname,
                    balance_cents, synced_at
                ) VALUES (
                    'demo-player', 'jordan-savings', 'savings', 'Rainy Day Fund',
                    625000, '2026-10-18 12:00:00'
                )
                """
            )
        )
        connection.execute(
            text(
                """
                INSERT INTO savings_goals (
                    user_id, name, target_amount_cents, amount_already_saved_cents,
                    target_date, is_active, created_at
                ) VALUES (
                    'demo-player', 'Emergency fund', 1000000, 50000,
                    '2027-10-18', 1, '2026-10-18 12:00:00'
                )
                """
            )
        )

    database.create_schema()

    columns = {column["name"] for column in inspect(database.engine).get_columns("savings_goals")}
    with database.engine.connect() as connection:
        starting_balance = connection.execute(
            text("SELECT starting_savings_balance_cents FROM savings_goals")
        ).scalar_one()

    assert "starting_savings_balance_cents" in columns
    assert starting_balance == 625_000
