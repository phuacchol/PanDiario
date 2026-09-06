#!/usr/bin/env node
// Pruebas unitarias ligeras de la lógica pura de finanzas personales
// (src/utils/financeHelpers.ts, usada por DataContext.tsx). DataContext.tsx
// en sí es un .tsx que además importa expo-sqlite/expo-notifications
// (módulos nativos que exigen el runtime de Expo), así que no puede
// probarse directamente con Node a secas -por eso la lógica pura vive
// separada en su propio archivo .ts, sin dependencias de React Native-.
import { computeCycleLabel, daysUntil, splitSavingsFromWallet } from "../src/utils/financeHelpers.ts";

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
// computeCycleLabel: nombre del ciclo en el Historial de Cierres.
// ---------------------------------------------------------------------
check(
  'computeCycleLabel: ciclo íntegro dentro de un mes -> "Abril"',
  computeCycleLabel(new Date(2026, 3, 1), new Date(2026, 3, 28)) === "Abril"
);

check(
  'computeCycleLabel: ciclo con >=20 días en el mes de cierre -> ese mes',
  computeCycleLabel(new Date(2026, 8, 25), new Date(2026, 9, 20)) === "Octubre",
  `obtenido: ${computeCycleLabel(new Date(2026, 8, 25), new Date(2026, 9, 20))}`
);

check(
  'computeCycleLabel: ciclo repartido sin que ningún mes llegue a 20 días -> nombre compuesto',
  computeCycleLabel(new Date(2026, 8, 20), new Date(2026, 9, 5)) === "Septiembre - Octubre",
  `obtenido: ${computeCycleLabel(new Date(2026, 8, 20), new Date(2026, 9, 5))}`
);

check(
  'computeCycleLabel: ciclo que cruza fin de año respeta el orden cronológico ("Diciembre - Enero", no "Enero - Diciembre")',
  computeCycleLabel(new Date(2026, 11, 25), new Date(2027, 0, 5)) === "Diciembre - Enero",
  `obtenido: ${computeCycleLabel(new Date(2026, 11, 25), new Date(2027, 0, 5))}`
);

// ---------------------------------------------------------------------
// daysUntil: cuenta regresiva "X días para el cierre".
// ---------------------------------------------------------------------
{
  const now = new Date(2026, 0, 1);
  check(
    "daysUntil: 25 días exactos hacia adelante",
    daysUntil("2026-01-26", now) === 25,
    `obtenido: ${daysUntil("2026-01-26", now)}`
  );
  check("daysUntil: null sin fecha", daysUntil(null, now) === null);
  check("daysUntil: 0 el mismo día", daysUntil("2026-01-01", now) === 0);
}

// ---------------------------------------------------------------------
// splitSavingsFromWallet: "Ahorrar" descuenta de Cartera (efectivo primero)
// sin dejar saldos negativos ni ahorrar más de lo disponible.
// ---------------------------------------------------------------------
{
  const r = splitSavingsFromWallet(50, 30, 100);
  check(
    "splitSavingsFromWallet: descuenta primero de efectivo y el resto de digital",
    r.amount === 50 && r.carteraEfectivo === 0 && r.carteraDigital === 80,
    `obtenido: ${JSON.stringify(r)}`
  );
}
{
  const r = splitSavingsFromWallet(200, 30, 20);
  check(
    "splitSavingsFromWallet: nunca ahorra más de lo disponible en Cartera",
    r.amount === 50 && r.carteraEfectivo === 0 && r.carteraDigital === 0,
    `obtenido: ${JSON.stringify(r)}`
  );
}
{
  const r = splitSavingsFromWallet(20, 100, 0);
  check(
    "splitSavingsFromWallet: monto cubierto solo con efectivo no toca digital",
    r.amount === 20 && r.carteraEfectivo === 80 && r.carteraDigital === 0,
    `obtenido: ${JSON.stringify(r)}`
  );
}

if (failures > 0) {
  console.error(`\n${failures} de ${total} pruebas fallaron.`);
  process.exit(1);
}
console.log(`\n${total} pruebas de finanzas (DataContext) pasaron correctamente.`);
