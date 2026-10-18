from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

from sqlalchemy import func, select

from database import Database
from models import GameWallet, RewardEvent
from repository import ensure_wallet, seed_demo_users


def test_concurrent_first_load_reuses_one_wallet_and_starter_grant(tmp_path) -> None:
    database = Database(f"sqlite:///{tmp_path / 'concurrent-wallet.db'}")
    database.create_schema()
    with database.session_factory() as session:
        seed_demo_users(session)

    first_lookup = Barrier(2)

    def load_wallet() -> int:
        with database.session_factory() as session:
            original_get = session.get
            synchronized = False

            def synchronized_get(entity, identity, **kwargs):
                nonlocal synchronized
                result = original_get(entity, identity, **kwargs)
                if entity is GameWallet and not synchronized:
                    synchronized = True
                    first_lookup.wait(timeout=5)
                return result

            with patch.object(session, "get", side_effect=synchronized_get):
                wallet = ensure_wallet(session, "demo-player")
                session.commit()
                return wallet.coin_balance

    with ThreadPoolExecutor(max_workers=2) as executor:
        balances = list(executor.map(lambda _index: load_wallet(), range(2)))

    with database.session_factory() as session:
        wallet_count = session.scalar(select(func.count()).select_from(GameWallet))
        starter_count = session.scalar(
            select(func.count())
            .select_from(RewardEvent)
            .where(
                RewardEvent.user_id == "demo-player",
                RewardEvent.source_key == "starter",
            )
        )

    assert balances == [300, 300]
    assert wallet_count == 1
    assert starter_count == 1
