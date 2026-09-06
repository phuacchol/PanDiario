import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface CategoryItem {
  name: string;
  subcategories: string[];
}

interface TaxonomyContextType {
  inventory: CategoryItem[];
  expenses: CategoryItem[];
  expenseTypes: string[];
  load: () => Promise<void>;
  saveTaxonomy: (data: { inventory?: CategoryItem[]; expenses?: CategoryItem[] }) => Promise<void>;
  addInventoryCategory: (name: string) => Promise<void>;
  removeInventoryCategory: (name: string) => Promise<void>;
  addInventorySubcategory: (catName: string, subName: string) => Promise<void>;
  removeInventorySubcategory: (catName: string, subName: string) => Promise<void>;
  addExpenseCategory: (name: string) => Promise<void>;
  removeExpenseCategory: (name: string) => Promise<void>;
  addExpenseSubcategory: (catName: string, subName: string) => Promise<void>;
  removeExpenseSubcategory: (catName: string, subName: string) => Promise<void>;
}

export const TAXONOMY_STORAGE_KEY = "@pandiario_custom_taxonomy";

export const DEFAULT_INVENTORY_CATEGORIES: CategoryItem[] = [
  {
    name: "Ropa",
    subcategories: ["Baggy", "Buzos", "Tops", "Musculosas", "Conjuntos", "Pantalones", "Abrigos"],
  },
  {
    name: "Cosméticos",
    subcategories: ["Maquillaje", "Skincare", "Perfumes", "Cabello", "Uñas", "Labiales", "Cremas"],
  },
  {
    name: "Electrónicos",
    subcategories: ["Celulares", "Audífonos", "Cargadores", "Accesorios", "Cables", "Fundas", "Parlantes"],
  },
  {
    name: "General",
    subcategories: ["Nuevos", "Ofertas", "Temporada", "Básicos", "Premium", "Accesorios"],
  },
  {
    name: "Calzado",
    subcategories: ["Zapatillas", "Sandalias", "Botas", "Formal", "Deportivo"],
  },
  {
    name: "Bazar y Accesorios",
    subcategories: ["Relojes", "Bolsos", "Mochilas", "Billeteras", "Joyas"],
  },
  {
    name: "Hogar y Varios",
    subcategories: ["Decoración", "Cocina", "Limpieza", "Organización"],
  },
];

export const DEFAULT_EXPENSE_TYPES: string[] = ["Mercancía", "Insumos", "Operativos", "Otros"];

export const DEFAULT_EXPENSE_CATEGORIES: CategoryItem[] = [
  { name: "Transporte", subcategories: ["Pasajes", "Taxi", "Combustible", "Delivery", "Peajes"] },
  { name: "Comida", subcategories: ["Almuerzo", "Refrigerio", "Café", "Cena", "Desayuno"] },
  { name: "Servicios", subcategories: ["Luz", "Agua", "Internet", "Teléfono", "Mantenimiento"] },
  { name: "Alquiler", subcategories: ["Local", "Almacén", "Stand", "Depósito"] },
  { name: "Mercadería", subcategories: ["Compra de Stock", "Flete de Carga", "Empaque mayorista", "Muestras"] },
  { name: "Personal", subcategories: ["Sueldos", "Adelantos", "Comisiones", "Bonos"] },
  { name: "Otros", subcategories: ["Imprevistos", "Mantenimiento", "Papelería", "Varios"] },
];

export function generateInitialSubcategories(name: string, isExpense: boolean): string[] {
  const norm = (name || "").toLowerCase().trim();

  if (isExpense) {
    if (/transporte|viaje|movilidad/i.test(norm)) return ["Pasajes", "Taxi", "Combustible", "Delivery", "Peajes"];
    if (/comida|alimento|restaurante/i.test(norm)) return ["Almuerzo", "Refrigerio", "Café", "Cena", "Desayuno"];
    if (/servicio|luz|agua/i.test(norm)) return ["Luz", "Agua", "Internet", "Teléfono", "Mantenimiento"];
    if (/alquiler|arriendo/i.test(norm)) return ["Local", "Almacén", "Stand", "Depósito", "Cochera"];
    if (/mercader[ií]a|stock|compra/i.test(norm)) return ["Compra de Stock", "Flete de Carga", "Empaque mayorista", "Muestras", "Reposición"];
    if (/personal|empleado|sueldo/i.test(norm)) return ["Sueldos", "Adelantos", "Comisiones", "Bonos", "Refrigerios"];
    return ["General", "Imprevistos", "Mantenimiento", "Papelería", "Otros"];
  }

  if (/ropa|textil|prenda/i.test(norm)) return ["Polos", "Pantalones", "Buzos", "Casacas", "Shorts"];
  if (/calzado|zapato/i.test(norm)) return ["Zapatillas", "Sandalias", "Botas", "Formal", "Deportivo"];
  if (/accesorio|bazar/i.test(norm)) return ["Relojes", "Bolsos", "Mochilas", "Billeteras", "Joyas"];
  if (/hogar|casa/i.test(norm)) return ["Decoración", "Cocina", "Limpieza", "Organización", "Menaje"];
  if (/patito|juguete|kawaii/i.test(norm)) return ["Clásicos", "Con Sombrero", "Llaveros", "Peluches", "Accesorios"];
  if (/mascota|veterinaria/i.test(norm)) return ["Comida", "Juguetes", "Correas", "Higiene", "Premios"];
  if (/electronica|tecnologia/i.test(norm)) return ["Cables", "Cargadores", "Fundas", "Audífonos", "Soportes"];

  return ["Modelos Nuevos", "Básicos", "Premium", "Ofertas", "Varios"];
}

const TaxonomyContext = createContext<TaxonomyContextType>({} as TaxonomyContextType);

export function TaxonomyProvider({ children }: { children: React.ReactNode }) {
  const [inventory, setInventory] = useState<CategoryItem[]>(DEFAULT_INVENTORY_CATEGORIES);
  const [expenses, setExpenses] = useState<CategoryItem[]>(DEFAULT_EXPENSE_CATEGORIES);
  const [expenseTypes] = useState<string[]>(DEFAULT_EXPENSE_TYPES);

  const saveBoth = async (inv: CategoryItem[], exp: CategoryItem[]) => {
    try {
      await AsyncStorage.setItem(TAXONOMY_STORAGE_KEY, JSON.stringify({ inventory: inv, expenses: exp }));
    } catch {}
  };

  const load = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(TAXONOMY_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.inventory && Array.isArray(parsed.inventory) && parsed.inventory.length > 0) {
          setInventory(parsed.inventory);
        } else {
          setInventory(DEFAULT_INVENTORY_CATEGORIES);
        }
        if (parsed?.expenses && Array.isArray(parsed.expenses) && parsed.expenses.length > 0) {
          setExpenses(parsed.expenses);
        } else {
          setExpenses(DEFAULT_EXPENSE_CATEGORIES);
        }
      } else {
        await saveBoth(DEFAULT_INVENTORY_CATEGORIES, DEFAULT_EXPENSE_CATEGORIES);
        setInventory(DEFAULT_INVENTORY_CATEGORIES);
        setExpenses(DEFAULT_EXPENSE_CATEGORIES);
      }
    } catch {
      setInventory(DEFAULT_INVENTORY_CATEGORIES);
      setExpenses(DEFAULT_EXPENSE_CATEGORIES);
    }
  }, []);

  const saveTaxonomy = async (data: { inventory?: CategoryItem[]; expenses?: CategoryItem[] }) => {
    const nextInv = data.inventory ?? inventory;
    const nextExp = data.expenses ?? expenses;
    setInventory(nextInv);
    setExpenses(nextExp);
    await saveBoth(nextInv, nextExp);
  };

  useEffect(() => {
    load();
  }, [load]);

  const addInventoryCategory = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || inventory.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return;
    const subs = generateInitialSubcategories(trimmed, false);
    const updated = [...inventory, { name: trimmed, subcategories: subs }];
    setInventory(updated);
    await saveBoth(updated, expenses);
  };

  const removeInventoryCategory = async (name: string) => {
    const updated = inventory.filter((c) => c.name !== name);
    setInventory(updated);
    await saveBoth(updated, expenses);
  };

  const addInventorySubcategory = async (catName: string, subName: string) => {
    const trimmed = subName.trim();
    if (!trimmed) return;
    const updated = inventory.map((c) => {
      if (c.name === catName) {
        if (c.subcategories.includes(trimmed)) return c;
        return { ...c, subcategories: [...c.subcategories, trimmed] };
      }
      return c;
    });
    setInventory(updated);
    await saveBoth(updated, expenses);
  };

  const removeInventorySubcategory = async (catName: string, subName: string) => {
    const updated = inventory.map((c) => {
      if (c.name === catName) {
        return { ...c, subcategories: c.subcategories.filter((s) => s !== subName) };
      }
      return c;
    });
    setInventory(updated);
    await saveBoth(updated, expenses);
  };

  const addExpenseCategory = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || expenses.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return;
    const subs = generateInitialSubcategories(trimmed, true);
    const updated = [...expenses, { name: trimmed, subcategories: subs }];
    setExpenses(updated);
    await saveBoth(inventory, updated);
  };

  const removeExpenseCategory = async (name: string) => {
    const updated = expenses.filter((c) => c.name !== name);
    setExpenses(updated);
    await saveBoth(inventory, updated);
  };

  const addExpenseSubcategory = async (catName: string, subName: string) => {
    const trimmed = subName.trim();
    if (!trimmed) return;
    const updated = expenses.map((c) => {
      if (c.name === catName) {
        if (c.subcategories.includes(trimmed)) return c;
        return { ...c, subcategories: [...c.subcategories, trimmed] };
      }
      return c;
    });
    setExpenses(updated);
    await saveBoth(inventory, updated);
  };

  const removeExpenseSubcategory = async (catName: string, subName: string) => {
    const updated = expenses.map((c) => {
      if (c.name === catName) {
        return { ...c, subcategories: c.subcategories.filter((s) => s !== subName) };
      }
      return c;
    });
    setExpenses(updated);
    await saveBoth(inventory, updated);
  };

  return (
    <TaxonomyContext.Provider
      value={{
        inventory,
        expenses,
        expenseTypes,
        load,
        saveTaxonomy,
        addInventoryCategory,
        removeInventoryCategory,
        addInventorySubcategory,
        removeInventorySubcategory,
        addExpenseCategory,
        removeExpenseCategory,
        addExpenseSubcategory,
        removeExpenseSubcategory,
      }}
    >
      {children}
    </TaxonomyContext.Provider>
  );
}

export const useTaxonomy = () => useContext(TaxonomyContext);
