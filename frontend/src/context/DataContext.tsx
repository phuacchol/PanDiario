import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import { api } from "@/src/api/client";
import { getDb } from "@/src/utils/localDb";
import { clampStockAfterDeletion, excludeDeletedPurchases } from "@/src/utils/purchaseHelpers";

// Sincronización con el backend: nunca debe interrumpir al usuario con un
// error visible (los datos locales ya se mostraron). El fallo se registra
// solo en consola para depuración — nunca Alert.alert ni un toast en
// pantalla — y la próxima sincronización pasiva (llamada periódica o al
// recuperar conectividad, ver el listener de NetInfo más abajo) reintenta
// sola sin que el usuario tenga que hacer nada.
function warnSyncError(label: string, err: unknown) {
  console.warn(`[sync] ${label} falló (se sigue usando el dato local):`, err);
}

export type Product = {
  id: string;
  name: string;
  category: string;
  subcategory?: string | null;
  stock: number;
  min_stock: number;
  cost: number;
  margin: number;
  price: number;
  price_pending?: boolean;
  note?: string | null;
  is_perishable?: boolean;
  // Lote perecible más próximo a vencer con unidades disponibles (FEFO),
  // calculado al cargar productos a partir de product_batches. null cuando
  // el producto no es perecible o no tiene lotes con stock.
  nearest_expiry_date?: string | null;
  nearest_expiry_qty?: number | null;
};

export type ProductBatch = {
  id: string;
  product_id: string;
  expiry_date: string | null;
  batch_quantity: number;
  created_at: string;
};

export type WasteRecord = {
  id: string;
  product_id?: string | null;
  product_name: string;
  quantity_discarded: number;
  unit_cost: number;
  total_loss_cost: number;
  expiry_date?: string | null;
  timestamp: string;
  note?: string | null;
};

export type ProductPurchase = {
  id: string;
  product_id?: string | null;
  product_name: string;
  qty: number;
  unit_cost: number;
  total_cost: number;
  note?: string | null;
  payment_method?: string;
  created_at: string;
};

export type Sale = {
  id: string;
  items: { product_id?: string; name: string; qty: number; unit_price: number; unit_cost: number }[];
  payments: { method: string; amount: number; detail?: string }[];
  total: number;
  cost_total: number;
  profit: number;
  note?: string;
  created_at: string;
};

export type Expense = {
  id: string;
  type: string;
  category: string;
  amount: number;
  method: string;
  method_detail?: string;
  note?: string;
  created_at: string;
};

export type CashShift = {
  id: string;
  date: string;
  initial_cash: number;
  actual_cash?: number | null;
  difference?: number | null;
  note?: string | null;
  status: "open" | "closed_manual" | "closed_auto";
  opened_at: string;
  closed_at?: string | null;
};

type DataCtx = {
  products: Product[];
  purchases: ProductPurchase[];
  sales: Sale[];
  expenses: Expense[];
  currentShift: CashShift | null;
  shiftsHistory: CashShift[];
  wasteRecords: WasteRecord[];
  loadProducts: () => Promise<void>;
  loadPurchases: () => Promise<void>;
  loadSales: () => Promise<void>;
  loadExpenses: () => Promise<void>;
  loadShifts: () => Promise<void>;
  loadWasteRecords: () => Promise<void>;
  openCashShift: (initialCash?: number) => Promise<void>;
  saveProduct: (p: any, id?: string) => Promise<Product>;
  deleteProduct: (id: string) => Promise<void>;
  createPurchase: (payload: {
    product_id?: string;
    product_name: string;
    qty: number;
    unit_cost: number;
    new_price?: number;
    new_min_stock?: number;
    payment_method?: string;
    note?: string;
    createExpenseRecord?: boolean;
    is_perishable?: boolean;
    expiry_date?: string;
  }) => Promise<void>;
  deletePurchase: (id: string) => Promise<void>;
  updatePurchase: (id: string, patch: { note?: string }) => Promise<void>;
  discardExpiredBatch: (payload: {
    product_id?: string;
    product_name: string;
    expiry_date: string;
    quantity: number;
    unit_cost: number;
    note?: string;
  }) => Promise<void>;
  createSale: (payload: any) => Promise<void>;
  updateSale: (id: string, patch: Partial<Sale>) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;
  createExpense: (payload: any) => Promise<void>;
  updateExpense: (id: string, patch: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  updateInitialCash: (amount: number) => Promise<void>;
  closeCashShift: (actualCash: number, note?: string) => Promise<void>;
  getDashboard: (range: string, customStart?: string, customEnd?: string) => Promise<any>;
};

const Ctx = createContext<DataCtx | undefined>(undefined);

function getLocalDateStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Lee los productos locales tal cual están en SQLite, identificados
// estrictamente por su `id`. Dos productos pueden compartir `name`
// legítimamente (variantes distintas de un mismo artículo) y nunca deben
// fusionarse ni perder su fila por coincidir el nombre.
async function readLocalProducts(db: any): Promise<Product[]> {
  try {
    const rows = await db.getAllAsync(`SELECT * FROM products ORDER BY name ASC, id ASC`).catch(() => []);
    if (!rows || rows.length === 0) return [];

    // Lote más próximo a vencer (FEFO) por producto, entre los que aún
    // tienen unidades: una sola consulta agrupada en vez de N consultas.
    const nearestBatchByProduct = new Map<string, { expiry_date: string; qty: number }>();
    const batchRows = await db
      .getAllAsync(
        `SELECT product_id, expiry_date, batch_quantity FROM product_batches
         WHERE batch_quantity > 0 AND expiry_date IS NOT NULL
         ORDER BY expiry_date ASC`
      )
      .catch(() => []);
    (batchRows || []).forEach((b: any) => {
      if (!nearestBatchByProduct.has(b.product_id)) {
        nearestBatchByProduct.set(b.product_id, { expiry_date: b.expiry_date, qty: Number(b.batch_quantity) || 0 });
      }
    });

    return rows
      .map((p: any) => {
        const nearest = nearestBatchByProduct.get(p.id);
        return {
          id: p.id,
          name: p.name,
          category: p.category,
          subcategory: p.subcategory ?? null,
          stock: Number(p.stock) || 0,
          min_stock: Number(p.min_stock) || 0,
          cost: Number(p.cost) || 0,
          margin: Number(p.margin) || 0,
          price: Number(p.price) || 0,
          price_pending: Boolean(p.price_pending),
          note: p.note ?? null,
          is_perishable: Boolean(p.is_perishable),
          nearest_expiry_date: nearest?.expiry_date ?? null,
          nearest_expiry_qty: nearest?.qty ?? null,
        };
      })
      .sort((a: Product, b: Product) => a.name.localeCompare(b.name));
  } catch (err) {
    console.warn("Fallo en readLocalProducts:", err);
    return [];
  }
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<ProductPurchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currentShift, setCurrentShift] = useState<CashShift | null>(null);
  const [shiftsHistory, setShiftsHistory] = useState<CashShift[]>([]);
  const [wasteRecords, setWasteRecords] = useState<WasteRecord[]>([]);

  // IDs de compras/ingresos eliminados localmente en esta sesión: el
  // backend todavía no expone un DELETE para /purchases, así que cualquier
  // sincronización en segundo plano (loadPurchases, pull-to-refresh) volvería
  // a traer el registro ya borrado desde el servidor. Se filtran aquí para
  // que la eliminación local sea definitiva y no "rebote" a los valores
  // anteriores cuando la lectura remota responde después que la local.
  const deletedPurchaseIdsRef = useRef<Set<string>>(new Set());

  // Cierra un turno de un día anterior que quedó abierto. Si no tuvo NINGÚN
  // movimiento (ni ventas, ni gastos, ni ingresos de stock, ni fondo
  // inicial distinto de 0), se elimina en vez de dejar un registro
  // histórico vacío; si tuvo cualquier actividad, se cierra y persiste en
  // el historial de arqueos aunque el saldo neto termine en 0.
  const closeStaleShift = useCallback(async (db: NonNullable<Awaited<ReturnType<typeof getDb>>>, shift: CashShift) => {
    const shiftDate = shift.date;
    const sRows = await db.getAllAsync<any>(`SELECT payments, created_at FROM sales`).catch(() => []);
    const eRows = await db.getAllAsync<any>(`SELECT amount, method, type, category, created_at FROM expenses`).catch(() => []);
    const pRows = await db.getAllAsync<any>(`SELECT created_at FROM product_purchases`).catch(() => []);

    const salesOfDay = sRows.filter((s: any) => s.created_at?.startsWith(shiftDate));
    const expensesOfDay = eRows.filter((e: any) => e.created_at?.startsWith(shiftDate));
    const purchasesOfDay = pRows.filter((p: any) => p.created_at?.startsWith(shiftDate));

    const hadActivity =
      salesOfDay.length > 0 ||
      expensesOfDay.length > 0 ||
      purchasesOfDay.length > 0 ||
      (Number(shift.initial_cash) || 0) !== 0;

    if (!hadActivity) {
      await db.runAsync(`DELETE FROM cash_shifts WHERE id = ?`, [shift.id]).catch(() => {});
      return;
    }

    let cashSales = 0;
    let cashExpenses = 0;
    salesOfDay.forEach((s: any) => {
      const pays = typeof s.payments === "string" ? JSON.parse(s.payments || "[]") : s.payments || [];
      pays.forEach((p: any) => { if (p.method === "cash") cashSales += Number(p.amount) || 0; });
    });
    expensesOfDay.forEach((e: any) => {
      const isStock = e.type === "Mercancía" || e.category === "Compra de Stock";
      if (e.method === "cash" && !isStock) cashExpenses += Number(e.amount) || 0;
    });

    const expected = (Number(shift.initial_cash) || 0) + cashSales - cashExpenses;
    await db.runAsync(
      `UPDATE cash_shifts
       SET actual_cash = ?, difference = 0, status = 'closed_auto', closed_at = datetime('now'), synced = 0
       WHERE id = ?`,
      [expected, shift.id]
    ).catch(() => {});
  }, []);

  const ensureDailyShift = useCallback(async () => {
    try {
      const todayStr = getLocalDateStr();
      const now = new Date().toISOString();
      const db = await getDb();

      if (db) {
        const oldOpenShifts = await db.getAllAsync<CashShift>(
          `SELECT * FROM cash_shifts WHERE date < ? AND status = 'open'`,
          [todayStr]
        ).catch(() => []);

        for (const oldShift of oldOpenShifts) {
          await closeStaleShift(db, oldShift);
        }

        let todayShift = await db.getFirstAsync<CashShift>(
          `SELECT * FROM cash_shifts WHERE date = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1`,
          [todayStr]
        ).catch(() => null);

        if (!todayShift) {
          const shiftId = "shift_" + Date.now();
          await db.runAsync(
            `INSERT INTO cash_shifts (id, date, initial_cash, status, opened_at, synced)
             VALUES (?, ?, 0, 'open', ?, 0)`,
            [shiftId, todayStr, now]
          ).catch(() => {});

          todayShift = {
            id: shiftId,
            date: todayStr,
            initial_cash: 0,
            status: "open",
            opened_at: now,
          };
        }

        setCurrentShift(todayShift);

        const history = await db.getAllAsync<CashShift>(
          `SELECT * FROM cash_shifts ORDER BY opened_at DESC`
        ).catch(() => []);
        setShiftsHistory(history);
      } else {
        setCurrentShift((prev) =>
          prev && prev.date === todayStr
            ? prev
            : {
                id: "shift_" + Date.now(),
                date: todayStr,
                initial_cash: 0,
                status: "open",
                opened_at: now,
              }
        );
      }
    } catch (e) {
      console.warn("Fallo en ensureDailyShift:", e);
    }
  }, [closeStaleShift]);

  const ensureOpenShiftForOperation = useCallback(async () => {
    const todayStr = getLocalDateStr();
    const now = new Date().toISOString();
    const db = await getDb();

    if (db) {
      if (currentShift && currentShift.date < todayStr && currentShift.status === "open") {
        await closeStaleShift(db, currentShift);
      }

      const activeShift = await db.getFirstAsync<CashShift>(
        `SELECT * FROM cash_shifts WHERE date = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1`,
        [todayStr]
      ).catch(() => null);

      if (activeShift) {
        setCurrentShift(activeShift);
        return activeShift;
      }

      const newShiftId = "shift_" + Date.now();
      await db.runAsync(
        `INSERT INTO cash_shifts (id, date, initial_cash, status, opened_at, synced)
         VALUES (?, ?, 0, 'open', ?, 0)`,
        [newShiftId, todayStr, now]
      ).catch(() => {});

      const newShift: CashShift = {
        id: newShiftId,
        date: todayStr,
        initial_cash: 0,
        status: "open",
        opened_at: now,
      };

      setCurrentShift(newShift);
      const history = await db.getAllAsync<CashShift>(
        `SELECT * FROM cash_shifts ORDER BY opened_at DESC`
      ).catch(() => []);
      setShiftsHistory(history);
      return newShift;
    }
  }, [currentShift, closeStaleShift]);

  const openCashShift = useCallback(async (initialCash: number = 0) => {
    const todayStr = getLocalDateStr();
    const now = new Date().toISOString();
    const safeAmount = Number(initialCash) || 0;
    const shiftId = "shift_" + Date.now();

    const newShift: CashShift = {
      id: shiftId,
      date: todayStr,
      initial_cash: safeAmount,
      status: "open",
      opened_at: now,
    };

    setCurrentShift(newShift);

    try {
      const db = await getDb();
      if (db) {
        await db.runAsync(
          `INSERT INTO cash_shifts (id, date, initial_cash, status, opened_at, synced)
           VALUES (?, ?, ?, 'open', ?, 0)`,
          [shiftId, todayStr, safeAmount, now]
        ).catch(() => {});
        const history = await db.getAllAsync<CashShift>(
          `SELECT * FROM cash_shifts ORDER BY opened_at DESC`
        ).catch(() => []);
        setShiftsHistory(history);
      }
    } catch (err) {
      console.warn("Error en openCashShift:", err);
    }
  }, []);

  const loadShifts = useCallback(async () => {
    await ensureDailyShift();
  }, [ensureDailyShift]);

  const updateInitialCash = useCallback(
    async (amount: number) => {
      const todayStr = getLocalDateStr();
      const now = new Date().toISOString();
      const safeAmount = Number(amount) || 0;
      const targetId = currentShift?.id || "shift_" + Date.now();

      setCurrentShift((prev) => ({
        id: targetId,
        date: todayStr,
        initial_cash: safeAmount,
        status: "open",
        opened_at: prev?.opened_at || now,
      }));

      try {
        const db = await getDb();
        if (db) {
          await db.runAsync(
            `UPDATE cash_shifts SET initial_cash = ?, synced = 0 WHERE id = ?`,
            [safeAmount, targetId]
          ).catch(() => {});
        }
      } catch (err) {
        console.warn("Fallo guardado initial_cash:", err);
      }
    },
    [currentShift]
  );

  const closeCashShift = useCallback(
    async (actualCash: number, note?: string) => {
      const todayStr = getLocalDateStr();
      const now = new Date().toISOString();
      const db = await getDb();

      let cashSales = 0;
      let cashExpenses = 0;

      if (db) {
        const salesRows = await db.getAllAsync<any>(`SELECT payments, created_at FROM sales`).catch(() => []);
        const expensesRows = await db.getAllAsync<any>(`SELECT amount, method, type, category, created_at FROM expenses`).catch(() => []);

        for (const s of salesRows) {
          if (s.created_at?.startsWith(todayStr)) {
            const pays = typeof s.payments === "string" ? JSON.parse(s.payments) : s.payments;
            for (const p of pays) {
              if (p.method === "cash") cashSales += Number(p.amount) || 0;
            }
          }
        }

        for (const e of expensesRows) {
          const isStock = e.type === "Mercancía" || e.category === "Compra de Stock";
          if (e.created_at?.startsWith(todayStr) && e.method === "cash" && !isStock) {
            cashExpenses += Number(e.amount) || 0;
          }
        }

        const initial = currentShift?.initial_cash || 0;
        const expected = initial + cashSales - cashExpenses;
        const diff = actualCash - expected;
        const targetId = currentShift?.id;

        if (targetId) {
          await db.runAsync(
            `UPDATE cash_shifts
             SET actual_cash = ?, difference = ?, note = ?, status = 'closed_manual', closed_at = ?, synced = 0
             WHERE id = ?`,
            [actualCash, diff, note || null, now, targetId]
          ).catch(() => {});

          const updatedShift = await db.getFirstAsync<CashShift>(
            `SELECT * FROM cash_shifts WHERE id = ?`,
            [targetId]
          ).catch(() => null);
          if (updatedShift) setCurrentShift(updatedShift);
        }

        const history = await db.getAllAsync<CashShift>(
          `SELECT * FROM cash_shifts ORDER BY opened_at DESC`
        ).catch(() => []);
        setShiftsHistory(history);
      }
    },
    [currentShift]
  );

  // Local-first / stale-while-revalidate: cada load* pinta con SQLite de
  // inmediato (nunca espera a la red) y lanza la sincronización remota sin
  // "await" dentro de la función — así su propia promesa se resuelve en
  // cuanto termina la lectura local, y un Promise.all([...]).finally(() =>
  // setLoading(false)) en la pantalla que llama nunca queda bloqueado
  // esperando un servidor lento o inalcanzable. Si el remoto responde más
  // tarde, actualiza el estado igual (reactivo), sin spinners de por medio.
  const loadProducts = useCallback(async () => {
    const db = await getDb();
    let local: Product[] = [];
    if (db) {
      local = await readLocalProducts(db);
      if (local.length > 0) {
        setProducts(local);
      }
    }

    api
      .get("/products")
      .then(async (remote) => {
        if (Array.isArray(remote) && remote.length > 0 && db) {
          // is_perishable es un dato solo local (el backend no lo conoce
          // todavía): se preserva el valor local existente en vez de
          // dejar que el upsert remoto lo resetee a 0.
          const localPerishableMap = new Map(local.map((p) => [p.id, p.is_perishable ? 1 : 0]));

          // Upsert estrictamente por id: el servidor es la fuente de verdad
          // para cada producto ya sincronizado; nunca se busca por nombre.
          for (const p of remote) {
            await db.runAsync(
              `INSERT OR REPLACE INTO products (id, name, category, subcategory, stock, min_stock, cost, margin, price, price_pending, note, is_perishable, synced)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
              [
                p.id,
                p.name,
                p.category,
                p.subcategory ?? null,
                p.stock ?? 0,
                p.min_stock ?? 0,
                p.cost ?? 0,
                p.margin ?? 0,
                p.price ?? 0,
                p.price_pending ? 1 : 0,
                p.note ?? null,
                localPerishableMap.get(p.id) ?? 0,
              ]
            ).catch(() => {});
          }
          const finalLocal = await readLocalProducts(db);
          setProducts(finalLocal);
        }
      })
      .catch((err) => warnSyncError("loadProducts", err));
  }, []);

  const loadPurchases = useCallback(async () => {
    const db = await getDb();
    if (db) {
      const rows = await db.getAllAsync<any>(`SELECT * FROM product_purchases ORDER BY created_at DESC`).catch(() => []);
      setPurchases(rows);
    }

    api
      .get("/purchases")
      .then((remote) => {
        if (Array.isArray(remote)) {
          setPurchases(excludeDeletedPurchases(remote, deletedPurchaseIdsRef.current));
        }
      })
      .catch((err) => warnSyncError("loadPurchases", err));
  }, []);

  const loadSales = useCallback(async () => {
    const db = await getDb();
    if (db) {
      const localRows = await db.getAllAsync<any>(`SELECT * FROM sales ORDER BY created_at DESC`).catch(() => []);
      setSales(
        localRows.map((r) => ({
          ...r,
          items: typeof r.items === "string" ? JSON.parse(r.items) : r.items,
          payments: typeof r.payments === "string" ? JSON.parse(r.payments) : r.payments,
        }))
      );
    }

    api
      .get("/sales")
      .then((remote) => {
        if (Array.isArray(remote)) setSales(remote);
      })
      .catch((err) => warnSyncError("loadSales", err));
  }, []);

  const loadExpenses = useCallback(async () => {
    const db = await getDb();
    if (db) {
      const localRows = await db.getAllAsync<any>(`SELECT * FROM expenses ORDER BY created_at DESC`).catch(() => []);
      setExpenses(localRows);
    }

    api
      .get("/expenses")
      .then((remote) => {
        if (Array.isArray(remote)) setExpenses(remote);
      })
      .catch((err) => warnSyncError("loadExpenses", err));
  }, []);

  // Registro de auditoría de mermas por vencimiento: es puramente local (no
  // hay endpoint remoto todavía, igual que los sublotes perecibles).
  const loadWasteRecords = useCallback(async () => {
    const db = await getDb();
    if (db) {
      const rows = await db.getAllAsync<any>(`SELECT * FROM expired_waste_records ORDER BY timestamp DESC`).catch(() => []);
      setWasteRecords(rows);
    }
  }, []);

  useEffect(() => {
    loadProducts();
    loadPurchases();
    loadSales();
    loadExpenses();
    loadWasteRecords();
    ensureDailyShift();
  }, [loadProducts, loadPurchases, loadSales, loadExpenses, loadWasteRecords, ensureDailyShift]);

  // Reintento pasivo al recuperar conectividad: si el servidor estaba caído
  // o no había red al cargar (los catch de arriba ya lo absorbieron en
  // silencio), no hace falta que el usuario recargue la pantalla a mano —
  // en cuanto vuelve la conexión se relanza la sincronización en segundo
  // plano sola, con los mismos load* silenciosos de siempre.
  useEffect(() => {
    let wasConnected: boolean | null = null;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = !!(state.isConnected && state.isInternetReachable !== false);
      if (isConnected && wasConnected === false) {
        loadProducts();
        loadPurchases();
        loadSales();
        loadExpenses();
      }
      wasConnected = isConnected;
    });
    return () => unsubscribe();
  }, [loadProducts, loadPurchases, loadSales, loadExpenses]);

  const saveProduct = useCallback(
    async (p: any, id?: string) => {
      const cleanName = (p.name || "").trim();
      const db = await getDb();

      // Búsqueda estrictamente por id: dos productos pueden compartir nombre
      // (variantes distintas) y nunca deben confundirse entre sí.
      const existing: any = id ? products.find((x) => x.id === id) : null;

      const targetId = id || existing?.id || "prod_" + Date.now();
      const newStock = Number(p.stock) || 0;
      const newMinStock = Number(p.min_stock) || 0;
      const newCost = Number(p.cost) || 0;
      const newMargin = Number(p.margin) || 0;
      const newPrice = Number(p.price) || 0;
      const pricePending = Boolean(p.price_pending || newPrice <= 0);

      const savedProduct: Product = {
        id: targetId,
        name: cleanName,
        category: p.category || existing?.category || "General",
        subcategory: p.subcategory !== undefined ? p.subcategory : (existing?.subcategory ?? null),
        stock: newStock,
        min_stock: newMinStock,
        cost: newCost > 0 ? newCost : (existing?.cost || 0),
        margin: newMargin,
        price: newPrice,
        price_pending: pricePending,
        note: p.note !== undefined ? (String(p.note).trim() || null) : (existing?.note ?? null),
        is_perishable: p.is_perishable !== undefined ? Boolean(p.is_perishable) : Boolean(existing?.is_perishable),
        nearest_expiry_date: existing?.nearest_expiry_date ?? null,
        nearest_expiry_qty: existing?.nearest_expiry_qty ?? null,
      };

      if (db) {
        await db.runAsync(
          `INSERT OR REPLACE INTO products (id, name, category, subcategory, stock, min_stock, cost, margin, price, price_pending, note, is_perishable, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            savedProduct.id,
            savedProduct.name,
            savedProduct.category,
            savedProduct.subcategory ?? null,
            savedProduct.stock,
            savedProduct.min_stock,
            savedProduct.cost,
            savedProduct.margin,
            savedProduct.price,
            savedProduct.price_pending ? 1 : 0,
            savedProduct.note ?? null,
            savedProduct.is_perishable ? 1 : 0,
          ]
        ).catch(() => {});

        // Al editar un producto ya existente, la fecha de vencimiento elegida
        // en el formulario no viaja con ningún ingreso de stock nuevo (eso lo
        // resuelve createPurchase), así que aquí se refleja directamente en
        // el lote más próximo del producto para no perder la selección.
        if (existing && savedProduct.is_perishable && p.expiry_date) {
          const nearestBatch = await db
            .getFirstAsync<any>(
              `SELECT id, batch_quantity FROM product_batches WHERE product_id = ? ORDER BY expiry_date ASC LIMIT 1`,
              [targetId]
            )
            .catch(() => null);

          if (nearestBatch) {
            await db
              .runAsync(`UPDATE product_batches SET expiry_date = ?, synced = 0 WHERE id = ?`, [
                p.expiry_date,
                nearestBatch.id,
              ])
              .catch(() => {});
            savedProduct.nearest_expiry_qty = Number(nearestBatch.batch_quantity) || existing?.nearest_expiry_qty || null;
          } else {
            const batchId = "batch_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
            await db
              .runAsync(
                `INSERT INTO product_batches (id, product_id, expiry_date, batch_quantity, created_at, synced)
                 VALUES (?, ?, ?, ?, ?, 0)`,
                [batchId, targetId, p.expiry_date, newStock, new Date().toISOString()]
              )
              .catch(() => {});
            savedProduct.nearest_expiry_qty = newStock;
          }
          savedProduct.nearest_expiry_date = p.expiry_date;
        }
      }

      // Actualización optimista inmediata: la UI refleja el nuevo valor sin
      // esperar la red, y sin tocar ningún otro producto (aunque comparta nombre).
      setProducts((prev) => {
        const withoutOld = prev.filter((item) => item.id !== savedProduct.id);
        return [...withoutOld, savedProduct].sort((a, b) => a.name.localeCompare(b.name));
      });

      // Sincronización remota en segundo plano: no bloquea el guardado local.
      // Si el producto era solo local (id `prod_`/`local_`), al crearse en el
      // servidor se reescribe su id local por el id real para no duplicarlo
      // en el siguiente guardado ni en la próxima sincronización.
      if (targetId.startsWith("prod_") || targetId.startsWith("local_")) {
        api
          .post("/products", savedProduct)
          .then(async (res) => {
            if (!res?.id || res.id === targetId) return;
            const newId = res.id;
            if (db) {
              await db.runAsync(`UPDATE products SET id = ? WHERE id = ?`, [newId, targetId]).catch(() => {});
              await db.runAsync(`UPDATE product_purchases SET product_id = ? WHERE product_id = ?`, [newId, targetId]).catch(() => {});
            }
            setProducts((prev) => prev.map((item) => (item.id === targetId ? { ...item, id: newId } : item)));
          })
          .catch(() => {});
      } else {
        api.put(`/products/${targetId}`, savedProduct).catch(() => {});
      }

      return savedProduct;
    },
    [products]
  );

  const deleteProduct = useCallback(async (id: string) => {
    try {
      await api.del(`/products/${id}`).catch(() => {});
    } catch {}
    const db = await getDb();
    if (db) {
      await db.runAsync(`DELETE FROM products WHERE id = ?`, [id]).catch(() => {});
    }
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const createPurchase = useCallback(
    async (payload: {
      product_id?: string;
      product_name: string;
      qty: number;
      unit_cost: number;
      new_price?: number;
      new_min_stock?: number;
      payment_method?: string;
      note?: string;
      createExpenseRecord?: boolean;
      is_perishable?: boolean;
      expiry_date?: string;
    }) => {
      const purchaseId = "purch_" + Date.now();
      const now = new Date().toISOString();
      const qty = Number(payload.qty) || 0;
      const unit_cost = Number(payload.unit_cost) || 0;
      const total_cost = qty * unit_cost;
      const cleanName = (payload.product_name || "").trim();
      const cleanKey = cleanName.toLowerCase();
      const payMethod = payload.payment_method || "transfer";
      const isPerishable = Boolean(payload.is_perishable && payload.expiry_date);

      const db = await getDb();
      let matchedProd = products.find((p) => (payload.product_id ? p.id === payload.product_id : p.name.toLowerCase().trim() === cleanKey));

      if (!matchedProd && db) {
        matchedProd = await db.getFirstAsync<any>(
          `SELECT * FROM products WHERE id = ? OR LOWER(TRIM(name)) = ? LIMIT 1`,
          [payload.product_id || "", cleanKey]
        ).catch(() => null);
      }

      const targetProdId = matchedProd?.id || payload.product_id || "prod_" + Date.now();
      const targetProdName = matchedProd?.name || cleanName;

      const newPurchase: ProductPurchase = {
        id: purchaseId,
        product_id: targetProdId,
        product_name: targetProdName,
        qty,
        unit_cost,
        total_cost,
        note: payload.note || null,
        payment_method: payMethod,
        created_at: now,
      };

      setPurchases((prev) => [newPurchase, ...prev]);

      if (matchedProd) {
        const updatedStock = (Number(matchedProd.stock) || 0) + qty;
        const updatedPrice = payload.new_price !== undefined && payload.new_price > 0 ? payload.new_price : (Number(matchedProd.price) || 0);
        const updatedMinStock = payload.new_min_stock !== undefined && payload.new_min_stock >= 0 ? payload.new_min_stock : (Number(matchedProd.min_stock) || 0);
        const updatedCost = unit_cost > 0 ? unit_cost : (Number(matchedProd.cost) || 0);

        setProducts((prev) =>
          prev.map((p) =>
            p.id === targetProdId || p.name.toLowerCase().trim() === cleanKey
              ? {
                  ...p,
                  stock: updatedStock,
                  price: updatedPrice,
                  min_stock: updatedMinStock,
                  cost: updatedCost,
                  price_pending: updatedPrice <= 0,
                  is_perishable: isPerishable || p.is_perishable,
                }
              : p
          )
        );

        if (db) {
          await db.runAsync(
            `UPDATE products
             SET stock = stock + ?,
                 price = CASE WHEN ? > 0 THEN ? ELSE price END,
                 min_stock = CASE WHEN ? >= 0 THEN ? ELSE min_stock END,
                 cost = CASE WHEN ? > 0 THEN ? ELSE cost END,
                 is_perishable = CASE WHEN ? = 1 THEN 1 ELSE is_perishable END,
                 synced = 0
             WHERE id = ? OR LOWER(TRIM(name)) = ?`,
            [qty, updatedPrice, updatedPrice, updatedMinStock, updatedMinStock, unit_cost, unit_cost, isPerishable ? 1 : 0, targetProdId, cleanKey]
          ).catch(() => {});
        }
      } else {
        const initialPrice = payload.new_price || 0;
        const newProd: Product = {
          id: targetProdId,
          name: targetProdName,
          category: "General",
          subcategory: null,
          stock: qty,
          min_stock: payload.new_min_stock || 0,
          cost: unit_cost,
          margin: 30,
          price: initialPrice,
          price_pending: initialPrice <= 0,
          is_perishable: isPerishable,
        };

        setProducts((prev) => [...prev, newProd].sort((a, b) => a.name.localeCompare(b.name)));

        if (db) {
          await db.runAsync(
            `INSERT OR REPLACE INTO products (id, name, category, subcategory, stock, min_stock, cost, margin, price, price_pending, is_perishable, synced)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [newProd.id, newProd.name, newProd.category, null, newProd.stock, newProd.min_stock, newProd.cost, newProd.margin, newProd.price, newProd.price_pending ? 1 : 0, isPerishable ? 1 : 0]
          ).catch(() => {});
        }
      }

      if (db) {
        await db.runAsync(
          `INSERT INTO product_purchases (id, product_id, product_name, qty, unit_cost, total_cost, note, payment_method, created_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [purchaseId, targetProdId, targetProdName, qty, unit_cost, total_cost, payload.note || null, payMethod, now]
        ).catch(() => {});

        // Cada ingreso perecible abre su propio lote (sublote) con la fecha
        // de vencimiento dictada/elegida, para poder descontarlo luego por
        // FEFO en vez de mezclarlo con lotes de otras fechas.
        if (isPerishable && qty > 0) {
          const batchId = "batch_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
          await db.runAsync(
            `INSERT INTO product_batches (id, product_id, expiry_date, batch_quantity, created_at, synced)
             VALUES (?, ?, ?, ?, ?, 0)`,
            [batchId, targetProdId, payload.expiry_date || null, qty, now]
          ).catch(() => {});
        }
      }

      // Sincronización con el servidor
      try {
        await api.post("/purchases", {
          product_id: targetProdId.startsWith("prod_") || targetProdId.startsWith("purch_") ? undefined : targetProdId,
          product_name: targetProdName,
          qty,
          unit_cost,
          payment_method: payMethod,
          note: payload.note,
        }).catch(() => {});
      } catch {}

      if (payload.createExpenseRecord !== false && total_cost > 0) {
        const expenseId = "exp_" + Date.now();
        const expenseItem: Expense = {
          id: expenseId,
          type: "Mercancía",
          category: "Compra de Stock",
          amount: total_cost,
          method: payMethod,
          method_detail: payMethod === "cash" ? "Caja Física" : "Inversión Activo",
          note: `[Ingreso Stock] ${qty}x ${targetProdName} ${payload.note ? "- " + payload.note : ""}`,
          created_at: now,
        };

        setExpenses((prev) => [expenseItem, ...prev]);

        if (db) {
          await db.runAsync(
            `INSERT INTO expenses (id, type, category, amount, method, method_detail, note, created_at, synced)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [expenseId, expenseItem.type, expenseItem.category, total_cost, payMethod, expenseItem.method_detail ?? null, expenseItem.note ?? "", now]
          ).catch(() => {});
        }
      }
    },
    [products]
  );

  // Corrige solo la nota de un ingreso ya registrado, sin tocar cantidades,
  // costos ni el stock que ese ingreso ya sumó al producto.
  const updatePurchase = useCallback(async (id: string, patch: { note?: string }) => {
    const cleanNote = (patch.note || "").trim() || null;
    setPurchases((prev) => prev.map((p) => (p.id === id ? { ...p, note: cleanNote } : p)));

    const db = await getDb();
    if (db) {
      await db.runAsync(`UPDATE product_purchases SET note = ?, synced = 0 WHERE id = ?`, [cleanNote, id]).catch(() => {});
    }

    try {
      await api.patch(`/purchases/${id}`, { note: cleanNote }).catch(() => {});
    } catch {}
  }, []);

  const deletePurchase = useCallback(
    async (id: string) => {
      const target = purchases.find((p) => p.id === id);

      // Se recuerda ANTES que nada: si la sincronización remota en curso
      // (loadPurchases) responde después de este punto, no debe reintroducir
      // el registro que se está por borrar.
      deletedPurchaseIdsRef.current.add(id);

      setPurchases((prev) => prev.filter((p) => p.id !== id));

      // Se captura fuera del actualizador de estado para poder sincronizar
      // el mismo valor al servidor más abajo (setProducts corre síncrono,
      // así que ya está resuelto cuando sigue el código).
      let updatedProduct: Product | undefined;
      if (target) {
        setProducts((prev) =>
          prev.map((p) => {
            const match = target.product_id ? p.id === target.product_id : p.name.toLowerCase().trim() === target.product_name.toLowerCase().trim();
            if (!match) return p;
            updatedProduct = { ...p, stock: clampStockAfterDeletion(p.stock, target.qty) };
            return updatedProduct;
          })
        );
      }

      const db = await getDb();
      if (db) {
        try {
          // Transacción: el descuento de stock y el borrado del ingreso se
          // aplican juntos o no se aplica ninguno, para que una falla a
          // mitad de camino nunca deje el stock desfasado del historial.
          await db.withTransactionAsync(async () => {
            await db.runAsync(`DELETE FROM product_purchases WHERE id = ?`, [id]);
            if (target) {
              await db.runAsync(
                `UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ? OR LOWER(TRIM(name)) = LOWER(TRIM(?))`,
                [target.qty, target.product_id || "", target.product_name]
              );
            }
          });
        } catch (err) {
          console.warn("[deletePurchase] la transacción local falló, se mantiene el estado en memoria:", err);
        }
      }

      // Sincroniza el nuevo stock al servidor en segundo plano: /purchases
      // todavía no expone un DELETE remoto, así que sin esto la próxima
      // carga de /products traería de vuelta el stock anterior (el backend
      // nunca se enteró del descuento). No aplica a productos que solo
      // existen localmente (aún no se crean en el servidor).
      if (updatedProduct && !/^(prod_|local_)/.test(updatedProduct.id)) {
        api.put(`/products/${updatedProduct.id}`, updatedProduct).catch(() => {});
      }
    },
    [purchases]
  );

  // Baja por caducidad: descarta unidades de un lote ya vencido (o por
  // vencer). Es un movimiento puramente físico de almacén — el costo ya se
  // registró como egreso al momento de la compra — así que NUNCA toca
  // expenses, la caja/arqueo en curso ni la fórmula de ganancia neta;
  // solo ajusta el stock físico y deja un registro de auditoría.
  const discardExpiredBatch = useCallback(
    async (payload: {
      product_id?: string;
      product_name: string;
      expiry_date: string;
      quantity: number;
      unit_cost: number;
      note?: string;
    }) => {
      const qty = Number(payload.quantity) || 0;
      if (qty <= 0) return;

      const unitCost = Number(payload.unit_cost) || 0;
      const totalLoss = Math.round(qty * unitCost * 100) / 100;
      const now = new Date().toISOString();
      const cleanKey = (payload.product_name || "").trim().toLowerCase();
      const note = payload.note || "Descarte por vencimiento";

      const db = await getDb();
      let resolvedId = payload.product_id;
      if (!resolvedId && db) {
        const match = await db
          .getFirstAsync<any>(`SELECT id FROM products WHERE LOWER(TRIM(name)) = ? LIMIT 1`, [cleanKey])
          .catch(() => null);
        resolvedId = match?.id;
      }

      if (db && resolvedId) {
        // Descuenta solo el/los lote(s) con esa fecha exacta de
        // vencimiento (el más antiguo primero si hubiera más de uno),
        // sin afectar lotes de otras fechas del mismo producto.
        const batches = await db
          .getAllAsync<any>(
            `SELECT id, batch_quantity FROM product_batches WHERE product_id = ? AND expiry_date = ? AND batch_quantity > 0 ORDER BY created_at ASC`,
            [resolvedId, payload.expiry_date]
          )
          .catch(() => []);

        let remaining = qty;
        for (const batch of batches || []) {
          if (remaining <= 0) break;
          const available = Number(batch.batch_quantity) || 0;
          const taken = Math.min(available, remaining);
          if (taken <= 0) continue;
          await db
            .runAsync(`UPDATE product_batches SET batch_quantity = batch_quantity - ?, synced = 0 WHERE id = ?`, [taken, batch.id])
            .catch(() => {});
          remaining -= taken;
        }

        await db
          .runAsync(`UPDATE products SET stock = MAX(0, stock - ?), synced = 0 WHERE id = ?`, [qty, resolvedId])
          .catch(() => {});
      }

      setProducts((prev) => prev.map((p) => (p.id === resolvedId ? { ...p, stock: Math.max(0, p.stock - qty) } : p)));

      const recordId = "waste_" + Date.now();
      const record: WasteRecord = {
        id: recordId,
        product_id: resolvedId || null,
        product_name: payload.product_name,
        quantity_discarded: qty,
        unit_cost: unitCost,
        total_loss_cost: totalLoss,
        expiry_date: payload.expiry_date,
        timestamp: now,
        note,
      };

      setWasteRecords((prev) => [record, ...prev]);

      if (db) {
        await db
          .runAsync(
            `INSERT INTO expired_waste_records (id, product_id, product_name, quantity_discarded, unit_cost, total_loss_cost, expiry_date, timestamp, note, synced)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [recordId, resolvedId || null, payload.product_name, qty, unitCost, totalLoss, payload.expiry_date, now, note]
          )
          .catch(() => {});
      }
    },
    []
  );

  // FEFO (First Expired, First Out): descuenta las unidades vendidas de un
  // producto priorizando siempre el lote con la fecha de vencimiento más
  // próxima; si la venta agota ese lote, continúa con el siguiente. No
  // afecta el stock total del producto (eso ya lo maneja el UPDATE
  // separado) — solo mantiene los sublotes consistentes entre sí.
  const consumeFefoBatches = useCallback(async (db: NonNullable<Awaited<ReturnType<typeof getDb>>>, productId: string | undefined, productName: string, qtyToConsume: number) => {
    if (!db || qtyToConsume <= 0) return;

    let resolvedId = productId;
    if (!resolvedId) {
      const match = await db
        .getFirstAsync<any>(`SELECT id FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`, [productName])
        .catch(() => null);
      resolvedId = match?.id;
    }
    if (!resolvedId) return;

    const batches = await db
      .getAllAsync<any>(
        `SELECT id, batch_quantity FROM product_batches WHERE product_id = ? AND batch_quantity > 0 ORDER BY expiry_date ASC`,
        [resolvedId]
      )
      .catch(() => []);

    let remaining = qtyToConsume;
    for (const batch of batches || []) {
      if (remaining <= 0) break;
      const available = Number(batch.batch_quantity) || 0;
      const taken = Math.min(available, remaining);
      if (taken <= 0) continue;
      await db
        .runAsync(`UPDATE product_batches SET batch_quantity = batch_quantity - ?, synced = 0 WHERE id = ?`, [taken, batch.id])
        .catch(() => {});
      remaining -= taken;
    }
  }, []);

  const createSale = useCallback(
    async (payload: any) => {
      await ensureOpenShiftForOperation();
      const saleId = "sale_" + Date.now();
      const now = new Date().toISOString();

      const items = (payload.items || []).map((it: any) => ({
        product_id: it.product_id || undefined,
        name: it.name,
        qty: Number(it.qty) || 1,
        unit_price: Number(it.unit_price) || 0,
        unit_cost: Number(it.unit_cost) || 0,
      }));

      const payments = payload.payments || [{ method: "cash", amount: payload.total || 0 }];
      const total = Number(payload.total) || items.reduce((s: number, i: any) => s + i.unit_price * i.qty, 0);
      const cost_total = Number(payload.cost_total) || items.reduce((s: number, i: any) => s + i.unit_cost * i.qty, 0);
      const profit = total - cost_total;

      const newSale: Sale = {
        id: saleId,
        items,
        payments,
        total,
        cost_total,
        profit,
        note: payload.note || undefined,
        created_at: now,
      };

      setProducts((prev) =>
        prev.map((p) => {
          const soldItem = items.find((i: any) => i.product_id === p.id || i.name?.toLowerCase().trim() === p.name?.toLowerCase().trim());
          if (soldItem) {
            return { ...p, stock: p.stock - soldItem.qty };
          }
          return p;
        })
      );

      setSales((prev) => [newSale, ...prev]);

      try {
        await api.post("/sales", {
          items,
          payments,
          note: payload.note,
        });
      } catch {}

      const db = await getDb();
      if (db) {
        await db.runAsync(
          `INSERT INTO sales (id, items, payments, total, cost_total, profit, note, created_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [saleId, JSON.stringify(items), JSON.stringify(payments), total, cost_total, profit, payload.note ?? "", now]
        ).catch(() => {});

        for (const it of items) {
          await db.runAsync(
            `UPDATE products SET stock = stock - ? WHERE id = ? OR LOWER(TRIM(name)) = LOWER(TRIM(?))`,
            [it.qty, it.product_id || "", it.name]
          ).catch(() => {});
          await consumeFefoBatches(db, it.product_id, it.name, it.qty);
        }
      }
    },
    [ensureOpenShiftForOperation, consumeFefoBatches]
  );

  const updateSale = useCallback(async (id: string, patch: Partial<Sale>) => {
    try {
      await api.patch(`/sales/${id}`, patch).catch(() => {});
    } catch {}
    setSales((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const db = await getDb();
    if (db) {
      await db.runAsync(
        `UPDATE sales SET note = COALESCE(?, note), payments = COALESCE(?, payments), synced = 0 WHERE id = ?`,
        [patch.note ?? null, patch.payments ? JSON.stringify(patch.payments) : null, id]
      ).catch(() => {});
    }
  }, []);

  const deleteSale = useCallback(
    async (id: string) => {
      const targetSale = sales.find((s) => s.id === id);
      try {
        await api.del(`/sales/${id}`).catch(() => {});
      } catch {}

      if (targetSale) {
        setProducts((prev) =>
          prev.map((p) => {
            const returnedItem = targetSale.items.find((i: any) => i.product_id === p.id || i.name?.toLowerCase().trim() === p.name?.toLowerCase().trim());
            if (returnedItem) {
              return { ...p, stock: p.stock + returnedItem.qty };
            }
            return p;
          })
        );
      }

      setSales((prev) => prev.filter((s) => s.id !== id));

      const db = await getDb();
      if (db) {
        await db.runAsync(`DELETE FROM sales WHERE id = ?`, [id]).catch(() => {});
        if (targetSale) {
          for (const it of targetSale.items) {
            await db.runAsync(
              `UPDATE products SET stock = stock + ? WHERE id = ? OR LOWER(TRIM(name)) = LOWER(TRIM(?))`,
              [it.qty, it.product_id || "", it.name]
            ).catch(() => {});
          }
        }
      }
    },
    [sales]
  );

  const createExpense = useCallback(
    async (payload: any) => {
      await ensureOpenShiftForOperation();
      const expenseId = "exp_" + Date.now();
      const now = new Date().toISOString();
      const amt = Number(payload.amount) || 0;

      const newExpense: Expense = {
        id: expenseId,
        type: payload.type || "Operativos",
        category: payload.category || "Otros",
        amount: amt,
        method: payload.method || "cash",
        method_detail: payload.method_detail,
        note: payload.note,
        created_at: now,
      };

      setExpenses((prev) => [newExpense, ...prev]);

      try {
        await api.post("/expenses", {
          type: newExpense.type,
          category: newExpense.category,
          amount: newExpense.amount,
          method: newExpense.method,
          method_detail: newExpense.method_detail,
          note: newExpense.note,
        }).catch(() => {});
      } catch {}

      const db = await getDb();
      if (db) {
        await db.runAsync(
          `INSERT INTO expenses (id, type, category, amount, method, method_detail, note, created_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [expenseId, newExpense.type, newExpense.category, amt, newExpense.method, newExpense.method_detail ?? null, newExpense.note ?? "", now]
        ).catch(() => {});
      }
    },
    [ensureOpenShiftForOperation]
  );

  const updateExpense = useCallback(async (id: string, patch: Partial<Expense>) => {
    try {
      await api.patch(`/expenses/${id}`, patch).catch(() => {});
    } catch {}
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    const db = await getDb();
    if (db) {
      await db.runAsync(
        `UPDATE expenses SET amount = COALESCE(?, amount), note = COALESCE(?, note), method = COALESCE(?, method), method_detail = COALESCE(?, method_detail), synced = 0 WHERE id = ?`,
        [patch.amount ?? null, patch.note ?? null, patch.method ?? null, patch.method_detail ?? null, id]
      ).catch(() => {});
    }
  }, []);

  const deleteExpense = useCallback(async (id: string) => {
    try {
      await api.del(`/expenses/${id}`).catch(() => {});
    } catch {}
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    const db = await getDb();
    if (db) {
      await db.runAsync(`DELETE FROM expenses WHERE id = ?`, [id]).catch(() => {});
    }
  }, []);

  const getDashboard = useCallback(
    async (range: string, customStart?: string, customEnd?: string) => {
      // Siempre se calcula con los datos locales (SQLite): el endpoint
      // remoto de /dashboard no rellena con ceros los días sin ventas ni
      // los días futuros del mes/año en curso, así que su sales_series
      // llega incompleta (se corta en el día de hoy en vez de trazar el
      // mes/año completo). El cálculo local ya lo hace bien y es la única
      // fuente usada tanto aquí como en Inicio.
      const db = await getDb();
      if (!db) return null;

      try {
        const todayStr = getLocalDateStr();
        // Módulo 4.3: en modo "year", customStart (si viene, ej. "2025-01-01"
        // desde el selector de año) fija qué año se consulta en vez de
        // asumir siempre el año en curso.
        const targetYear = customStart ? customStart.slice(0, 4) : todayStr.slice(0, 4);
        const allSales = await db.getAllAsync<any>(`SELECT * FROM sales`).catch(() => []);
        const allExpenses = await db.getAllAsync<any>(`SELECT * FROM expenses`).catch(() => []);

        const filteredSales = allSales.filter((s) => {
          const sDate = s.created_at || "";
          if (range === "today") return sDate.startsWith(todayStr);
          if (range === "week") {
            const d = new Date();
            d.setDate(d.getDate() - 7);
            return new Date(sDate) >= d;
          }
          if (range === "month") return sDate.startsWith(todayStr.slice(0, 7));
          if (range === "year") return sDate.startsWith(targetYear);
          if (range === "custom") {
            const d = sDate.split("T")[0];
            return (!customStart || d >= customStart) && (!customEnd || d <= customEnd);
          }
          return true;
        });

        const filteredExpenses = allExpenses.filter((e) => {
          const eDate = e.created_at || "";
          if (range === "today") return eDate.startsWith(todayStr);
          if (range === "week") {
            const d = new Date();
            d.setDate(d.getDate() - 7);
            return new Date(eDate) >= d;
          }
          if (range === "month") return eDate.startsWith(todayStr.slice(0, 7));
          if (range === "year") return eDate.startsWith(targetYear);
          if (range === "custom") {
            const d = eDate.split("T")[0];
            return (!customStart || d >= customStart) && (!customEnd || d <= customEnd);
          }
          return true;
        });

        const total_income = filteredSales.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
        const cogs = filteredSales.reduce((acc, s) => acc + (Number(s.cost_total) || 0), 0);

        const operating_expenses = filteredExpenses
          .filter((e) => e.type !== "Mercancía" && e.category !== "Compra de Stock")
          .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

        const stock_purchases = filteredExpenses
          .filter((e) => e.type === "Mercancía" || e.category === "Compra de Stock")
          .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

        const total_expenses = cogs + operating_expenses;
        const net_profit = total_income - total_expenses;
        const gross_profit = total_income - cogs;

        let sales_series: { label: string; value: number }[] = [];

        if (range === "year") {
          const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
          const monthMap = new Array(12).fill(0);
          filteredSales.forEach((s) => {
            const m = new Date(s.created_at).getMonth();
            if (!isNaN(m)) monthMap[m] += Number(s.total) || 0;
          });
          sales_series = months.map((m, idx) => ({ label: m, value: monthMap[idx] }));
        } else if (range === "today") {
          const hourMap = new Map<string, number>();
          filteredSales.forEach((s) => {
            const d = new Date(s.created_at);
            const hr = !isNaN(d.getHours()) ? `${String(d.getHours()).padStart(2, "0")}:00` : "00:00";
            hourMap.set(hr, (hourMap.get(hr) || 0) + (Number(s.total) || 0));
          });
          sales_series = Array.from(hourMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([hr, val]) => ({ label: hr, value: val }));
          if (sales_series.length === 0) sales_series = [{ label: "Hoy", value: total_income }];
        } else {
          const dayMap = new Map<string, number>();
          filteredSales.forEach((s) => {
            const d = (s.created_at || "").split("T")[0];
            dayMap.set(d, (dayMap.get(d) || 0) + (Number(s.total) || 0));
          });

          // Relleno con 0 para los días sin ventas dentro del período, así
          // la curva siempre traza el rango completo en vez de saltar
          // directo al único día con datos (o quedar vacía si no hay ninguno).
          let rangeStart: Date | null = null;
          let rangeEnd: Date | null = null;
          if (range === "week") {
            rangeEnd = new Date(todayStr);
            rangeStart = new Date(todayStr);
            rangeStart.setDate(rangeStart.getDate() - 6);
          } else if (range === "month") {
            // Abarca el mes completo (día 1 al último), no solo hasta hoy,
            // para que el eje X del gráfico siempre trace todos los días.
            rangeStart = new Date(todayStr.slice(0, 7) + "-01");
            rangeEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 0);
          } else if (range === "custom" && customStart && customEnd) {
            rangeStart = new Date(customStart);
            rangeEnd = new Date(customEnd);
          }

          if (rangeStart && rangeEnd && rangeEnd >= rangeStart) {
            const diffDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000);
            if (diffDays <= 92) {
              const cursor = new Date(rangeStart);
              while (cursor <= rangeEnd) {
                const key = cursor.toISOString().split("T")[0];
                if (!dayMap.has(key)) dayMap.set(key, 0);
                cursor.setDate(cursor.getDate() + 1);
              }
            }
          }

          sales_series = Array.from(dayMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([d, val]) => ({ label: d, value: val }));
        }

        // Garantía final: el gráfico nunca debe verse vacío ni con un solo
        // punto. Con 0 o 1 valores se antepone un punto en 0 para que la
        // curva siempre trace ambos ejes (ej. de 0 a 80).
        if (sales_series.length === 0) {
          sales_series = [{ label: "Inicio", value: 0 }, { label: "Hoy", value: 0 }];
        } else if (sales_series.length === 1) {
          sales_series = [{ label: "Inicio", value: 0 }, sales_series[0]];
        }

        const opExpensesList = filteredExpenses.filter((e) => e.type !== "Mercancía" && e.category !== "Compra de Stock");
        const expCatMap = new Map<string, number>();
        opExpensesList.forEach((e) => {
          expCatMap.set(e.category, (expCatMap.get(e.category) || 0) + (Number(e.amount) || 0));
        });
        const expense_by_category = Array.from(expCatMap.entries()).map(([label, value]) => ({ label, value }));

        const productSalesMap = new Map<string, number>();
        filteredSales.forEach((s) => {
          const items = typeof s.items === "string" ? JSON.parse(s.items || "[]") : s.items || [];
          items.forEach((it: any) => {
            const pName = it.name || "Producto";
            productSalesMap.set(pName, (productSalesMap.get(pName) || 0) + (Number(it.qty) || 1));
          });
        });

        const top_products = Array.from(productSalesMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([label, value]) => ({ label, value }));

        return {
          total_income,
          total_expenses,
          cogs,
          operating_expenses,
          stock_purchases,
          gross_profit,
          net_profit,
          sales_count: filteredSales.length,
          balance_total: total_income - total_expenses,
          balance_cash: total_income,
          balance_transfer: 0,
          sales_series,
          expense_by_category,
          top_products,
        };
      } catch (err) {
        console.warn("Fallo calculando el reporte financiero local:", err);
        return null;
      }
    },
    []
  );

  return (
    <Ctx.Provider
      value={{
        products,
        purchases,
        sales,
        expenses,
        currentShift,
        shiftsHistory,
        wasteRecords,
        loadProducts,
        loadPurchases,
        loadSales,
        loadExpenses,
        loadShifts,
        loadWasteRecords,
        openCashShift,
        saveProduct,
        deleteProduct,
        createPurchase,
        deletePurchase,
        updatePurchase,
        discardExpiredBatch,
        createSale,
        updateSale,
        deleteSale,
        createExpense,
        updateExpense,
        deleteExpense,
        updateInitialCash,
        closeCashShift,
        getDashboard,
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
