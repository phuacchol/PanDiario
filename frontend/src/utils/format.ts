export type Currency = string;

// Default quick-pick currencies (shown as chips in settings).
export const CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: "PEN", symbol: "S/", label: "Soles (S/)" },
  { code: "USD", symbol: "$", label: "Dólares ($)" },
  { code: "EUR", symbol: "€", label: "Euros (€)" },
  { code: "ARS", symbol: "$", label: "Pesos Argentinos ($)" },
  { code: "COP", symbol: "$", label: "Pesos Colombianos ($)" },
];

// Broader world currency list for the "+" picker.
export const WORLD_CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: "USD", symbol: "$", label: "Dólar estadounidense" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "PEN", symbol: "S/", label: "Sol peruano" },
  { code: "ARS", symbol: "$", label: "Peso argentino" },
  { code: "COP", symbol: "$", label: "Peso colombiano" },
  { code: "MXN", symbol: "$", label: "Peso mexicano" },
  { code: "CLP", symbol: "$", label: "Peso chileno" },
  { code: "BRL", symbol: "R$", label: "Real brasileño" },
  { code: "BOB", symbol: "Bs", label: "Boliviano" },
  { code: "UYU", symbol: "$U", label: "Peso uruguayo" },
  { code: "PYG", symbol: "₲", label: "Guaraní paraguayo" },
  { code: "VES", symbol: "Bs", label: "Bolívar venezolano" },
  { code: "GTQ", symbol: "Q", label: "Quetzal guatemalteco" },
  { code: "CRC", symbol: "₡", label: "Colón costarricense" },
  { code: "DOP", symbol: "RD$", label: "Peso dominicano" },
  { code: "GBP", symbol: "£", label: "Libra esterlina" },
  { code: "JPY", symbol: "¥", label: "Yen japonés" },
  { code: "CNY", symbol: "¥", label: "Yuan chino" },
  { code: "CAD", symbol: "C$", label: "Dólar canadiense" },
  { code: "AUD", symbol: "A$", label: "Dólar australiano" },
  { code: "CHF", symbol: "Fr", label: "Franco suizo" },
  { code: "INR", symbol: "₹", label: "Rupia india" },
  { code: "KRW", symbol: "₩", label: "Won surcoreano" },
  { code: "RUB", symbol: "₽", label: "Rublo ruso" },
  { code: "ZAR", symbol: "R", label: "Rand sudafricano" },
];

export function currencySymbol(code?: string): string {
  if (!code) return "$";
  const all = [...CURRENCIES, ...WORLD_CURRENCIES];
  return all.find((c) => c.code === code)?.symbol ?? code;
}

// Thousands separator = dot, decimal separator = comma (Latin American format).
export function formatNumber(value: number, decimals = 0): string {
  const n = isFinite(value) ? value : 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sign = n < 0 ? "-" : "";
  return decPart ? `${sign}${withSep},${decPart}` : `${sign}${withSep}`;
}

export function formatMoney(value: number, currency?: string, decimals = 0): string {
  return `${currencySymbol(currency)} ${formatNumber(value, decimals)}`;
}

// Formateadores de fecha/hora 100% locales, SIN toLocaleTimeString/
// toLocaleDateString/Intl: Hermes en Android no siempre trae los datos ICU
// completos que Intl.DateTimeFormat necesita, así que pedirle una
// configuración regional explícita ("es-PE") puede devolver una hora
// desfasada del huso horario real del dispositivo en ciertos equipos -el
// síntoma reportado: la hora guardada es correcta (UTC), pero se muestra
// corrida un par de horas respecto al reloj del teléfono-. Estas funciones
// arman el texto a mano con los getters nativos de Date (getHours,
// getMinutes, getDate, getMonth, getDay), que siempre reflejan la zona
// horaria del sistema operativo sin pasar por Intl.
const MONTH_ABBR_ES = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "set.", "oct.", "nov.", "dic."];
const WEEKDAY_ABBR_ES = ["dom.", "lun.", "mar.", "mié.", "jue.", "vie.", "sáb."];

// Un ISO datetime ("YYYY-MM-DDTHH:mm:ss[.sss]") SIN sufijo de zona horaria
// (ni "Z" ni "+HH:MM"/"-HH:MM") es ambiguo: el motor JS puede interpretarlo
// como hora local (lo que dice el spec) o como UTC (lo que hacen algunos
// motores en la práctica, Hermes incluido en ciertas versiones/plataformas),
// y ambas lecturas producen una hora distinta en pantalla. Todo created_at
// que maneja esta app representa un instante absoluto (siempre se guarda
// vía Date.now()/toISOString(), o llega del backend como isoformat() de un
// datetime en UTC) — nunca una hora de pared "sin zona" a propósito — así
// que si llega sin sufijo se asume UTC explícitamente anteponiendo "Z"
// antes de construir el Date, en vez de dejar la interpretación al motor.
const ISO_DATETIME_WITHOUT_TZ_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/;

export function toLocalDate(input: string | number | Date): Date {
  if (input instanceof Date) return input;
  if (typeof input === "string" && ISO_DATETIME_WITHOUT_TZ_RE.test(input)) {
    return new Date(`${input.replace(" ", "T")}Z`);
  }
  return new Date(input);
}

export function formatLocalTime(input: string | number | Date, opts?: { seconds?: boolean }): string {
  const d = toLocalDate(input);
  if (isNaN(d.getTime())) return "";
  let hours = d.getHours();
  const ampm = hours >= 12 ? "p. m." : "a. m.";
  hours = hours % 12 || 12;
  const hh = String(hours).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const time = opts?.seconds ? `${hh}:${mm}:${String(d.getSeconds()).padStart(2, "0")}` : `${hh}:${mm}`;
  return `${time} ${ampm}`;
}

export function formatLocalDate(input: string | number | Date, opts?: { withYear?: boolean }): string {
  const d = toLocalDate(input);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTH_ABBR_ES[d.getMonth()] || "";
  return opts?.withYear ? `${day} ${month} ${d.getFullYear()}` : `${day} ${month}`;
}

export function formatLocalWeekday(input: string | number | Date): string {
  const d = toLocalDate(input);
  if (isNaN(d.getTime())) return "";
  return WEEKDAY_ABBR_ES[d.getDay()];
}
