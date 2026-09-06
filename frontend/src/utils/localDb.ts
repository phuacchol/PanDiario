import * as SQLite from "expo-sqlite";

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (dbInstance) return dbInstance;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        const db = await SQLite.openDatabaseAsync("pandiario.db");
        await initDb(db);
        dbInstance = db;
        return db;
      } catch (error) {
        console.warn("Error al inicializar SQLite nativo:", error);
        return null;
      } finally {
        initPromise = null;
      }
    })();
  }

  return initPromise;
}

async function initDb(db: SQLite.SQLiteDatabase) {
  try {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT,
        currency TEXT DEFAULT 'PEN',
        theme TEXT DEFAULT 'light',
        token TEXT,
        synced INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        subcategory TEXT,
        stock REAL DEFAULT 0,
        min_stock REAL DEFAULT 0,
        cost REAL DEFAULT 0,
        margin REAL DEFAULT 0,
        price REAL DEFAULT 0,
        price_pending INTEGER DEFAULT 0,
        note TEXT,
        updated_at TEXT,
        is_perishable INTEGER DEFAULT 0,
        synced INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS product_batches (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        expiry_date TEXT,
        batch_quantity REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS expired_waste_records (
        id TEXT PRIMARY KEY,
        product_id TEXT,
        product_name TEXT NOT NULL,
        quantity_discarded REAL NOT NULL,
        unit_cost REAL NOT NULL,
        total_loss_cost REAL NOT NULL,
        expiry_date TEXT,
        timestamp TEXT NOT NULL,
        note TEXT,
        synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS product_purchases (
        id TEXT PRIMARY KEY,
        product_id TEXT,
        product_name TEXT NOT NULL,
        qty REAL NOT NULL,
        unit_cost REAL NOT NULL,
        total_cost REAL NOT NULL,
        note TEXT,
        payment_method TEXT DEFAULT 'cash',
        created_at TEXT NOT NULL,
        synced INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        items TEXT NOT NULL,
        payments TEXT NOT NULL,
        total REAL NOT NULL,
        cost_total REAL NOT NULL,
        profit REAL NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        synced INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        method_detail TEXT,
        note TEXT,
        created_at TEXT NOT NULL,
        synced INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS cash_shifts (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        initial_cash REAL DEFAULT 0,
        actual_cash REAL,
        difference REAL,
        note TEXT,
        status TEXT DEFAULT 'open',
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        synced INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS taxonomy (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
      CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
      CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
      CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON product_purchases(created_at);
      CREATE INDEX IF NOT EXISTS idx_shifts_date ON cash_shifts(date);
      CREATE INDEX IF NOT EXISTS idx_batches_product ON product_batches(product_id);
      CREATE INDEX IF NOT EXISTS idx_batches_expiry ON product_batches(expiry_date);
      CREATE INDEX IF NOT EXISTS idx_waste_timestamp ON expired_waste_records(timestamp);
    `);

    // Migraciones seguras para bases de datos existentes
    try {
      await db.runAsync(`ALTER TABLE expenses ADD COLUMN method_detail TEXT;`);
    } catch {}
    try {
      await db.runAsync(`ALTER TABLE products ADD COLUMN updated_at TEXT;`);
    } catch {}
    try {
      await db.runAsync(`ALTER TABLE products ADD COLUMN min_stock REAL DEFAULT 0;`);
    } catch {}
    try {
      await db.runAsync(`ALTER TABLE products ADD COLUMN price_pending INTEGER DEFAULT 0;`);
    } catch {}
    try {
      await db.runAsync(`ALTER TABLE cash_shifts ADD COLUMN opened_at TEXT;`);
    } catch {}
    try {
      await db.runAsync(`ALTER TABLE cash_shifts ADD COLUMN closed_at TEXT;`);
    } catch {}
    try {
      await db.runAsync(`ALTER TABLE products ADD COLUMN note TEXT;`);
    } catch {}
    try {
      await db.runAsync(`ALTER TABLE product_purchases ADD COLUMN payment_method TEXT DEFAULT 'cash';`);
    } catch {}
    try {
      await db.runAsync(`ALTER TABLE products ADD COLUMN is_perishable INTEGER DEFAULT 0;`);
    } catch {}
  } catch (err) {
    console.warn("Fallo en execAsync de creación de tablas SQLite:", err);
  }
}
