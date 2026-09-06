#!/usr/bin/env node
// Pruebas unitarias ligeras del clasificador de intenciones de voz y de la
// máquina de estados de confirmación del Modo Mostrador
// (src/utils/assistantEngine.ts), sin depender de un framework de tests:
// el proyecto no tiene jest configurado, así que este script corre con
// `node --experimental-strip-types` (Node 22.6+) importando el .ts
// directamente. Ver npm script "test:voice-parser".
import {
  analyzeVoiceIntent,
  parseSingleExpense,
  classifyConfirmCommand,
  matchProducts,
  isKnownAssistantPhrase,
  validateBatchSaleForConfirm,
} from "../src/utils/assistantEngine.ts";

let failures = 0;
let total = 0;

function check(label, ok, details) {
  total++;
  if (ok) {
    console.log(`PASS  ${label}`);
  } else {
    failures++;
    console.error(`FAIL  ${label}`);
    if (details) console.error(`      ${details}`);
  }
}

// ---------------------------------------------------------------------
// Suite 1: parser de ventas (verbos vendí/cobré/pagaron, tolerancia
// fonética, normalizador de números).
// ---------------------------------------------------------------------
const PRODUCTS = [
  { name: "Polos", price: 10, stock: 50 },
  { name: "Paletas", price: 5, stock: 50 },
  { name: "Buzo", price: 35, stock: 20 },
];

const saleCases = [
  {
    label: 'vendí cinco polos a diez soles -> VENTA, cantidad 5, precio 10',
    phrase: "vendí cinco polos a diez soles",
    expect: { kind: "batch_sale", qty: 5, unit_price: 10, name: "Polos" },
  },
  {
    label: 'cobré 20 soles por 2 paletas -> VENTA, cantidad 2, precio 10 (total 20)',
    phrase: "cobré 20 soles por 2 paletas",
    expect: { kind: "batch_sale", qty: 2, unit_price: 10, name: "Paletas" },
  },
  {
    label: 'me pagaron 40 por un buzo -> VENTA, cantidad 1, precio 40',
    phrase: "me pagaron 40 por un buzo",
    expect: { kind: "batch_sale", qty: 1, unit_price: 40, name: "Buzo" },
  },
  {
    label: 'pagaron 40 por un buzo (verbo sin "me") -> VENTA, cantidad 1, precio 40',
    phrase: "pagaron 40 por un buzo",
    expect: { kind: "batch_sale", qty: 1, unit_price: 40, name: "Buzo" },
  },
  {
    label: 'vendí cinco pueblos a 10 soles (tolerancia fonética "pueblos"->"polos") -> VENTA',
    phrase: "vendí cinco pueblos a 10 soles",
    expect: { kind: "batch_sale", qty: 5, unit_price: 10, name: "Polos" },
  },
];

for (const { label, phrase, expect } of saleCases) {
  const result = await analyzeVoiceIntent(phrase, PRODUCTS);
  const item = result.items?.[0];
  const ok =
    result.kind === expect.kind &&
    item?.qty === expect.qty &&
    item?.unit_price === expect.unit_price &&
    item?.name === expect.name;
  check(label, ok, `esperado: ${JSON.stringify(expect)} | obtenido: kind=${result.kind} item=${JSON.stringify(item)}`);
}

// ---------------------------------------------------------------------
// Suite 2: vocabulario de confirmación/cancelación de la tarjeta (Modo
// Mostrador) — debe reconocerse en cualquier momento posterior a la
// apertura de la tarjeta, sin importar mayúsculas/acentos.
// ---------------------------------------------------------------------
const confirmWords = [
  "sí guardar", "si guardar", "guardar", "confirmar", "sí", "si", "listo",
  "guardar gasto", "guardar venta", "confirma", "proceder", "grabar",
];
for (const w of confirmWords) {
  check(`classifyConfirmCommand("${w}") === "confirm"`, classifyConfirmCommand(w) === "confirm");
}

const cancelWords = ["no cancelar", "cancelar", "descartar", "borrar", "no", "eliminar"];
for (const w of cancelWords) {
  check(`classifyConfirmCommand("${w}") === "cancel"`, classifyConfirmCommand(w) === "cancel");
}

// La directiva pide validar explícitamente que, con una tarjeta de
// confirmación abierta, estas frases sigan clasificando correctamente
// incluso con puntuación/mayúsculas variables tal como las devuelve el STT.
const directiveConfirmPhrases = ["Sí, guardar!", "SI GUARDAR", "Guardar.", "¡Confirma!"];
for (const phrase of directiveConfirmPhrases) {
  check(
    `classifyConfirmCommand("${phrase}") === "confirm" (puntuación/mayúsculas variables del STT)`,
    classifyConfirmCommand(phrase) === "confirm"
  );
}
const directiveCancelPhrases = ["No, cancelar.", "CANCELAR", "Descartar!"];
for (const phrase of directiveCancelPhrases) {
  check(
    `classifyConfirmCommand("${phrase}") === "cancel" (puntuación/mayúsculas variables del STT)`,
    classifyConfirmCommand(phrase) === "cancel"
  );
}

check(
  'classifyConfirmCommand("cincuenta soles en chocolate") === null (no es confirmación ni cancelación)',
  classifyConfirmCommand("cincuenta soles en chocolate") === null
);

// ---------------------------------------------------------------------
// Suite 3: simulación de la máquina de estados de la tarjeta de Gasto en
// Modo Mostrador — reproduce, con las mismas funciones exportadas que usa
// voice.tsx, el flujo: detectar gasto -> abrir tarjeta -> (opcional
// corrección verbal) -> confirmar -> guardar.
// ---------------------------------------------------------------------
function openExpenseCardFrom(intent) {
  return {
    activeCard: "expense",
    awaitingConfirm: true,
    fields: {
      description: intent.note || "Gasto general",
      category: intent.category || "Operativos",
      amount: intent.amount || 0,
      method: intent.method || "cash",
    },
  };
}

// Reproduce la rama agregada en voice.tsx: mientras la tarjeta de gasto
// está abierta, un comando no confirma ni cancela, y clasifica como una
// corrección dictada, así que se reparsea y actualiza en el sitio.
function applyVoiceCommandToExpenseCard(card, text) {
  const cmd = classifyConfirmCommand(text);
  if (cmd === "confirm") return { ...card, awaitingConfirm: false, action: "save" };
  if (cmd === "cancel") return { ...card, awaitingConfirm: false, action: "cancel" };

  const updated = parseSingleExpense(text);
  if (updated && updated.amount > 0) {
    return {
      ...card,
      fields: {
        description: updated.note || "Gasto general",
        category: updated.category || "Operativos",
        amount: updated.amount,
        method: updated.methodUnspecified ? card.fields.method : updated.method,
      },
    };
  }
  return card; // silencio/ruido: la tarjeta permanece sin cambios
}

{
  // gasto detectado -> tarjeta abierta -> "sí guardar" -> ejecuta saveExpense() con éxito
  const intent = await analyzeVoiceIntent("gasté 30 soles en transporte", []);
  check('"gasté 30 soles en transporte" se detecta como gasto', intent.kind === "expense" && intent.amount === 30);

  let card = openExpenseCardFrom(intent);
  check("tarjeta de gasto abierta con monto 30", card.activeCard === "expense" && card.awaitingConfirm && card.fields.amount === 30);

  let saveExpenseCalled = null;
  card = applyVoiceCommandToExpenseCard(card, "sí guardar");
  if (card.action === "save") {
    saveExpenseCalled = { ...card.fields };
  }
  check(
    '"sí guardar" ejecuta saveExpense() con el monto detectado (30)',
    card.awaitingConfirm === false && saveExpenseCalled?.amount === 30
  );
}

{
  // gasto detectado -> actualización verbal intermedia -> "guardar" -> persiste y cierra tarjeta
  const intent = await analyzeVoiceIntent("gasté 30 soles en transporte", []);
  let card = openExpenseCardFrom(intent);

  card = applyVoiceCommandToExpenseCard(card, "cincuenta soles en chocolate");
  check(
    "corrección verbal intermedia actualiza el monto (30 -> 50) sin cerrar la tarjeta",
    card.awaitingConfirm === true && card.fields.amount === 50 && !card.action
  );

  let saveExpenseCalled = null;
  card = applyVoiceCommandToExpenseCard(card, "guardar");
  if (card.action === "save") {
    saveExpenseCalled = { ...card.fields };
  }
  check(
    '"guardar" persiste el monto ya corregido (50) y cierra la tarjeta',
    card.awaitingConfirm === false && card.action === "save" && saveExpenseCalled?.amount === 50
  );
}

// ---------------------------------------------------------------------
// Suite 4: nuevos sinónimos de voz — verbos de VENTA (despaché/salió/
// facturé/boletié/entregué/liquidó), GASTO (compré/cancelé/aboné/invertí/
// "salió para"/puse) e INGRESO DE STOCK (llegó/recibí/entró/surtir/
// reponer/cargar). El parser es el mismo en modo directo y en Modo
// Mostrador (continuo), así que una sola pasada por analyzeVoiceIntent
// cubre ambos.
// ---------------------------------------------------------------------
const SALE_TEST_PRODUCTS = [...PRODUCTS, { name: "Gaseosas", price: 9, stock: 50 }];
const newSaleVerbCases = [
  { phrase: "despaché 3 gaseosas a 9 soles", qty: 3, unit_price: 9 },
  { phrase: "despache 2 gaseosas a 9 soles", qty: 2, unit_price: 9 },
  { phrase: "despacho 1 gaseosa a 9 soles", qty: 1, unit_price: 9 },
  { phrase: "salió 1 polo a 40 soles", qty: 1, unit_price: 40 },
  { phrase: "salio 1 polo a 40 soles", qty: 1, unit_price: 40 },
  { phrase: "salieron 2 polos a 40", qty: 2, unit_price: 40 },
  { phrase: "facturé 1 buzo a 35 soles", qty: 1, unit_price: 35 },
  { phrase: "facture 2 buzos a 35 soles", qty: 2, unit_price: 35 },
  { phrase: "boletié 1 paleta a 5 soles", qty: 1, unit_price: 5 },
  { phrase: "boletie 2 paletas a 5 soles", qty: 2, unit_price: 5 },
  { phrase: "entregué 3 polos a 10 soles", qty: 3, unit_price: 10 },
  { phrase: "entregue 1 polo a 10 soles", qty: 1, unit_price: 10 },
  { phrase: "liquidó 2 buzos a 35 soles", qty: 2, unit_price: 35 },
  { phrase: "liquido 1 buzo a 35 soles", qty: 1, unit_price: 35 },
];
for (const { phrase, qty, unit_price } of newSaleVerbCases) {
  const result = await analyzeVoiceIntent(phrase, SALE_TEST_PRODUCTS);
  const item = result.items?.[0];
  const ok = result.kind === "batch_sale" && item?.qty === qty && item?.unit_price === unit_price;
  check(
    `"${phrase}" -> VENTA cantidad ${qty}, precio ${unit_price}`,
    ok,
    `obtenido: kind=${result.kind} item=${JSON.stringify(item)}`
  );
}

const newExpenseVerbCases = [
  { phrase: "compré bolsas por 12 soles", amount: 12 },
  { phrase: "compre bolsas por 12 soles", amount: 12 },
  { phrase: "cancelé 50 soles de luz", amount: 50 },
  { phrase: "cancele 50 soles de luz", amount: 50 },
  { phrase: "aboné 20 soles de agua", amount: 20 },
  { phrase: "abone 20 soles de agua", amount: 20 },
  { phrase: "invertí 100 soles en transporte", amount: 100 },
  { phrase: "inverti 100 soles en transporte", amount: 100 },
  { phrase: "salió para luz 30 soles", amount: 30 },
  { phrase: "salio para agua 20 soles", amount: 20 },
  { phrase: "puse 50 soles de mi bolsillo", amount: 50 },
];
for (const { phrase, amount } of newExpenseVerbCases) {
  const result = await analyzeVoiceIntent(phrase, []);
  const ok = result.kind === "expense" && result.amount === amount;
  check(`"${phrase}" -> GASTO monto ${amount}`, ok, `obtenido: kind=${result.kind} amount=${result.amount}`);
}

const newStockVerbCases = [
  { phrase: "llegaron 20 galletas a 1 sol", qty: 20, cost: 1 },
  { phrase: "llegó 10 polos a 5 soles", qty: 10, cost: 5 },
  { phrase: "llego 10 polos a 5 soles", qty: 10, cost: 5 },
  { phrase: "recibí 10 polos", qty: 10, cost: 0 },
  { phrase: "recibi 5 buzos a 30 soles", qty: 5, cost: 30 },
  { phrase: "entró 8 paletas a 3 soles", qty: 8, cost: 3 },
  { phrase: "entro 8 paletas a 3 soles", qty: 8, cost: 3 },
  { phrase: "entraron 15 polos a 5 soles", qty: 15, cost: 5 },
  { phrase: "surtir 20 galletas a 1 sol", qty: 20, cost: 1 },
  { phrase: "reponer 12 polos a 5 soles", qty: 12, cost: 5 },
  { phrase: "cargar 6 buzos a 30 soles", qty: 6, cost: 30 },
];
for (const { phrase, qty, cost } of newStockVerbCases) {
  const result = await analyzeVoiceIntent(phrase, PRODUCTS);
  const item = result.items?.[0];
  const ok = result.kind === "stock_in" && item?.qty === qty && item?.cost === cost;
  check(
    `"${phrase}" -> INGRESO DE STOCK cantidad ${qty}, costo ${cost}`,
    ok,
    `obtenido: kind=${result.kind} item=${JSON.stringify(item)}`
  );
}

// ---------------------------------------------------------------------
// Suite 5: corrección crítica de desambiguación (auditoría de blindaje del
// parser) — colisión "caja/cajas" vs. consulta de arqueo, verbos genéricos
// de stock sin evidencia real de mercadería, "salió"/"liquidó" como gasto
// (no venta), y "bolsas" como gasto operativo exclusivo.
// ---------------------------------------------------------------------
const CAJA_TEST_PRODUCTS = [
  { name: "Caja de leche", price: 20, stock: 30 },
  { name: "Cajas de huevos", price: 15, stock: 20 },
];

{
  const r = await analyzeVoiceIntent("vendí 5 cajas de leche a 20 soles", CAJA_TEST_PRODUCTS);
  const item = r.items?.[0];
  check(
    '"vendí 5 cajas de leche a 20 soles" -> VENTA (no consulta de caja), cantidad 5, precio 20',
    r.kind === "batch_sale" && item?.qty === 5 && item?.unit_price === 20,
    `obtenido: kind=${r.kind} item=${JSON.stringify(item)}`
  );
}
{
  const r = await analyzeVoiceIntent("ingresé 10 cajas de huevos a 15 soles", CAJA_TEST_PRODUCTS);
  const item = r.items?.[0];
  check(
    '"ingresé 10 cajas de huevos a 15 soles" -> INGRESO DE STOCK, cantidad 10, costo 15',
    r.kind === "stock_in" && item?.qty === 10 && item?.cost === 15,
    `obtenido: kind=${r.kind} item=${JSON.stringify(item)}`
  );
}
{
  const r = await analyzeVoiceIntent("cuánto hay en caja", []);
  check(
    '"cuánto hay en caja" -> consulta de arqueo (cash_box)',
    r.kind === "query" && r.metric === "cash_box",
    `obtenido: ${JSON.stringify(r)}`
  );
}

const abstractStockPhrases = [
  "llegó un cliente",
  "recibí una llamada",
  "entraron dos personas a la tienda",
  "cargar 20 soles a mi celular",
];
for (const phrase of abstractStockPhrases) {
  const r = await analyzeVoiceIntent(phrase, PRODUCTS);
  check(
    `"${phrase}" -> NO crea ingreso de stock fantasma (kind !== stock_in)`,
    r.kind !== "stock_in",
    `obtenido: ${JSON.stringify(r)}`
  );
}
{
  const r = await analyzeVoiceIntent("recibí un recibo de luz de 50 soles", []);
  check(
    '"recibí un recibo de luz de 50 soles" -> GASTO (no stock), monto 50',
    r.kind === "expense" && r.amount === 50,
    `obtenido: ${JSON.stringify(r)}`
  );
}
{
  const r = await analyzeVoiceIntent("llegaron 20 galletas a 1 sol", PRODUCTS);
  const item = r.items?.[0];
  check(
    '"llegaron 20 galletas a 1 sol" -> sigue siendo INGRESO DE STOCK (producto nuevo, no en catálogo)',
    r.kind === "stock_in" && item?.qty === 20 && item?.cost === 1,
    `obtenido: kind=${r.kind} item=${JSON.stringify(item)}`
  );
}

const salioLiquidoExpenseCases = [
  { phrase: "salió dinero para pagar la luz, 30 soles", amount: 30 },
  { phrase: "salieron 30 soles para luz", amount: 30 },
  { phrase: "liquidó su deuda con el proveedor, 200 soles", amount: 200 },
];
for (const { phrase, amount } of salioLiquidoExpenseCases) {
  const r = await analyzeVoiceIntent(phrase, []);
  check(
    `"${phrase}" -> GASTO (no venta), monto ${amount}`,
    r.kind === "expense" && r.amount === amount,
    `obtenido: ${JSON.stringify(r)}`
  );
}
{
  const r = await analyzeVoiceIntent("salieron 2 polos a 40 soles", PRODUCTS);
  const item = r.items?.[0];
  check(
    '"salieron 2 polos a 40 soles" -> sigue siendo VENTA física, cantidad 2, precio 40',
    r.kind === "batch_sale" && item?.qty === 2 && item?.unit_price === 40,
    `obtenido: kind=${r.kind} item=${JSON.stringify(item)}`
  );
}
{
  const r = await analyzeVoiceIntent("compré 50 bolsas a 0.10 soles", []);
  check(
    '"compré 50 bolsas a 0.10 soles" -> GASTO operativo exclusivo (nunca stock), monto 50',
    r.kind === "expense" && r.amount === 50,
    `obtenido: ${JSON.stringify(r)}`
  );
}

// ---------------------------------------------------------------------
// Suite 6: fuzzy matching 100% local (distancia de edición) contra el
// catálogo — sin depender de ningún servicio externo ni backend de IA,
// tolera errores de transcripción del reconocimiento de voz que el match
// exacto/de subcadena no detecta.
// ---------------------------------------------------------------------
const FUZZY_PRODUCTS = [
  { name: "Polos", price: 10, stock: 50 },
  { name: "Gaseosa", price: 5, stock: 50 },
  { name: "Chocolate", price: 8, stock: 30 },
];

const fuzzyMatchCases = [
  { dictated: "poloh", expected: "Polos" },
  { dictated: "gaseoza", expected: "Gaseosa" },
  { dictated: "chocolatee", expected: "Chocolate" },
];
for (const { dictated, expected } of fuzzyMatchCases) {
  const { match } = matchProducts(dictated, FUZZY_PRODUCTS);
  check(
    `matchProducts("${dictated}") tolera el error de transcripción -> "${expected}"`,
    match?.name === expected,
    `obtenido: ${JSON.stringify(match)}`
  );
}

{
  const { match, candidates } = matchProducts("zapatos", FUZZY_PRODUCTS);
  check(
    'matchProducts("zapatos") NO fuerza una coincidencia con un producto totalmente distinto del catálogo',
    match === null && candidates.length === 0,
    `obtenido: match=${JSON.stringify(match)} candidates=${JSON.stringify(candidates)}`
  );
}

{
  // De extremo a extremo: la venta se resuelve pese al error de
  // transcripción, sin ninguna llamada de red (analyzeVoiceIntent solo usa
  // el catálogo local que ya se le pasa por parámetro).
  const r = await analyzeVoiceIntent("vendí 3 poloh a 10 soles", FUZZY_PRODUCTS);
  const item = r.items?.[0];
  check(
    '"vendí 3 poloh a 10 soles" (typo de voz) -> VENTA reconocida contra el catálogo local, cantidad 3',
    r.kind === "batch_sale" && item?.qty === 3 && item?.name === "Polos",
    `obtenido: kind=${r.kind} item=${JSON.stringify(item)}`
  );
}

// ---------------------------------------------------------------------
// Suite: filtro de eco acústico del Modo Mostrador (isKnownAssistantPhrase).
// Verifica que las frases que la propia app emite por TTS -y que el
// micrófono podría captar de vuelta por el parlante- se detecten como eco
// y se descarten, sin bloquear los comandos reales de confirmación que se
// le parecen ("sí guardar", "no cancelar").
// ---------------------------------------------------------------------
const echoPhrases = [
  "No entendí bien. Intenta de nuevo, por ejemplo: vendí cinco polos a diez soles.",
  "no entendí bien",
  "Intenta de nuevo.",
  "Tuve un problema procesando eso. Intenta de nuevo.",
  "Modo mostrador activado. Puedes decir Pan, Oye Pan o tu orden.",
  "Ahora si me voy a mimir.",
  "AHORA SI ME VOY A MIMIR",
  "Asigna precio al producto antes de guardar.",
  "No hay productos en la venta.",
  "No hay productos en el ingreso de stock.",
  "El pago mixto no suma el total. Revisa efectivo y transferencia en pantalla.",
  "No encontré ese producto, repítemelo por favor.",
  "Error al registrar venta.",
  "Error al guardar el gasto.",
  "Error al añadir stock.",
  "Operación cancelada.",
  "Anotado 2 Polos, pero revisa el producto en pantalla. ¿Algo más?",
  // Fragmentos sueltos (ver ECHO_FILLER_TOKENS/isPureFillerEcho): se
  // descartan SOLO cuando la transcripción completa se reduce a nada más
  // que esas muletillas -señal clara de que es puro eco del propio TTS,
  // no una orden real del usuario que simplemente las mencione de paso-.
  "algo más",
  "anotado",
  "Venta guardada",
  "no entendí",
  "modo mostrador",
  "por él",
];
for (const phrase of echoPhrases) {
  check(
    `isKnownAssistantPhrase(${JSON.stringify(phrase)}) === true (eco de TTS)`,
    isKnownAssistantPhrase(phrase) === true
  );
}

const genuineUserPhrases = [
  "sí guardar",
  "guardar venta",
  "no cancelar",
  "cancelar",
  "vendí cinco polos a diez soles",
  "sí",
  "no",
  "",
  // Aunque "algo más"/"anotado" solos se traten como eco puro, la misma
  // palabra dentro de una orden real con contenido propio NO debe
  // descartarse: isPureFillerEcho exige que después de quitar todas las
  // muletillas no quede ningún otro texto.
  "anotado, vendí algo más de pan",
  "vendí dos panes más",
];
for (const phrase of genuineUserPhrases) {
  check(
    `isKnownAssistantPhrase(${JSON.stringify(phrase)}) === false (comando real del usuario)`,
    isKnownAssistantPhrase(phrase) === false
  );
}

// ---------------------------------------------------------------------
// Suite: validación de la tarjeta de venta multi-ítem al confirmar
// ("sí guardar"). Simula el escenario de la directiva: una lista de 4+
// productos que debe guardarse íntegramente, y los casos donde una
// validación legítima (precio faltante, pago mixto que no cuadra) debe
// bloquear el guardado con un mensaje claro, sin lanzar excepciones.
// ---------------------------------------------------------------------
const fourItemSale = [
  { qty: 2, unit_price: 10 },
  { qty: 1, unit_price: 35 },
  { qty: 5, unit_price: 5 },
  { qty: 3, unit_price: 8 },
];

{
  const r = validateBatchSaleForConfirm(fourItemSale, "cash", 0, 0);
  check(
    "validateBatchSaleForConfirm: venta de 4 ítems con precios válidos -> ok=true",
    r.ok === true && r.totalAmount === 104 && r.payments?.[0]?.amount === 104,
    `obtenido: ${JSON.stringify(r)}`
  );
}

{
  const r = validateBatchSaleForConfirm(fourItemSale, "transfer", 0, 0);
  check(
    'validateBatchSaleForConfirm: método "transfer" se respeta en el payment resultante',
    r.ok === true && r.payments?.[0]?.method === "transfer",
    `obtenido: ${JSON.stringify(r)}`
  );
}

{
  const r = validateBatchSaleForConfirm(fourItemSale, "mixed", 50, 54);
  check(
    "validateBatchSaleForConfirm: pago mixto que sí suma el total -> ok=true con 2 payments",
    r.ok === true && r.payments?.length === 2,
    `obtenido: ${JSON.stringify(r)}`
  );
}

{
  // Ítem fantasma (eco/muletilla del TTS interpretada como producto sin
  // precio dictado): con otros ítems válidos en la lista, se purga en
  // silencio y la venta se guarda con los productos reales, en vez de
  // bloquear toda la transacción por ese ítem accidental.
  const withGhostItem = [...fourItemSale, { qty: 1, unit_price: 0 }];
  const r = validateBatchSaleForConfirm(withGhostItem, "cash", 0, 0);
  check(
    "validateBatchSaleForConfirm: ítem fantasma con precio 0 se purga -> ok=true con los demás ítems",
    r.ok === true && r.validItems.length === 4 && r.totalAmount === 104,
    `obtenido: ${JSON.stringify(r)}`
  );
}

{
  // Si TODOS los ítems están sin precio, no hay nada que purgar: sigue
  // bloqueando y pidiendo que se asigne un precio, como antes.
  const allUnpriced = [
    { qty: 1, unit_price: 0 },
    { qty: 2, unit_price: 0 },
  ];
  const r = validateBatchSaleForConfirm(allUnpriced, "cash", 0, 0);
  check(
    "validateBatchSaleForConfirm: TODOS los ítems sin precio bloquea el guardado (no hay nada que purgar)",
    r.ok === false && r.reason === "Asigna precio al producto antes de guardar." && r.validItems.length === 2,
    `obtenido: ${JSON.stringify(r)}`
  );
}

{
  const r = validateBatchSaleForConfirm([], "cash", 0, 0);
  check(
    "validateBatchSaleForConfirm: lista vacía bloquea el guardado",
    r.ok === false && r.reason === "No hay productos en la venta." && r.validItems.length === 0,
    `obtenido: ${JSON.stringify(r)}`
  );
}

{
  const r = validateBatchSaleForConfirm(fourItemSale, "mixed", 50, 20);
  check(
    "validateBatchSaleForConfirm: pago mixto que NO suma el total bloquea el guardado",
    r.ok === false && r.reason.includes("pago mixto"),
    `obtenido: ${JSON.stringify(r)}`
  );
}

if (failures > 0) {
  console.error(`\n${failures} de ${total} pruebas fallaron.`);
  process.exit(1);
}
console.log(`\n${total} pruebas de voz (parser + máquina de confirmación) pasaron correctamente.`);
