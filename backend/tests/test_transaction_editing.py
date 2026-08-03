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


def _liability_outstanding(client, liability_id):
    liabilities = client.get("/api/init").json()["liabilities"]
    return next(l["outstanding"] for l in liabilities if l["id"] == liability_id)


def _credit_card_liability(client, outstanding=10000.0):
    categories = client.get("/api/init").json()["categories"]
    cc_cat = next(c["id"] for c in categories if c["entity_type"] == "Liability" and c["name"] == "Credit Card")
    return client.post(
        "/api/entities/liabilities",
        json={"name": "Test Card", "category_id": cc_cat, "outstanding": outstanding, "owner_id": 1},
    ).json()["id"]


def test_spend_transaction_increases_outstanding_and_reverts_on_delete(test_db_path):
    # 'Spend' is the only transaction type that INCREASES liabilities.outstanding
    # (EMI/Prepayment are the only others that touch it, and they decrease it) —
    # confirms create/delete correctly apply/revert via the generic
    # adjust_double_entry_balances path, no special-casing needed.
    from backend.main import app

    with TestClient(app) as client:
        liability_id = _credit_card_liability(client, outstanding=10000.0)

        tx_id = client.post(
            "/api/entities/transactions",
            json={
                "type": "Spend",
                "amount": 2500.0,
                "transaction_date": "2026-07-15",
                "notes": "flight",
                "related_entity_type": "Liability",
                "related_entity_id": liability_id,
            },
        ).json()["id"]

        assert _liability_outstanding(client, liability_id) == 12500.0

        client.delete(f"/api/entities/transactions/{tx_id}")

    assert _liability_outstanding(client, liability_id) == 10000.0


def test_edit_spend_transaction_amount_reverts_and_reapplies_outstanding(test_db_path):
    from backend.main import app

    with TestClient(app) as client:
        liability_id = _credit_card_liability(client, outstanding=10000.0)

        tx_id = client.post(
            "/api/entities/transactions",
            json={
                "type": "Spend",
                "amount": 2500.0,
                "transaction_date": "2026-07-15",
                "related_entity_type": "Liability",
                "related_entity_id": liability_id,
            },
        ).json()["id"]

        client.put(
            f"/api/entities/transactions/{tx_id}",
            json={
                "type": "Spend",
                "amount": 4000.0,
                "transaction_date": "2026-07-15",
                "related_entity_type": "Liability",
                "related_entity_id": liability_id,
            },
        )

    # Revert removes the old 2500 impact entirely, then reapply adds the new
    # 4000 - net effect is simply original (10000) + new amount (4000) = 14000,
    # not original + (new - old), since revert doesn't leave the old amount
    # "partially applied."
    assert _liability_outstanding(client, liability_id) == 14000.0


def test_debit_transaction_category_id_round_trips(test_db_path):
    # Regression: the Ledger's "Budget Category" picker for Debit/Credit sends
    # category_id, but transactions previously had no column for it, so
    # serialize_entity_payload silently dropped it (no metadata_json fallback
    # on this table). Now a real column, it must actually persist.
    from backend.main import app

    with TestClient(app) as client:
        inst_id = _any_institution_id(client)
        acc_id = client.post(
            "/api/entities/accounts",
            json={"name": "Test Savings", "current_balance": 5000.0, "institution_id": inst_id},
        ).json()["id"]
        categories = client.get("/api/init").json()["categories"]
        grocery_cat = next(c["id"] for c in categories if c["entity_type"] == "Expense" and c["name"] == "Grocery")

        tx_id = client.post(
            "/api/entities/transactions",
            json={
                "type": "Debit",
                "amount": 200.0,
                "account_id": acc_id,
                "transaction_date": "2026-07-16",
                "category_id": grocery_cat,
            },
        ).json()["id"]

        stored = next(t for t in client.get("/api/entities/transactions").json() if t["id"] == tx_id)
        assert stored["category_id"] == grocery_cat


def test_statement_spend_adjustment_never_moves_outstanding(test_db_path):
    # The "Statement Spend Adjustment" mechanism in put_credit_card_details maps
    # onto a marked 'Spend' transaction (for the derived spend-total/breakdown)
    # but is permanently exempt from the normal Spend contract of increasing
    # outstanding — enforced centrally in adjust_double_entry_balances, keyed on
    # the notes marker, not by sign-flipping logic in this endpoint. Create,
    # amount change, and zero-out (delete) must all leave outstanding untouched.
    from backend.main import app

    with TestClient(app) as client:
        liability_id = _credit_card_liability(client, outstanding=10000.0)
        client.put(f"/api/liabilities/{liability_id}/credit-card-details", json={"credit_limit": 500000})

        client.put(f"/api/liabilities/{liability_id}/credit-card-details", json={"current_statement_spend": 3000})
        assert _liability_outstanding(client, liability_id) == 10000.0
        d = client.get("/api/init").json()
        li = next(l for l in d["liabilities"] if l["id"] == liability_id)
        assert li["real_cycle_spend_total"] == 3000.0

        client.put(f"/api/liabilities/{liability_id}/credit-card-details", json={"current_statement_spend": 1000})
        assert _liability_outstanding(client, liability_id) == 10000.0

        client.put(f"/api/liabilities/{liability_id}/credit-card-details", json={"current_statement_spend": 0})

    assert _liability_outstanding(client, liability_id) == 10000.0


def test_entity_grid_partial_put_does_not_touch_statement_spend_adjustment(test_db_path):
    # The generic Liabilities grid PUTs a partial payload (no
    # current_statement_spend key at all) — confirms the adjustment logic,
    # gated on the key's presence via exclude_unset, correctly no-ops rather
    # than treating an omitted field as "set to 0".
    from backend.main import app

    with TestClient(app) as client:
        liability_id = _credit_card_liability(client, outstanding=10000.0)
        client.put(f"/api/liabilities/{liability_id}/credit-card-details", json={"current_statement_spend": 2000})

        # EntityGrid.tsx-style partial payload (credit_limit/statement_balance/
        # statement_date/due_date/annual_fee/reward_points/point_value only).
        client.put(f"/api/liabilities/{liability_id}/credit-card-details", json={"credit_limit": 600000})

        d = client.get("/api/init").json()
        li = next(l for l in d["liabilities"] if l["id"] == liability_id)
        assert li["real_cycle_spend_total"] == 2000.0  # untouched by the partial PUT

    assert _liability_outstanding(client, liability_id) == 10000.0


def test_statement_spend_adjustment_survives_notes_field_edit_and_subsequent_amount_change(test_db_path):
    # Regression for two bugs found in successive review rounds on this exact
    # mechanism. Round 1 tried keying exemption off exact-matching a free-text
    # `notes` value, with update_entity's reapply step reading `notes` from the
    # NEW payload — clearing the marker's Notes field would silently un-exempt
    # it on that very reapply. Round 2's attempted fix (key both revert and
    # reapply off the PRE-edit notes) closed that single-edit case but broke a
    # SECOND edit afterward: once a row's stored notes no longer matched the
    # marker text (e.g. cleared), the next edit's revert would incorrectly
    # apply real balance impact for an amount that was never actually applied.
    # The actual fix is a dedicated is_balance_exempt column the generic Ledger
    # route never writes (not a text match at all) — verify a marker's Notes
    # can be cleared AND its amount changed afterward with zero effect on
    # outstanding either time, since exemption never depended on notes text.
    from backend.main import app

    with TestClient(app) as client:
        liability_id = _credit_card_liability(client, outstanding=10000.0)
        client.put(f"/api/liabilities/{liability_id}/credit-card-details", json={"current_statement_spend": 5000})
        assert _liability_outstanding(client, liability_id) == 10000.0

        marker_tx = next(
            t for t in client.get("/api/entities/transactions").json() if t.get("is_balance_exempt")
        )

        client.put(
            f"/api/entities/transactions/{marker_tx['id']}",
            json={
                "type": "Spend",
                "amount": marker_tx["amount"],
                "transaction_date": marker_tx["transaction_date"],
                "notes": "",  # simulates a user clearing the Notes box
                "related_entity_type": "Liability",
                "related_entity_id": liability_id,
            },
        )
        assert _liability_outstanding(client, liability_id) == 10000.0

        # The second edit is where the notes-based fix broke: amount change on
        # an already-notes-cleared row must still have zero effect, since
        # is_balance_exempt (not notes) governs exemption.
        client.put(
            f"/api/entities/transactions/{marker_tx['id']}",
            json={
                "type": "Spend",
                "amount": 250.0,
                "transaction_date": marker_tx["transaction_date"],
                "notes": "",
                "related_entity_type": "Liability",
                "related_entity_id": liability_id,
            },
        )

    assert _liability_outstanding(client, liability_id) == 10000.0


def test_real_spend_retyped_with_marker_text_still_reverts_correctly(test_db_path):
    # The inverse regression: a real (non-exempt) Spend transaction whose notes
    # happen to get retyped to the exact marker string must NOT become exempt —
    # since exemption is governed by is_balance_exempt (never settable via the
    # generic Ledger route), not by notes content. Confirms amend-after-retype
    # and delete-after-retype both still correctly revert/reapply real impact.
    from backend.main import app

    with TestClient(app) as client:
        liability_id = _credit_card_liability(client, outstanding=10000.0)
        tx_id = client.post(
            "/api/entities/transactions",
            json={
                "type": "Spend", "amount": 300.0, "transaction_date": "2026-07-15",
                "related_entity_type": "Liability", "related_entity_id": liability_id,
            },
        ).json()["id"]
        assert _liability_outstanding(client, liability_id) == 10300.0

        client.put(
            f"/api/entities/transactions/{tx_id}",
            json={
                "type": "Spend", "amount": 300.0, "transaction_date": "2026-07-15",
                "notes": "Manual statement spend adjustment",
                "related_entity_type": "Liability", "related_entity_id": liability_id,
            },
        )
        assert _liability_outstanding(client, liability_id) == 10300.0  # unchanged, still real

        client.put(
            f"/api/entities/transactions/{tx_id}",
            json={
                "type": "Spend", "amount": 350.0, "transaction_date": "2026-07-15",
                "notes": "Manual statement spend adjustment",
                "related_entity_type": "Liability", "related_entity_id": liability_id,
            },
        )
        assert _liability_outstanding(client, liability_id) == 10350.0  # real delta applied

        client.delete(f"/api/entities/transactions/{tx_id}")

    assert _liability_outstanding(client, liability_id) == 10000.0  # real revert on delete


def test_statement_spend_adjustment_marker_survives_generic_ledger_edit_and_delete(test_db_path):
    # Regression: the marker transaction is a perfectly ordinary row from the
    # generic Transactions Ledger's point of view (no special UI treatment),
    # so editing or deleting it there must ALSO never move outstanding —
    # exercising the exemption from a second entry point, not just the
    # dedicated adjustment endpoint.
    from backend.main import app

    with TestClient(app) as client:
        liability_id = _credit_card_liability(client, outstanding=10000.0)
        client.put(f"/api/liabilities/{liability_id}/credit-card-details", json={"current_statement_spend": 5000})
        assert _liability_outstanding(client, liability_id) == 10000.0

        marker_tx = next(
            t for t in client.get("/api/entities/transactions").json()
            if t.get("notes") == "Manual statement spend adjustment"
        )

        # Edit the marker's amount directly via the generic transactions route.
        client.put(
            f"/api/entities/transactions/{marker_tx['id']}",
            json={
                "type": "Spend",
                "amount": 9000.0,
                "transaction_date": marker_tx["transaction_date"],
                "notes": "Manual statement spend adjustment",
                "related_entity_type": "Liability",
                "related_entity_id": liability_id,
            },
        )
        assert _liability_outstanding(client, liability_id) == 10000.0

        # Delete it directly via the generic transactions route.
        client.delete(f"/api/entities/transactions/{marker_tx['id']}")

    assert _liability_outstanding(client, liability_id) == 10000.0


def test_migrated_baseline_adjustment_edited_via_ongoing_endpoint_stays_consistent(test_db_path):
    # The exact scenario that exposed the original bug: a card migrates with a
    # legacy current_statement_spend baseline (outstanding correctly untouched),
    # then the user edits the SAME marker row through the ongoing adjustment
    # endpoint. Since the marker is now unconditionally exempt from affecting
    # outstanding (not sign-flipped depending on provenance), this must stay
    # correct regardless of whether the row originated from migration or the
    # endpoint itself.
    import backend.db as db

    db.init_db()
    conn = db.get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM categories WHERE name = 'Credit Card'")
    cc_cat_id = cur.fetchone()["id"]
    cur.execute(
        "INSERT INTO liabilities (name, category_id, outstanding, owner_id) VALUES ('Legacy Card', ?, 25000, 1)",
        (cc_cat_id,),
    )
    liability_id = cur.lastrowid
    cur.execute(
        "INSERT INTO credit_card_details (liability_id, current_statement_spend) VALUES (?, 12000)",
        (liability_id,),
    )
    conn.commit()
    conn.close()
    db.init_db()  # runs the baseline-conversion migration

    from backend.main import app

    with TestClient(app) as client:
        assert _liability_outstanding(client, liability_id) == 25000.0

        client.put(f"/api/liabilities/{liability_id}/credit-card-details", json={"current_statement_spend": 15000})
        assert _liability_outstanding(client, liability_id) == 25000.0
        d = client.get("/api/init").json()
        li = next(l for l in d["liabilities"] if l["id"] == liability_id)
        assert li["real_cycle_spend_total"] == 15000.0

        client.put(f"/api/liabilities/{liability_id}/credit-card-details", json={"current_statement_spend": 0})

    assert _liability_outstanding(client, liability_id) == 25000.0


def test_statement_spend_adjustment_resubmit_same_value_does_not_redate_marker(test_db_path):
    # Regression found in the 4th domain-review pass: the dedicated Credit Cards
    # modal resubmits current_statement_spend on EVERY save (even ones only
    # touching unrelated fields like lounge visits), since it always sends the
    # full form state rather than a diff. Without comparing against the
    # marker's currently-stored amount, an unrelated save would silently bump
    # its transaction_date to today — resurrecting an adjustment that had
    # already rolled out of the current statement cycle, i.e. exactly the
    # "baseline double-counts every cycle" bug the dated-row design exists to
    # prevent, just reintroduced via the ongoing edit endpoint.
    import backend.db as db
    from backend.main import app

    with TestClient(app) as client:
        liability_id = _credit_card_liability(client, outstanding=10000.0)
        client.put(f"/api/liabilities/{liability_id}/credit-card-details", json={"current_statement_spend": 5000})

        marker_tx = next(
            t for t in client.get("/api/entities/transactions").json() if t.get("is_balance_exempt")
        )
        # Simulate the marker having aged out of the current cycle already.
        conn = db.get_db_connection()
        conn.execute("UPDATE transactions SET transaction_date = '2020-01-01' WHERE id = ?", (marker_tx["id"],))
        conn.commit()
        conn.close()

        # Resubmit the SAME adjustment value alongside an unrelated field change.
        client.put(
            f"/api/liabilities/{liability_id}/credit-card-details",
            json={"current_statement_spend": 5000, "lounge_visits_used": 2},
        )

        refreshed = next(
            t for t in client.get("/api/entities/transactions").json() if t.get("is_balance_exempt")
        )
        assert refreshed["transaction_date"] == "2020-01-01"

    assert _liability_outstanding(client, liability_id) == 10000.0


def test_is_balance_exempt_cannot_be_set_via_generic_entity_create_or_update(test_db_path):
    # Regression found in the 4th domain-review pass: serialize_entity_payload
    # copies any payload key matching a real column straight through with no
    # allowlist, so a caller who isn't the current Ledger UI (a future
    # spread-the-fetched-object PUT, a script, another client) could set
    # is_balance_exempt directly in a POST/PUT body, bypassing the balance
    # impact adjust_double_entry_balances is supposed to apply. Both routes
    # must strip this field from any incoming payload — it's exclusively an
    # internal flag put_credit_card_details sets via raw SQL.
    from backend.main import app

    with TestClient(app) as client:
        liability_id = _credit_card_liability(client, outstanding=10000.0)

        tx_id = client.post(
            "/api/entities/transactions",
            json={
                "type": "Spend", "amount": 1000.0, "transaction_date": "2026-07-01",
                "related_entity_type": "Liability", "related_entity_id": liability_id,
                "is_balance_exempt": 1,
            },
        ).json()["id"]

        # The spoofed flag must not have taken effect: outstanding increases
        # normally, and the stored column stays 0.
        assert _liability_outstanding(client, liability_id) == 11000.0
        tx = next(t for t in client.get("/api/entities/transactions").json() if t["id"] == tx_id)
        assert not tx.get("is_balance_exempt")

        # Editing the same row while trying to flip the flag must also fail to
        # stick, and must not corrupt the amount-change's own revert/reapply.
        client.put(
            f"/api/entities/transactions/{tx_id}",
            json={
                "type": "Spend", "amount": 1500.0, "transaction_date": "2026-07-01",
                "related_entity_type": "Liability", "related_entity_id": liability_id,
                "is_balance_exempt": 1,
            },
        )
        assert _liability_outstanding(client, liability_id) == 11500.0
        tx = next(t for t in client.get("/api/entities/transactions").json() if t["id"] == tx_id)
        assert not tx.get("is_balance_exempt")

    assert _liability_outstanding(client, liability_id) == 11500.0


def test_real_spend_with_marker_text_notes_survives_init_db_restart(test_db_path):
    # Regression found in the 4th domain-review pass: an earlier version of
    # this migration unconditionally re-ran, on every startup, an UPDATE that
    # set is_balance_exempt=1 for any row whose notes matched the marker
    # string — with no way to distinguish that from a genuinely real Spend
    # transaction whose notes a user separately typed to match. Since this
    # entire feature is new (no shipped rows exist that legitimately need a
    # one-time backfill), that migration step was removed rather than
    # tightened. A real Spend transaction with marker-text notes must stay
    # non-exempt across any number of backend restarts (init_db() re-runs).
    import backend.db as db
    from backend.main import app

    with TestClient(app) as client:
        liability_id = _credit_card_liability(client, outstanding=10000.0)
        tx_id = client.post(
            "/api/entities/transactions",
            json={
                "type": "Spend", "amount": 777.0, "transaction_date": "2026-07-02",
                "notes": "Manual statement spend adjustment",
                "related_entity_type": "Liability", "related_entity_id": liability_id,
            },
        ).json()["id"]
        assert _liability_outstanding(client, liability_id) == 10777.0

    db.init_db()  # simulates a backend restart
    db.init_db()  # and a second one, for good measure

    with TestClient(app) as client:
        tx = next(t for t in client.get("/api/entities/transactions").json() if t["id"] == tx_id)
        assert not tx.get("is_balance_exempt")
        assert _liability_outstanding(client, liability_id) == 10777.0

        client.delete(f"/api/entities/transactions/{tx_id}")

    assert _liability_outstanding(client, liability_id) == 10000.0


def test_zeroing_statement_spend_adjustment_immediately_updates_init_without_restart(test_db_path):
    # Regression found in the 5th domain-review pass: current_statement_spend is
    # popped from the PUT payload so the marker-transaction logic can run, but
    # was never explicitly re-zeroed on the credit_card_details UPDATE — so a
    # legacy non-zero value survived forever underneath the marker mechanism.
    # The instant a user zeroed the adjustment (deleting the marker), /api/init's
    # has_spend_transactions flipped to False, but the raw current_statement_spend
    # field it falls back to was still the OLD non-zero value — silently
    # reverting the frontend's displayed figure (and the milestone/reward
    # calculations reading it) back to the stale number, with no restart needed.
    from backend.main import app

    with TestClient(app) as client:
        liability_id = _credit_card_liability(client, outstanding=10000.0)
        client.put(f"/api/liabilities/{liability_id}/credit-card-details", json={"current_statement_spend": 7000})
        client.put(f"/api/liabilities/{liability_id}/credit-card-details", json={"current_statement_spend": 0})

        details = client.get(f"/api/liabilities/{liability_id}/credit-card-details").json()
        assert details["current_statement_spend"] == 0.0

        d = client.get("/api/init").json()
        li = next(l for l in d["liabilities"] if l["id"] == liability_id)
        assert li["has_spend_transactions"] is False
        assert li["current_statement_spend"] == 0.0  # not the stale 7000

    assert _liability_outstanding(client, liability_id) == 10000.0


def test_migration_zeroes_legacy_column_so_ledger_deleted_marker_is_not_resurrected(test_db_path):
    # Regression found in the 5th domain-review pass: migration L converted a
    # legacy current_statement_spend value into a marker transaction but never
    # zeroed the source column. If that marker was later deleted via the
    # generic Transactions Ledger (which has no reason to know about this
    # column), the NEXT backend restart's init_db() would re-scan
    # credit_card_details WHERE current_statement_spend > 0, still find the
    # stale legacy value, and silently re-insert a brand new marker —
    # resurrecting a value the user had explicitly deleted.
    import backend.db as db

    db.init_db()
    conn = db.get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM categories WHERE name = 'Credit Card'")
    cc_cat_id = cur.fetchone()["id"]
    cur.execute(
        "INSERT INTO liabilities (name, category_id, outstanding, owner_id) VALUES ('Legacy Card', ?, 25000, 1)",
        (cc_cat_id,),
    )
    liability_id = cur.lastrowid
    cur.execute(
        "INSERT INTO credit_card_details (liability_id, current_statement_spend) VALUES (?, 12000)",
        (liability_id,),
    )
    conn.commit()
    conn.close()
    db.init_db()  # runs the baseline-conversion migration, should also zero the column

    from backend.main import app

    with TestClient(app) as client:
        marker_tx = next(
            t for t in client.get("/api/entities/transactions").json() if t.get("is_balance_exempt")
        )
        client.delete(f"/api/entities/transactions/{marker_tx['id']}")

    db.init_db()  # simulates a second backend restart, after the marker was deleted

    with TestClient(app) as client:
        assert not any(t.get("is_balance_exempt") for t in client.get("/api/entities/transactions").json())
        d = client.get("/api/init").json()
        li = next(l for l in d["liabilities"] if l["id"] == liability_id)
        assert li["real_cycle_spend_total"] == 0.0
        assert li["has_spend_transactions"] is False
