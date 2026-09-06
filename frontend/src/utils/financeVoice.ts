// Motor de clasificación de voz de PanDiario: mucho más simple que el
// motor comercial que reemplaza (sin ventas/inventario), con exactamente 3
// intenciones -Ingreso, Gasto, Nota- y half-duplex (nunca se reactiva la
// escucha sola: cada frase requiere una pulsación explícita del micrófono).

export const WORD_NUMBERS: Record<string, number> = {
  cero: 0, un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, quinientos: 500, mil: 1000,
};

const TENS_WORDS: Record<string, number> = {
  veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};

const NORMALIZABLE_NUMBER_WORDS = Object.keys(WORD_NUMBERS).filter((w) => w !== "un" && w !== "una");

// Convierte números hablados en dígitos ("cuarenta y cinco" -> "45") antes
// de buscar el monto: el reconocimiento de voz transcribe números en
// palabras, no en dígitos.
export function normalizeWordsToNumbers(text: string): string {
  if (!text) return text;
  let result = text;
  result = result.replace(
    /\b(veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\s+y\s+(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/gi,
    (_m, tens: string, unit: string) => String(TENS_WORDS[tens.toLowerCase()] + (WORD_NUMBERS[unit.toLowerCase()] || 0))
  );
  const pattern = new RegExp(`\\b(${NORMALIZABLE_NUMBER_WORDS.join("|")})\\b`, "gi");
  result = result.replace(pattern, (match) => String(WORD_NUMBERS[match.toLowerCase()] ?? match));
  return result;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Sinónimos por intención (mínimo 10 variantes cada una, per directiva).
// Se buscan sobre texto sin tildes para tolerar transcripciones sin acentos.
const INGRESO_TRIGGERS = [
  "ingreso", "ingrese", "ingresaron", "gane", "gano", "cobre", "cobro",
  "me pagaron", "pagaron", "recibi", "recibo", "deposito", "abono", "abone",
  "venta extra", "propina",
];
const GASTO_TRIGGERS = [
  "gasto", "gaste", "compre", "compro", "pague", "pago", "consumo", "consumi",
  "salida", "descuento", "egreso", "costo", "debito",
];
const NOTA_TRIGGERS = [
  "nota", "anota", "anotar", "apunta", "apuntar", "acuerdate", "recuerda",
  "recuerdame", "no olvidar", "olvides", "pendiente", "tarea", "aviso", "alarma",
];

function buildTriggerRegex(words: string[]): RegExp {
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"));
  return new RegExp(`\\b(${escaped.join("|")})\\b`, "i");
}

const NOTA_RE = buildTriggerRegex(NOTA_TRIGGERS);
const INGRESO_RE = buildTriggerRegex(INGRESO_TRIGGERS);
const GASTO_RE = buildTriggerRegex(GASTO_TRIGGERS);

const AMOUNT_RE = /(\d+(?:\.\d+)?)\s*(?:soles?|sol|pen|s\/\.?)?/i;
const METHOD_TRANSFER_RE = /\b(transferencia|transfer|yape|plin|deposito|tarjeta|digital)\b/i;
const METHOD_CASH_RE = /\b(efectivo|cash|contado)\b/i;

export type FinanceIntentKind = "ingreso" | "gasto" | "nota" | "unknown";

export interface FinanceIntentResult {
  kind: FinanceIntentKind;
  amount: number | null;
  method: "efectivo" | "transferencia" | null;
  category: string | null;
  note: string;
  rawText: string;
}

// Elimina el verbo/expresión disparadora del texto para quedarse solo con
// el concepto ("gasté 30 en transporte" -> "en transporte" -> "transporte").
function stripTrigger(text: string, re: RegExp): string {
  return text
    .replace(re, "")
    .replace(AMOUNT_RE, "")
    .replace(/\b(en|de|por|para|soles?|sol|pen|s\/\.?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Compara el concepto dictado contra las categorías de presupuesto ya
// creadas por el usuario (Vital/Secundario) y devuelve el nombre exacto de
// la que mejor coincide, o null si ninguna aplica (queda "Otros").
export function matchCategory(concept: string, categories: { name: string }[]): string | null {
  const clean = stripAccents(concept.toLowerCase().trim());
  if (!clean) return null;
  for (const cat of categories) {
    const catClean = stripAccents(cat.name.toLowerCase().trim());
    if (!catClean) continue;
    if (clean.includes(catClean) || catClean.includes(clean)) return cat.name;
  }
  const words = clean.split(/\s+/).filter(Boolean);
  for (const cat of categories) {
    const catClean = stripAccents(cat.name.toLowerCase().trim());
    if (words.some((w) => w.length > 2 && catClean.includes(w))) return cat.name;
  }
  return null;
}

export function analyzeFinanceIntent(rawText: string, categories: { name: string }[] = []): FinanceIntentResult {
  const normalized = normalizeWordsToNumbers(rawText || "");
  const flat = stripAccents(normalized.toLowerCase());

  const method: "efectivo" | "transferencia" | null = METHOD_TRANSFER_RE.test(flat)
    ? "transferencia"
    : METHOD_CASH_RE.test(flat)
      ? "efectivo"
      : null;

  const amountMatch = normalized.match(AMOUNT_RE);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : null;

  // Nota primero: sus disparadores son imperativos/reflexivos poco
  // ambiguos ("anota", "recuérdame") y no deben leerse como ingreso/gasto
  // aunque la frase también mencione un monto ("anota que debo 50 soles").
  if (NOTA_RE.test(flat)) {
    const concept = stripTrigger(normalized, NOTA_RE) || normalized.trim();
    return { kind: "nota", amount, method, category: null, note: concept, rawText };
  }

  if (INGRESO_RE.test(flat)) {
    const concept = stripTrigger(normalized, INGRESO_RE);
    return { kind: "ingreso", amount, method, category: matchCategory(concept, categories), note: concept, rawText };
  }

  if (GASTO_RE.test(flat)) {
    const concept = stripTrigger(normalized, GASTO_RE);
    return { kind: "gasto", amount, method, category: matchCategory(concept, categories), note: concept, rawText };
  }

  return { kind: "unknown", amount, method, category: null, note: normalized.trim(), rawText };
}

// Comandos cortos de confirmación/cancelación sobre la tarjeta de revisión.
export function classifyConfirmCommand(text: string): "confirm" | "cancel" | null {
  const clean = stripAccents((text || "").toLowerCase().trim());
  if (/\b(si|guardar|guarda|confirmar|confirma|listo|dale|ok|okay)\b/.test(clean)) return "confirm";
  if (/\b(no|cancelar|cancela|descartar|descarta)\b/.test(clean)) return "cancel";
  return null;
}
