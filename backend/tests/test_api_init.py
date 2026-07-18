from fastapi.testclient import TestClient


def test_get_init_on_fresh_db_returns_empty_entities_and_seeded_reference_data(test_db_path):
    # Imported inside the test, after test_db_path's monkeypatch has already
    # applied — `with TestClient(app) as client` is what actually triggers
    # startup_event() -> init_db(), and that must run against the patched
    # (isolated) DB path, not whatever real path get_db_path() would
    # otherwise resolve.
    from backend.main import app

    with TestClient(app) as client:
        response = client.get("/api/init")

    assert response.status_code == 200
    data = response.json()

    # Entity lists are empty on a freshly-initialized DB
    assert data["accounts"] == []
    assert data["assets"] == []
    assert data["liabilities"] == []
    assert data["income"] == []
    assert data["expenses"] == []
    assert data["goals"] == []
    assert data["people"] == []

    # Seeded reference data is present
    assert len(data["categories"]) > 0
    assert len(data["rules"]) > 0
    assert len(data["institutions"]) == 8
    assert len(data["card_variants"]) > 0
    assert len(data["knowledge_articles"]) > 0

    # AI Assistant is off by default (no ARTHA_API_SECRET/provider configured)
    assert data["ai_provider"] == "none"


def test_create_and_read_back_a_person(test_db_path):
    from backend.main import app

    with TestClient(app) as client:
        create_resp = client.post(
            "/api/metadata/people",
            json={"name": "Test User", "role": "Primary Owner", "risk_tolerance": "Moderate"},
        )
        assert create_resp.status_code == 200

        init_resp = client.get("/api/init")
        people = init_resp.json()["people"]

    assert len(people) == 1
    assert people[0]["name"] == "Test User"
    assert people[0]["role"] == "Primary Owner"
