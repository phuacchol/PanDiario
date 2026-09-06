#!/usr/bin/env node
// Pruebas unitarias ligeras de los formateadores de fecha/hora 100% locales
// (src/utils/format.ts): deben reflejar exactamente la hora del reloj del
// sistema (Date.now() / new Date(...)) sin depender de Intl/ICU, que en
// Hermes (Android) puede venir incompleto y devolver una hora desfasada al
// pedir un locale explícito ("es-PE"). Ver npm script "test:format".
import { formatLocalTime, formatLocalDate, formatLocalWeekday, toLocalDate } from "../src/utils/format.ts";

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
// formatLocalTime: debe coincidir exactamente con los getters nativos de
// Date en la zona horaria local del proceso (equivalente al reloj del
// dispositivo), sin importar el locale del sistema.
// ---------------------------------------------------------------------
const timeCases = [
  { d: new Date(2024, 0, 15, 23, 51, 0), expected: "11:51 p. m." },
  { d: new Date(2024, 0, 15, 21, 51, 0), expected: "09:51 p. m." },
  { d: new Date(2024, 0, 15, 0, 5, 0), expected: "12:05 a. m." },
  { d: new Date(2024, 0, 15, 12, 0, 0), expected: "12:00 p. m." },
  { d: new Date(2024, 0, 15, 9, 5, 0), expected: "09:05 a. m." },
];
for (const { d, expected } of timeCases) {
  const got = formatLocalTime(d);
  check(
    `formatLocalTime(${d.getHours()}:${d.getMinutes()} local) === "${expected}"`,
    got === expected,
    `obtenido: "${got}"`
  );
}

{
  const d = new Date(2024, 0, 15, 23, 51, 9);
  const got = formatLocalTime(d, { seconds: true });
  check(`formatLocalTime con seconds:true incluye segundos`, got === "11:51:09 p. m.", `obtenido: "${got}"`);
}

{
  // Un timestamp numérico (Date.now()) debe formatear igual que un objeto
  // Date equivalente: es la forma de guardado recomendada por la directiva.
  const d = new Date(2024, 5, 1, 14, 30, 0);
  const got = formatLocalTime(d.getTime());
  check(`formatLocalTime acepta timestamp numérico (Date.now())`, got === "02:30 p. m.", `obtenido: "${got}"`);
}

{
  // El reloj real del proceso (equivalente al reloj del teléfono en un
  // dispositivo) debe reproducirse exactamente vía los getters nativos.
  const now = new Date();
  let hours = now.getHours();
  const ampm = hours >= 12 ? "p. m." : "a. m.";
  hours = hours % 12 || 12;
  const expected = `${String(hours).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} ${ampm}`;
  const got = formatLocalTime(now);
  check(`formatLocalTime(new Date()) coincide con la hora local real del sistema`, got === expected, `obtenido: "${got}", esperado: "${expected}"`);
}

check("formatLocalTime con fecha inválida devuelve cadena vacía", formatLocalTime("no-es-una-fecha") === "");

// ---------------------------------------------------------------------
// formatLocalDate / formatLocalWeekday
// ---------------------------------------------------------------------
{
  const d = new Date(2024, 0, 15); // lunes 15 de enero de 2024
  check(`formatLocalDate sin año`, formatLocalDate(d) === "15 ene.", `obtenido: "${formatLocalDate(d)}"`);
  check(
    `formatLocalDate con año`,
    formatLocalDate(d, { withYear: true }) === "15 ene. 2024",
    `obtenido: "${formatLocalDate(d, { withYear: true })}"`
  );
  check(`formatLocalWeekday`, formatLocalWeekday(d) === "lun.", `obtenido: "${formatLocalWeekday(d)}"`);
}

check("formatLocalDate con fecha inválida devuelve cadena vacía", formatLocalDate("no-es-una-fecha") === "");
check("formatLocalWeekday con fecha inválida devuelve cadena vacía", formatLocalWeekday("no-es-una-fecha") === "");

// ---------------------------------------------------------------------
// toLocalDate: normalización de strings ISO sin sufijo de zona horaria.
// El bug de la directiva ("2:56 p. m." salta a "12:56 p. m." tras un
// re-render): Motor/PyMongo, sin tz_aware=True, devuelve los datetime
// leídos de Mongo como "naive" -isoformat() no agrega "Z" ni offset-, y
// ese string ambiguo puede interpretarse como hora local en vez de UTC.
// Todo created_at de esta app representa un instante absoluto, así que un
// string sin sufijo de zona debe tratarse como UTC explícito: el mismo
// instante (mismo epoch) que su equivalente con "Z", sin importar la zona
// horaria del dispositivo/entorno donde corre el test.
// ---------------------------------------------------------------------
{
  const naive = toLocalDate("2026-09-06T19:56:00");
  const withZ = toLocalDate("2026-09-06T19:56:00Z");
  check(
    'toLocalDate("...T19:56:00") sin "Z" se interpreta como el mismo instante UTC que "...T19:56:00Z"',
    naive.getTime() === withZ.getTime(),
    `naive=${naive.toISOString()} withZ=${withZ.toISOString()}`
  );
}

{
  // Variante estilo SQLite (espacio en vez de "T"), también sin zona.
  const sqliteStyle = toLocalDate("2026-09-06 19:56:00");
  const withZ = toLocalDate("2026-09-06T19:56:00Z");
  check(
    'toLocalDate("2026-09-06 19:56:00") (estilo SQLite, sin "T" ni zona) también se trata como UTC',
    sqliteStyle.getTime() === withZ.getTime(),
    `sqliteStyle=${sqliteStyle.toISOString()} withZ=${withZ.toISOString()}`
  );
}

{
  // Con milisegundos, también sin zona.
  const naiveMs = toLocalDate("2026-09-06T19:56:00.123");
  const withZMs = toLocalDate("2026-09-06T19:56:00.123Z");
  check(
    "toLocalDate respeta milisegundos al normalizar un string sin zona horaria",
    naiveMs.getTime() === withZMs.getTime(),
    `naiveMs=${naiveMs.toISOString()} withZMs=${withZMs.toISOString()}`
  );
}

{
  // Un string que YA trae su propio offset no debe tocarse -"+00:00" es
  // exactamente lo que produce el backend tras el fix de iso_utc()-.
  const withOffset = toLocalDate("2026-09-06T19:56:00+00:00");
  const withZ = toLocalDate("2026-09-06T19:56:00Z");
  check(
    'toLocalDate no altera un string que ya trae offset explícito ("+00:00")',
    withOffset.getTime() === withZ.getTime(),
    `withOffset=${withOffset.toISOString()} withZ=${withZ.toISOString()}`
  );
}

{
  // Un objeto Date ya construido pasa intacto, sin pasar por el regex de
  // normalización (evita romper el workaround de "T12:00:00" usado en los
  // ejes de gráficos para fechas-only, que construye el Date él mismo
  // ANTES de llegar a toLocalDate).
  const original = new Date(2026, 5, 1, 12, 0, 0);
  const passthrough = toLocalDate(original);
  check("toLocalDate devuelve el mismo Date sin modificarlo", passthrough === original);
}

check(
  "formatLocalTime en un created_at sin zona (bug de la directiva) coincide con su equivalente en Z",
  formatLocalTime("2026-09-06T19:56:00") === formatLocalTime("2026-09-06T19:56:00Z")
);

if (failures > 0) {
  console.error(`\n${failures} de ${total} pruebas fallaron.`);
  process.exit(1);
}
console.log(`\n${total} pruebas de formateo local de fecha/hora pasaron correctamente.`);
