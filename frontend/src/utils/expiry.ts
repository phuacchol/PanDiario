// Semáforo de vencimiento compartido entre Inventario, Ventas, el
// Asistente de voz y el formulario de producto: una sola fuente de verdad
// para los umbrales de días restantes y sus colores/etiquetas.

export type ExpiryLevel = "none" | "green" | "yellow" | "orange" | "red";

export interface ExpiryStatus {
  level: ExpiryLevel;
  daysLeft: number | null;
  label: string;
  color: string;
}

const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

// Días restantes hasta la fecha (puede ser negativo si ya venció).
// Compara por fecha calendario local, no por horas, para que "hoy" siempre
// dé 0 sin importar la hora del día.
export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const target = new Date(y, (m || 1) - 1, d || 1);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function formatExpiryDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return dateStr;
  return `${String(d).padStart(2, "0")}/${MONTH_ABBR[m - 1] || ""}`;
}

export function formatExpiryDateFull(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return dateStr;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

// Umbrales:
// Verde   > 30 días (o no perecible / sin fecha) -> sin indicador.
// Amarillo 15-30 días -> "Vence en X días".
// Naranja  4-14 días  -> "Por vencer (X días)".
// Rojo     <= 3 días o vencido -> "¡Vence pronto! (X días)" / "Vencido".
export function getExpiryStatus(expiryDate?: string | null, isPerishable?: boolean): ExpiryStatus {
  if (!isPerishable || !expiryDate) {
    return { level: "none", daysLeft: null, label: "", color: "" };
  }

  const daysLeft = daysUntil(expiryDate);

  if (daysLeft <= 3) {
    return {
      level: "red",
      daysLeft,
      label: daysLeft <= 0 ? "Vencido" : `¡Vence pronto! (${daysLeft} días)`,
      color: "#EF4444",
    };
  }
  if (daysLeft <= 14) {
    return { level: "orange", daysLeft, label: `Por vencer (${daysLeft} días)`, color: "#F59E0B" };
  }
  if (daysLeft <= 30) {
    return { level: "yellow", daysLeft, label: `Vence en ${daysLeft} días`, color: "#EAB308" };
  }
  return { level: "green", daysLeft, label: "", color: "#10B981" };
}
