// Lógica pura (sin dependencias de React Native/Expo) usada por
// DataContext.tsx, separada en su propio archivo para poder probarla con
// Node a secas (ver scripts/test-datacontext.mjs).

const MONTH_NAMES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Nombre de un ciclo cerrado para el Historial de Cierres: el mes con más
// días dentro del ciclo (>=20 días) le da su nombre; si el ciclo se reparte
// entre dos meses sin que ninguno llegue a 20, se usa el nombre compuesto
// "MesA - MesB" en orden cronológico.
export function computeCycleLabel(startDate: Date, endDate: Date): string {
  const dayCountByMonth = new Map<number, number>();
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(endDate);
  last.setHours(0, 0, 0, 0);

  let guard = 0;
  while (cursor <= last && guard < 400) {
    const m = cursor.getMonth();
    dayCountByMonth.set(m, (dayCountByMonth.get(m) || 0) + 1);
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }

  const entries = Array.from(dayCountByMonth.entries());
  if (entries.length === 0) return MONTH_NAMES_FULL[startDate.getMonth()];

  const top = entries.slice().sort((a, b) => b[1] - a[1])[0];
  if (top[1] >= 20 || entries.length === 1) {
    return MONTH_NAMES_FULL[top[0]];
  }

  const monthsInOrder = entries.map(([m]) => m).sort((a, b) => a - b);
  return monthsInOrder.map((m) => MONTH_NAMES_FULL[m]).join(" - ");
}

export function daysUntil(dateStr: string | null, now: Date = new Date()): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// Reparte un monto de ahorro entre efectivo/digital de la Cartera,
// descontando primero de efectivo, sin dejar ningún saldo negativo. Nunca
// ahorra más de lo que efectivamente hay disponible en Cartera.
export function splitSavingsFromWallet(
  requested: number,
  carteraEfectivo: number,
  carteraDigital: number
): { amount: number; carteraEfectivo: number; carteraDigital: number } {
  const available = Math.max(0, carteraEfectivo + carteraDigital);
  const amount = Math.max(0, Math.min(requested, available));
  const fromEfectivo = Math.min(carteraEfectivo, amount);
  const fromDigital = amount - fromEfectivo;
  return {
    amount,
    carteraEfectivo: carteraEfectivo - fromEfectivo,
    carteraDigital: carteraDigital - fromDigital,
  };
}
