#!/usr/bin/env node
// Pruebas unitarias ligeras del clasificador de intenciones de voz
// (src/utils/financeVoice.ts): Ingreso / Gasto / Nota, sin depender de un
// framework de tests -el proyecto no tiene jest configurado, así que este
// script corre con `node --experimental-strip-types` (Node 22.6+)
// importando el .ts directamente. Ver npm script "test:voice-parser".
import { analyzeFinanceIntent, matchCategory, classifyConfirmCommand, normalizeWordsToNumbers } from "../src/utils/financeVoice.ts";

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
// normalizeWordsToNumbers: convierte números hablados a dígitos.
// ---------------------------------------------------------------------
check(
  'normalizeWordsToNumbers("cuarenta y cinco") === "45"',
  normalizeWordsToNumbers("cuarenta y cinco") === "45"
);
check('normalizeWordsToNumbers("veinte") === "20"', normalizeWordsToNumbers("veinte") === "20");

// ---------------------------------------------------------------------
// analyzeFinanceIntent: al menos 10 variantes por intención, per directiva.
// ---------------------------------------------------------------------
const INGRESO_PHRASES = [
  "ingreso de 100 soles",
  "ingresé 50 soles de un amigo",
  "gané 200 soles en la rifa",
  "cobré 80 soles del trabajo",
  "me pagaron 300 soles",
  "recibí 40 soles de mi hermano",
  "depósito de 500 soles",
  "abono de 60 soles",
  "venta extra de 25 soles",
  "propina de 10 soles",
];
for (const phrase of INGRESO_PHRASES) {
  const result = analyzeFinanceIntent(phrase);
  check(`Ingreso: "${phrase}" -> kind=ingreso`, result.kind === "ingreso", `obtenido: ${JSON.stringify(result)}`);
}

const GASTO_PHRASES = [
  "gasto de 30 soles",
  "gasté 45 soles en el mercado",
  "compré 20 soles de pan",
  "pagué 15 soles de pasaje",
  "consumo de 12 soles",
  "salida de 100 soles",
  "descuento de 5 soles",
  "egreso de 70 soles",
  "costo de 90 soles",
  "débito de 25 soles",
];
for (const phrase of GASTO_PHRASES) {
  const result = analyzeFinanceIntent(phrase);
  check(`Gasto: "${phrase}" -> kind=gasto`, result.kind === "gasto", `obtenido: ${JSON.stringify(result)}`);
}

const NOTA_PHRASES = [
  "nota comprar pan mañana",
  "anota que debo pagar la luz",
  "apunta llamar al doctor",
  "acuérdate de la reunión",
  "recuerda sacar la basura",
  "recuérdame llamar a mamá",
  "no olvidar el cumpleaños",
  "pendiente pagar el alquiler",
  "tarea revisar el correo",
  "aviso reunión el lunes",
  "alarma para las 8",
];
for (const phrase of NOTA_PHRASES) {
  const result = analyzeFinanceIntent(phrase);
  check(`Nota: "${phrase}" -> kind=nota`, result.kind === "nota", `obtenido: ${JSON.stringify(result)}`);
}

// ---------------------------------------------------------------------
// Extracción de monto y método de pago.
// ---------------------------------------------------------------------
{
  const r = analyzeFinanceIntent("gasté 45 soles en transporte");
  check("extrae el monto dictado (45)", r.amount === 45, `obtenido: ${r.amount}`);
}
{
  const r = analyzeFinanceIntent("gasté 20 soles con tarjeta");
  check('detecta método "transferencia" (tarjeta)', r.method === "transferencia", `obtenido: ${r.method}`);
}
{
  const r = analyzeFinanceIntent("gasté 20 soles en efectivo");
  check('detecta método "efectivo"', r.method === "efectivo", `obtenido: ${r.method}`);
}

// ---------------------------------------------------------------------
// stripTrigger: el verbo/expresión disparadora dictado CON tilde (muy
// común en habla natural: "gasté", "compré", "ingresé", "recuérdame",
// "acuérdate") debe recortarse del concepto igual que su forma sin tilde
// -los disparadores están definidos sin tildes para tolerar transcripciones
// sin acentos, así que el recorte no puede depender de una coincidencia
// literal exacta contra el texto tal como se dictó-.
// ---------------------------------------------------------------------
check(
  '"gasté 45 soles en transporte" -> note="transporte" (sin el verbo pegado)',
  analyzeFinanceIntent("gasté 45 soles en transporte").note === "transporte",
  `obtenido: "${analyzeFinanceIntent("gasté 45 soles en transporte").note}"`
);
check(
  '"compré 20 soles de pan" -> note="pan"',
  analyzeFinanceIntent("compré 20 soles de pan").note === "pan",
  `obtenido: "${analyzeFinanceIntent("compré 20 soles de pan").note}"`
);
check(
  '"ingresé 50 soles de un amigo" -> note="un amigo"',
  analyzeFinanceIntent("ingresé 50 soles de un amigo").note === "un amigo",
  `obtenido: "${analyzeFinanceIntent("ingresé 50 soles de un amigo").note}"`
);
check(
  '"recuérdame llamar a mamá" -> note="llamar a mamá" (sin "recuérdame")',
  analyzeFinanceIntent("recuérdame llamar a mamá").note === "llamar a mamá",
  `obtenido: "${analyzeFinanceIntent("recuérdame llamar a mamá").note}"`
);
check(
  '"acuérdate de la reunión" -> note no incluye el verbo "acuérdate"',
  !analyzeFinanceIntent("acuérdate de la reunión").note.toLowerCase().includes("acuérdate"),
  `obtenido: "${analyzeFinanceIntent("acuérdate de la reunión").note}"`
);
check(
  '"me pagaron 300 soles" -> note vacío (todo el texto era el disparador + monto)',
  analyzeFinanceIntent("me pagaron 300 soles").note === "",
  `obtenido: "${analyzeFinanceIntent("me pagaron 300 soles").note}"`
);

// ---------------------------------------------------------------------
// matchCategory: auto-clasificación contra categorías ya creadas.
// ---------------------------------------------------------------------
{
  const categories = [{ name: "Transporte" }, { name: "Comida" }, { name: "Alquiler" }];
  check(
    "matchCategory encuentra 'Transporte' dentro del concepto dictado",
    matchCategory("en transporte al trabajo", categories) === "Transporte"
  );
  check("matchCategory devuelve null si no hay coincidencia", matchCategory("algo random", categories) === null);
}

// ---------------------------------------------------------------------
// classifyConfirmCommand: confirmar/cancelar la tarjeta de revisión.
// ---------------------------------------------------------------------
check('classifyConfirmCommand("sí") === "confirm"', classifyConfirmCommand("sí") === "confirm");
check('classifyConfirmCommand("guardar") === "confirm"', classifyConfirmCommand("guardar") === "confirm");
check('classifyConfirmCommand("cancelar") === "cancel"', classifyConfirmCommand("cancelar") === "cancel");
check('classifyConfirmCommand("no") === "cancel"', classifyConfirmCommand("no") === "cancel");
check('classifyConfirmCommand("hola") === null', classifyConfirmCommand("hola") === null);

if (failures > 0) {
  console.error(`\n${failures} de ${total} pruebas fallaron.`);
  process.exit(1);
}
console.log(`\n${total} pruebas del clasificador de voz (Ingreso/Gasto/Nota) pasaron correctamente.`);
