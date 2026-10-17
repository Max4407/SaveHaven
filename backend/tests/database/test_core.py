from pathlib import Path

from database import Database


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
