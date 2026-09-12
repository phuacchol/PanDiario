// Catálogo de frases motivacionales/financieras mostradas en Inicio, entre
// "MIS OBJETIVOS" y "HISTORIAL DE CIERRE" -ver app/(tabs)/index.tsx-. Una
// se elige al azar cada vez que la pestaña recibe foco.
export const MOTIVATIONAL_QUOTES: string[] = [
  "Un centavo ahorrado es un centavo ganado. (Benjamin Franklin)",
  "No ahorres lo que te queda después de gastar, gasta lo que te queda después de ahorrar. (Warren Buffett)",
  "El dinero es un buen siervo, pero un mal amo. (Alejandro Dumas)",
  "El camino hacia la riqueza depende fundamentalmente de dos palabras: trabajo y ahorro.",
  "Controla tus gastos pequeños; un pequeño agujero puede hundir un gran barco.",
  "La riqueza no consiste en tener muchas posesiones, sino en tener pocas necesidades. (Epicteto)",
  "El mejor momento para plantar un árbol fue hace 20 años. El segundo mejor momento es hoy.",
  "Siembra hoy tus hábitos financieros para cosechar tu libertad mañana.",
  "El presupuesto no te limita, te da el control de tu libertad.",
  "Invierte en ti mismo: el conocimiento siempre paga los mejores intereses.",
  "El interés compuesto es la octava maravilla del mundo; quien lo entiende, lo gana; quien no, lo paga. (Albert Einstein)",
  "La disciplina financiera no se trata de privarse, sino de elegir qué es lo verdaderamente importante.",
  "Nunca dependas de una sola fuente de ingresos; invierte para crear una segunda.",
  "Rico no es el que más tiene, sino el que menos necesita para vivir bien.",
  "Un objetivo sin un plan financiero es simplemente un deseo.",
  "Comprar cosas que no necesitas con dinero que no tienes para impresionar a gente que no te importa nunca te hará próspero.",
  "Cada moneda que guardas hoy es un empleado trabajando para tu tranquilidad futura.",
  "La paz mental financiera comienza el día en que decides vivir por debajo de tus posibilidades.",
  "No midas tu éxito financiero por lo que gastas, sino por la libertad que compras con tu tiempo.",
  "Los grandes patrimonios se construyen grano a grano, día tras día.",
  "El secreto de la riqueza es simple: encuentra una manera de hacer más por los demás de lo que cualquier otro hace.",
  "No pongas todos los huevos en la misma cesta; diversifica tus recursos y tu esfuerzo.",
  "El precio es lo que pagas, el valor es lo que obtienes. (Warren Buffett)",
  "La paciencia y la constancia son los dos mayores multiplicadores de cualquier inversión.",
  "Aprender a decir 'no' a un gasto impulsivo hoy es decirle 'sí' a tu tranquilidad de mañana.",
  "Tu mayor activo financiero no es tu cuenta bancaria, sino tu capacidad para aprender y adaptarte.",
  "Un error financiero solo es un fracaso si no te deja una lección para la próxima decisión.",
  "La verdadera libertad financiera no consiste en comprarlo todo, sino en no depender de nada.",
  "Antes de gastar, gana; antes de invertir, investiga; antes de renunciar, inténtalo.",
  "Cada pequeño hábito diario define si tu dinero trabaja para ti o tú para tu dinero.",
];

export function randomMotivationalQuote(): string {
  return MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
}

// Separa el autor -"(Nombre)" al final de la frase- del texto principal,
// para que el llamador pueda renderizarlos en líneas distintas (frase
// entre comillas + autor en una segunda línea sin paréntesis). Frases sin
// autor (la mayoría del catálogo) devuelven author: null.
export function parseQuote(quote: string): { text: string; author: string | null } {
  const match = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(quote);
  if (!match) return { text: quote, author: null };
  return { text: match[1], author: match[2] };
}
