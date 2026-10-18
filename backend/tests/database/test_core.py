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


def test_create_schema_adds_building_presentation_to_an_existing_sqlite_town(
    tmp_path: Path,
) -> None:
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
        visual_variant = connection.exec_driver_sql(
            "SELECT visual_variant FROM placed_buildings WHERE id = 1"
        ).scalar_one()

    assert columns["facing"][3] == 1
    assert columns["visual_variant"][3] == 1
    assert facing == "left"
    assert visual_variant == 0
