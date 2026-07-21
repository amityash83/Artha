from fastapi.testclient import TestClient


def _category_id(client, entity_type, name):
    categories = client.get("/api/init").json()["categories"]
    return next(c["id"] for c in categories if c["entity_type"] == entity_type and c["name"] == name)


def test_goal_with_linked_holdings_derives_current_amount(test_db_path):
    # Regression test for e97a2e8: /api/init's goals query aliased the derived
    # SUM as `current_amount` alongside `g.*`, which already carries that
    # column — sqlite3.Row resolves duplicate names to the leftmost, so the
    # stale stored value silently always won and linked assets never moved
    # a goal's progress. Assert the derived value wins, not the stored one.
    from backend.main import app

    with TestClient(app) as client:
        goal_resp = client.post(
            "/api/entities/goals",
            json={"name": "Retirement Corpus", "target_amount": 1000000.0, "current_amount": 1.0},
        )
        assert goal_resp.status_code == 200

        mutual_fund_cat = _category_id(client, "Asset", "Mutual Fund")
        asset_resp = client.post(
            "/api/entities/assets",
            json={
                "name": "Index Fund",
                "category_id": mutual_fund_cat,
                "current_value": 250000.0,
                "goal_mapping": "Retirement Corpus",
            },
        )
        assert asset_resp.status_code == 200

        init_resp = client.get("/api/init")
        goals = init_resp.json()["goals"]

    goal = next(g for g in goals if g["name"] == "Retirement Corpus")
    assert goal["current_amount"] == 250000.0


def test_goal_without_holdings_keeps_manual_value(test_db_path):
    # A goal funded outside tracked assets (e.g. cash held elsewhere) has no
    # goal_holdings rows and must keep its manually-entered current_amount —
    # the derivation only kicks in when at least one asset is actually linked.
    from backend.main import app

    with TestClient(app) as client:
        client.post(
            "/api/entities/goals",
            json={"name": "Emergency Fund", "target_amount": 500000.0, "current_amount": 120000.0},
        )
        init_resp = client.get("/api/init")
        goals = init_resp.json()["goals"]

    goal = next(g for g in goals if g["name"] == "Emergency Fund")
    assert goal["current_amount"] == 120000.0


def test_get_entities_goals_also_derives_current_amount(test_db_path):
    # GET /api/entities/goals has its own copy of this query (main.py's
    # get_entities) — assert it derives too, not just /api/init.
    from backend.main import app

    with TestClient(app) as client:
        client.post(
            "/api/entities/goals",
            json={"name": "House Down Payment", "target_amount": 2000000.0, "current_amount": 1.0},
        )
        fd_cat = _category_id(client, "Asset", "Fixed Deposit")
        client.post(
            "/api/entities/assets",
            json={
                "name": "FD for House",
                "category_id": fd_cat,
                "current_value": 400000.0,
                "goal_mapping": "House Down Payment",
            },
        )
        resp = client.get("/api/entities/goals")

    assert resp.status_code == 200
    goal = next(g for g in resp.json() if g["name"] == "House Down Payment")
    assert goal["current_amount"] == 400000.0
