import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { getDb } from "@/src/utils/localDb";
import { cancelReminder, scheduleReminder } from "@/src/utils/notifications";
import { computeCycleLabel, daysUntil, splitSavingsFromWallet } from "@/src/utils/financeHelpers";

export { computeCycleLabel, daysUntil };

export type BudgetType = "vital" | "secundario";
export type Method = "efectivo" | "transferencia";
export type TxKind = "ingreso" | "gasto";

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
  category: string | null;
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
  text: string;
  is_reminder: boolean;
  remind_at: string | null;
  lead_minutes: number;
  notification_id: string | null;
  done: boolean;
  created_at: string;
  cycle_id: string | null;
};

export type ListItem = {
  id: string;
  text: string;
  done: boolean;
  created_at: string;
  cycle_id: string | null;
};

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
  listItems: ListItem[];
  loading: boolean;
  refresh: () => Promise<void>;

  addIncome: (p: { amount: number; method: Method; category?: string; note?: string }) => Promise<void>;
  addExpense: (p: { amount: number; method: Method; category?: string; note?: string }) => Promise<void>;
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
  deleteBudgetCategory: (id: string) => Promise<void>;

  addNote: (p: { text: string; isReminder?: boolean; remindAt?: string | null; leadMinutes?: number }) => Promise<void>;
  toggleNoteDone: (id: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;

  addListItem: (text: string) => Promise<void>;
  toggleListItem: (id: string) => Promise<void>;
  deleteListItem: (id: string) => Promise<void>;

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
    category: row.category || null,
    note: row.note || null,
    created_at: row.created_at,
    cycle_id: row.cycle_id,
  };
}

function mapNote(row: any): Note {
  return {
    id: row.id,
    text: row.text,
    is_reminder: !!row.is_reminder,
    remind_at: row.remind_at || null,
    lead_minutes: Number(row.lead_minutes) || 15,
    notification_id: row.notification_id || null,
    done: !!row.done,
    created_at: row.created_at,
    cycle_id: row.cycle_id || null,
  };
}

function mapListItem(row: any): ListItem {
  return {
    id: row.id,
    text: row.text,
    done: !!row.done,
    created_at: row.created_at,
    cycle_id: row.cycle_id || null,
  };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<Wallet>(EMPTY_WALLET);
  const [openCycleId, setOpenCycleId] = useState<string | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [listItems, setListItems] = useState<ListItem[]>([]);
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

    const listRows = await db.getAllAsync<any>(`SELECT * FROM list_items ORDER BY created_at DESC`).catch(() => []);
    setListItems((listRows || []).map(mapListItem));

    setLoading(false);
  }, [ensureBootstrap]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persistWallet = useCallback(async (w: Wallet) => {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      `UPDATE wallet SET cartera_efectivo = ?, cartera_digital = ?, caja_chica = ?, ahorro = ?, last_salary = ?, cycle_start = ?, next_payment_date = ? WHERE id = 'main'`,
      [w.carteraEfectivo, w.carteraDigital, w.cajaChica, w.ahorro, w.lastSalary, w.cycleStart, w.nextPaymentDate]
    ).catch(() => {});
  }, []);

  const addIncome = useCallback(
    async (p: { amount: number; method: Method; category?: string; note?: string }) => {
      const amount = Number(p.amount) || 0;
      if (amount <= 0 || !openCycleId) return;
      const now = todayISO();
      const id = newId("tx");

      setWallet((prev) => {
        const next = { ...prev };
        if (p.method === "efectivo") next.carteraEfectivo += amount;
        else next.carteraDigital += amount;
        persistWallet(next);
        return next;
      });

      const newTx: Transaction = { id, kind: "ingreso", amount, method: p.method, category: p.category || "Otros", note: p.note || null, created_at: now, cycle_id: openCycleId };
      setTransactions((prev) => [newTx, ...prev]);

      const db = await getDb();
      if (db) {
        await db.runAsync(
          `INSERT INTO transactions (id, kind, amount, method, category, note, created_at, cycle_id) VALUES (?, 'ingreso', ?, ?, ?, ?, ?, ?)`,
          [id, amount, p.method, p.category || "Otros", p.note || null, now, openCycleId]
        ).catch(() => {});
      }
    },
    [openCycleId, persistWallet]
  );

  const addExpense = useCallback(
    async (p: { amount: number; method: Method; category?: string; note?: string }) => {
      const amount = Number(p.amount) || 0;
      if (amount <= 0 || !openCycleId) return;
      const now = todayISO();
      const id = newId("tx");

      setWallet((prev) => {
        const next = { ...prev };
        if (p.method === "efectivo") next.carteraEfectivo -= amount;
        else next.carteraDigital -= amount;
        persistWallet(next);
        return next;
      });

      const newTx: Transaction = { id, kind: "gasto", amount, method: p.method, category: p.category || "Otros", note: p.note || null, created_at: now, cycle_id: openCycleId };
      setTransactions((prev) => [newTx, ...prev]);

      const db = await getDb();
      if (db) {
        await db.runAsync(
          `INSERT INTO transactions (id, kind, amount, method, category, note, created_at, cycle_id) VALUES (?, 'gasto', ?, ?, ?, ?, ?, ?)`,
          [id, amount, p.method, p.category || "Otros", p.note || null, now, openCycleId]
        ).catch(() => {});
      }
    },
    [openCycleId, persistWallet]
  );

  const deleteTransaction = useCallback(
    async (id: string) => {
      const target = transactions.find((t) => t.id === id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));

      if (target) {
        setWallet((prev) => {
          const next = { ...prev };
          const sign = target.kind === "ingreso" ? -1 : 1;
          if (target.method === "efectivo") next.carteraEfectivo += sign * target.amount;
          else next.carteraDigital += sign * target.amount;
          persistWallet(next);
          return next;
        });
      }

      const db = await getDb();
      if (db) await db.runAsync(`DELETE FROM transactions WHERE id = ?`, [id]).catch(() => {});
    },
    [transactions, persistWallet]
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
        // El remanente que quedaba en Cartera se traslada a Caja Chica.
        const resto = prev.carteraEfectivo + prev.carteraDigital;

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

  const deleteBudgetCategory = useCallback(async (id: string) => {
    setBudgetCategories((prev) => prev.filter((c) => c.id !== id));
    const db = await getDb();
    if (db) await db.runAsync(`DELETE FROM budget_categories WHERE id = ?`, [id]).catch(() => {});
  }, []);

  const addNote = useCallback(
    async (p: { text: string; isReminder?: boolean; remindAt?: string | null; leadMinutes?: number }) => {
      const text = (p.text || "").trim();
      if (!text) return;
      const id = newId("note");
      const now = todayISO();
      const isReminder = !!p.isReminder && !!p.remindAt;
      const leadMinutes = p.leadMinutes ?? 15;

      let notificationId: string | null = null;
      if (isReminder && p.remindAt) {
        notificationId = await scheduleReminder({ id, text, remindAt: p.remindAt, leadMinutes });
      }

      const newNote: Note = {
        id,
        text,
        is_reminder: isReminder,
        remind_at: isReminder ? p.remindAt || null : null,
        lead_minutes: leadMinutes,
        notification_id: notificationId,
        done: false,
        created_at: now,
        cycle_id: openCycleId,
      };
      setNotes((prev) => [newNote, ...prev]);

      const db = await getDb();
      if (db) {
        await db.runAsync(
          `INSERT INTO notes (id, text, is_reminder, remind_at, lead_minutes, notification_id, done, created_at, cycle_id)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [id, text, isReminder ? 1 : 0, newNote.remind_at, leadMinutes, notificationId, now, openCycleId]
        ).catch(() => {});
      }
    },
    [openCycleId]
  );

  const toggleNoteDone = useCallback(
    async (id: string) => {
      const target = notes.find((n) => n.id === id);
      const nextDone = !target?.done;
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, done: nextDone } : n)));
      const db = await getDb();
      if (db) await db.runAsync(`UPDATE notes SET done = ? WHERE id = ?`, [nextDone ? 1 : 0, id]).catch(() => {});
      if (nextDone && target?.notification_id) {
        cancelReminder(target.notification_id).catch(() => {});
      }
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

  const addListItem = useCallback(
    async (text: string) => {
      const clean = (text || "").trim();
      if (!clean) return;
      const id = newId("item");
      const now = todayISO();
      setListItems((prev) => [{ id, text: clean, done: false, created_at: now, cycle_id: openCycleId }, ...prev]);
      const db = await getDb();
      if (db) {
        await db.runAsync(`INSERT INTO list_items (id, text, done, created_at, cycle_id) VALUES (?, ?, 0, ?, ?)`, [id, clean, now, openCycleId]).catch(() => {});
      }
    },
    [openCycleId]
  );

  const toggleListItem = useCallback(
    async (id: string) => {
      const target = listItems.find((i) => i.id === id);
      const nextDone = !target?.done;
      setListItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: nextDone } : i)));
      const db = await getDb();
      if (db) await db.runAsync(`UPDATE list_items SET done = ? WHERE id = ?`, [nextDone ? 1 : 0, id]).catch(() => {});
    },
    [listItems]
  );

  const deleteListItem = useCallback(async (id: string) => {
    setListItems((prev) => prev.filter((i) => i.id !== id));
    const db = await getDb();
    if (db) await db.runAsync(`DELETE FROM list_items WHERE id = ?`, [id]).catch(() => {});
  }, []);

  // Elimina un cierre archivado del Historial. Es una limpieza del registro
  // histórico: no recalcula ni revierte los saldos actuales de Cartera/Caja
  // Chica/Ahorro, que ya avanzaron con ciclos posteriores.
  const deleteCycle = useCallback(
    async (id: string) => {
      if (id === openCycleId) return;
      setCycles((prev) => prev.filter((c) => c.id !== id));
      setTransactions((prev) => prev.filter((t) => t.cycle_id !== id));
      setNotes((prev) => prev.filter((n) => n.cycle_id !== id));
      setListItems((prev) => prev.filter((i) => i.cycle_id !== id));

      const db = await getDb();
      if (db) {
        await db.withTransactionAsync(async () => {
          await db.runAsync(`DELETE FROM cycles WHERE id = ?`, [id]);
          await db.runAsync(`DELETE FROM transactions WHERE cycle_id = ?`, [id]);
          await db.runAsync(`DELETE FROM notes WHERE cycle_id = ?`, [id]);
          await db.runAsync(`DELETE FROM list_items WHERE cycle_id = ?`, [id]);
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
        listItems,
        loading,
        refresh,
        addIncome,
        addExpense,
        deleteTransaction,
        addSavings,
        registerSalary,
        addBudgetCategory,
        updateBudgetCategoryAmount,
        deleteBudgetCategory,
        addNote,
        toggleNoteDone,
        deleteNote,
        addListItem,
        toggleListItem,
        deleteListItem,
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
