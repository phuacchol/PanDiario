import { Feather } from "@expo/vector-icons";

export const PRODUCT_CATEGORIES = [
  "Ropa",
  "Cosméticos",
  "Electrónicos",
  "Calzado",
  "Bazar y Accesorios",
  "Hogar y Varios",
  "General",
];

export const EXPENSE_TYPES: {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  categories: string[];
}[] = [
  {
    key: "merchandise",
    label: "Mercancía",
    icon: "shopping-bag",
    categories: ["Mercancía", "Inversión inicial", "Reposición"],
  },
  {
    key: "supplies",
    label: "Insumos",
    icon: "package",
    categories: ["Bolsas", "Stickers", "Embalaje", "Insumos"],
  },
  {
    key: "operating",
    label: "Operativos",
    icon: "truck",
    categories: ["Transporte", "Comida", "Servicios", "Alquiler", "Personal", "Otros"],
  },
];

export function expenseTypeLabel(type?: string): string {
  if (!type) return "Operativos";
  const t = type.toLowerCase().trim();
  if (t === "merchandise" || t === "mercancía" || t === "mercancia") return "Mercancía";
  if (t === "supplies" || t === "insumos") return "Insumos";
  if (t === "operating" || t === "operativos" || t === "gastos operativos") return "Operativos";
  const found = EXPENSE_TYPES.find((item) => item.key === t || item.label.toLowerCase() === t);
  return found ? found.label : type;
}

export const PAYMENT_METHODS = [
  { key: "cash", label: "Efectivo", icon: "dollar-sign" as const },
  { key: "transfer", label: "Transferencia / Digital", icon: "credit-card" as const },
];

export const TRANSFER_SUBTYPES = [
  "Yape",
  "Plin",
  "BCP",
  "BBVA",
  "Interbank",
  "Scotiabank",
  "Tarjeta Débito / Crédito",
  "Otros",
];

export function paymentLabel(method?: string): string {
  if (!method) return "Efectivo";
  const m = method.toLowerCase().trim();
  if (m === "transfer" || m === "transferencia" || m === "digital") return "Transferencia / Digital";
  if (m === "cash" || m === "efectivo") return "Efectivo";
  if (m === "mixed" || m === "mixto") return "Pago Mixto";
  const found = PAYMENT_METHODS.find((p) => p.key === m);
  return found ? found.label : method;
}
