#!/usr/bin/env node
// Pruebas unitarias ligeras de la lógica pura de eliminación de ingresos de
// stock (src/utils/purchaseHelpers.ts, usada por deletePurchase/loadPurchases
// en DataContext.tsx). DataContext.tsx en sí es un .tsx que además importa
// expo-sqlite/@react-native-community/netinfo (módulos nativos que exigen el
// runtime de Expo), así que no puede probarse directamente con Node a secas
// -por eso la lógica aritmética/de filtrado vive separada en su propio
// archivo .ts, sin dependencias de React Native-.
import { clampStockAfterDeletion, excludeDeletedPurchases } from "../src/utils/purchaseHelpers.ts";

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
// clampStockAfterDeletion: nunca deja el stock en negativo.
// ---------------------------------------------------------------------
check(
  "clampStockAfterDeletion(153, 20) === 133 (descuento normal)",
  clampStockAfterDeletion(153, 20) === 133
);
check(
  "clampStockAfterDeletion(5, 20) === 0 (nunca negativo, aunque el ingreso exceda el stock actual)",
  clampStockAfterDeletion(5, 20) === 0
);
check("clampStockAfterDeletion(0, 0) === 0", clampStockAfterDeletion(0, 0) === 0);

// ---------------------------------------------------------------------
// excludeDeletedPurchases: reproduce el bug reportado — una lectura remota
// en segundo plano (el backend no expone DELETE para /purchases) no debe
// resucitar un ingreso ya borrado localmente, ni los totales (Capital
// Invertido / Unidades Ingresadas) que se calculan a partir de esa lista.
// ---------------------------------------------------------------------
{
  const remoteStale = [
    { id: "p1", qty: 100, total_cost: 1000 },
    { id: "p2", qty: 53, total_cost: 1073 }, // este es el que se "eliminó" localmente
  ];
  const deletedIds = new Set(["p2"]);
  const result = excludeDeletedPurchases(remoteStale, deletedIds);

  check(
    "excludeDeletedPurchases filtra el ingreso ya eliminado de una respuesta remota obsoleta",
    result.length === 1 && result[0].id === "p1",
    `obtenido: ${JSON.stringify(result)}`
  );

  const totalUnits = result.reduce((acc, p) => acc + p.qty, 0);
  const totalAmount = result.reduce((acc, p) => acc + p.total_cost, 0);
  check(
    "los totales recalculados (Unidades Ingresadas / Capital Invertido) reflejan solo los registros vigentes, sin 'rebotar' a los valores previos",
    totalUnits === 100 && totalAmount === 1000,
    `obtenido: unidades=${totalUnits} monto=${totalAmount}`
  );
}

{
  // Sin eliminaciones pendientes, la lista remota pasa intacta.
  const remote = [{ id: "a", qty: 1 }, { id: "b", qty: 2 }];
  const result = excludeDeletedPurchases(remote, new Set());
  check(
    "excludeDeletedPurchases no descarta nada cuando no hay eliminaciones locales pendientes",
    result.length === 2,
    `obtenido: ${JSON.stringify(result)}`
  );
}

if (failures > 0) {
  console.error(`\n${failures} de ${total} pruebas fallaron.`);
  process.exit(1);
}
console.log(`\n${total} pruebas de DataContext (eliminación de ingresos de stock) pasaron correctamente.`);
