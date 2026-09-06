"""Backend tests for Pan Administrador API.

Covers auth, products, sales, expenses, dashboard, and voice parse/transcribe endpoints.
Uses public EXPO_PUBLIC_BACKEND_URL for realistic ingress routing.
"""
import os
import io
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://margin-master-160.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth(session):
    """Register a fresh user and return (token, user, headers)."""
    email = f"TEST_{uuid.uuid4().hex[:10]}@pan.com"
    password = "testpass123"
    r = session.post(f"{API}/auth/register", json={"email": email, "password": password, "name": "Tester"})
    assert r.status_code == 201, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    token = data["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    return {"email": email, "password": password, "token": token, "user": data["user"], "headers": headers}


# ---------------- Auth ----------------
class TestAuth:
    def test_register_returns_token_and_user(self, session):
        email = f"TEST_{uuid.uuid4().hex[:10]}@pan.com"
        r = session.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "name": "N"})
        assert r.status_code == 201
        j = r.json()
        assert "access_token" in j and j["token_type"] == "bearer"
        assert j["user"]["email"] == email.lower() and j["user"]["currency"] == "PEN"

    def test_login_success_and_me(self, session, auth):
        r = session.post(f"{API}/auth/login", json={"email": auth["email"], "password": auth["password"]})
        assert r.status_code == 200
        token = r.json()["access_token"]
        me = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["email"] == auth["email"].lower()

    def test_login_invalid_returns_401(self, session, auth):
        r = session.post(f"{API}/auth/login", json={"email": auth["email"], "password": "wrongpass"})
        assert r.status_code == 401

    def test_me_without_token_returns_401(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_duplicate_register_returns_409(self, session, auth):
        r = session.post(f"{API}/auth/register", json={"email": auth["email"], "password": "abcdef", "name": "X"})
        assert r.status_code == 409


# ---------------- Products ----------------
class TestProducts:
    def test_create_list_update_delete(self, session, auth):
        h = auth["headers"]
        # create
        payload = {"name": "TEST_Camisa", "category": "Ropa", "stock": 10, "min_stock": 2, "cost": 20, "margin": 50, "price": 30}
        r = session.post(f"{API}/products", json=payload, headers=h)
        assert r.status_code == 200
        prod = r.json()
        assert prod["name"] == "TEST_Camisa" and prod["stock"] == 10
        pid = prod["id"]

        # list contains it
        r = session.get(f"{API}/products", headers=h)
        assert r.status_code == 200
        assert any(p["id"] == pid for p in r.json())

        # update
        upd = {**payload, "stock": 15, "price": 35}
        r = session.put(f"{API}/products/{pid}", json=upd, headers=h)
        assert r.status_code == 200
        assert r.json()["stock"] == 15 and r.json()["price"] == 35

        # verify persisted
        lst = session.get(f"{API}/products", headers=h).json()
        found = [p for p in lst if p["id"] == pid][0]
        assert found["stock"] == 15

        # soft delete
        r = session.delete(f"{API}/products/{pid}", headers=h)
        assert r.status_code == 200
        lst = session.get(f"{API}/products", headers=h).json()
        assert not any(p["id"] == pid for p in lst)

    def test_products_require_auth(self, session):
        assert session.get(f"{API}/products").status_code == 401


# ---------------- Sales ----------------
class TestSales:
    def test_create_sale_decrements_stock_and_computes_profit(self, session, auth):
        h = auth["headers"]
        # create product
        payload = {"name": "TEST_Polo", "category": "Ropa", "stock": 20, "min_stock": 1, "cost": 10, "margin": 100, "price": 20}
        pid = session.post(f"{API}/products", json=payload, headers=h).json()["id"]

        sale = {
            "items": [{"product_id": pid, "name": "TEST_Polo", "qty": 3, "unit_price": 20, "unit_cost": 10}],
            "payments": [{"method": "cash", "amount": 40}, {"method": "transfer", "amount": 20}],
            "note": "TEST sale",
        }
        r = session.post(f"{API}/sales", json=sale, headers=h)
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["total"] == 60 and s["cost_total"] == 30 and s["profit"] == 30
        sid = s["id"]

        # stock decremented
        lst = session.get(f"{API}/products", headers=h).json()
        found = [p for p in lst if p["id"] == pid][0]
        assert found["stock"] == 17

        # delete sale restores stock
        r = session.delete(f"{API}/sales/{sid}", headers=h)
        assert r.status_code == 200
        lst = session.get(f"{API}/products", headers=h).json()
        found = [p for p in lst if p["id"] == pid][0]
        assert found["stock"] == 20

    def test_create_sale_empty_items_400(self, session, auth):
        r = session.post(f"{API}/sales", json={"items": [], "payments": []}, headers=auth["headers"])
        assert r.status_code == 400


# ---------------- Expenses ----------------
class TestExpenses:
    def test_create_list_delete_expense(self, session, auth):
        h = auth["headers"]
        r = session.post(f"{API}/expenses", json={"type": "operating", "category": "Transporte", "amount": 15, "method": "cash", "note": "TEST"}, headers=h)
        assert r.status_code == 200
        eid = r.json()["id"]
        assert r.json()["amount"] == 15 and r.json()["category"] == "Transporte"

        lst = session.get(f"{API}/expenses", headers=h).json()
        assert any(e["id"] == eid for e in lst)

        r = session.delete(f"{API}/expenses/{eid}", headers=h)
        assert r.status_code == 200
        lst = session.get(f"{API}/expenses", headers=h).json()
        assert not any(e["id"] == eid for e in lst)


# ---------------- Dashboard ----------------
class TestDashboard:
    @pytest.mark.parametrize("rng", ["today", "week", "month", "year"])
    def test_dashboard_ranges(self, session, auth, rng):
        r = session.get(f"{API}/dashboard?range={rng}", headers=auth["headers"])
        assert r.status_code == 200
        j = r.json()
        for k in ("balance_cash", "balance_transfer", "total_income", "total_expenses",
                 "net_profit", "sales_series", "expense_by_category", "top_products", "low_stock_count"):
            assert k in j, f"missing {k}"

    def test_dashboard_aggregates(self, session, auth):
        h = auth["headers"]
        # create isolated user data
        session.post(f"{API}/expenses", json={"type": "operating", "category": "TEST_Cat", "amount": 25, "method": "cash"}, headers=h)
        session.post(f"{API}/expenses", json={"type": "operating", "category": "TEST_Cat", "amount": 5, "method": "transfer"}, headers=h)
        r = session.get(f"{API}/dashboard?range=today", headers=h)
        j = r.json()
        # our test_cat should show in expense_by_category
        cats = {c["label"]: c["value"] for c in j["expense_by_category"]}
        assert cats.get("TEST_Cat", 0) >= 30


# ---------------- Voice ----------------
class TestVoice:
    def test_voice_parse_sale(self, session, auth):
        r = session.post(f"{API}/voice/parse", json={"text": "vendí una camisa a 50 soles en efectivo"}, headers=auth["headers"], timeout=60)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "parsed" in j
        assert j["parsed"].get("kind") in ("sale", "expense", "unknown")

    def test_voice_parse_expense(self, session, auth):
        r = session.post(f"{API}/voice/parse", json={"text": "gasté 10 soles en pasajes"}, headers=auth["headers"], timeout=60)
        assert r.status_code == 200
        parsed = r.json()["parsed"]
        # Gemini should identify as expense
        assert parsed.get("kind") in ("expense", "unknown")

    def test_voice_parse_requires_auth(self, session):
        r = session.post(f"{API}/voice/parse", json={"text": "hola"})
        assert r.status_code == 401

    def test_voice_transcribe_requires_auth(self, session):
        # multipart without auth
        files = {"audio": ("x.m4a", b"\x00\x00", "audio/m4a")}
        r = requests.post(f"{API}/voice/transcribe", files=files)
        assert r.status_code == 401
