import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { AppState, DeviceEventEmitter } from "react-native";
import { getDb } from "@/src/utils/localDb";
import { cancelReminder, scheduleReminder } from "@/src/utils/notifications";
import { computeCycleLabel, daysUntil, splitSavingsFromWallet } from "@/src/utils/financeHelpers";

export { computeCycleLabel, daysUntil };

// "vital"/"secundario" son categorías de Gasto (con cupo, usadas por la
// Calculadora de Presupuesto); "ingreso" es la categorización de Ingresos
// (sin cupo, solo para clasificar/autocompletar).
export type BudgetType = "vital" | "secundario" | "ingreso";
export type Method = "efectivo" | "transferencia" | "mixto";
export type TxKind = "ingreso" | "gasto";
export type Origin = "cuenta" | "vital" | "secundario" | "caja_chica" | "ahorro";

export type Wallet = {
  carteraEfectivo: number;
  carteraDigital: number;
  cajaChica: number;
  ahorro: number;
  lastSalary: number;
  cycleStart: string;
  nextPaymentDate: string | null;
};

export type BudgetCategory = {
  id: string;
  type: BudgetType;
  name: string;
  amount: number;
  created_at: string;
};

export type Transaction = {
  id: string;
  kind: TxKind;
  amount: number;
  method: Method | null;
  // Solo relevante cuando method === "mixto": monto que fue en efectivo (el
  // resto hasta `amount` se asume en transferencia).
  cashAmount: number | null;
  category: string | null;
  origin: Origin;
  note: string | null;
  created_at: string;
  cycle_id: string;
};

export type Cycle = {
  id: string;
  start_date: string;
  end_date: string | null;
  label: string;
  caja_chica_snapshot: number;
  ahorro_snapshot: number;
  resto_caja: number;
  salary_amount: number;
  created_at: string;
};

export type Note = {
  id: string;
  subject: string;
  text: string;
  pinned: boolean;
  is_reminder: boolean;
  remind_at: string | null;
  lead_minutes: number;
  notification_id: string | null;
  done: boolean;
  completed_at: string | null;
  created_at: string;
  cycle_id: string | null;
};

// 'active' (sin empezar) -> 'in_progress' (Play presionado: bloqueada
// contra edición estructural, ícono verde) -> 'done' (Finalizar Compra,
// archivada en el Historial de Listas).
export type ListStatus = "active" | "in_progress" | "done";

export type ListRecord = {
  id: string;
  list_code: string;
  title: string;
  category: string | null;
  is_programmed: boolean;
  scheduled_at: string | null;
  lead_minutes: number;
  notification_id: string | null;
  status: ListStatus;
  completed_at: string | null;
  created_at: string;
  cycle_id: string | null;
};

export type ListEntry = {
  id: string;
  list_id: string;
  text: string;
  done: boolean;
  extra: boolean;
  created_at: string;
};

// Categorías base predeterminadas de la Calculadora de Presupuesto,
// sembradas una sola vez en cuentas nuevas (ver ensureBootstrap).
const DEFAULT_VITAL_CATEGORIES = [
  "Alimentación / Mercado",
  "Vivienda / Alquiler",
  "Servicios básicos (Luz, Agua, Gas)",
  "Transporte",
  "Salud / Medicinas",
  "Educación",
];
const DEFAULT_SECUNDARIO_CATEGORIES = [
  "Entretenimiento / Salidas",
  "Ropa y Calzado",
  "Suscripciones digitales",
  "Cuidado personal",
  "Varios / Imprevistos",
];

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function todayISO(): string {
  return new Date().toISOString();
}

const EMPTY_WALLET: Wallet = {
  carteraEfectivo: 0,
  carteraDigital: 0,
  cajaChica: 0,
  ahorro: 0,
  lastSalary: 0,
  cycleStart: todayISO(),
  nextPaymentDate: null,
};

type DataCtx = {
  wallet: Wallet;
  openCycleId: string | null;
  cycles: Cycle[];
  budgetCategories: BudgetCategory[];
  transactions: Transaction[];
  notes: Note[];
  lists: ListRecord[];
  listEntries: ListEntry[];
  loading: boolean;
  refresh: () => Promise<void>;

  addIncome: (p: { amount: number; method: Method; cashAmount?: number; category?: string; note?: string; createdAt?: string }) => Promise<void>;
  addExpense: (p: { amount: number; method: Method; cashAmount?: number; category?: string; origin?: Origin; note?: string; createdAt?: string }) => Promise<void>;
  updateTransaction: (
    id: string,
    patch: { amount?: number; method?: Method; cashAmount?: number; category?: string; origin?: Origin; note?: string; createdAt?: string }
  ) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  addSavings: (amount: number) => Promise<void>;

  registerSalary: (p: {
    amount: number;
    method: "efectivo" | "transferencia" | "mixto";
    cashAmount?: number;
    nextPaymentDate: string;
  }) => Promise<void>;

  addBudgetCategory: (p: { type: BudgetType; name: string; amount: number }) => Promise<void>;
  updateBudgetCategoryAmount: (id: string, amount: number) => Promise<void>;
  updateBudgetCategoryName: (id: string, name: string) => Promise<void>;
  deleteBudgetCategory: (id: string) => Promise<void>;

  addNote: (p: { subject?: string; text: string; isReminder?: boolean; remindAt?: string | null; leadMinutes?: number }) => Promise<void>;
  updateNote: (id: string, patch: { subject?: string; text?: string; remindAt?: string | null; leadMinutes?: number }) => Promise<void>;
  toggleNoteDone: (id: string) => Promise<void>;
  toggleNotePin: (id: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;

  addList: (p: { title: string; category?: string; isProgrammed?: boolean; scheduledAt?: string | null; leadMinutes?: number }) => Promise<string>;
  updateList: (id: string, patch: { title?: string; category?: string }) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  toggleListPlay: (id: string) => Promise<void>;
  addListEntry: (listId: string, text: string, extra?: boolean) => Promise<void>;
  toggleListEntry: (id: string) => Promise<void>;
  deleteListEntry: (id: string) => Promise<void>;
  completeList: (
    listId: string,
    p: { registerExpense: boolean; amount?: number; method?: Method; cashAmount?: number; origin?: Origin; category?: string; note?: string }
  ) => Promise<void>;

  deleteCycle: (id: string) => Promise<void>;
};

const Ctx = createContext<DataCtx | undefined>(undefined);

function mapWalletRow(row: any): Wallet {
  if (!row) return { ...EMPTY_WALLET };
  return {
    carteraEfectivo: Number(row.cartera_efectivo) || 0,
    carteraDigital: Number(row.cartera_digital) || 0,
    cajaChica: Number(row.caja_chica) || 0,
    ahorro: Number(row.ahorro) || 0,
    lastSalary: Number(row.last_salary) || 0,
    cycleStart: row.cycle_start || todayISO(),
    nextPaymentDate: row.next_payment_date || null,
  };
}

function mapTx(row: any): Transaction {
  return {
    id: row.id,
    kind: row.kind,
    amount: Number(row.amount) || 0,
    method: row.method || null,
    cashAmount: row.cash_amount != null ? Number(row.cash_amount) : null,
    category: row.category || null,
    origin: (row.origin || "cuenta") as Origin,
    note: row.note || null,
    created_at: row.created_at,
    cycle_id: row.cycle_id,
  };
}

function mapNote(row: any): Note {
  return {
    id: row.id,
    subject: row.subject || "",
    text: row.text,
    pinned: !!row.pinned,
    is_reminder: !!row.is_reminder,
    remind_at: row.remind_at || null,
    lead_minutes: Number(row.lead_minutes) || 15,
    notification_id: row.notification_id || null,
    done: !!row.done,
    completed_at: row.completed_at || null,
    created_at: row.created_at,
    cycle_id: row.cycle_id || null,
  };
}

function mapList(row: any): ListRecord {
  const status: ListStatus = row.status === "done" ? "done" : row.status === "in_progress" ? "in_progress" : "active";
  return {
    id: row.id,
    list_code: row.list_code || "",
    title: row.title,
    category: row.category || null,
    is_programmed: !!row.is_programmed,
    scheduled_at: row.scheduled_at || null,
    lead_minutes: Number(row.lead_minutes) || 15,
    notification_id: row.notification_id || null,
    status,
    completed_at: row.completed_at || null,
    created_at: row.created_at,
    cycle_id: row.cycle_id || null,
  };
}

function mapListEntry(row: any): ListEntry {
  return {
    id: row.id,
    list_id: row.list_id,
    text: row.text,
    done: !!row.done,
    extra: !!row.extra,
    created_at: row.created_at,
  };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<Wallet>(EMPTY_WALLET);
  const [openCycleId, setOpenCycleId] = useState<string | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [lists, setLists] = useState<ListRecord[]>([]);
  const [listEntries, setListEntries] = useState<ListEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Garantiza que exista la fila singleton de wallet y un ciclo abierto;
  // se ejecuta una sola vez, en la primera carga de la app.
  const ensureBootstrap = useCallback(async (db: NonNullable<Awaited<ReturnType<typeof getDb>>>) => {
    let walletRow = await db.getFirstAsync<any>(`SELECT * FROM wallet WHERE id = 'main'`).catch(() => null);
    if (!walletRow) {
      const now = todayISO();
      await db.runAsync(
        `INSERT INTO wallet (id, cartera_efectivo, cartera_digital, caja_chica, ahorro, last_salary, cycle_start, next_payment_date)
         VALUES ('main', 0, 0, 0, 0, 0, ?, NULL)`,
        [now]
      ).catch(() => {});
      walletRow = await db.getFirstAsync<any>(`SELECT * FROM wallet WHERE id = 'main'`).catch(() => null);
    }

    let openCycle = await db.getFirstAsync<any>(`SELECT * FROM cycles WHERE end_date IS NULL ORDER BY start_date DESC LIMIT 1`).catch(() => null);
    if (!openCycle) {
      const id = newId("cycle");
      const now = todayISO();
      await db.runAsync(
        `INSERT INTO cycles (id, start_date, end_date, label, caja_chica_snapshot, ahorro_snapshot, resto_caja, salary_amount, created_at)
         VALUES (?, ?, NULL, '', 0, 0, 0, 0, ?)`,
        [id, walletRow?.cycle_start || now, now]
      ).catch(() => {});
      openCycle = await db.getFirstAsync<any>(`SELECT * FROM cycles WHERE id = ?`, [id]).catch(() => null);
    }

    // Categorías base predeterminadas para la Calculadora de Presupuesto:
    // solo se siembran una vez, si la tabla está totalmente vacía (cuenta
    // recién creada) -así no reaparecen si el usuario borró todo a propósito.
    const categoryCountRow = await db.getFirstAsync<any>(`SELECT COUNT(*) as n FROM budget_categories`).catch(() => null);
    if (!categoryCountRow || Number(categoryCountRow.n) === 0) {
      const now = todayISO();
      for (const name of DEFAULT_VITAL_CATEGORIES) {
        await db.runAsync(`INSERT INTO budget_categories (id, type, name, amount, created_at) VALUES (?, 'vital', ?, 0, ?)`, [newId("cat"), name, now]).catch(() => {});
      }
      for (const name of DEFAULT_SECUNDARIO_CATEGORIES) {
        await db.runAsync(`INSERT INTO budget_categories (id, type, name, amount, created_at) VALUES (?, 'secundario', ?, 0, ?)`, [newId("cat"), name, now]).catch(() => {});
      }
    }

    return { walletRow, openCycle };
  }, []);

  const refresh = useCallback(async () => {
    const db = await getDb();
    if (!db) {
      setLoading(false);
      return;
    }

    const { walletRow, openCycle } = await ensureBootstrap(db);
    setWallet(mapWalletRow(walletRow));
    setOpenCycleId(openCycle?.id || null);

    const cycleRows = await db.getAllAsync<any>(`SELECT * FROM cycles ORDER BY start_date DESC`).catch(() => []);
    setCycles(cycleRows || []);

    const budgetRows = await db.getAllAsync<any>(`SELECT * FROM budget_categories ORDER BY created_at ASC`).catch(() => []);
    setBudgetCategories(budgetRows || []);

    const txRows = await db.getAllAsync<any>(`SELECT * FROM transactions ORDER BY created_at DESC`).catch(() => []);
    setTransactions((txRows || []).map(mapTx));

    const noteRows = await db.getAllAsync<any>(`SELECT * FROM notes ORDER BY created_at DESC`).catch(() => []);
    setNotes((noteRows || []).map(mapNote));

    const listRows = await db.getAllAsync<any>(`SELECT * FROM lists ORDER BY created_at DESC`).catch(() => []);
    setLists((listRows || []).map(mapList));

    const entryRows = await db.getAllAsync<any>(`SELECT * FROM list_entries ORDER BY created_at DESC`).catch(() => []);
    setListEntries((entryRows || []).map(mapListEntry));

    setLoading(false);
  }, [ensureBootstrap]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Sincronización reactiva con el panel flotante nativo: cada escritura
  // de PanDb.kt (Ingreso/Gasto/Nota/Lista/liquidación desde la burbuja)
  // emite "onDatabaseSyncRequired" -ver NativeSync.kt.template- una vez
  // que su transacción SQLite ya confirmó en disco; refrescar aquí trae
  // ese cambio a la app sin esperar a que el usuario la reabra. El
  // listener de AppState es el respaldo para el caso en que el evento no
  // llegue a tiempo -app recién resumida, motor JS aún no listo cuando se
  // emitió-: al volver a "active" siempre se vuelve a leer la base, así
  // que un estado en memoria desactualizado nunca sobrevive más que el
  // tiempo que la app estuvo en segundo plano.
  useEffect(() => {
    const syncSub = DeviceEventEmitter.addListener("onDatabaseSyncRequired", () => {
      refresh();
    });
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      syncSub.remove();
      appStateSub.remove();
    };
  }, [refresh]);

  const persistWallet = useCallback(async (w: Wallet) => {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      `UPDATE wallet SET cartera_efectivo = ?, cartera_digital = ?, caja_chica = ?, ahorro = ?, last_salary = ?, cycle_start = ?, next_payment_date = ? WHERE id = 'main'`,
      [w.carteraEfectivo, w.carteraDigital, w.cajaChica, w.ahorro, w.lastSalary, w.cycleStart, w.nextPaymentDate]
    ).catch(() => {});
  }, []);

  // Aplica el efecto de un gasto/ingreso sobre Cartera/Caja Chica/Ahorro y,
  // si el origen es un presupuesto, sobre el cupo de esa categoría. `sign`
  // +1 para aplicar el movimiento, -1 para revertirlo (edición/eliminación).
  const applyTxEffect = useCallback(
    (kind: TxKind, amount: number, method: Method, origin: Origin, category: string | null, sign: 1 | -1, cashAmount?: number | null) => {
      const txSign = kind === "ingreso" ? 1 : -1;
      const delta = sign * txSign * amount;

      setWallet((prev) => {
        let next = { ...prev };
        if (origin === "caja_chica") {
          next.cajaChica += delta;
        } else if (origin === "ahorro") {
          next.ahorro += delta;
        } else if (method === "mixto") {
          // Pago mixto: se reparte entre Efectivo y Digital según el monto
          // en efectivo declarado; el resto hasta `amount` va a Digital.
          const cash = Math.min(Math.max(Number(cashAmount) || 0, 0), amount);
          const digital = amount - cash;
          next.carteraEfectivo += sign * txSign * cash;
          next.carteraDigital += sign * txSign * digital;
        } else {
          // 'cuenta', 'vital' y 'secundario' siempre mueven la Cuenta Actual.
          if (method === "efectivo") next.carteraEfectivo += delta;
          else next.carteraDigital += delta;
        }
        persistWallet(next);
        return next;
      });

      if ((origin === "vital" || origin === "secundario") && category) {
        // Sin clamp a 0: un gasto que agota el cupo debe poder dejarlo en
        // negativo (señal real de sobregiro) para que revertir el mismo
        // efecto -al editar o eliminar la transacción- siempre devuelva el
        // cupo exacto anterior, sin importar el orden de las operaciones.
        setBudgetCategories((prev) =>
          prev.map((c) => {
            if (c.type !== origin || c.name !== category) return c;
            const nextAmount = c.amount + delta;
            const db2 = getDb();
            db2.then((db) => db?.runAsync(`UPDATE budget_categories SET amount = ? WHERE id = ?`, [nextAmount, c.id]).catch(() => {}));
            return { ...c, amount: nextAmount };
          })
        );
      }
    },
    [persistWallet]
  );

  const addIncome = useCallback(
    async (p: { amount: number; method: Method; cashAmount?: number; category?: string; note?: string; createdAt?: string }) => {
      const amount = Number(p.amount) || 0;
      if (amount <= 0 || !openCycleId) return;
      const now = p.createdAt || todayISO();
      const id = newId("tx");
      const category = p.category || "Otros";
      const cashAmount = p.method === "mixto" ? Number(p.cashAmount) || 0 : null;

      applyTxEffect("ingreso", amount, p.method, "cuenta", null, 1, cashAmount);

      const newTx: Transaction = { id, kind: "ingreso", amount, method: p.method, cashAmount, category, origin: "cuenta", note: p.note || null, created_at: now, cycle_id: openCycleId };
      setTransactions((prev) => [newTx, ...prev].sort((a, b) => b.created_at.localeCompare(a.created_at)));

      const db = await getDb();
      if (db) {
        await db.runAsync(
          `INSERT INTO transactions (id, kind, amount, method, cash_amount, category, origin, note, created_at, cycle_id) VALUES (?, 'ingreso', ?, ?, ?, ?, 'cuenta', ?, ?, ?)`,
          [id, amount, p.method, cashAmount, category, p.note || null, now, openCycleId]
        ).catch(() => {});
      }
    },
    [openCycleId, applyTxEffect]
  );

  const addExpense = useCallback(
    async (p: { amount: number; method: Method; cashAmount?: number; category?: string; origin?: Origin; note?: string; createdAt?: string }) => {
      const amount = Number(p.amount) || 0;
      if (amount <= 0 || !openCycleId) return;
      const now = p.createdAt || todayISO();
      const id = newId("tx");
      const category = p.category || "Otros";
      const origin = p.origin || "cuenta";
      const cashAmount = p.method === "mixto" ? Number(p.cashAmount) || 0 : null;

      applyTxEffect("gasto", amount, p.method, origin, category, 1, cashAmount);

      const newTx: Transaction = { id, kind: "gasto", amount, method: p.method, cashAmount, category, origin, note: p.note || null, created_at: now, cycle_id: openCycleId };
      setTransactions((prev) => [newTx, ...prev].sort((a, b) => b.created_at.localeCompare(a.created_at)));

      const db = await getDb();
      if (db) {
        await db.runAsync(
          `INSERT INTO transactions (id, kind, amount, method, cash_amount, category, origin, note, created_at, cycle_id) VALUES (?, 'gasto', ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, amount, p.method, cashAmount, category, origin, p.note || null, now, openCycleId]
        ).catch(() => {});
      }
    },
    [openCycleId, applyTxEffect]
  );

  const updateTransaction = useCallback(
    async (id: string, patch: { amount?: number; method?: Method; cashAmount?: number; category?: string; origin?: Origin; note?: string; createdAt?: string }) => {
      const target = transactions.find((t) => t.id === id);
      if (!target) return;

      // Revierte el efecto anterior y aplica el nuevo: así el recálculo de
      // saldos/cupos siempre queda consistente, sin importar qué campo cambió.
      applyTxEffect(target.kind, target.amount, target.method || "efectivo", target.origin, target.category, -1, target.cashAmount);

      const nextAmount = patch.amount !== undefined ? Number(patch.amount) || 0 : target.amount;
      const nextMethod = patch.method || target.method || "efectivo";
      const nextCashAmount = nextMethod === "mixto" ? Number(patch.cashAmount !== undefined ? patch.cashAmount : target.cashAmount) || 0 : null;
      const nextOrigin = patch.origin || target.origin;
      const nextCategory = patch.category !== undefined ? patch.category : target.category;
      const nextNote = patch.note !== undefined ? patch.note : target.note;
      const nextCreatedAt = patch.createdAt || target.created_at;

      applyTxEffect(target.kind, nextAmount, nextMethod, nextOrigin, nextCategory, 1, nextCashAmount);

      const updated: Transaction = { ...target, amount: nextAmount, method: nextMethod, cashAmount: nextCashAmount, origin: nextOrigin, category: nextCategory, note: nextNote, created_at: nextCreatedAt };
      setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)).sort((a, b) => b.created_at.localeCompare(a.created_at)));

      const db = await getDb();
      if (db) {
        await db.runAsync(
          `UPDATE transactions SET amount = ?, method = ?, cash_amount = ?, category = ?, origin = ?, note = ?, created_at = ? WHERE id = ?`,
          [nextAmount, nextMethod, nextCashAmount, nextCategory, nextOrigin, nextNote, nextCreatedAt, id]
        ).catch(() => {});
      }
    },
    [transactions, applyTxEffect]
  );

  const deleteTransaction = useCallback(
    async (id: string) => {
      const target = transactions.find((t) => t.id === id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));

      if (target) {
        applyTxEffect(target.kind, target.amount, target.method || "efectivo", target.origin, target.category, -1, target.cashAmount);
      }

      const db = await getDb();
      if (db) await db.runAsync(`DELETE FROM transactions WHERE id = ?`, [id]).catch(() => {});
    },
    [transactions, applyTxEffect]
  );

  const addSavings = useCallback(
    async (amount: number) => {
      const requested = Number(amount) || 0;
      if (requested <= 0) return;

      setWallet((prev) => {
        const split = splitSavingsFromWallet(requested, prev.carteraEfectivo, prev.carteraDigital);
        const next: Wallet = {
          ...prev,
          carteraEfectivo: split.carteraEfectivo,
          carteraDigital: split.carteraDigital,
          ahorro: prev.ahorro + split.amount,
        };
        persistWallet(next);
        return next;
      });
    },
    [persistWallet]
  );

  const registerSalary = useCallback(
    async (p: { amount: number; method: "efectivo" | "transferencia" | "mixto"; cashAmount?: number; nextPaymentDate: string }) => {
      const amount = Number(p.amount) || 0;
      if (amount <= 0 || !openCycleId) return;
      const now = todayISO();
      const db = await getDb();

      setWallet((prev) => {
        // El primer sueldo de la cuenta no tiene remanente real que
        // trasladar (la Cuenta Actual nace en 0) ni un periodo previo que
        // cerrar: actúa solo como Apertura de Ciclo Inicial. El archivado
        // mensual y la transferencia a Caja Chica arrancan desde el
        // segundo registro en adelante.
        const isFirstSalary = prev.lastSalary <= 0;
        const resto = isFirstSalary ? 0 : prev.carteraEfectivo + prev.carteraDigital;

        let carteraEfectivo = 0;
        let carteraDigital = 0;
        if (p.method === "efectivo") carteraEfectivo = amount;
        else if (p.method === "transferencia") carteraDigital = amount;
        else {
          const cash = Math.min(Math.max(Number(p.cashAmount) || 0, 0), amount);
          carteraEfectivo = cash;
          carteraDigital = amount - cash;
        }

        const next: Wallet = {
          carteraEfectivo,
          carteraDigital,
          cajaChica: prev.cajaChica + resto,
          ahorro: prev.ahorro,
          lastSalary: amount,
          cycleStart: now,
          nextPaymentDate: p.nextPaymentDate,
        };

        persistWallet(next);

        (async () => {
          if (!db) return;

          if (isFirstSalary) {
            // Solo adelanta el inicio del ciclo ya abierto a este momento
            // (el periodo real empieza cuando entra el primer sueldo, no
            // cuando se creó la cuenta); no cierra ni archiva nada, así
            // el Historial de Cierre permanece vacío.
            await db.runAsync(`UPDATE cycles SET start_date = ? WHERE id = ?`, [now, openCycleId]).catch(() => {});
            refresh();
            return;
          }

          // Cierra el ciclo actual con su snapshot y abre uno nuevo.
          const openCycleRow = await db.getFirstAsync<any>(`SELECT * FROM cycles WHERE id = ?`, [openCycleId]).catch(() => null);
          const startDate = openCycleRow?.start_date ? new Date(openCycleRow.start_date) : new Date(prev.cycleStart);
          const label = computeCycleLabel(startDate, new Date(now));

          await db.runAsync(
            `UPDATE cycles SET end_date = ?, label = ?, caja_chica_snapshot = ?, ahorro_snapshot = ?, resto_caja = ?, salary_amount = ? WHERE id = ?`,
            [now, label, next.cajaChica, next.ahorro, resto, amount, openCycleId]
          ).catch(() => {});

          const newCycleId = newId("cycle");
          await db.runAsync(
            `INSERT INTO cycles (id, start_date, end_date, label, caja_chica_snapshot, ahorro_snapshot, resto_caja, salary_amount, created_at)
             VALUES (?, ?, NULL, '', 0, 0, 0, 0, ?)`,
            [newCycleId, now, now]
          ).catch(() => {});

          setOpenCycleId(newCycleId);
          refresh();
        })();

        return next;
      });
    },
    [openCycleId, persistWallet, refresh]
  );

  const addBudgetCategory = useCallback(async (p: { type: BudgetType; name: string; amount: number }) => {
    const name = (p.name || "").trim();
    if (!name) return;
    const id = newId("cat");
    const now = todayISO();
    const amount = Number(p.amount) || 0;

    setBudgetCategories((prev) => [...prev, { id, type: p.type, name, amount, created_at: now }]);

    const db = await getDb();
    if (db) {
      await db.runAsync(
        `INSERT INTO budget_categories (id, type, name, amount, created_at) VALUES (?, ?, ?, ?, ?)`,
        [id, p.type, name, amount, now]
      ).catch(() => {});
    }
  }, []);

  const updateBudgetCategoryAmount = useCallback(async (id: string, amount: number) => {
    const amt = Number(amount) || 0;
    setBudgetCategories((prev) => prev.map((c) => (c.id === id ? { ...c, amount: amt } : c)));
    const db = await getDb();
    if (db) await db.runAsync(`UPDATE budget_categories SET amount = ? WHERE id = ?`, [amt, id]).catch(() => {});
  }, []);

  const updateBudgetCategoryName = useCallback(async (id: string, name: string) => {
    const clean = (name || "").trim();
    if (!clean) return;
    setBudgetCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name: clean } : c)));
    const db = await getDb();
    if (db) await db.runAsync(`UPDATE budget_categories SET name = ? WHERE id = ?`, [clean, id]).catch(() => {});
  }, []);

  const deleteBudgetCategory = useCallback(async (id: string) => {
    setBudgetCategories((prev) => prev.filter((c) => c.id !== id));
    const db = await getDb();
    if (db) await db.runAsync(`DELETE FROM budget_categories WHERE id = ?`, [id]).catch(() => {});
  }, []);

  const addNote = useCallback(
    async (p: { subject?: string; text: string; isReminder?: boolean; remindAt?: string | null; leadMinutes?: number }) => {
      const text = (p.text || "").trim();
      if (!text) return;
      const id = newId("note");
      const now = todayISO();
      const subject = (p.subject || "").trim();
      const isReminder = !!p.isReminder && !!p.remindAt;
      const leadMinutes = p.leadMinutes ?? 15;

      let notificationId: string | null = null;
      if (isReminder && p.remindAt) {
        notificationId = await scheduleReminder({ id, text: subject || text, remindAt: p.remindAt, leadMinutes });
      }

      const newNote: Note = {
        id,
        subject,
        text,
        pinned: false,
        is_reminder: isReminder,
        remind_at: isReminder ? p.remindAt || null : null,
        lead_minutes: leadMinutes,
        notification_id: notificationId,
        done: false,
        completed_at: null,
        created_at: now,
        cycle_id: openCycleId,
      };
      setNotes((prev) => [newNote, ...prev]);

      const db = await getDb();
      if (db) {
        await db.runAsync(
          `INSERT INTO notes (id, subject, text, pinned, is_reminder, remind_at, lead_minutes, notification_id, done, created_at, cycle_id)
           VALUES (?, ?, ?, 0, ?, ?, ?, ?, 0, ?, ?)`,
          [id, subject, text, isReminder ? 1 : 0, newNote.remind_at, leadMinutes, notificationId, now, openCycleId]
        ).catch(() => {});
      }
    },
    [openCycleId]
  );

  const updateNote = useCallback(
    async (id: string, patch: { subject?: string; text?: string; remindAt?: string | null; leadMinutes?: number }) => {
      const target = notes.find((n) => n.id === id);
      if (!target) return;

      const nextSubject = patch.subject !== undefined ? patch.subject : target.subject;
      const nextText = patch.text !== undefined ? patch.text : target.text;
      const nextRemindAt = patch.remindAt !== undefined ? patch.remindAt : target.remind_at;
      const nextLead = patch.leadMinutes !== undefined ? patch.leadMinutes : target.lead_minutes;

      let notificationId = target.notification_id;
      if (target.is_reminder && (patch.remindAt !== undefined || patch.leadMinutes !== undefined) && nextRemindAt) {
        if (notificationId) cancelReminder(notificationId).catch(() => {});
        notificationId = await scheduleReminder({ id, text: nextSubject || nextText, remindAt: nextRemindAt, leadMinutes: nextLead });
      }

      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, subject: nextSubject, text: nextText, remind_at: nextRemindAt, lead_minutes: nextLead, notification_id: notificationId } : n))
      );

      const db = await getDb();
      if (db) {
        await db.runAsync(
          `UPDATE notes SET subject = ?, text = ?, remind_at = ?, lead_minutes = ?, notification_id = ? WHERE id = ?`,
          [nextSubject, nextText, nextRemindAt, nextLead, notificationId, id]
        ).catch(() => {});
      }
    },
    [notes]
  );

  const toggleNoteDone = useCallback(
    async (id: string) => {
      const target = notes.find((n) => n.id === id);
      const nextDone = !target?.done;
      // Se guarda la fecha/hora de cumplimiento para poder ordenar el
      // Historial de Notas/Recordatorios cronológicamente; se limpia si el
      // usuario destilda el ítem (vuelve a quedar activo, sin archivar).
      const completedAt = nextDone ? todayISO() : null;
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, done: nextDone, completed_at: completedAt } : n)));
      const db = await getDb();
      if (db) await db.runAsync(`UPDATE notes SET done = ?, completed_at = ? WHERE id = ?`, [nextDone ? 1 : 0, completedAt, id]).catch(() => {});
      if (nextDone && target?.notification_id) {
        cancelReminder(target.notification_id).catch(() => {});
      }
    },
    [notes]
  );

  const toggleNotePin = useCallback(
    async (id: string) => {
      const target = notes.find((n) => n.id === id);
      const nextPinned = !target?.pinned;
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, pinned: nextPinned } : n)));
      const db = await getDb();
      if (db) await db.runAsync(`UPDATE notes SET pinned = ? WHERE id = ?`, [nextPinned ? 1 : 0, id]).catch(() => {});
    },
    [notes]
  );

  const deleteNote = useCallback(
    async (id: string) => {
      const target = notes.find((n) => n.id === id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (target?.notification_id) cancelReminder(target.notification_id).catch(() => {});
      const db = await getDb();
      if (db) await db.runAsync(`DELETE FROM notes WHERE id = ?`, [id]).catch(() => {});
    },
    [notes]
  );

  const addList = useCallback(
    async (p: { title: string; category?: string; isProgrammed?: boolean; scheduledAt?: string | null; leadMinutes?: number }) => {
      const title = (p.title || "").trim();
      if (!title) return "";
      const id = newId("list");
      const now = todayISO();
      const isProgrammed = !!p.isProgrammed && !!p.scheduledAt;
      const leadMinutes = p.leadMinutes ?? 15;

      // Código secuencial visible (#L-001, #L-002, ...): se calcula sobre el
      // mayor número ya usado en las listas cargadas, así que sobrevive a
      // borrados sin reutilizar un código ya mostrado al usuario.
      let maxSeq = 0;
      for (const l of lists) {
        const m = /^L-(\d+)$/.exec(l.list_code || "");
        if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
      }
      const listCode = `L-${String(maxSeq + 1).padStart(3, "0")}`;

      let notificationId: string | null = null;
      if (isProgrammed && p.scheduledAt) {
        notificationId = await scheduleReminder({ id, text: `Lista: ${title}`, remindAt: p.scheduledAt, leadMinutes });
      }

      const newList: ListRecord = {
        id,
        list_code: listCode,
        title,
        category: p.category || null,
        is_programmed: isProgrammed,
        scheduled_at: isProgrammed ? p.scheduledAt || null : null,
        lead_minutes: leadMinutes,
        notification_id: notificationId,
        status: "active",
        completed_at: null,
        created_at: now,
        cycle_id: openCycleId,
      };
      setLists((prev) => [newList, ...prev]);

      const db = await getDb();
      if (db) {
        await db.runAsync(
          `INSERT INTO lists (id, list_code, title, category, is_programmed, scheduled_at, lead_minutes, notification_id, status, created_at, cycle_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
          [id, listCode, title, newList.category, isProgrammed ? 1 : 0, newList.scheduled_at, leadMinutes, notificationId, now, openCycleId]
        ).catch(() => {});
      }
      return id;
    },
    [openCycleId, lists]
  );

  const updateList = useCallback(async (id: string, patch: { title?: string; category?: string }) => {
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, title: patch.title ?? l.title, category: patch.category ?? l.category } : l)));
    const db = await getDb();
    if (db) {
      await db.runAsync(`UPDATE lists SET title = COALESCE(?, title), category = COALESCE(?, category) WHERE id = ?`, [patch.title ?? null, patch.category ?? null, id]).catch(() => {});
    }
  }, []);

  const deleteList = useCallback(
    async (id: string) => {
      const target = lists.find((l) => l.id === id);
      setLists((prev) => prev.filter((l) => l.id !== id));
      setListEntries((prev) => prev.filter((e) => e.list_id !== id));
      if (target?.notification_id) cancelReminder(target.notification_id).catch(() => {});
      const db = await getDb();
      if (db) {
        await db.withTransactionAsync(async () => {
          await db.runAsync(`DELETE FROM lists WHERE id = ?`, [id]);
          await db.runAsync(`DELETE FROM list_entries WHERE list_id = ?`, [id]);
        }).catch(() => {});
      }
    },
    [lists]
  );

  // Los ítems nuevos se anteponen (más cerca del input de entrada) para
  // confirmar visualmente la adición inmediata, empujando los anteriores
  // hacia abajo -igual en la lista en memoria que en la recarga desde DB
  // (ver el SELECT ...ORDER BY created_at DESC en refresh()).
  const addListEntry = useCallback(async (listId: string, text: string, extra: boolean = false) => {
    const clean = (text || "").trim();
    if (!clean) return;
    const id = newId("entry");
    const now = todayISO();
    setListEntries((prev) => [{ id, list_id: listId, text: clean, done: false, extra, created_at: now }, ...prev]);
    const db = await getDb();
    if (db) {
      await db.runAsync(`INSERT INTO list_entries (id, list_id, text, done, extra, created_at) VALUES (?, ?, ?, 0, ?, ?)`, [id, listId, clean, extra ? 1 : 0, now]).catch(() => {});
    }
  }, []);

  const toggleListEntry = useCallback(
    async (id: string) => {
      const target = listEntries.find((e) => e.id === id);
      const nextDone = !target?.done;
      setListEntries((prev) => prev.map((e) => (e.id === id ? { ...e, done: nextDone } : e)));
      const db = await getDb();
      if (db) await db.runAsync(`UPDATE list_entries SET done = ? WHERE id = ?`, [nextDone ? 1 : 0, id]).catch(() => {});
    },
    [listEntries]
  );

  const deleteListEntry = useCallback(async (id: string) => {
    setListEntries((prev) => prev.filter((e) => e.id !== id));
    const db = await getDb();
    if (db) await db.runAsync(`DELETE FROM list_entries WHERE id = ?`, [id]).catch(() => {});
  }, []);

  // Play es un alternador real: un toque pasa la lista a "en ejecución"
  // (ícono verde, bloqueada contra edición estructural -renombrar/quitar
  // ítems base-; los ítems nuevos que se agreguen mientras tanto quedan
  // marcados 'extra' y se ven en naranja) y otro toque la regresa a
  // "activa" (color neutro, desbloqueada). Una lista ya 'done' no cambia.
  const toggleListPlay = useCallback(
    async (id: string) => {
      const target = lists.find((l) => l.id === id);
      if (!target || target.status === "done") return;
      const nextStatus: ListStatus = target.status === "in_progress" ? "active" : "in_progress";
      setLists((prev) => prev.map((l) => (l.id === id ? { ...l, status: nextStatus } : l)));
      const db = await getDb();
      if (db) await db.runAsync(`UPDATE lists SET status = ? WHERE id = ?`, [nextStatus, id]).catch(() => {});
    },
    [lists]
  );

  // Cierra la lista desde el overlay flotante (o desde la app). El
  // interruptor "Registrar como gasto / Es una compra" decide el
  // comportamiento: si viene activo, genera el gasto referenciando el
  // código de la lista (ej. "Gasto Lista #L-001") con el origen elegido;
  // si viene desactivado, solo archiva la lista sin tocar la contabilidad.
  // En ambos casos la lista termina en estado 'done' (Historial de Listas).
  const completeList = useCallback(
    async (listId: string, p: { registerExpense: boolean; amount?: number; method?: Method; cashAmount?: number; origin?: Origin; category?: string; note?: string }) => {
      const now = todayISO();
      if (p.registerExpense && p.amount && p.method && p.origin) {
        const target = lists.find((l) => l.id === listId);
        const codeTag = target?.list_code ? `Gasto Lista #${target.list_code}` : "Gasto de lista";
        const note = p.note ? `${p.note} (${codeTag})` : codeTag;
        await addExpense({ amount: p.amount, method: p.method, cashAmount: p.cashAmount, origin: p.origin, category: p.category || "Lista de compras", note });
      }
      setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, status: "done", completed_at: now } : l)));
      const db = await getDb();
      if (db) await db.runAsync(`UPDATE lists SET status = 'done', completed_at = ? WHERE id = ?`, [now, listId]).catch(() => {});
    },
    [addExpense, lists]
  );

  // Elimina un cierre archivado del Historial. Es una limpieza del registro
  // histórico: no recalcula ni revierte los saldos actuales de Cartera/Caja
  // Chica/Ahorro (que ya avanzaron con ciclos posteriores) y nunca borra
  // notas/listas -esas viven en sus propios módulos, no en el Historial-.
  const deleteCycle = useCallback(
    async (id: string) => {
      if (id === openCycleId) return;
      setCycles((prev) => prev.filter((c) => c.id !== id));
      setTransactions((prev) => prev.filter((t) => t.cycle_id !== id));

      const db = await getDb();
      if (db) {
        await db.withTransactionAsync(async () => {
          await db.runAsync(`DELETE FROM cycles WHERE id = ?`, [id]);
          await db.runAsync(`DELETE FROM transactions WHERE cycle_id = ?`, [id]);
        }).catch(() => {});
      }
    },
    [openCycleId]
  );

  return (
    <Ctx.Provider
      value={{
        wallet,
        openCycleId,
        cycles,
        budgetCategories,
        transactions,
        notes,
        lists,
        listEntries,
        loading,
        refresh,
        addIncome,
        addExpense,
        updateTransaction,
        deleteTransaction,
        addSavings,
        registerSalary,
        addBudgetCategory,
        updateBudgetCategoryAmount,
        updateBudgetCategoryName,
        deleteBudgetCategory,
        addNote,
        updateNote,
        toggleNoteDone,
        toggleNotePin,
        deleteNote,
        addList,
        updateList,
        deleteList,
        toggleListPlay,
        addListEntry,
        toggleListEntry,
        deleteListEntry,
        completeList,
        deleteCycle,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useData() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useData must be used within DataProvider");
  return c;
}
