import { Redirect, useLocalSearchParams } from "expo-router";

// Rutas destino de cada acceso rápido de la burbuja flotante nativa
// (pandiario://quick/<accion>): ingreso/gasto/nota/lista abren su pestaña,
// voice abre el modal de voz para hablar de inmediato, budget abre Inicio
// -la Calculadora de Presupuesto es un modal sin ruta propia, se abre
// desde ahí con el botón que ya existe en la tarjeta Presupuesto-.
const QUICK_ACTION_ROUTES: Record<string, string> = {
  ingreso: "/(tabs)/ingreso",
  gasto: "/(tabs)/gasto",
  nota: "/(tabs)/nota",
  lista: "/(tabs)/lista",
  voice: "/voice",
  budget: "/(tabs)",
};

// Ruta formal para pandiario://quick/<accion>: registrarla explícitamente
// en Expo Router (en vez de depender solo de un listener manual de
// Linking) evita el "Unmatched Route" -el resolver de deep links de Expo
// Router intenta hacer match de archivo ANTES de que cualquier listener
// manual llegue a redirigir, así que sin esta ruta el 404 aparecía primero.
export default function QuickAction() {
  const { action } = useLocalSearchParams<{ action?: string }>();
  const route = (action && QUICK_ACTION_ROUTES[action]) || "/(tabs)";
  return <Redirect href={route as any} />;
}
