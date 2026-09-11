// Frases financieras de la pantalla de carga inicial (app/index.tsx): una
// se elige al azar por montaje, no rotan mientras la pantalla está visible.
export const FINANCIAL_QUOTES = [
  '"Un centavo ahorrado es un centavo ganado." (Benjamin Franklin)',
  '"No ahorres lo que te queda después de gastar, gasta lo que te queda después de ahorrar." (Warren Buffett)',
  '"El dinero es un buen siervo, pero un mal amo." (Alejandro Dumas)',
  '"El camino hacia la riqueza depende fundamentalmente de dos palabras: trabajo y ahorro."',
  '"Controla tus gastos pequeños; un pequeño agujero puede hundir un gran barco."',
  '"La riqueza no consiste en tener muchas posesiones, sino en tener pocas necesidades." (Epicteto)',
  '"El mejor momento para plantar un árbol fue hace 20 años. El segundo mejor momento es hoy."',
  '"Siembra hoy tus hábitos financieros para cosechar tu libertad mañana."',
  '"El presupuesto no te limita, te da el control de tu libertad."',
  '"Invierte en ti mismo: el conocimiento siempre paga los mejores intereses."',
  '"El interés compuesto es la octava maravilla del mundo; quien lo entiende, lo gana; quien no, lo paga." (Albert Einstein)',
  '"La disciplina financiera no se trata de privarse, sino de elegir qué es lo verdaderamente importante."',
  '"Nunca dependas de una sola fuente de ingresos; invierte para crear una segunda."',
  '"Rico no es el que más tiene, sino el que menos necesita para vivir bien."',
  '"Un objetivo sin un plan financiero es simplemente un deseo."',
  '"Comprar cosas que no necesitas con dinero que no tienes para impresionar a gente que no te importa nunca te hará próspero."',
  '"Cada moneda que guardas hoy es un empleado trabajando para tu tranquilidad futura."',
  '"La paz mental financiera comienza el día en que decides vivir por debajo de tus posibilidades."',
  '"No midas tu éxito financiero por lo que gastas, sino por la libertad que compras con tu tiempo."',
  '"Los grandes patrimonios se construyen grano a grano, día tras día."',
];

export function randomFinancialQuote(): string {
  return FINANCIAL_QUOTES[Math.floor(Math.random() * FINANCIAL_QUOTES.length)];
}
