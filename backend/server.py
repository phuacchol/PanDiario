import os
import logging
import uuid
import tempfile
import json
import re
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated, Dict, Any

from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, BeforeValidator
from bson import ObjectId
import bcrypt
import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
JWT_MINUTES = int(os.environ.get('JWT_EXPIRE_MINUTES', '43200'))

app = FastAPI(title="Pan Administrador API")
api_router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("pan_admin")


# ---------------- Mongo helpers ----------------
def _validate_object_id(v):
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)

PyObjectId = Annotated[str, BeforeValidator(_validate_object_id)]


def now_utc():
    return datetime.now(timezone.utc)


# Motor/PyMongo, sin tz_aware=True (el cliente de este archivo no lo pasa),
# devuelve los datetime leídos de Mongo como "naive" (sin tzinfo) aunque
# BSON los guarda siempre en UTC. datetime.isoformat() sobre un naive NO
# agrega ningún sufijo de zona horaria (ej. "2026-09-06T19:56:00.123000"),
# y ese string ambiguo -sin "Z" ni offset- puede interpretarse como hora
# LOCAL del dispositivo en vez de UTC según el motor JS del cliente
# (Hermes en React Native, notablemente), produciendo un desfase de varias
# horas en pantalla que además "salta" al cargar: la escritura local ya
# guarda la hora local u otro string ISO sin ambigüedad, así que el valor
# se ve correcto hasta que la respuesta de este mismo endpoint lo
# sobrescribe. Se fuerza tzinfo=UTC antes de serializar para que el
# resultado SIEMPRE lleve un offset explícito ("+00:00"), sin importar si
# el datetime venía de Mongo (naive) o de now_utc() (ya aware).
def iso_utc(value) -> Optional[str]:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return str(value) if value is not None else None


# ---------------- Models ----------------
class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    name: Optional[str] = None


class PublicUser(BaseModel):
    id: str
    email: EmailStr
    name: str
    currency: str = "PEN"
    theme: str = "light"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: PublicUser


class SettingsUpdate(BaseModel):
    currency: Optional[str] = None
    theme: Optional[str] = None
    name: Optional[str] = None


class ProductIn(BaseModel):
    name: str
    category: str = "General"
    subcategory: Optional[str] = None
    stock: float = 0
    min_stock: float = 0
    cost: float = 0
    margin: float = 30
    price: float = 0
    price_pending: bool = False
    note: Optional[str] = None


class SaleItem(BaseModel):
    product_id: Optional[str] = None
    name: str
    qty: float = 1
    unit_price: float = 0
    unit_cost: float = 0


class PaymentPart(BaseModel):
    method: str  # cash | transfer
    amount: float
    detail: Optional[str] = None


class SaleIn(BaseModel):
    items: List[SaleItem]
    payments: List[PaymentPart]
    note: Optional[str] = None


class SaleUpdate(BaseModel):
    note: Optional[str] = None
    payments: Optional[List[PaymentPart]] = None


class ExpenseIn(BaseModel):
    type: str  # merchandise | supplies | operating | Operativos | Insumos | Mercancía
    category: str
    amount: float
    method: str = "cash"  # cash | transfer
    method_detail: Optional[str] = None
    note: Optional[str] = None


class ExpenseUpdate(BaseModel):
    amount: Optional[float] = None
    note: Optional[str] = None
    method: Optional[str] = None
    method_detail: Optional[str] = None


class PurchaseIn(BaseModel):
    product_id: Optional[str] = None
    product_name: str
    qty: float = 1
    unit_cost: float = 0
    payment_method: str = "cash"
    note: Optional[str] = None


class ParseIn(BaseModel):
    text: str
    context: Optional[str] = "home"


class AssistantAskIn(BaseModel):
    question: str
    screen: Optional[str] = "General"


# ---------------- Auth utils ----------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode()


def verify_password(pw: str, pw_hash: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode('utf-8'), pw_hash.encode())
    except (ValueError, TypeError):
        return False


def make_token(uid: str) -> str:
    n = now_utc()
    payload = {"sub": uid, "iat": n, "exp": n + timedelta(minutes=JWT_MINUTES)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def public_user(doc: dict) -> PublicUser:
    return PublicUser(
        id=str(doc["_id"]),
        email=doc["email"],
        name=doc.get("name") or doc["email"].split("@")[0],
        currency=doc.get("currency", "PEN"),
        theme=doc.get("theme", "light"),
    )


async def current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "No autenticado", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        uid = payload.get("sub")
        if not uid or not ObjectId.is_valid(uid):
            raise jwt.InvalidTokenError()
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido o expirado", headers={"WWW-Authenticate": "Bearer"})
    doc = await db.users.find_one({"_id": ObjectId(uid)})
    if not doc:
        raise HTTPException(401, "El usuario ya no existe")
    return doc


async def optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> Optional[dict]:
    if not credentials or credentials.scheme.lower() != "bearer":
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        uid = payload.get("sub")
        if uid and ObjectId.is_valid(uid):
            return await db.users.find_one({"_id": ObjectId(uid)})
    except Exception:
        pass
    return None


# ---------------- Auth routes ----------------
@api_router.post("/auth/register", response_model=TokenResponse, status_code=201)
async def register(body: Credentials):
    email = body.email.lower().strip()
    if len(body.password.encode("utf-8")) > 72:
        raise HTTPException(400, "La contraseña es demasiado larga")
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(409, "El correo ya está registrado")
    doc = {
        "email": email,
        "password_hash": hash_password(body.password),
        "name": (body.name or email.split("@")[0]).strip(),
        "currency": "PEN",
        "theme": "light",
        "created_at": now_utc(),
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    return TokenResponse(access_token=make_token(str(res.inserted_id)), user=public_user(doc))


@api_router.post("/auth/login", response_model=TokenResponse)
async def login(body: Credentials):
    email = body.email.lower().strip()
    doc = await db.users.find_one({"email": email})
    if not doc or not verify_password(body.password, doc["password_hash"]):
        raise HTTPException(401, "Correo o contraseña incorrectos", headers={"WWW-Authenticate": "Bearer"})
    return TokenResponse(access_token=make_token(str(doc["_id"])), user=public_user(doc))


@api_router.get("/auth/me", response_model=PublicUser)
async def me(user: dict = Depends(current_user)):
    return public_user(user)


@api_router.patch("/settings", response_model=PublicUser)
async def update_settings(body: SettingsUpdate, user: dict = Depends(current_user)):
    updates = {}
    if body.currency is not None:
        updates["currency"] = body.currency
    if body.theme is not None:
        updates["theme"] = body.theme
    if body.name is not None:
        updates["name"] = body.name.strip()
    if updates:
        await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    doc = await db.users.find_one({"_id": user["_id"]})
    return public_user(doc)


# ---------------- Products ----------------
def product_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "category": doc.get("category", "General"),
        "subcategory": doc.get("subcategory"),
        "stock": doc.get("stock", 0),
        "min_stock": doc.get("min_stock", 0),
        "cost": doc.get("cost", 0),
        "margin": doc.get("margin", 0),
        "price": doc.get("price", 0),
        "price_pending": doc.get("price_pending", False),
        "note": doc.get("note"),
        "created_at": iso_utc(doc.get("created_at")) or now_utc().isoformat(),
        "updated_at": iso_utc(doc.get("updated_at")) or now_utc().isoformat(),
    }


@api_router.get("/products")
async def list_products(user: dict = Depends(current_user)):
    docs = await db.products.find({"user_id": str(user["_id"]), "deleted_at": None}).sort("name", 1).to_list(1000)
    return [product_out(d) for d in docs]


@api_router.post("/products")
async def create_product(body: ProductIn, user: dict = Depends(current_user)):
    doc = body.model_dump()
    doc.update({"user_id": str(user["_id"]), "deleted_at": None, "created_at": now_utc(), "updated_at": now_utc()})
    res = await db.products.insert_one(doc)
    doc["_id"] = res.inserted_id
    return product_out(doc)


@api_router.put("/products/{pid}")
async def update_product(pid: str, body: ProductIn, user: dict = Depends(current_user)):
    if not ObjectId.is_valid(pid):
        raise HTTPException(400, "ID inválido")
    upd = body.model_dump()
    upd["updated_at"] = now_utc()
    res = await db.products.update_one({"_id": ObjectId(pid), "user_id": str(user["_id"])}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Producto no encontrado")
    doc = await db.products.find_one({"_id": ObjectId(pid)})
    return product_out(doc)


@api_router.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(current_user)):
    if not ObjectId.is_valid(pid):
        raise HTTPException(400, "ID inválido")
    await db.products.update_one({"_id": ObjectId(pid), "user_id": str(user["_id"])}, {"$set": {"deleted_at": now_utc()}})
    return {"ok": True}


# ---------------- Sales ----------------
def sale_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "items": doc.get("items", []),
        "payments": doc.get("payments", []),
        "total": doc.get("total", 0),
        "cost_total": doc.get("cost_total", 0),
        "profit": doc.get("profit", 0),
        "note": doc.get("note"),
        "created_at": iso_utc(doc.get("created_at")) or now_utc().isoformat(),
    }


@api_router.get("/sales")
async def list_sales(user: dict = Depends(current_user)):
    docs = await db.sales.find({"user_id": str(user["_id"]), "deleted_at": None}).sort("created_at", -1).to_list(500)
    return [sale_out(d) for d in docs]


@api_router.post("/sales")
async def create_sale(body: SaleIn, user: dict = Depends(current_user)):
    if not body.items:
        raise HTTPException(400, "La venta no tiene artículos")
    total = sum(i.unit_price * i.qty for i in body.items)
    cost_total = sum(i.unit_cost * i.qty for i in body.items)
    profit = total - cost_total
    doc = {
        "user_id": str(user["_id"]),
        "items": [i.model_dump() for i in body.items],
        "payments": [p.model_dump() for p in body.payments],
        "total": total,
        "cost_total": cost_total,
        "profit": profit,
        "note": body.note,
        "deleted_at": None,
        "created_at": now_utc(),
    }
    res = await db.sales.insert_one(doc)
    doc["_id"] = res.inserted_id
    for i in body.items:
        if i.product_id and ObjectId.is_valid(i.product_id):
            await db.products.update_one(
                {"_id": ObjectId(i.product_id), "user_id": str(user["_id"])},
                {"$inc": {"stock": -i.qty}},
            )
    return sale_out(doc)


@api_router.patch("/sales/{sid}")
async def patch_sale(sid: str, body: SaleUpdate, user: dict = Depends(current_user)):
    if not ObjectId.is_valid(sid):
        raise HTTPException(400, "ID inválido")
    updates = body.model_dump(exclude_unset=True)
    updates.pop("created_at", None)
    updates["updated_at"] = now_utc()
    res = await db.sales.update_one({"_id": ObjectId(sid), "user_id": str(user["_id"])}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Venta no encontrada")
    return {"ok": True}


@api_router.delete("/sales/{sid}")
async def delete_sale(sid: str, user: dict = Depends(current_user)):
    if not ObjectId.is_valid(sid):
        raise HTTPException(400, "ID inválido")
    doc = await db.sales.find_one({"_id": ObjectId(sid), "user_id": str(user["_id"]), "deleted_at": None})
    if not doc:
        raise HTTPException(404, "Venta no encontrada")
    for i in doc.get("items", []):
        pid = i.get("product_id")
        if pid and ObjectId.is_valid(pid):
            await db.products.update_one({"_id": ObjectId(pid)}, {"$inc": {"stock": i.get("qty", 0)}})
    await db.sales.update_one({"_id": ObjectId(sid)}, {"$set": {"deleted_at": now_utc()}})
    return {"ok": True}


# ---------------- Expenses ----------------
def expense_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "type": doc.get("type", "operating"),
        "category": doc.get("category", ""),
        "amount": doc.get("amount", 0),
        "method": doc.get("method", "cash"),
        "method_detail": doc.get("method_detail"),
        "note": doc.get("note"),
        "created_at": iso_utc(doc.get("created_at")) or now_utc().isoformat(),
    }


@api_router.get("/expenses")
async def list_expenses(user: dict = Depends(current_user)):
    docs = await db.expenses.find({"user_id": str(user["_id"]), "deleted_at": None}).sort("created_at", -1).to_list(500)
    return [expense_out(d) for d in docs]


@api_router.post("/expenses")
async def create_expense(body: ExpenseIn, user: dict = Depends(current_user)):
    doc = body.model_dump()
    doc.update({"user_id": str(user["_id"]), "deleted_at": None, "created_at": now_utc()})
    res = await db.expenses.insert_one(doc)
    doc["_id"] = res.inserted_id
    return expense_out(doc)


@api_router.patch("/expenses/{eid}")
async def patch_expense(eid: str, body: ExpenseUpdate, user: dict = Depends(current_user)):
    if not ObjectId.is_valid(eid):
        raise HTTPException(400, "ID inválido")
    updates = body.model_dump(exclude_unset=True)
    updates.pop("created_at", None)
    updates["updated_at"] = now_utc()
    res = await db.expenses.update_one({"_id": ObjectId(eid), "user_id": str(user["_id"])}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Gasto no encontrado")
    return {"ok": True}


@api_router.delete("/expenses/{eid}")
async def delete_expense(eid: str, user: dict = Depends(current_user)):
    if not ObjectId.is_valid(eid):
        raise HTTPException(400, "ID inválido")
    await db.expenses.update_one({"_id": ObjectId(eid), "user_id": str(user["_id"])}, {"$set": {"deleted_at": now_utc()}})
    return {"ok": True}


# ---------------- Purchases ----------------
def purchase_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "product_id": doc.get("product_id"),
        "product_name": doc.get("product_name", ""),
        "qty": doc.get("qty", 1),
        "unit_cost": doc.get("unit_cost", 0),
        "total_cost": doc.get("total_cost", 0),
        "payment_method": doc.get("payment_method", "cash"),
        "note": doc.get("note"),
        "created_at": iso_utc(doc.get("created_at")) or now_utc().isoformat(),
    }


@api_router.get("/purchases")
async def list_purchases(user: dict = Depends(current_user)):
    docs = await db.purchases.find({"user_id": str(user["_id"]), "deleted_at": None}).sort("created_at", -1).to_list(500)
    return [purchase_out(d) for d in docs]


@api_router.post("/purchases")
async def create_purchase_endpoint(body: PurchaseIn, user: dict = Depends(current_user)):
    doc = body.model_dump()
    total = doc["qty"] * doc["unit_cost"]
    doc.update({
        "user_id": str(user["_id"]),
        "total_cost": total,
        "deleted_at": None,
        "created_at": now_utc(),
    })
    res = await db.purchases.insert_one(doc)
    doc["_id"] = res.inserted_id

    if body.product_id and ObjectId.is_valid(body.product_id):
        await db.products.update_one(
            {"_id": ObjectId(body.product_id), "user_id": str(user["_id"])},
            {"$inc": {"stock": body.qty}, "$set": {"cost": body.unit_cost}}
        )
    return purchase_out(doc)


# ---------------- Dashboard / Reports ----------------
def range_start(range_key: str) -> Optional[datetime]:
    n = now_utc()
    if range_key == "today":
        return n.replace(hour=0, minute=0, second=0, microsecond=0)
    if range_key == "week":
        start = n - timedelta(days=n.weekday())
        return start.replace(hour=0, minute=0, second=0, microsecond=0)
    if range_key == "month":
        return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if range_key == "year":
        return n.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return None


@api_router.get("/dashboard")
async def dashboard(range: str = "month", user: dict = Depends(current_user)):
    uid = str(user["_id"])
    start = range_start(range)

    sale_q = {"user_id": uid, "deleted_at": None}
    exp_q = {"user_id": uid, "deleted_at": None}
    if start:
        sale_q["created_at"] = {"$gte": start}
        exp_q["created_at"] = {"$gte": start}

    sales = await db.sales.find(sale_q).to_list(5000)
    expenses = await db.expenses.find(exp_q).to_list(5000)

    all_sales = await db.sales.find({"user_id": uid, "deleted_at": None}).to_list(10000)
    all_exp = await db.expenses.find({"user_id": uid, "deleted_at": None}).to_list(10000)

    def payments_sum(docs, method):
        t = 0.0
        for d in docs:
            for p in d.get("payments", []):
                if p.get("method") == method:
                    t += p.get("amount", 0)
        return t

    balance_cash = payments_sum(all_sales, "cash") - sum(e.get("amount", 0) for e in all_exp if e.get("method") == "cash")
    balance_transfer = payments_sum(all_sales, "transfer") - sum(e.get("amount", 0) for e in all_exp if e.get("method") == "transfer")

    total_income = sum(s.get("total", 0) for s in sales)
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    gross_profit = sum(s.get("profit", 0) for s in sales)
    net_profit = gross_profit - total_expenses

    def bucket_key(dt: datetime):
        if range in ("today",):
            return dt.astimezone(timezone.utc).strftime("%H:00")
        if range in ("week", "month"):
            return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")
        return dt.astimezone(timezone.utc).strftime("%Y-%m")

    series = {}
    for s in sales:
        dt = s.get("created_at")
        if not isinstance(dt, datetime):
            continue
        k = bucket_key(dt)
        series[k] = series.get(k, 0) + s.get("total", 0)
    sales_series = [{"label": k, "value": round(v, 2)} for k, v in sorted(series.items())]

    by_cat = {}
    for e in expenses:
        c = e.get("category", "Otros") or "Otros"
        by_cat[c] = by_cat.get(c, 0) + e.get("amount", 0)
    expense_by_category = [{"label": k, "value": round(v, 2)} for k, v in sorted(by_cat.items(), key=lambda x: -x[1])]

    prod = {}
    for s in sales:
        for it in s.get("items", []):
            name = it.get("name", "?")
            prod[name] = prod.get(name, 0) + it.get("qty", 0)
    top_products = [{"label": k, "value": v} for k, v in sorted(prod.items(), key=lambda x: -x[1])[:6]]

    low = await db.products.count_documents({
        "user_id": uid, "deleted_at": None,
        "$expr": {"$lte": ["$stock", "$min_stock"]},
    })

    return {
        "range": range,
        "balance_cash": round(balance_cash, 2),
        "balance_transfer": round(balance_transfer, 2),
        "balance_total": round(balance_cash + balance_transfer, 2),
        "total_income": round(total_income, 2),
        "total_expenses": round(total_expenses, 2),
        "gross_profit": round(gross_profit, 2),
        "net_profit": round(net_profit, 2),
        "sales_count": len(sales),
        "low_stock_count": low,
        "sales_series": sales_series,
        "expense_by_category": expense_by_category,
        "top_products": top_products,
    }


# ---------------- Taxonomy ----------------
GENERIC_SUBCATS = ["Nuevos", "Ofertas", "Temporada", "Básicos", "Premium", "Accesorios", "Otros"]
SUBCAT_SUGGESTIONS = {
    "ropa": ["Baggy", "Buzos", "Tops", "Musculosas", "Conjuntos", "Pantalones", "Abrigos"],
    "cosméticos": ["Maquillaje", "Skincare", "Perfumes", "Cabello", "Uñas", "Labiales", "Cremas"],
    "cosmeticos": ["Maquillaje", "Skincare", "Perfumes", "Cabello", "Uñas", "Labiales", "Cremas"],
    "electrónicos": ["Celulares", "Audífonos", "Cargadores", "Accesorios", "Cables", "Fundas", "Parlantes"],
    "electronicos": ["Celulares", "Audífonos", "Cargadores", "Accesorios", "Cables", "Fundas", "Parlantes"],
    "calzado": ["Zapatillas", "Sandalias", "Botas", "Tacos", "Deportivos", "Casual", "Niños"],
    "hogar": ["Cocina", "Decoración", "Baño", "Dormitorio", "Limpieza", "Organización", "Otros"],
    "accesorios": ["Bolsos", "Gorras", "Cinturones", "Joyería", "Relojes", "Lentes", "Otros"],
}


def default_subcats(name: str) -> list:
    return SUBCAT_SUGGESTIONS.get(name.strip().lower(), list(GENERIC_SUBCATS))


def default_taxonomy(uid: str) -> dict:
    return {
        "user_id": uid,
        "inventory": [
            {"name": "Ropa", "subcategories": default_subcats("Ropa")},
            {"name": "Cosméticos", "subcategories": default_subcats("Cosméticos")},
            {"name": "Electrónicos", "subcategories": default_subcats("Electrónicos")},
            {"name": "General", "subcategories": list(GENERIC_SUBCATS)},
        ],
        "expenses": [
            {"name": "Transporte", "subcategories": ["Pasajes", "Taxi", "Combustible", "Delivery"]},
            {"name": "Comida", "subcategories": ["Almuerzo", "Refrigerio", "Café"]},
            {"name": "Servicios", "subcategories": ["Luz", "Agua", "Internet", "Teléfono"]},
            {"name": "Alquiler", "subcategories": ["Local", "Almacén", "Stand"]},
            {"name": "Mercadería", "subcategories": ["Compra de Stock", "Flete de Carga"]},
            {"name": "Personal", "subcategories": ["Sueldos", "Adelantos", "Comisiones"]},
            {"name": "Otros", "subcategories": ["Varios", "Imprevistos"]},
        ],
        "expense_types": [
            {"key": "merchandise", "label": "Mercancía", "categories": ["Mercancía", "Inversión inicial", "Reposición"]},
            {"key": "supplies", "label": "Insumos", "categories": ["Bolsas", "Stickers", "Embalaje", "Insumos"]},
            {"key": "operating", "label": "Operativos", "categories": ["Transporte", "Comida", "Servicios", "Alquiler", "Otros"]},
        ],
        "updated_at": now_utc(),
    }


def taxonomy_out(doc: dict) -> dict:
    return {
        "inventory": doc.get("inventory", []),
        "expenses": doc.get("expenses", []),
        "expense_types": doc.get("expense_types", []),
    }


async def get_taxonomy_doc(uid: str) -> dict:
    doc = await db.taxonomy.find_one({"user_id": uid})
    if not doc:
        doc = default_taxonomy(uid)
        await db.taxonomy.insert_one(doc)
    return doc


class NameIn(BaseModel):
    name: str


class SubcatIn(BaseModel):
    category: str
    name: str


class ExpenseCatIn(BaseModel):
    type: str
    name: str


@api_router.get("/taxonomy")
async def get_taxonomy(user: dict = Depends(current_user)):
    return taxonomy_out(await get_taxonomy_doc(str(user["_id"])))


@api_router.post("/taxonomy/inventory-category")
async def add_inventory_category(body: NameIn, user: dict = Depends(current_user)):
    uid = str(user["_id"])
    doc = await get_taxonomy_doc(uid)
    name = body.name.strip()
    if name and not any(c["name"].lower() == name.lower() for c in doc["inventory"]):
        doc["inventory"].append({"name": name, "subcategories": default_subcats(name)})
        await db.taxonomy.update_one({"user_id": uid}, {"$set": {"inventory": doc["inventory"], "updated_at": now_utc()}})
    return taxonomy_out(doc)


@api_router.post("/taxonomy/inventory-subcategory")
async def add_inventory_subcategory(body: SubcatIn, user: dict = Depends(current_user)):
    uid = str(user["_id"])
    doc = await get_taxonomy_doc(uid)
    for c in doc["inventory"]:
        if c["name"].lower() == body.category.strip().lower():
            n = body.name.strip()
            if n and n not in c["subcategories"]:
                c["subcategories"].append(n)
    await db.taxonomy.update_one({"user_id": uid}, {"$set": {"inventory": doc["inventory"], "updated_at": now_utc()}})
    return taxonomy_out(doc)


@api_router.delete("/taxonomy/inventory-category/{name}")
async def del_inventory_category(name: str, user: dict = Depends(current_user)):
    uid = str(user["_id"])
    doc = await get_taxonomy_doc(uid)
    doc["inventory"] = [c for c in doc["inventory"] if c["name"].lower() != name.strip().lower()]
    await db.taxonomy.update_one({"user_id": uid}, {"$set": {"inventory": doc["inventory"], "updated_at": now_utc()}})
    return taxonomy_out(doc)


@api_router.delete("/taxonomy/inventory-subcategory/{category}/{name}")
async def del_inventory_subcategory(category: str, name: str, user: dict = Depends(current_user)):
    uid = str(user["_id"])
    doc = await get_taxonomy_doc(uid)
    for c in doc["inventory"]:
        if c["name"].lower() == category.strip().lower():
            c["subcategories"] = [s for s in c["subcategories"] if s.lower() != name.strip().lower()]
    await db.taxonomy.update_one({"user_id": uid}, {"$set": {"inventory": doc["inventory"], "updated_at": now_utc()}})
    return taxonomy_out(doc)


# ---------------- Voice: transcribe + parse ----------------
SPANISH_NUMS = {
    "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5,
    "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10, "once": 11,
    "doce": 12, "trece": 13, "catorce": 14, "quince": 15, "dieciseis": 16,
    "diecisiete": 17, "dieciocho": 18, "diecinueve": 19, "veinte": 20,
    "treinta": 30, "cuarenta": 40, "cincuenta": 50, "cien": 100
}

def normalize_text_numbers(text: str) -> str:
    t = text.lower()
    for word, num in SPANISH_NUMS.items():
        t = re.sub(rf"\b{word}\b", str(num), t)
    return t

def native_parse_text(text: str, context: str = "home", prod_list: list = None) -> dict:
    t = normalize_text_numbers(text)
    prod_list = prod_list or []

    # 1. Consultas financieras
    if any(k in t for k in ["cuanto he vendido", "cuánto he vendido", "cuanto vendi", "cuánto vendí", "mis ventas"]):
        r = "today"
        if "semana" in t: r = "week"
        elif "mes" in t: r = "month"
        elif "año" in t or "ano" in t: r = "year"
        return {"kind": "query", "metric": "sales", "range": r}

    if any(k in t for k in ["ganancia", "ganancias", "cuanto gane", "cuánto gané", "utilidad"]):
        r = "today"
        if "semana" in t: r = "week"
        elif "mes" in t: r = "month"
        return {"kind": "query", "metric": "profit", "range": r}

    # 2. Búsqueda
    if any(k in t for k in ["buscar", "busca", "cuanto stock", "cuánto stock", "ver", "mostrar", "encuentra"]):
        clean_q = re.sub(r"^(buscar|busca|ver|mostrar|encuentra|cuánto stock queda de|cuanto stock queda de)\s+", "", t).strip()
        return {"kind": "search", "target": context if context in ["inventory", "sales", "expenses"] else "global", "query": clean_q or t}

    # 3. Gasto
    if any(k in t for k in ["gaste", "gasté", "pague", "pagué", "gasto de", "compre", "compré"]):
        amount_match = re.search(r"(\d+(?:\.\d+)?)", t)
        amount = float(amount_match.group(1)) if amount_match else 0.0

        cat = "Transporte"
        exp_type = "Operativos"
        if any(c in t for c in ["pasaje", "transporte", "taxi", "gasolina", "delivery"]):
            cat = "Transporte"
        elif any(c in t for c in ["comida", "almuerzo", "cena", "menu", "refrigerio"]):
            cat = "Comida"
        elif any(c in t for c in ["luz", "agua", "internet", "telefono", "teléfono"]):
            cat = "Servicios"
        elif any(c in t for c in ["alquiler", "local", "almacen", "stand"]):
            cat = "Alquiler"
        elif any(c in t for c in ["mercaderia", "mercadería", "stock", "compra"]):
            cat = "Mercadería"
            exp_type = "Mercancía"
        elif any(c in t for c in ["bolsa", "sticker", "embalaje", "caja", "insumo"]):
            cat = "Insumos"
            exp_type = "Insumos"

        method = "transfer" if any(m in t for m in ["transferencia", "tarjeta", "yape", "plin", "banco"]) else "cash"
        return {
            "kind": "expense",
            "type": exp_type,
            "category": cat,
            "amount": amount,
            "method": method
        }

    # 4. Venta
    if any(k in t for k in ["vendi", "vendí", "vender", "cobre", "cobré", "venta"]):
        segments = re.split(r"\s+y\s+|\s*,\s*", t)
        items = []
        total_amount = 0.0
        method = "transfer" if any(m in t for m in ["transferencia", "tarjeta", "yape", "plin", "banco"]) else "cash"

        for seg in segments:
            seg = re.sub(r"^(vendi|vendí|vender|venta de|cobre|cobré)\s+", "", seg).strip()
            match = re.search(r"(?:(\d+)\s+)?([a-záéíóúñ\s]+?)\s+(?:a|por|de|\$)\s*(\d+(?:\.\d+)?)", seg)
            if match:
                qty = float(match.group(1)) if match.group(1) else 1.0
                name = match.group(2).strip()
                unit_price = float(match.group(3))
                total_amount += (unit_price * qty)
                items.append({
                    "name": name.capitalize(),
                    "qty": qty,
                    "unit_price": unit_price,
                    "total": unit_price * qty
                })

        if items:
            return {
                "kind": "sale",
                "items": items,
                "amount": total_amount,
                "method": method
            }

    return {"kind": "unknown"}


@api_router.post("/voice/transcribe")
async def voice_transcribe(audio: UploadFile = File(...), user: Optional[dict] = Depends(optional_user)):
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if not groq_key:
        raise HTTPException(500, "Falta configurar GROQ_API_KEY")

    filename = audio.filename or "recording.m4a"
    data = await audio.read()
    if not data:
        raise HTTPException(400, "Audio vacío")

    try:
        from groq import Groq
        groq_client = Groq(api_key=groq_key)
        transcription = groq_client.audio.transcriptions.create(
            file=(filename, data),
            model="whisper-large-v3-turbo",
            language="es",
            prompt="Pan, Pancito, Oye Pan, Descansa Pan, polos, soles, ventas, gastos, inventario, registrar, confirmar.",
            response_format="text"
        )
        text = str(transcription).strip()
        return {"text": text}
    except Exception as e:
        logger.error(f"Error en transcripción con Groq: {e}")
        raise HTTPException(500, f"Error al transcribir audio: {e}")


@api_router.post("/voice/parse")
async def voice_parse(body: ParseIn, user: Optional[dict] = Depends(optional_user)):
    prod_list = []
    currency = "PEN"

    if user:
        uid = str(user["_id"])
        products = await db.products.find({"user_id": uid, "deleted_at": None}).to_list(500)
        prod_list = [{"name": p["name"], "price": p.get("price", 0), "cost": p.get("cost", 0)} for p in products]
        currency = user.get("currency", "PEN")

    groq_key = os.environ.get("GROQ_API_KEY", "")
    if groq_key:
        try:
            from groq import Groq
            groq_client = Groq(api_key=groq_key)
            system_prompt = f"""
            Eres el asistente inteligente contable de 'PanCon Miel'. Moneda: {currency}.
            Analiza la orden por voz o texto del usuario y devuelve ÚNICAMENTE un JSON con:
            - "kind": "sale" | "expense" | "query" | "search" | "unknown"

            REGLAS IMPORTANTES DE VENTA:
            - Las palabras de cantidad ("un", "dos", "tres", etc.) deben convertirse SIEMPRE a números flotantes en el campo "qty". NUNCA las incluyas en el "name".
            - Si el usuario dice múltiples artículos (ej: "vendí 2 polos a 20 y una chompa a 50"), agrúpalos dentro de una lista "items":
              "items": [
                {{"name": "Polo", "qty": 2.0, "unit_price": 20.0, "total": 40.0}},
                {{"name": "Chompa", "qty": 1.0, "unit_price": 50.0, "total": 50.0}}
              ]
            - "amount": Suma total de todos los artículos vendidos.
            - "method": "cash" o "transfer".

            REGLAS DE GASTO:
            - "kind": "expense"
            - "type": "Mercancía" | "Insumos" | "Operativos"
            - "category": "Transporte" | "Comida" | "Servicios" | "Alquiler" | "Mercadería" | "Personal" | "Otros"
            - "amount": número flotante
            - "method": "cash" | "transfer"
            """

            completion = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": body.text}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            parsed_ai = json.loads(completion.choices[0].message.content)
            return {"transcript": body.text, "parsed": parsed_ai}
        except Exception as err:
            logger.warning(f"Fallo Groq LLM, usando respaldo regex: {err}")

    parsed = native_parse_text(body.text, body.context or "home", prod_list)
    return {"transcript": body.text, "parsed": parsed}


# ---------------- Assistant FAQ / Ask ----------------
@api_router.post("/assistant/ask")
async def assistant_ask(body: AssistantAskIn, user: Optional[dict] = Depends(optional_user)):
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if not groq_key:
        return {"answer": f"En {body.screen} puedes usar los botones principales para registrar o consultar tus datos."}

    try:
        from groq import Groq
        groq_client = Groq(api_key=groq_key)
        system_prompt = f"""
        Eres Pan con Miel, la mascota y asistente kawaii, amable y concisa de la app administrativa 'PanCon Miel'.
        El usuario está actualmente en la pantalla: '{body.screen}'.
        Responde su duda sobre el uso de la app de forma clara, directa y amistosa en español en máximo 2 o 3 oraciones.
        """

        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": body.question}
            ],
            temperature=0.3,
            max_tokens=150
        )
        answer = completion.choices[0].message.content.strip()
        return {"answer": answer}
    except Exception as e:
        logger.error(f"Error en /assistant/ask: {e}")
        return {"answer": f"En la pantalla de {body.screen} puedes gestionar tus registros tocando las tarjetas o el botón de acción principal."}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
