export const METHODS: { key: "efectivo" | "transferencia"; label: string; icon: "dollar-sign" | "credit-card" }[] = [
  { key: "efectivo", label: "Efectivo", icon: "dollar-sign" },
  { key: "transferencia", label: "Transferencia", icon: "credit-card" },
];

export function methodLabel(method?: string | null): string {
  return method === "transferencia" ? "Transferencia" : "Efectivo";
}

// Opciones de anticipación para notificaciones de recordatorios y listas
// programadas (en minutos), usadas tanto en Ajustes (valor por defecto)
// como en el selector de cada recordatorio/lista individual.
export const LEAD_TIME_OPTIONS: { key: string; label: string; minutes: number }[] = [
  { key: "1", label: "1 min", minutes: 1 },
  { key: "5", label: "5 min", minutes: 5 },
  { key: "10", label: "10 min", minutes: 10 },
  { key: "15", label: "15 min", minutes: 15 },
  { key: "30", label: "30 min", minutes: 30 },
  { key: "60", label: "1 h", minutes: 60 },
  { key: "120", label: "2 h", minutes: 120 },
  { key: "180", label: "3 h", minutes: 180 },
  { key: "300", label: "5 h", minutes: 300 },
  { key: "1440", label: "1 día", minutes: 1440 },
  { key: "2880", label: "2 días", minutes: 2880 },
  { key: "4320", label: "3 días", minutes: 4320 },
];

export const DEFAULT_LEAD_MINUTES_KEY = "@pandiario_default_lead_minutes";

export const ORIGIN_OPTIONS: { key: "cuenta" | "vital" | "secundario" | "caja_chica" | "ahorro"; label: string }[] = [
  { key: "cuenta", label: "Cuenta Actual" },
  { key: "vital", label: "Presupuesto Vital" },
  { key: "secundario", label: "Presupuesto Secundario" },
  { key: "caja_chica", label: "Caja Chica" },
  { key: "ahorro", label: "Ahorro" },
];
