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

      -- Cartera: saldo activo del ciclo de sueldo en curso.
      CREATE TABLE IF NOT EXISTS wallet (
        id TEXT PRIMARY KEY,
        cartera_efectivo REAL DEFAULT 0,
        cartera_digital REAL DEFAULT 0,
        caja_chica REAL DEFAULT 0,
        ahorro REAL DEFAULT 0,
        last_salary REAL DEFAULT 0,
        cycle_start TEXT,
        next_payment_date TEXT
      );

      -- Categorías del presupuesto: Vital (gastos primarios obligatorios) o
      -- Secundario (prescindibles / estilo de vida), cada una con un monto
      -- presupuestado editable.
      CREATE TABLE IF NOT EXISTS budget_categories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        amount REAL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      -- Ingresos y gastos. cycle_id los ata al ciclo de sueldo (abierto o ya
      -- cerrado) al que pertenecen, para el detalle auditado del Historial.
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT,
        category TEXT,
        note TEXT,
        created_at TEXT NOT NULL,
        cycle_id TEXT NOT NULL
      );

      -- Historial de Cierres: cada fila es un ciclo de sueldo ya cerrado
      -- (o el ciclo abierto en curso, con end_date NULL).
      CREATE TABLE IF NOT EXISTS cycles (
        id TEXT PRIMARY KEY,
        start_date TEXT NOT NULL,
        end_date TEXT,
        label TEXT,
        caja_chica_snapshot REAL DEFAULT 0,
        ahorro_snapshot REAL DEFAULT 0,
        resto_caja REAL DEFAULT 0,
        salary_amount REAL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      -- Notas y recordatorios (dictados por voz o manuales).
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        is_reminder INTEGER DEFAULT 0,
        remind_at TEXT,
        lead_minutes INTEGER DEFAULT 15,
        notification_id TEXT,
        done INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        cycle_id TEXT
      );

      -- Pestaña LISTA: checklist simple (compras pendientes, tareas, etc).
      CREATE TABLE IF NOT EXISTS list_items (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        done INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        cycle_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_transactions_cycle ON transactions(cycle_id);
      CREATE INDEX IF NOT EXISTS idx_cycles_start ON cycles(start_date);
      CREATE INDEX IF NOT EXISTS idx_notes_remind_at ON notes(remind_at);
      CREATE INDEX IF NOT EXISTS idx_list_items_created_at ON list_items(created_at);
    `);

    // Migraciones seguras para instalaciones previas del APK con un esquema
    // más antiguo de esta misma app.
    try {
      await db.runAsync(`ALTER TABLE notes ADD COLUMN notification_id TEXT;`);
    } catch {}
  } catch (err) {
    console.warn("Fallo en execAsync de creación de tablas SQLite:", err);
  }
}
