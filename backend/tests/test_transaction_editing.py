from fastapi.testclient import TestClient


def _account_balance(client, account_id):
    accounts = client.get("/api/init").json()["accounts"]
    return next(a["current_balance"] for a in accounts if a["id"] == account_id)


def _asset_value(client, asset_id):
    assets = client.get("/api/init").json()["assets"]
    return next(a["current_value"] for a in assets if a["id"] == asset_id)


def _any_institution_id(client):
    # accounts.institution_id is NOT NULL — any of the always-seeded reference
    # institutions works, since these tests don't care which bank.
    return client.get("/api/init").json()["institutions"][0]["id"]


def test_edit_transaction_amount_reverts_and_reapplies_balance(test_db_path):
    # Regression test for 4196582: PUT /api/entities/transactions reverted the
    # old row's balance impact using the RAW db row (fine), but reapplied using
    # standard_params built from a payload that, when it arrives in the Ledger's
    # legacy shape (account_id/type/related_entity_id, not source_ref_type),
    # was never normalized — so the reapply saw no refs and silently did
    # nothing, corrupting the balance by the old amount every edit.
    from backend.main import app

    with TestClient(app) as client:
        inst_id = _any_institution_id(client)
        acc_id = client.post(
            "/api/entities/accounts",
            json={"name": "Test Savings", "current_balance": 0.0, "institution_id": inst_id},
        ).json()["id"]

        tx_id = client.post(
            "/api/entities/transactions",
            json={
                "type": "Credit",
                "amount": 1000.0,
                "transaction_date": "2026-01-01",
                "source_ref_type": "None",
                "source_ref_id": None,
                "dest_ref_type": "Account",
                "dest_ref_id": acc_id,
            },
        ).json()["id"]

        assert _account_balance(client, acc_id) == 1000.0

        # Edit via the Ledger's legacy payload shape (account_id + type +
        # related_entity_id), exactly as TransactionsLedger.tsx sends it —
        # NOT the raw source_ref_type/dest_ref_type shape.
        edit_resp = client.put(
            f"/api/entities/transactions/{tx_id}",
            json={
                "account_id": acc_id,
                "type": "Credit",
                "amount": 1500.0,
                "transaction_date": "2026-01-01",
                "related_entity_id": None,
            },
        )
        assert edit_resp.status_code == 200

    # Correct revert-then-reapply: 0 (reverted) + 1500 (reapplied) = 1500, not
    # 2500 (reapply silently skipped, old 1000 impact never removed) and not
    # 0 (reverted but never reapplied).
    assert _account_balance(client, acc_id) == 1500.0


def test_edit_transaction_changing_destination_moves_balance_correctly(test_db_path):
    # A stronger version of the same regression: editing which account a
    # transaction credits must remove the balance from the old account and
    # add it to the new one — this only works if the reapply step actually
    # sees the (possibly changed) refs, not just the amount.
    from backend.main import app

    with TestClient(app) as client:
        inst_id = _any_institution_id(client)
        acc_a = client.post("/api/entities/accounts", json={"name": "Account A", "current_balance": 0.0, "institution_id": inst_id}).json()["id"]
        acc_b = client.post("/api/entities/accounts", json={"name": "Account B", "current_balance": 0.0, "institution_id": inst_id}).json()["id"]

        tx_id = client.post(
            "/api/entities/transactions",
            json={
                "type": "Credit",
                "amount": 500.0,
                "transaction_date": "2026-01-01",
                "source_ref_type": "None",
                "source_ref_id": None,
                "dest_ref_type": "Account",
                "dest_ref_id": acc_a,
            },
        ).json()["id"]

        assert _account_balance(client, acc_a) == 500.0
        assert _account_balance(client, acc_b) == 0.0

        client.put(
            f"/api/entities/transactions/{tx_id}",
            json={
                "account_id": acc_b,
                "type": "Credit",
                "amount": 500.0,
                "transaction_date": "2026-01-01",
                "related_entity_id": None,
            },
        )

        assert _account_balance(client, acc_a) == 0.0
        assert _account_balance(client, acc_b) == 500.0


def test_edit_investment_transaction_reverts_and_reapplies_asset_value(test_db_path):
    # Same regression, but on the Asset side (Buy/Sell types adjust
    # assets.current_value directly, not just an account's derived balance).
    from backend.main import app

    with TestClient(app) as client:
        categories = client.get("/api/init").json()["categories"]
        mf_cat = next(c["id"] for c in categories if c["entity_type"] == "Asset" and c["name"] == "Mutual Fund")

        inst_id = _any_institution_id(client)
        acc_id = client.post("/api/entities/accounts", json={"name": "Broker Account", "current_balance": 0.0, "institution_id": inst_id}).json()["id"]
        asset_id = client.post(
            "/api/entities/assets",
            json={"name": "Growth Fund", "category_id": mf_cat, "current_value": 10000.0},
        ).json()["id"]

        tx_id = client.post(
            "/api/entities/transactions",
            json={
                "type": "Buy",
                "amount": 2000.0,
                "transaction_date": "2026-01-01",
                "source_ref_type": "Account",
                "source_ref_id": acc_id,
                "dest_ref_type": "Asset",
                "dest_ref_id": asset_id,
            },
        ).json()["id"]

        assert _asset_value(client, asset_id) == 12000.0

        client.put(
            f"/api/entities/transactions/{tx_id}",
            json={
                "account_id": acc_id,
                "type": "Investment",
                "amount": 3000.0,
                "transaction_date": "2026-01-01",
                "related_entity_id": asset_id,
            },
        )

    # 12000 - 2000 (revert old Buy) + 3000 (reapply new Buy) = 13000
    assert _asset_value(client, asset_id) == 13000.0
