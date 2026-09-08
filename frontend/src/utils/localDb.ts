import * as SQLite from "expo-sqlite";

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (dbInstance) return dbInstance;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        const db = await SQLite.openDatabaseAsync("pandiario.db");
        // Diagnóstico: confirma en logcat (adb logcat | grep PANDIARIO_DB)
        // que esta ruta absoluta coincide exactamente con la que loguea
        // PanDb.kt.template al abrir su propia conexión -ambas fórmulas de
        // ruta (context.filesDir + "/SQLite/pandiario.db") son idénticas
        // por diseño, pero esto lo confirma en un dispositivo real en vez
        // de asumirlo-.
        console.log("PANDIARIO_DB_RN", db.databasePath);
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

// Descubrimiento clave: expo-sqlite CACHEA la conexión nativa por nombre de
// archivo -openDatabaseAsync("pandiario.db") llamado de nuevo NO abre una
// conexión realmente independiente, devuelve la misma (con un ref-count
// interno), salvo que se pase { useNewConnection: true } explícitamente
// (ver node_modules/expo-sqlite/android/.../SQLiteModule.kt,
// findCachedDatabase). Esto significa que dbInstance (usado por getDb(),
// y por lo tanto por refresh()) es, en la práctica, UNA SOLA conexión
// viva durante toda la sesión -sin importar cuántas veces distintas
// funciones llamen a getDb()-, así que cualquier motivo por el que esa
// conexión deje de ver escrituras externas (transacción atascada, o
// cualquier otra causa que no se pudo confirmar sin logcat de un
// dispositivo real) afecta a TODOS los refresh subsiguientes por igual,
// sin importar el mecanismo que los dispare (evento, AppState, polling,
// botón manual) -coincide exactamente con el patrón reportado: nada
// funciona salvo matar el proceso, que sí abre una conexión realmente
// nueva-.
//
// En vez de seguir apostando a diagnosticar la causa exacta sin poder
// probarla en un dispositivo, refresh() ahora abre su propia conexión de
// SOLO LECTURA con useNewConnection: true -genuinamente independiente de
// dbInstance, nunca cacheada- y la cierra al terminar. Cada refresh queda
// así mecánicamente idéntico, a nivel SQL, a lo que pasa en un reinicio
// completo de la app -que el usuario confirmó una y otra vez que SIEMPRE
// muestra los datos reales-, sin depender de ninguna teoría sobre qué
// exactamente se atasca en la conexión compartida. dbInstance (getDb)
// sigue siendo la única conexión usada para ESCRIBIR -eso nunca falló: el
// usuario siempre confirmó que lo registrado sobrevive a un reinicio-, así
// que no hay ningún cambio de riesgo ahí.
export async function openFreshReadConnection(): Promise<SQLite.SQLiteDatabase | null> {
  try {
    const db = await SQLite.openDatabaseAsync("pandiario.db", { useNewConnection: true });
    await db.execAsync(`PRAGMA busy_timeout = 3000;`).catch(() => {});
    return db;
  } catch (error) {
    console.warn("PANDIARIO_SYNC: no se pudo abrir la conexión de lectura fresca:", error);
    return null;
  }
}

async function initDb(db: SQLite.SQLiteDatabase) {
  try {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 3000;

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
      -- origin: de dónde sale/entra el dinero -'cuenta' (Cuenta Actual),
      -- 'vital'/'secundario' (Presupuesto, además descuenta esa categoría),
      -- 'caja_chica' o 'ahorro'-. Los ingresos siempre usan 'cuenta'.
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT,
        cash_amount REAL,
        category TEXT,
        category_id TEXT,
        origin TEXT DEFAULT 'cuenta',
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

      -- Notas y recordatorios (dictados por voz o manuales). subject es el
      -- "asunto"/título corto; text es el cuerpo. pinned las ancla arriba
      -- del panel de Notas.
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        subject TEXT DEFAULT '',
        text TEXT NOT NULL,
        pinned INTEGER DEFAULT 0,
        is_reminder INTEGER DEFAULT 0,
        remind_at TEXT,
        lead_minutes INTEGER DEFAULT 15,
        notification_id TEXT,
        done INTEGER DEFAULT 0,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        cycle_id TEXT
      );

      -- Pestaña LISTA: cada fila es una lista con nombre y categoría propios
      -- (ej. "Compras del súper"). is_programmed + scheduled_at la vuelven
      -- una Lista Programada. status: 'active' (sin empezar) ->
      -- 'in_progress' (Play presionado, bloqueada contra edición
      -- estructural, ícono verde) -> 'done' (Finalizar Compra, archivada
      -- en el Historial de Listas).
      CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY,
        list_code TEXT,
        title TEXT NOT NULL,
        category TEXT,
        is_programmed INTEGER DEFAULT 0,
        scheduled_at TEXT,
        lead_minutes INTEGER DEFAULT 15,
        notification_id TEXT,
        status TEXT DEFAULT 'active',
        completed_at TEXT,
        created_at TEXT NOT NULL,
        cycle_id TEXT
      );

      -- Ítems dentro de una lista. extra=1 marca los agregados durante el
      -- modo Editar Lista del overlay flotante (se muestran en naranja).
      CREATE TABLE IF NOT EXISTS list_entries (
        id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL,
        text TEXT NOT NULL,
        done INTEGER DEFAULT 0,
        extra INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_transactions_cycle ON transactions(cycle_id);
      CREATE INDEX IF NOT EXISTS idx_cycles_start ON cycles(start_date);
      CREATE INDEX IF NOT EXISTS idx_notes_remind_at ON notes(remind_at);
      CREATE INDEX IF NOT EXISTS idx_lists_scheduled_at ON lists(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_list_entries_list ON list_entries(list_id);
    `);

    // Migraciones seguras para instalaciones previas del APK con un esquema
    // más antiguo de esta misma app.
    try {
      await db.runAsync(`ALTER TABLE notes ADD COLUMN notification_id TEXT;`);
    } catch {}
    try {
      await db.runAsync(`ALTER TABLE notes ADD COLUMN subject TEXT DEFAULT '';`);
    } catch {}
    try {
      await db.runAsync(`ALTER TABLE notes ADD COLUMN pinned INTEGER DEFAULT 0;`);
    } catch {}
    try {
      await db.runAsync(`ALTER TABLE transactions ADD COLUMN origin TEXT DEFAULT 'cuenta';`);
    } catch {}
    try {
      await db.runAsync(`ALTER TABLE transactions ADD COLUMN cash_amount REAL;`);
    } catch {}
    try {
      await db.runAsync(`ALTER TABLE notes ADD COLUMN completed_at TEXT;`);
    } catch {}
    try {
      await db.runAsync(`ALTER TABLE lists ADD COLUMN completed_at TEXT;`);
    } catch {}
    try {
      await db.runAsync(`ALTER TABLE lists ADD COLUMN list_code TEXT;`);
    } catch {}
    try {
      // Antes, el cupo de Vital/Secundario se ubicaba buscando por
      // "type + name" (texto) en vez de por un id estable -si el usuario
      // renombraba una categoría, las transacciones antiguas (que solo
      // guardaban el nombre viejo) dejaban de encontrarla al editarlas o
      // borrarlas, y el cupo quedaba desalineado en silencio. category_id
      // fija la categoría real al momento de crear la transacción; ver
      // ensureBudgetCategoryId en DataContext.tsx.
      await db.runAsync(`ALTER TABLE transactions ADD COLUMN category_id TEXT;`);
    } catch {}
  } catch (err) {
    console.warn("Fallo en execAsync de creación de tablas SQLite:", err);
  }
}
