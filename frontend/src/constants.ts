export const METHODS: { key: "efectivo" | "transferencia"; label: string; icon: "dollar-sign" | "credit-card" }[] = [
  { key: "efectivo", label: "Efectivo", icon: "dollar-sign" },
  { key: "transferencia", label: "Transferencia", icon: "credit-card" },
];

export function methodLabel(method?: string | null): string {
  return method === "transferencia" ? "Transferencia" : "Efectivo";
}
