"""New iteration-2 backend tests: taxonomy endpoints + dual-intent voice parse."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://margin-master-160.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def auth():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_{uuid.uuid4().hex[:10]}@pan.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "testpass123", "name": "Tax"})
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    return {"s": s, "email": email, "headers": {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}}


# ---------------- Taxonomy defaults ----------------
class TestTaxonomyDefaults:
    def test_get_taxonomy_seeds_defaults(self):
        # Use a fresh user so no prior mutations affect defaults
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        email = f"TEST_{uuid.uuid4().hex[:10]}@pan.com"
        rr = s.post(f"{API}/auth/register", json={"email": email, "password": "testpass123", "name": "Fresh"})
        assert rr.status_code == 201
        h = {"Authorization": f"Bearer {rr.json()['access_token']}", "Content-Type": "application/json"}
        r = s.get(f"{API}/taxonomy", headers=h)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "inventory" in j and "expense_types" in j
        names = [c["name"] for c in j["inventory"]]
        for expected in ["Ropa", "Cosméticos", "Electrónicos", "General"]:
            assert expected in names, f"missing default cat {expected}"
        # Each default cat should have 7 subcategories
        for c in j["inventory"]:
            assert len(c["subcategories"]) == 7, f"{c['name']} has {len(c['subcategories'])} subs"
        keys = [t["key"] for t in j["expense_types"]]
        for k in ["merchandise", "supplies", "operating"]:
            assert k in keys

    def test_get_taxonomy_requires_auth(self, auth):
        assert auth["s"].get(f"{API}/taxonomy").status_code == 401


# ---------------- Inventory taxonomy CRUD ----------------
class TestInventoryTaxonomy:
    def test_add_new_inv_category_seeds_7_subcats(self, auth):
        name = f"TESTCAT_{uuid.uuid4().hex[:6]}"
        r = auth["s"].post(f"{API}/taxonomy/inventory-category", json={"name": name}, headers=auth["headers"])
        assert r.status_code == 200
        cats = {c["name"]: c for c in r.json()["inventory"]}
        assert name in cats
        assert len(cats[name]["subcategories"]) == 7  # generic fallback

    def test_add_subcategory_persists(self, auth):
        sub = f"TESTSUB_{uuid.uuid4().hex[:6]}"
        r = auth["s"].post(f"{API}/taxonomy/inventory-subcategory",
                           json={"category": "Ropa", "name": sub}, headers=auth["headers"])
        assert r.status_code == 200
        ropa = next(c for c in r.json()["inventory"] if c["name"] == "Ropa")
        assert sub in ropa["subcategories"]
        # verify GET persists
        j2 = auth["s"].get(f"{API}/taxonomy", headers=auth["headers"]).json()
        ropa2 = next(c for c in j2["inventory"] if c["name"] == "Ropa")
        assert sub in ropa2["subcategories"]

    def test_delete_inv_subcategory(self, auth):
        sub = f"TESTDEL_{uuid.uuid4().hex[:6]}"
        auth["s"].post(f"{API}/taxonomy/inventory-subcategory",
                       json={"category": "Ropa", "name": sub}, headers=auth["headers"])
        r = auth["s"].delete(f"{API}/taxonomy/inventory-subcategory/Ropa/{sub}", headers=auth["headers"])
        assert r.status_code == 200
        ropa = next(c for c in r.json()["inventory"] if c["name"] == "Ropa")
        assert sub not in ropa["subcategories"]

    def test_delete_inv_category(self, auth):
        name = f"TESTDELCAT_{uuid.uuid4().hex[:6]}"
        auth["s"].post(f"{API}/taxonomy/inventory-category", json={"name": name}, headers=auth["headers"])
        r = auth["s"].delete(f"{API}/taxonomy/inventory-category/{name}", headers=auth["headers"])
        assert r.status_code == 200
        assert not any(c["name"] == name for c in r.json()["inventory"])


# ---------------- Expense taxonomy CRUD ----------------
class TestExpenseTaxonomy:
    def test_add_and_delete_expense_type(self, auth):
        label = f"TESTETYPE_{uuid.uuid4().hex[:6]}"
        r = auth["s"].post(f"{API}/taxonomy/expense-type", json={"name": label}, headers=auth["headers"])
        assert r.status_code == 200
        types = r.json()["expense_types"]
        matched = [t for t in types if t["label"] == label]
        assert matched, f"expense type {label} not added"
        key = matched[0]["key"]
        assert matched[0]["categories"] == ["General"]

        r = auth["s"].delete(f"{API}/taxonomy/expense-type/{key}", headers=auth["headers"])
        assert r.status_code == 200
        assert not any(t["key"] == key for t in r.json()["expense_types"])

    def test_add_and_delete_expense_category(self, auth):
        cat = f"TESTECAT_{uuid.uuid4().hex[:6]}"
        r = auth["s"].post(f"{API}/taxonomy/expense-category",
                           json={"type": "operating", "name": cat}, headers=auth["headers"])
        assert r.status_code == 200
        op = next(t for t in r.json()["expense_types"] if t["key"] == "operating")
        assert cat in op["categories"]

        r = auth["s"].delete(f"{API}/taxonomy/expense-category/operating/{cat}", headers=auth["headers"])
        assert r.status_code == 200
        op = next(t for t in r.json()["expense_types"] if t["key"] == "operating")
        assert cat not in op["categories"]


# ---------------- Voice dual-intent parse ----------------
class TestVoiceDualIntent:
    def test_parse_search_intent(self, auth):
        r = auth["s"].post(f"{API}/voice/parse",
                           json={"text": "buscar buzo azul", "context": "inventory"},
                           headers=auth["headers"], timeout=60)
        assert r.status_code == 200
        p = r.json()["parsed"]
        assert p.get("kind") == "search", f"expected search, got {p}"
        assert p.get("target") in ("inventory", "global"), p
        assert "buzo" in (p.get("query") or "").lower()

    def test_parse_add_product_intent(self, auth):
        r = auth["s"].post(f"{API}/voice/parse",
                           json={"text": "añadir 5 pantalones a 10", "context": "inventory"},
                           headers=auth["headers"], timeout=60)
        assert r.status_code == 200
        p = r.json()["parsed"]
        assert p.get("kind") == "add_product", f"expected add_product, got {p}"
        assert "pantal" in (p.get("name") or "").lower()
        assert float(p.get("stock", 0)) == 5
        assert float(p.get("cost", 0)) == 10
        # price should be pending (null) per system prompt
        assert p.get("price") in (None, 0, "null")

    def test_parse_sale_intent(self, auth):
        r = auth["s"].post(f"{API}/voice/parse",
                           json={"text": "vendí un buzo a 15000 en efectivo", "context": "sales"},
                           headers=auth["headers"], timeout=60)
        assert r.status_code == 200
        p = r.json()["parsed"]
        assert p.get("kind") == "sale", f"got {p}"
        assert p.get("method") == "cash"
        assert float(p.get("amount", 0)) == 15000

    def test_parse_expense_intent(self, auth):
        r = auth["s"].post(f"{API}/voice/parse",
                           json={"text": "gasté 10000 en pasajes", "context": "expenses"},
                           headers=auth["headers"], timeout=60)
        assert r.status_code == 200
        p = r.json()["parsed"]
        assert p.get("kind") == "expense", f"got {p}"
        assert p.get("type") == "operating"
        assert (p.get("category") or "").lower().startswith("transporte")
        assert float(p.get("amount", 0)) == 10000
