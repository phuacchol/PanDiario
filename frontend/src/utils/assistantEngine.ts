import AsyncStorage from "@react-native-async-storage/async-storage";

export const ASSISTANT_MEMORY_KEY = "@pan_assistant_memory";

export interface AssistantMemory {
  preferredPaymentMethod: "cash" | "transfer";
  aliases: Record<string, string>;
  categoryAffinities: Record<string, { category: string; subcategory: string }>;
  lastAction?: {
    id: string;
    type: "sale" | "expense" | "purchase";
    timestamp: number;
    description: string;
    total: number;
  };
}

const DEFAULT_MEMORY: AssistantMemory = {
  preferredPaymentMethod: "cash",
  aliases: {},
  categoryAffinities: {},
};

export const WORD_NUMBERS: Record<string, number> = {
  cero: 0, un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, quinientos: 500, mil: 1000,
};

const MONTH_MAP: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

export function normalizeWord(w: string): string {
  return (w || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/es$/i, "")
    .replace(/s$/i, "");
}

export function parseNumberWord(token: string): number | null {
  if (!token) return null;
  const clean = token.toLowerCase().trim();
  if (/^\d+(\.\d+)?$/.test(clean)) return parseFloat(clean);
  if (WORD_NUMBERS[clean] !== undefined) return WORD_NUMBERS[clean];
  return null;
}

// "un"/"una" se excluyen a propósito: son también el artículo indefinido
// ("un polo"), así que se siguen resolviendo solo donde el contexto ya lo
// espera (los regex de cantidad/precio existentes), no como reemplazo global.
const NORMALIZABLE_NUMBER_WORDS = Object.keys(WORD_NUMBERS).filter((w) => w !== "un" && w !== "una");
const TENS_WORDS: Record<string, number> = {
  veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};

// Convierte números hablados en dígitos ANTES de que corran los regex de
// intención (cantidad, precio, etc.), en vez de tener que listar cada
// palabra numérica dentro de cada patrón por separado. Android transcribe
// "cinco", "veinte", "cuarenta y dos" en palabras, no en dígitos.
export function normalizeWordsToNumbers(text: string): string {
  if (!text) return text;
  let result = text;

  // Compuestos hablados ("treinta y cinco" -> "35") antes de reemplazar
  // cada palabra suelta, para no dejar un "y cinco" residual.
  result = result.replace(
    /\b(veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\s+y\s+(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/gi,
    (_m, tens: string, unit: string) => String(TENS_WORDS[tens.toLowerCase()] + (WORD_NUMBERS[unit.toLowerCase()] || 0))
  );

  const pattern = new RegExp(`\\b(${NORMALIZABLE_NUMBER_WORDS.join("|")})\\b`, "gi");
  result = result.replace(pattern, (match) => String(WORD_NUMBERS[match.toLowerCase()] ?? match));

  return result;
}

// Transcripciones frecuentes del reconocimiento de voz de Google en Perú
// que suenan parecido a un producto común pero nunca lo son en el habla
// real de una tienda ("pueblos" nunca es un artículo de venta, "polos" sí).
const PHONETIC_CORRECTIONS: Record<string, string> = {
  pueblos: "polos",
  pueblo: "polo",
};

// Corrige transcripciones fonéticamente parecidas ANTES del matching de
// productos, para que "vendí 2 pueblos a 20 soles" reconozca "polos" en
// vez de fallar silenciosamente por no encontrar el producto.
export function applyPhoneticCorrections(text: string): string {
  if (!text) return text;
  const words = Object.keys(PHONETIC_CORRECTIONS);
  const pattern = new RegExp(`\\b(${words.join("|")})\\b`, "gi");
  return text.replace(pattern, (match) => PHONETIC_CORRECTIONS[match.toLowerCase()] || match);
}

// Verbos/expresiones que abren explícitamente una intención de VENTA.
// Centralizado para no mantener sincronizadas varias copias del mismo
// patrón repartidas en distintas funciones (limpieza de prefijo, filtro de
// cláusulas mixtas, disparador principal).
// "sali[oó]"/"salieron" y "liquid[oó]" son AMBIGUOS entre VENTA (mercadería
// que sale/se remata) y GASTO (dinero que sale para pagar algo, o una
// deuda que se salda). El lookahead negativo excluye la lectura de VENTA
// cuando la frase trae, en cualquier parte -no solo pegado al verbo-, una
// señal de destino de pago ("salió DINERO PARA luz" también se excluye, no
// solo "salió PARA luz") o, para "liquidó", una mención de deuda/cuenta/
// proveedor. Sin esas señales se asume VENTA física (ej. "salieron 2 polos
// a 40 soles", "liquidó 2 buzos a 35 soles").
const SALIO_EXPENSE_HINT_SRC =
  "para|por\\s+pagar|al\\s+proveedor|de\\s+luz|de\\s+agua|en\\s+(?:gastos?|pagos?|deudas?)";
const LIQUIDO_EXPENSE_HINT_SRC = "deuda|proveedor|cuenta";
const SALIO_EXPENSE_HINT_RE = new RegExp(`\\b(?:${SALIO_EXPENSE_HINT_SRC})\\b`, "i");
const LIQUIDO_EXPENSE_HINT_RE = new RegExp(`\\b(?:${LIQUIDO_EXPENSE_HINT_SRC})\\b`, "i");
const SALE_VERBS_SRC =
  "registrar\\s+(?:una\\s+)?[bv]enta|registra\\s+(?:una\\s+)?[bv]enta|nueva\\s+[bv]enta|anotar\\s+[bv]enta|[bv]end[ií]|[bv]endo|[bv]ender|[bv]enta|cobr[eéo]|cobrar|me\\s+pagaron|pagaron|he\\s+[bv]endido|despach[eéo]|" +
  `sali[oó](?!.*\\b(?:${SALIO_EXPENSE_HINT_SRC})\\b)|salieron(?!.*\\b(?:${SALIO_EXPENSE_HINT_SRC})\\b)|` +
  `factur[eé]|boleti[eé]|entregu[eé]|liquid[oó](?!.*\\b(?:${LIQUIDO_EXPENSE_HINT_SRC})\\b)`;
const SALE_TRIGGER_RE = new RegExp(SALE_VERBS_SRC, "i");
const SALE_LEAD_STRIP_RE = new RegExp(`^(?:${SALE_VERBS_SRC})\\s*(?:de|a)?`, "i");

// Subconjunto de SALE_VERBS_SRC que dicta el MONTO TOTAL primero ("cobré
// 20 soles POR 2 paletas", "me pagaron 40 POR un buzo"): orden inverso al
// de "vendí", que dicta primero la cantidad ("vendí 2 paletas A 10
// soles"). Se usa para elegir qué extractor de cantidad/precio aplicar.
const COBRO_VERBS_SRC = "cobr[eéo]|cobrar|me\\s+pagaron|pagaron";
const COBRO_LEAD_RE = new RegExp(`^(?:${COBRO_VERBS_SRC})(?:\\s|$)`, "i");
const NUM_ALT_SRC =
  "\\d+(?:\\.\\d+)?|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|veinticinco|treinta|cuarenta|cincuenta|cien";
const COBRO_TOTAL_FIRST_RE = new RegExp(
  `^(${NUM_ALT_SRC})\\s*(?:soles|sol|pen|pesos|dolares|lucas|so)?\\s*(?:por|en|de)\\s+(.+)$`,
  "i"
);

// Sustantivos que casi nunca son mercadería de tienda y casi siempre
// indican un gasto operativo/personal. Se usan solo para desambiguar
// "compré"/"comprar" entre INGRESO DE STOCK y GASTO ("compré 5 casacas" es
// stock; "compré almuerzo" es gasto), evitando tocar palabras ambiguas que
// también podrían ser un producto de tienda (agua, gaseosa, etc.).
const PERSONAL_EXPENSE_HINT_RE =
  /(?:almuerzo|comida|cena|desayuno|refrigerio|pasaje|transporte|taxi|combustible|flete|peaje|tel[eé]fono|celular|alquiler|servicio|bolsas?|\bluz\b|\brecibo\b)/i;

// Dígitos sueltos (0-9) que, al aparecer en serie ("nueve siete seis..."),
// casi siempre son alguien deletreando un teléfono/DNI y no una cantidad —
// se concatenan en un solo número en vez de quedar separados por espacios.
const SINGLE_DIGIT_WORDS = ["cero", "un", "una", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const DIGIT_SEQUENCE_RE = new RegExp(`\\b(?:(?:${SINGLE_DIGIT_WORDS.join("|")})\\s+){1,}(?:${SINGLE_DIGIT_WORDS.join("|")})\\b`, "gi");

// Convierte una serie de dígitos hablados uno por uno ("nueve siete seis
// cinco cuatro tres") en un solo número concatenado ("976543"), pensado
// para notas dictadas con un teléfono/DNI de proveedor. Se aplica solo al
// texto de la nota, nunca al resto de la orden (ahí cada palabra numérica
// debe seguir siendo un número independiente para cantidades/precios).
export function digitizeSpokenDigitSequences(text: string): string {
  if (!text) return text;
  return text.replace(DIGIT_SEQUENCE_RE, (match) =>
    match
      .trim()
      .split(/\s+/)
      .map((w) => String(WORD_NUMBERS[w.toLowerCase()] ?? ""))
      .join("")
  );
}

// Extrae una "Nota / Proveedor" dictada al final de una orden de ingreso de
// stock (ej. "...con nota señor Pepe nueve siete seis cinco cuatro tres"),
// devolviendo el texto restante sin la cláusula de nota y la nota misma ya
// con cualquier serie de dígitos hablados normalizada a un solo número.
function extractDictatedNote(text: string): { rest: string; note: string } {
  const match = text.match(/\b(?:con\s+nota\s+de\s+proveedor|con\s+nota|nota\s+de\s+proveedor|nota|proveedor)\s*[:\-]?\s*(.+)$/i);
  if (!match) return { rest: text, note: "" };
  const note = digitizeSpokenDigitSequences(match[1].trim());
  const rest = text.slice(0, match.index).trim();
  return { rest, note };
}

const EXPIRY_MONTHS_SRC = Object.keys(MONTH_MAP).join("|");
// Coincide con "vence 15 de octubre" o "vence el 15 de octubre del 2026"
// (los números ya llegan como dígitos gracias a normalizeWordsToNumbers).
const EXPIRY_RE = new RegExp(`\\bvence\\s+(?:el\\s+)?(\\d{1,2})\\s+de\\s+(${EXPIRY_MONTHS_SRC})(?:\\s+(?:de|del)\\s+(\\d{4}))?\\b`, "i");

// Detecta si la orden dictada trae una fecha de vencimiento, sin necesidad
// de un verbo explícito de ingreso ("cinco latas de atún vence 15 de
// octubre" ya implica que se está registrando un lote perecible).
export function hasDictatedExpiry(text: string): boolean {
  return EXPIRY_RE.test(text);
}

// Extrae la cláusula "vence <día> de <mes>" dictada en un ingreso de stock,
// devolviendo la fecha en ISO (YYYY-MM-DD) y el texto restante sin ella. Si
// no se especifica año, se asume el actual, o el próximo si esa fecha con
// el año en curso ya quedó en el pasado (nadie ingresa stock ya vencido).
function extractDictatedExpiry(text: string): { rest: string; expiryDate: string | null } {
  const match = text.match(EXPIRY_RE);
  if (!match) return { rest: text, expiryDate: null };

  const day = parseInt(match[1], 10);
  const monthIdx = MONTH_MAP[match[2].toLowerCase()];
  const now = new Date();
  let year = match[3] ? parseInt(match[3], 10) : now.getFullYear();

  if (!match[3]) {
    const candidate = new Date(year, monthIdx, day);
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (candidate < todayLocal) year += 1;
  }

  const expiryDate = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const rest = (text.slice(0, match.index) + text.slice((match.index || 0) + match[0].length)).replace(/\s+/g, " ").trim();
  return { rest, expiryDate };
}

export interface PaymentCommand {
  method: "cash" | "transfer" | "mixed";
  cashAmount?: number;
  transferAmount?: number;
}

// Interpreta comandos de método de pago dictados mientras una tarjeta de
// venta espera confirmación ("pagar todo en efectivo", "pagar mixto", "120
// en efectivo"). No confirma ni cancela la tarjeta: solo ajusta cómo se
// repartirá el monto total entre efectivo y transferencia.
export function parsePaymentCommand(text: string, totalAmount: number): PaymentCommand | null {
  const clean = normalizeWordsToNumbers(text || "");

  if (/\bpagar\s+(?:todo\s+)?en\s+efectivo\b/i.test(clean)) return { method: "cash" };
  if (/\bpagar\s+(?:todo\s+)?por\s+transferencia\b/i.test(clean)) return { method: "transfer" };
  if (/\bpagar\s+mixto\b/i.test(clean)) return { method: "mixed" };

  const cashMatch = clean.match(/(\d+(?:\.\d+)?)\s+en\s+efectivo\b/i);
  if (cashMatch) {
    const cashAmount = parseFloat(cashMatch[1]) || 0;
    const transferAmount = Math.max(0, Math.round((totalAmount - cashAmount) * 100) / 100);
    return { method: "mixed", cashAmount, transferAmount };
  }

  const transferMatch = clean.match(/(\d+(?:\.\d+)?)\s+(?:en|por)\s+transferencia\b/i);
  if (transferMatch) {
    const transferAmount = parseFloat(transferMatch[1]) || 0;
    const cashAmount = Math.max(0, Math.round((totalAmount - transferAmount) * 100) / 100);
    return { method: "mixed", cashAmount, transferAmount };
  }

  return null;
}

// Vocabulario de cierre de una tarjeta de confirmación (Venta, Gasto o
// Ingreso de Stock) en Modo Mostrador: se evalúa en cada ciclo mientras la
// tarjeta sigue abierta, con prioridad absoluta sobre cualquier otra
// interpretación (acumulación, edición, etc.), para que "Sí guardar" y "No
// cancelar" nunca queden deshabilitados por el resto del parser.
// Nota: la palabra final de "s[ií]" puede terminar en "í" (con tilde), y
// \b de JS no reconoce las vocales acentuadas como caracteres de palabra
// -no hay límite detectable entre "í" y el fin de cadena o un espacio-, así
// que un \b de cierre normal nunca casaría con un "sí" suelto. Se usa un
// lookahead negativo de letra en su lugar, inmune a ese problema.
const WORD_END = "(?![a-záéíóúñA-ZÁÉÍÓÚÑ])";
const CONFIRM_COMMAND_RE = new RegExp(
  `\\b(?:s[ií]\\s+guardar|guardar|confirmar|confirma|proceder|grabar|guardar\\s+venta|guardar\\s+stock|guardar\\s+gasto|correcto\\s+guardar|dale\\s+guardar|listo|cobrar|s[ií])${WORD_END}`,
  "i"
);
const CANCEL_COMMAND_RE = new RegExp(
  `\\b(?:no\\s+cancelar|cancelar|descartar|cancelar\\s+orden|descarta|cancela|borrar|eliminar|no)${WORD_END}`,
  "i"
);

// Consulta de arqueo/caja: solo frases de balance explícitas y con límite
// de palabra. "caja"/"cajas" sueltas ya NO cuentan como señal de consulta
// -colisionaban con nombres de producto como "caja de leche", haciendo que
// "vendí 5 cajas de leche a 20 soles" se interpretara como "¿cuánto hay en
// caja?"-. "efectivo en caja"/"con cuanto cierro" se mantienen por ser la
// consulta de saldo en caja ya existente.
const CASH_QUERY_RE =
  /\b(?:cu[aá]nto\s+hay\s+en\s+caja|total\s+en\s+caja|dinero\s+en\s+caja|efectivo\s+en\s+caja|caja\s+del\s+d[ií]a|arqueo|con\s+cuanto\s+cierro)\b/i;

export function classifyConfirmCommand(text: string): "confirm" | "cancel" | null {
  if (!text) return null;
  if (CONFIRM_COMMAND_RE.test(text)) return "confirm";
  if (CANCEL_COMMAND_RE.test(text)) return "cancel";
  return null;
}

export async function getAssistantMemory(): Promise<AssistantMemory> {
  try {
    const raw = await AsyncStorage.getItem(ASSISTANT_MEMORY_KEY);
    if (!raw) return DEFAULT_MEMORY;
    return { ...DEFAULT_MEMORY, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_MEMORY;
  }
}

export async function saveAssistantMemory(mem: Partial<AssistantMemory>) {
  try {
    const current = await getAssistantMemory();
    const updated = { ...current, ...mem };
    await AsyncStorage.setItem(ASSISTANT_MEMORY_KEY, JSON.stringify(updated));
  } catch {}
}

// Distancia de edición (Levenshtein) entre dos cadenas: cantidad mínima de
// inserciones/eliminaciones/sustituciones para convertir una en la otra.
// Único recurso 100% local (sin red) para tolerar errores de transcripción
// del reconocimiento de voz que ni el match exacto ni el de subcadena
// detectan (ej. "poloh"/"polos", "gaseoza"/"gaseosa", "buson"/"buzon").
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prevRow = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prevRow[j] = j;

  for (let i = 1; i <= a.length; i++) {
    const currRow = new Array(b.length + 1);
    currRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1, // inserción
        prevRow[j] + 1, // eliminación
        prevRow[j - 1] + cost // sustitución
      );
    }
    prevRow = currRow;
  }
  return prevRow[b.length];
}

// Tolerancia de edición proporcional al largo de la palabra: exigir 0
// errores en nombres cortos (2-3 letras) evita falsos positivos entre
// productos distintos ("te" vs "pan"), mientras que nombres largos
// admiten más margen para transcripciones ruidosas.
function fuzzyMatchTolerance(len: number): number {
  if (len <= 4) return 1;
  if (len <= 9) return 2;
  return 3;
}

export function matchProducts(itemName: string, products: any[], memory?: AssistantMemory): { match: any | null; candidates: any[] } {
  if (!itemName || !products || products.length === 0) return { match: null, candidates: [] };
  const clean = itemName.toLowerCase().trim();
  const aliasMatch = memory?.aliases[clean];
  const target = aliasMatch ? aliasMatch.toLowerCase().trim() : clean;
  const normTarget = normalizeWord(target);

  const exact = products.find((p: any) => (p.name || "").toLowerCase().trim() === target);
  if (exact) return { match: exact, candidates: [exact] };

  const candidates = products.filter((p: any) => {
    const pName = (p.name || "").toLowerCase().trim();
    const normPName = normalizeWord(pName);
    return (
      normPName === normTarget ||
      target.includes(pName) ||
      pName.includes(target) ||
      normTarget.includes(normPName) ||
      normPName.includes(normTarget)
    );
  });

  if (candidates.length === 1) return { match: candidates[0], candidates };
  if (candidates.length > 1) return { match: null, candidates };

  // Último recurso, 100% local: ninguna coincidencia exacta ni de
  // subcadena, pero el nombre dictado puede ser una transcripción ruidosa
  // de un producto real del catálogo. Se compara por distancia de edición
  // y solo se acepta dentro de la tolerancia proporcional al largo.
  const fuzzy = products.filter((p: any) => {
    const normPName = normalizeWord((p.name || "").toLowerCase().trim());
    if (!normPName) return false;
    const tolerance = fuzzyMatchTolerance(Math.max(normPName.length, normTarget.length));
    return levenshteinDistance(normTarget, normPName) <= tolerance;
  });
  if (fuzzy.length === 1) return { match: fuzzy[0], candidates: fuzzy };
  if (fuzzy.length > 1) return { match: null, candidates: fuzzy };

  return { match: null, candidates: [] };
}

export function splitCompoundPhrase(text: string): string[] {
  return text
    .replace(/[.,;]/g, " ")
    .split(/\s+(?:y|tambien|ademas|mas)\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface ParsedBatchSaleItem {
  name: string;
  qty: number;
  unit_price: number;
  product?: any;
  warning?: string;
  candidates?: any[];
  needsPrice?: boolean;
  // Stock del producto emparejado del catálogo al momento de anotar la
  // venta, para la advertencia "Stock insuficiente" en la tarjeta de
  // confirmación. undefined cuando el producto no está catalogado.
  currentStock?: number;
}

export function parseSingleSaleItem(clause: string, products: any[], memory?: AssistantMemory): ParsedBatchSaleItem | null {
  const preNormalized = applyPhoneticCorrections(normalizeWordsToNumbers(clause))
    .replace(/^(?:por favor|quiero|necesito)\s+/i, "")
    .trim();
  const isCobroStyle = COBRO_LEAD_RE.test(preNormalized);

  let core = preNormalized
    .replace(SALE_LEAD_STRIP_RE, "")
    .replace(/^(?:a|de)\s+/i, "")
    .trim();

  let qty = 1;
  let unitPrice = 0;

  // "Cobré"/"me pagaron"/"pagaron" dictan el MONTO TOTAL primero, y la
  // cantidad+producto llegan después del conector ("cobré 20 soles por 2
  // paletas" = S/20 total por 2 paletas, no una cantidad de 20 unidades).
  // Orden inverso al de "vendí", que dicta primero la cantidad ("vendí 2
  // paletas a 10 soles"): sin esta rama, el número inicial se leía siempre
  // como cantidad y el resultado salía con la cantidad y el precio cruzados.
  const cobroMatch = isCobroStyle ? core.match(COBRO_TOTAL_FIRST_RE) : null;
  if (cobroMatch) {
    const total = parseNumberWord(cobroMatch[1]) || parseFloat(cobroMatch[1]) || 0;
    core = cobroMatch[2].trim();
    const qm = core.match(/^(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cincuenta|cien)\s+/i);
    if (qm) {
      qty = parseNumberWord(qm[1]) || 1;
      core = core.slice(qm[0].length).trim();
    }
    unitPrice = qty > 0 ? Math.round((total / qty) * 100) / 100 : total;
  } else {
    const qm = core.match(/^(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cincuenta|cien)\s+/i);
    if (qm) {
      qty = parseNumberWord(qm[1]) || 1;
      core = core.slice(qm[0].length).trim();
    }

    const porMatch = core.match(/por\s+(\d+(?:\.\d+)?|un|una|uno|dos|tres|cuatro|cinco|diez|quince|veinte|veinticinco|treinta|cincuenta|cien)\s*(?:soles|sol|pen|pesos|dolares|lucas|so)?/i);
    const aMatch = core.match(/a\s+(\d+(?:\.\d+)?|un|una|uno|dos|tres|cuatro|cinco|diez|quince|veinte|veinticinco|treinta|cincuenta|cien)\s*(?:soles|sol|pen|pesos|dolares|lucas|so)?(?:\s*(?:cada\s+uno|c\/u))?/i);

    if (porMatch) {
      const rawVal = porMatch[1];
      const total = parseNumberWord(rawVal) || parseFloat(rawVal) || 0;
      unitPrice = qty > 0 ? Math.round((total / qty) * 100) / 100 : total;
      core = core.replace(porMatch[0], "").trim();
    } else if (aMatch) {
      const rawVal = aMatch[1];
      unitPrice = parseNumberWord(rawVal) || parseFloat(rawVal) || 0;
      core = core.replace(aMatch[0], "").trim();
    }
  }

  const rawItemName = core
    .replace(/(?:en\s+efectivo|por\s+transferencia|con\s+transferencia|yape|plin|soles|sol|pen|dolares|lucas|\bso\b)/gi, "")
    .replace(/^(?:de|a|el|la|los|las|un|una)\s+/i, "")
    .replace(/\b\d+\b/g, "")
    .trim();

  if (!rawItemName) return null;

  const { match: matched, candidates } = matchProducts(rawItemName, products, memory);

  if (unitPrice <= 0 && matched?.price) {
    unitPrice = Number(matched.price);
  }

  let warning = undefined;
  let needsPrice = false;

  if (unitPrice <= 0) {
    needsPrice = true;
    warning = "Precio no especificado";
  } else if (matched) {
    if (matched.price && unitPrice > 0 && unitPrice < Number(matched.price) * 0.4) {
      warning = `Precio bajo detectado (Regular: S/ ${matched.price})`;
    } else if (matched.price && unitPrice > 0 && unitPrice > Number(matched.price) * 2.5) {
      warning = `Precio elevado detectado (Regular: S/ ${matched.price})`;
    }
    if (matched.stock != null && qty > Number(matched.stock)) {
      warning = `Stock insuficiente (Disponible: ${matched.stock})`;
    }
  }

  return {
    name: matched ? matched.name : rawItemName,
    qty,
    unit_price: unitPrice,
    product: matched,
    warning,
    candidates: candidates.length > 1 ? candidates : undefined,
    needsPrice,
  };
}

export function parseAdditionalSaleClauses(text: string, products: any[], memory?: AssistantMemory): ParsedBatchSaleItem[] {
  const stripped = text
    .replace(/^(?:y\s+tambien|y\s+ademas|tambien|ademas|adem[aá]s|y|agregar|agrega|a[ñn]adir|a[ñn]ade|sumale|suma|incluye|incluir|pon|ponle)\s+/i, "")
    .trim();
  if (!stripped) return [];

  const clauses = splitCompoundPhrase(stripped);
  const items: ParsedBatchSaleItem[] = [];
  for (const clause of clauses) {
    const parsed = parseSingleSaleItem(clause, products, memory);
    if (parsed && (parsed.product || parsed.qty > 0)) items.push(parsed);
  }
  return items;
}

export interface ParsedStockItem {
  name: string;
  qty: number;
  cost: number;
  product?: any;
  isPerishable?: boolean;
  expiryDate?: string | null;
  // Stock actual del producto emparejado del catálogo, cuando el ingreso se
  // vincula a uno existente (ver mergeStockItems/updateStockItemField).
  currentStock?: number;
}

// Prefijos de verbo/registro que abren un ingreso de stock, compartidos
// entre el disparador principal y el parseo de cada ítem individual (así
// una cláusula posterior sin verbo propio, ej. "5 gorras a 15" dentro de
// "ingresar 10 casacas a 30 y 5 gorras a 15", no se ve afectada).
//
// GENERIC_STOCK_VERBS_SRC agrupa los verbos "genéricos" (llegó/recibí/
// entró/surtir/reponer/cargar): también tienen sentido fuera del comercio
// ("recibí una llamada", "cargar el celular"), así que el disparador
// principal (analyzeVoiceIntent, más abajo) exige evidencia real de
// mercadería antes de tratarlos como ingreso de stock. Los verbos
// "establecidos" (añadir/ingresar/comprar/etc.) son lo bastante
// inequívocos por sí solos y no llevan esa restricción extra.
const GENERIC_STOCK_VERBS_SRC = "lleg[oó]|llegaron|recib[ií]|entr[oó]|entraron|surtir|reponer|cargar";
const GENERIC_STOCK_VERB_TRIGGER_RE = new RegExp(`(?:${GENERIC_STOCK_VERBS_SRC})\\s+`, "i");
const ESTABLISHED_STOCK_VERBS_SRC =
  "añadir|anadir|agregar|ingresar|ingres[eé]|comprar|compr[eé]|compras|lleg[oó]\\s+mercader[ií]a\\s+de|lleg[oó]\\s+mercader[ií]a|compra\\s+de|registrar\\s+(?:nuevo\\s+)?(?:inventario|stock|mercader[ií]a|lote)?|registrar|registra";
const STOCK_LEAD_STRIP_RE = new RegExp(`^(?:${ESTABLISHED_STOCK_VERBS_SRC}|${GENERIC_STOCK_VERBS_SRC})\\s*`, "i");
// Sustantivos explícitos que por sí solos confirman un ingreso de
// mercadería, aun sin nombre de producto reconocible ("llegó mercadería
// nueva", "reponer stock del almacén").
const EXPLICIT_STOCK_NOUN_RE = /mercader[ií]a|almac[eé]n|\bstock\b|unidades|inventario|\blote\b/i;
// Sustantivos que casi nunca son mercadería y sí son eventos cotidianos del
// local (clientes, llamadas, dinero recibido...): si el nombre que queda
// después de un verbo GENÉRICO de stock coincide con uno de estos, y no
// hay coincidencia con el catálogo, nunca es un ingreso real.
const NON_MERCHANDISE_NOUNS = new Set([
  "cliente", "llamada", "persona", "mensaje", "pago", "hora", "favor",
  "noticia", "visita", "dinero", "plata", "efectivo",
]);

export function parseSingleStockItem(clause: string, products?: any[]): ParsedStockItem | null {
  let core = applyPhoneticCorrections(normalizeWordsToNumbers(clause))
    .replace(/[.,]/g, " ")
    .replace(/^(?:por favor|quiero|necesito|al)\s+/i, "")
    .replace(STOCK_LEAD_STRIP_RE, "")
    .replace(/^(?:a|de)\s+/i, "")
    .trim();

  let qty = 1;
  const qm = core.match(/^(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cincuenta|cien)\s+/i);
  if (qm) {
    qty = parseNumberWord(qm[1]) || 1;
    core = core.slice(qm[0].length).trim();
  }

  let cost = 0;
  const costPattern = /(?:costo\s+(?:de\s+)?|precio\s+(?:de\s+)?|a\s+|por\s+)(\d+(?:\.\d+)?|un|una|uno|dos|tres|cuatro|cinco|diez|quince|veinte|veinticinco|treinta|cincuenta|cien)\s*(?:soles|sol|pen|dolares|lucas|so)?$/i;
  const costMatch = core.match(costPattern);
  if (costMatch) {
    const rawCost = costMatch[1];
    cost = parseNumberWord(rawCost) || parseFloat(rawCost) || 0;
    core = core.slice(0, costMatch.index).trim();
  }

  const itemName = core
    .replace(/(?:soles|sol|pen|pesos|dolares|lucas|\bso\b|unidades|unid|cada\s+uno|c\/u)/gi, "")
    .replace(/^(?:de|a|el|la|los|las|un|una)\s+/i, "")
    .replace(/\s+(?:de|a)\s*$/i, "")
    .replace(/\b\d+\b/g, "")
    .trim();

  if (!itemName) return null;

  const { match: matched } = matchProducts(itemName, products || []);

  return { name: matched ? matched.name : itemName, qty, cost, product: matched };
}

// Confirma que, tras quitar el verbo, la frase describe mercadería
// plausible: coincide con un producto real del catálogo (máxima
// confianza) o, al menos, su primer sustantivo no es uno de los eventos
// cotidianos de NON_MERCHANDISE_NOUNS. Se usa solo para los verbos
// GENÉRICOS de stock (llegó/recibí/entró/surtir/reponer/cargar); los
// verbos explícitos (añadir/ingresar/etc.) ya son suficientemente
// inequívocos y no pasan por aquí.
function genericStockClauseIsPlausible(clause: string, products?: any[]): boolean {
  const parsed = parseSingleStockItem(clause, products);
  if (!parsed) return false;
  if (parsed.product) return true;
  const firstWord = (parsed.name || "").trim().split(/\s+/)[0] || "";
  return !NON_MERCHANDISE_NOUNS.has(normalizeWord(firstWord));
}

// Acumulación: mientras la tarjeta de ingreso de stock sigue abierta, suma
// el/los producto(s) recién dictados en vez de reemplazar la tarjeta.
export function parseAdditionalStockClauses(text: string, products?: any[]): ParsedStockItem[] {
  const stripped = text
    .replace(/^(?:y\s+tambien|y\s+ademas|tambien|ademas|adem[aá]s|y|agregar|agrega|a[ñn]adir|a[ñn]ade|sumale|suma|incluye|incluir|pon|ponle)\s+/i, "")
    .trim();
  if (!stripped) return [];

  const normalized = applyPhoneticCorrections(normalizeWordsToNumbers(stripped));
  const { rest: afterExpiry, expiryDate } = extractDictatedExpiry(normalized);
  const { rest } = extractDictatedNote(afterExpiry);
  const clauses = splitCompoundPhrase(rest);
  const items: ParsedStockItem[] = [];
  for (const clause of clauses) {
    const parsed = parseSingleStockItem(clause, products);
    if (parsed) items.push({ ...parsed, isPerishable: !!expiryDate, expiryDate });
  }
  return items;
}

export function parseSingleExpense(clause: string, memory?: AssistantMemory) {
  let core = applyPhoneticCorrections(normalizeWordsToNumbers(clause))
    .replace(/^(?:por favor|quiero|necesito)\s+/i, "")
    .replace(
      /^(?:gast[eé]|gasto\s+de|gasto\s+en|pagu[eé]|pago\s+de|pagar\b|anota\s+gasto|registrar\s+gasto|compr[eé]|cancel[eé]|abon[eé]|invert[ií]|sali[oó]|salieron|liquid[oó]|recib[ií]\s+(?:un\s+)?recibo\s+de|\bpuse\b)\s*/i,
      ""
    )
    .trim();

  let amount = 0;
  const amtMatch = core.match(/(\d+(?:\.\d+)?|un|una|uno|dos|tres|cuatro|cinco|diez|quince|veinte|veinticinco|treinta|cincuenta|cien)/i);
  if (amtMatch) {
    amount = parseNumberWord(amtMatch[1]) || parseFloat(amtMatch[1]) || 0;
    core = core.replace(amtMatch[0], "").trim();
  }

  const hasTransferKeyword = /transferencia|yape|plin|tarjeta|digital|banco/i.test(clause);
  const hasCashKeyword = /efectivo|cash/i.test(clause);
  const methodSpecified = hasTransferKeyword || hasCashKeyword;
  const method: "cash" | "transfer" = hasTransferKeyword
    ? "transfer"
    : hasCashKeyword
    ? "cash"
    : memory?.preferredPaymentMethod || "cash";

  let rawDesc = core
    .replace(/(?:soles|sol|pen|pesos|dolares|lucas|\bso\b|en\s+efectivo|por\s+transferencia|con\s+transferencia|yape|plin)/gi, "")
    .replace(/^(?:de|en|un|una|el|la|por|del)\s+/i, "")
    .trim();

  let category = "Operativos";

  if (/mercader[ií]a|stock|inventario/i.test(clause)) {
    category = "Mercancía";
    if (!rawDesc) rawDesc = "Compra de Mercadería";
  } else if (/pasaje|transporte|taxi|combustible|flete|peaje/i.test(clause)) {
    category = "Transporte";
    if (!rawDesc) rawDesc = "Pasajes";
  } else if (/comida|almuerzo|cena|refrigerio|desayuno|gaseosa/i.test(clause)) {
    category = "Comida";
    if (!rawDesc) rawDesc = "Comida / Refrigerio";
  } else if (/luz|agua|internet|telefono|celular/i.test(clause)) {
    category = "Servicios";
    if (!rawDesc) rawDesc = "Servicios";
  } else if (/alquiler|local|stand/i.test(clause)) {
    category = "Alquiler";
    if (!rawDesc) rawDesc = "Alquiler de local";
  }

  const cleanDesc = rawDesc ? rawDesc.charAt(0).toUpperCase() + rawDesc.slice(1) : "Gasto operativo";

  return {
    kind: "expense" as const,
    amount,
    category,
    note: cleanDesc,
    method,
    methodUnspecified: !methodSpecified,
  };
}

export async function analyzeVoiceIntent(text: string, products: any[]) {
  const memory = await getAssistantMemory();
  let clean = text.trim();

  // 1. Separar números pegados a letras (ej: "5polos" -> "5 polos", "a10soles" -> "a 10 soles")
  clean = clean
    .replace(/(\d+)([a-zA-ZáéíóúñÁÉÍÓÚÑ])/g, "$1 $2")
    .replace(/([a-zA-ZáéíóúñÁÉÍÓÚÑ])(\d+)/g, "$1 $2");

  // 1.5. Números hablados -> dígitos (ej: "cinco" -> "5", "treinta y cinco" -> "35"),
  // antes de que corra cualquier regex de cantidad/precio/consulta.
  clean = applyPhoneticCorrections(normalizeWordsToNumbers(clean));

  // 2. Normalizar decimales hablados con "con" o "punto" (ej: "10 con 50" -> "10.50")
  clean = clean.replace(/(\b\d+)\s+(?:con|punto)\s+(\d{1,2}\b)/gi, "$1.$2");

  // 3. Comando de reposo directo
  if (/(?:descansa\s+pan|apagar\s+asistente|ap[aá]gate|du[eé]rmete|cerrar\s+micr[oó]fono|silencio\s+pan|pancito\s+descansa|mimir)/i.test(clean)) {
    return { kind: "sleep_assistant" };
  }

  // 4. Limpieza estricta de prefijos y wake words
  clean = clean
    .replace(/^(?:oye\s+pan(?:cito)?|oye\s+pam|hola\s+pan(?:cito)?|ey\s+pan(?:cito)?|pancito|pan\s+con\s+miel|pan|pam|van)\s*[,.:;?!-]*\s*/i, "")
    .trim();

  // 5. Limpieza de muletillas iniciales
  clean = clean.replace(/^(?:este|a\s+ver|bueno|mira|porfa|por\s+favor)\s*[,.:;?!-]*\s*/i, "").trim();

  // 5.5. Consulta de atención/saludo: el usuario solo quiere confirmar que
  // Pan sigue escuchando, no está dando una orden todavía.
  if (/(?:me\s+escuchas|me\s+oyes|est[aá]s\s+ah[ií]|^hola\b|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches)/i.test(clean)) {
    return { kind: "attention_check" };
  }

  // 6. Confirmación explícita robusta (exige frases/palabras claras, nunca monosílabos aislados)
  if (/^(?:s[ií]\s+guardar|guardar|confirmar|guardar\s+venta|guardar\s+stock|guardar\s+gasto|correcto\s+guardar|dale\s+guardar)$/i.test(clean)) {
    return { kind: "confirm_hands_free" };
  }

  // 7. Deshacer
  if (/^(?:deshacer|deshaz|cancela\s+lo\s+anterior|borra\s+(?:la\s+)?ultima\s+(?:venta|accion|operacion))/i.test(clean)) {
    return { kind: "undo", lastAction: memory.lastAction };
  }

  // 8. Arqueo de caja
  if (/(?:cerrar\s+caja|arqueo|cuadre\s+de\s+caja|cerrar\s+turno|hacer\s+arqueo)/i.test(clean)) {
    return { kind: "cash_audit" };
  }

  // 9. Ingreso de Stock / Mercadería
  // "Compré"/"comprar" solo abre stock_in cuando el objeto suena a
  // mercadería; si es un gasto personal/operativo ("compré almuerzo") se
  // deja pasar para que lo capture el bloque de Gastos (paso 13).
  const looksLikePersonalExpense =
    /(?:compr[eé]|comprar)/i.test(clean) && PERSONAL_EXPENSE_HINT_RE.test(clean);
  const matchesEstablishedStockVerb =
    !looksLikePersonalExpense &&
    /(?:añadir|anadir|agregar|ingresar|ingreso|ingres[eé]|meter|reabastecer|sumar\s+al\s+stock|comprar|compr[eé]|compras|lleg[oó]\s+mercader[ií]a|compra\s+de)\s+/i.test(clean);
  // Los verbos GENÉRICOS (llegó/recibí/entró/surtir/reponer/cargar) también
  // tienen sentido fuera del comercio ("llegó un cliente", "recibí una
  // llamada", "cargar el celular"), así que exigimos evidencia real de
  // mercadería antes de disparar un ingreso de stock: un sustantivo
  // explícito de almacén/stock/mercadería/unidades, o una cantidad+nombre
  // plausible (coincide con el catálogo, o al menos no es un evento
  // cotidiano como "cliente"/"llamada"). Si además la frase suena a gasto
  // operativo (luz, recibo, celular...), nunca es stock.
  const matchesGenericStockVerb = !looksLikePersonalExpense && GENERIC_STOCK_VERB_TRIGGER_RE.test(clean);
  const genericStockHasEvidence =
    matchesGenericStockVerb &&
    !PERSONAL_EXPENSE_HINT_RE.test(clean) &&
    (EXPLICIT_STOCK_NOUN_RE.test(clean) || genericStockClauseIsPlausible(clean, products));
  const isExplicitStockIn = matchesEstablishedStockVerb || genericStockHasEvidence;
  const isRegisterStock = /registrar\s+(?:nuevo\s+)?(?:producto|inventario|stock|mercader[ií]a|lote)/i.test(clean);
  const isRegisterGeneral = /^(?:registrar|registra)\s+/i.test(clean) && !/[bv]end[ií]|[bv]enta|cobrar|gasto|pago/i.test(clean);
  // "Nuevo producto ..." dictado sin verbo propio ("meter", "añadir", etc.)
  // también implica un alta de inventario.
  const hasNewProductPhrase = /\bnuevo\s+producto\b/i.test(clean);
  // Dictar una fecha de vencimiento ("cinco latas de atún vence 15 de
  // octubre") ya implica un ingreso de stock perecible, aunque no se diga
  // explícitamente "ingresar"/"añadir".
  const hasExpiryClause = !looksLikePersonalExpense && !SALE_TRIGGER_RE.test(clean) && hasDictatedExpiry(clean);

  if (isExplicitStockIn || isRegisterStock || isRegisterGeneral || hasNewProductPhrase || hasExpiryClause) {
    const core = clean.replace(/[.,]/g, " ").trim();
    const { rest: afterExpiry, expiryDate } = extractDictatedExpiry(core);
    const { rest, note } = extractDictatedNote(afterExpiry);
    const stockClauses = splitCompoundPhrase(rest);
    const items: ParsedStockItem[] = [];
    stockClauses.forEach((cl) => {
      const parsed = parseSingleStockItem(cl, products);
      if (parsed) items.push({ ...parsed, isPerishable: !!expiryDate, expiryDate });
    });

    if (items.length === 0) {
      items.push({ name: "Producto", qty: 1, cost: 0, isPerishable: !!expiryDate, expiryDate });
    }

    return { kind: "stock_in", items, note };
  }

  // 10. Cotizaciones
  if (/(?:a\s+cuanto|cuanto\s+deberia|a\s+como\s+[bv]endo|precio\s+de)/i.test(clean)) {
    const numMatch = clean.match(/(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta|cincuenta|cien)\s+([a-záéíóúñ]+)/i);
    let qty = 1;
    let target = "";
    if (numMatch) {
      qty = parseNumberWord(numMatch[1]) || 1;
      target = numMatch[2];
    } else {
      target = clean.replace(/.*(?:[bv]ender|costaria|precio)\s+/i, "").trim();
    }
    return { kind: "quote_query", qty, targetProduct: target };
  }

  // 11. Consultas contables y balances
  // "caja"/"cajas" ya NO dispara esta rama por sí sola (colisionaba con
  // nombres de producto como "caja de leche": "vendí 5 cajas de leche a 20
  // soles" se interpretaba como consulta de arqueo) — solo cuenta una frase
  // de balance explícita y con límite de palabra (CASH_QUERY_RE). Además,
  // una orden transaccional clara -la frase EMPIEZA con un verbo de venta
  // seguido de una cantidad, ej. "vendí 5 cajas..."- tiene prioridad
  // absoluta sobre cualquier consulta, aunque el resto mencione palabras
  // como "stock" o "tengo".
  const startsWithSaleCommand =
    SALE_LEAD_STRIP_RE.test(clean) &&
    /^(?:\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cincuenta|cien)\b/i.test(
      clean.replace(SALE_LEAD_STRIP_RE, "").trim()
    );
  if (
    (/(?:cuanto|cuantos|como\s+va|balance|resumen|reporte|informe|mercaderia|stock|quedan|tengo|estancado|sin\s+[bv]enta|comparar)/i.test(clean) ||
      CASH_QUERY_RE.test(clean)) &&
    !/(?:gaste|anadir|añadir|agregar|ingresar)/i.test(clean) &&
    !startsWithSaleCommand
  ) {

    if (/estancad[oa]s?|sin\s+[bv]ender|sin\s+movimiento/i.test(clean)) {
      return { kind: "query", metric: "stagnant_stock" };
    }
    if (/compar(?:ar|ativa)|respecto\s+a\s+la\s+semana\s+pasada/i.test(clean)) {
      return { kind: "query", metric: "performance_comparison" };
    }
    if (/mercader[ií]a|valor\s+del\s+inventario/i.test(clean)) return { kind: "query", metric: "inventory_value" };
    if (CASH_QUERY_RE.test(clean)) return { kind: "query", metric: "cash_box" };
    if (/reporte\s+del\s+d[ií]a|informe\s+del\s+d[ií]a/i.test(clean)) return { kind: "query", metric: "day_report" };

    if (/cuant[ao]s?\s+([a-záéíóúñ\s]+)\s+(?:me\s+quedan|tengo|hay)/i.test(clean)) {
      const match = clean.match(/cuant[ao]s?\s+([a-záéíóúñ\s]+)\s+(?:me\s+quedan|tengo|hay)/i);
      return { kind: "query", metric: "stock_item", targetProduct: match ? match[1].trim() : "" };
    }

    for (const [mName, mIndex] of Object.entries(MONTH_MAP)) {
      if (clean.toLowerCase().includes(mName)) {
        const metric = /gan/i.test(clean) ? "profit" : /gast/i.test(clean) ? "expenses" : "sales";
        return { kind: "query", metric, specificMonth: mIndex, monthName: mName };
      }
    }

    const range = /semana|semanal/i.test(clean) ? "week" : /mes|mensual/i.test(clean) ? "month" : "today";
    const metric = /gan/i.test(clean) ? "profit" : /gast/i.test(clean) ? "expenses" : /balance|informe|resumen/i.test(clean) ? "balance" : "sales";
    return { kind: "query", metric, range };
  }

  // 12. Mixtas
  const clauses = splitCompoundPhrase(clean);
  const saleClauses = clauses.filter((c) => SALE_TRIGGER_RE.test(c));
  const expenseClauses = clauses.filter((c) => /(?:gast[eé]|gasto|pagu[eé]|pago)/i.test(c));

  if (saleClauses.length > 0 && expenseClauses.length > 0) {
    const isTransfer = /transferencia|yape|plin|tarjeta|digital/i.test(clean);
    const saleItems: ParsedBatchSaleItem[] = [];
    saleClauses.forEach((cl) => {
      const parsed = parseSingleSaleItem(cl, products, memory);
      if (parsed) saleItems.push(parsed);
    });
    const expense = parseSingleExpense(expenseClauses[0], memory);

    return {
      kind: "mixed_batch",
      saleItems,
      salePaymentMethod: isTransfer ? "transfer" : memory.preferredPaymentMethod,
      expense,
    };
  }

  // 13. Gastos
  // "Salió/salieron ... para/al proveedor/de luz" y "liquidó ... deuda/
  // proveedor/cuenta" son GASTO, no venta, aunque compartan raíz de verbo
  // con SALE_VERBS_SRC: se detectan con la misma señal (sin exigir que
  // esté pegada al verbo) para clasificarlos aquí.
  const looksLikeSalioExpense = /sali[oó]|salieron/i.test(clean) && SALIO_EXPENSE_HINT_RE.test(clean);
  const looksLikeLiquidoExpense = /liquid[oó]/i.test(clean) && LIQUIDO_EXPENSE_HINT_RE.test(clean);
  const hasExpenseVerb =
    /(?:gast[eé]|gasto\s+de|gasto|pagu[eé]|pag[oó]\s+de|pag[oó]|\bpagar\b|adquir[ií]|cuenta\s+de|recibo\s+de|se\s+pag[oó]|cancel[eé]|abon[eé]|invert[ií]|\bpuse\b)/i.test(
      clean
    ) ||
    looksLikeSalioExpense ||
    looksLikeLiquidoExpense;
  const hasPurchaseAsExpense = /(?:compr[eé]|comprar)/i.test(clean) && PERSONAL_EXPENSE_HINT_RE.test(clean);
  // "Vendí..." nunca deriva a gasto, aunque la frase mencione de paso el
  // método de pago ("vendí 5 polos con pago en efectivo"): la venta clara
  // tiene prioridad exclusiva sobre cualquier palabra de gasto que se cuele.
  // "salió"/"liquidó" quedan exceptuados de esa regla sin generar conflicto:
  // si ya se detectaron como gasto arriba, el lookahead de SALE_VERBS_SRC
  // tampoco los reconoce como venta.
  if ((hasExpenseVerb || hasPurchaseAsExpense) && !SALE_TRIGGER_RE.test(clean)) {
    return parseSingleExpense(clean, memory);
  }

  // 14. Ventas
  if (SALE_TRIGGER_RE.test(clean)) {
    const isTransfer = /transferencia|yape|plin|tarjeta|digital/i.test(clean);
    const method = isTransfer ? "transfer" : memory.preferredPaymentMethod;
    const batchItems: ParsedBatchSaleItem[] = [];

    clauses.forEach((cl) => {
      const parsed = parseSingleSaleItem(cl, products, memory);
      if (parsed) batchItems.push(parsed);
    });

    if (batchItems.length > 0) {
      const ambiguous = batchItems.find((it) => it.candidates && it.candidates.length > 1);
      if (ambiguous) {
        return {
          kind: "disambiguation",
          targetItem: ambiguous,
          candidates: ambiguous.candidates,
          allItems: batchItems,
          method,
        };
      }
      return { kind: "batch_sale", items: batchItems, method };
    }
  }

  return { kind: "unknown" };
}

// ---------------------------------------------------------------------
// Filtro de eco acústico (Modo Mostrador): defensa adicional sobre el
// apagado físico del micrófono durante el TTS (half-duplex estricto, ver
// finishSpeaking en voice.tsx). Cubre el margen justo alrededor de la
// reapertura del micrófono -sin cancelación de eco por hardware, frecuente
// en altavoz, el parlante puede seguir "sonando" un instante- donde
// todavía podría captarse de vuelta la propia voz de Pan y transcribirse
// como si fuera una orden. TTS_ECHO_BLACKLIST cubre las frases fijas más
// frecuentes que el asistente pronuncia (fallback genérico + prompts
// recurrentes); si el reconocedor las devuelve, deben descartarse en vez
// de procesarse como comando. Deliberadamente NO incluye "sí guardar" ni
// "no cancelar": el usuario SÍ puede -y debe- poder responder eso a la
// propia pregunta de Pan.

// Milisegundos de gracia tras terminar de hablar (onDone/onStopped/
// onError): cubre el margen entre que isSpeakingRef pasa a false y que el
// micrófono, ya reabierto tras el cooldown, entregue su primer resultado.
export const TTS_ECHO_GUARD_MS = 700;

export const TTS_ECHO_BLACKLIST = [
  "no entendi bien",
  "intenta de nuevo",
  "modo mostrador activado",
  "ahora si me voy a mimir",
  "asigna precio al producto antes de guardar",
  "no hay productos en la venta",
  "no hay productos en el ingreso de stock",
  "el pago mixto no suma el total",
  "no encontre ese producto",
  "error al registrar venta",
  "error al guardar el gasto",
  "error al anadir stock",
  "operacion cancelada",
  "revisa el producto en pantalla",
];

export function normalizeForEchoCompare(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¿?¡!.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Fragmentos sueltos que el asistente también pronuncia con frecuencia
// ("algo más", "anotado") pero que, a diferencia de las frases fijas de
// arriba, SÍ podrían aparecer dentro de una orden real del usuario (p.ej.
// "anotado, vendí algo más de pan"). Por eso no se descartan por simple
// substring: isPureFillerEcho() solo los trata como eco si, tras quitarlos
// TODOS, no queda ningún otro texto -es decir, la transcripción completa
// era puramente esas muletillas y nada más.
const ECHO_FILLER_TOKENS = [
  "no entendi",
  "intenta de nuevo",
  "venta guardada",
  "modo mostrador",
  "por el",
  "algo mas",
  "anotado",
];

function isPureFillerEcho(norm: string): boolean {
  if (!norm) return false;
  let remaining = norm;
  for (const token of ECHO_FILLER_TOKENS) {
    remaining = remaining.split(token).join(" ");
  }
  return remaining.replace(/\s+/g, "").length === 0;
}

export function isKnownAssistantPhrase(rawText: string): boolean {
  const norm = normalizeForEchoCompare(rawText);
  if (!norm) return false;
  if (TTS_ECHO_BLACKLIST.some((phrase) => norm.includes(phrase))) return true;
  return isPureFillerEcho(norm);
}

// ---------------------------------------------------------------------
// Validación de la tarjeta de venta multi-ítem al confirmar por voz o por
// botón ("sí guardar"): única fuente de verdad para las reglas que pueden
// bloquear el guardado (precio faltante, pago mixto que no cuadra). Se
// extrae de voice.tsx para poder probarla sin depender de refs/estado de
// React -y para que la máquina de confirmación (isAwaitingVoiceConfirmRef)
// sepa, a partir del mismo resultado, si debe seguir esperando una
// corrección o si la venta ya quedó lista para persistir.
export interface BatchSaleValidationItem {
  qty: number;
  unit_price: number;
}

export interface BatchSaleValidationResult<T extends BatchSaleValidationItem> {
  ok: boolean;
  reason?: string;
  totalAmount: number;
  payments?: { method: "cash" | "transfer"; amount: number }[];
  // Lista efectivamente usada para el total/guardado, ya sin los ítems
  // fantasma purgados (ver más abajo). Se expone siempre -incluso cuando
  // ok === false- para que la UI pueda reflejar la purga aunque el pago
  // mixto u otra regla termine bloqueando el guardado.
  validItems: T[];
}

export function validateBatchSaleForConfirm<T extends BatchSaleValidationItem>(
  items: T[],
  method: "cash" | "transfer" | "mixed",
  cashAmount: number,
  transferAmount: number
): BatchSaleValidationResult<T> {
  // Purga automática de ítems fantasma (precio <= 0): una muletilla o un
  // fragmento del propio TTS que se cuela por el micrófono a veces se
  // interpreta como un producto dictado sin precio. Bloquear TODA la venta
  // por ese ítem accidental obliga a repetir de palabra productos que sí se
  // reconocieron bien, así que se descartan en silencio siempre que quede
  // al menos un ítem con precio real -si NINGUNO tiene precio, no hay nada
  // que purgar y se sigue pidiendo que se asigne uno, como antes.
  const priced = items.filter((it) => it.unit_price > 0);
  const validItems = priced.length > 0 ? priced : items;
  const totalAmount = validItems.reduce((acc, it) => acc + it.qty * it.unit_price, 0);

  if (validItems.length === 0) {
    return { ok: false, reason: "No hay productos en la venta.", totalAmount, validItems };
  }
  if (priced.length === 0) {
    return { ok: false, reason: "Asigna precio al producto antes de guardar.", totalAmount, validItems };
  }

  if (method === "mixed") {
    const payments: { method: "cash" | "transfer"; amount: number }[] = [];
    if (cashAmount > 0) payments.push({ method: "cash", amount: cashAmount });
    if (transferAmount > 0) payments.push({ method: "transfer", amount: transferAmount });
    if (payments.length === 0 || Math.round((cashAmount + transferAmount) * 100) !== Math.round(totalAmount * 100)) {
      return {
        ok: false,
        reason: "El pago mixto no suma el total. Revisa efectivo y transferencia en pantalla.",
        totalAmount,
        validItems,
      };
    }
    return { ok: true, totalAmount, payments, validItems };
  }

  return { ok: true, totalAmount, payments: [{ method, amount: totalAmount }], validItems };
}
