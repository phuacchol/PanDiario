export const LIGHT = {
  surface: "#F5F7FA",
  onSurface: "#1E1F35",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1E1F35",
  surfaceTertiary: "#EEF0F6",
  onSurfaceTertiary: "#7E859B",
  surfaceInverse: "#22203E",
  onSurfaceInverse: "#FFFFFF",
  brand: "#6C7FD8",
  onBrand: "#FFFFFF",
  brandSecondary: "#5B6FC7",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E9EBFA",
  onBrandTertiary: "#5B6FC7",
  accent: "#E67E22",
  onAccent: "#FFFFFF",
  accentSoft: "#FBEADB",
  success: "#48C78E",
  onSuccess: "#FFFFFF",
  warning: "#F39C12",
  onWarning: "#FFFFFF",
  error: "#E55050",
  onError: "#FFFFFF",
  info: "#6C7FD8",
  border: "#E5E8F0",
  borderStrong: "#D3D8E6",
  divider: "#EEF0F6",
  // Tarjeta "Cuenta Actual" (hero) y semáforo de origen del dinero en Gasto.
  heroBg: "#1E1B38",
  heroAmount: "#4EE3A5",
  cajaChica: "#E67E22",
};

export const DARK = {
  surface: "#0F1830",
  onSurface: "#EAF0FA",
  surfaceSecondary: "#182544",
  onSurfaceSecondary: "#EAF0FA",
  surfaceTertiary: "#22314F",
  onSurfaceTertiary: "#9FB0CC",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#1A2E5C",
  brand: "#7B8CDE",
  onBrand: "#12102A",
  brandSecondary: "#6C7FD8",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#22314F",
  onBrandTertiary: "#C7CEF5",
  accent: "#E67E22",
  onAccent: "#12102A",
  accentSoft: "#2E2313",
  success: "#48C78E",
  onSuccess: "#0F1830",
  warning: "#F39C12",
  onWarning: "#0F1830",
  error: "#E55050",
  onError: "#FFFFFF",
  info: "#7B8CDE",
  border: "#26324D",
  borderStrong: "#39476690",
  divider: "#1E2A44",
  heroBg: "#1E1B38",
  heroAmount: "#4EE3A5",
  cajaChica: "#E67E22",
};

export type Palette = typeof LIGHT;

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const RADIUS = { sm: 10, md: 16, lg: 20, xl: 28, pill: 999 };
export const NIGHT_GRADIENT = ["#1A2E5C", "#4A6FA5"] as const;
// Degradado oscuro compartido por las tarjetas "premium" destacadas (Hero
// Card de Balance en Inicio, Caja del Día en Reportes): una sola fuente de
// verdad para que ambas usen exactamente el mismo par de colores.
export const DARK_HERO_GRADIENT = ["#1E293B", "#0F172A"] as const;
// Degradado azul lavanda de la zona superior de Bienvenida
// (BicolorCurveBackground): reutilizado como fondo de Login para que ambas
// pantallas compartan el mismo tono azul de marca.
export const WELCOME_GRADIENT = ["#8FA7D6", "#6C86C1"] as const;
// Degradados de las 3 tarjetas de métricas del Dashboard (Caja Chica,
// Ahorro, Neto): fuente única para que Inicio los use tal cual.
export const CAJA_CHICA_GRADIENT = ["#00A3FF", "#0077C2"] as const;
export const AHORRO_GRADIENT = ["#FF6B8B", "#FF4757"] as const;
export const NETO_GRADIENT = ["#00C9A7", "#00A86B"] as const;
// Colores de acento de las barras de PRESUPUESTO (Vital/Secundario).
export const BUDGET_VITAL_COLOR = "#1FB6B6";
export const BUDGET_SECO_COLOR = "#E14E7A";
// Franja superior de las tarjetas de Gasto: mismo color por origen del
// dinero que ya usan Caja Chica/Ahorro (tarjetas de Inicio) y Vital/Secundario
// (barras de PRESUPUESTO de Inicio) -una sola fuente de verdad para los 4-.
// origin "cuenta" (Cuenta Actual, sin franja propia) no tiene entrada aquí:
// TransactionCard usa colors.warning como respaldo, igual que la regla
// anterior de bordes por origen.
export const ORIGIN_HEADER_COLORS = {
  caja_chica: CAJA_CHICA_GRADIENT[0],
  ahorro: AHORRO_GRADIENT[0],
  vital: BUDGET_VITAL_COLOR,
  secundario: BUDGET_SECO_COLOR,
} as const;
export const FONTS = {
  regular: "Nunito",
  medium: "Nunito-SemiBold",
  bold: "Nunito-Bold",
  black: "Nunito-ExtraBold",
};
export const FONT_SIZE = { xs: 10, sm: 12, base: 14, lg: 16, xl: 20, "2xl": 24, "3xl": 32, "4xl": 40 };

// Paleta y estilos "Dashboard Financiero": desde la unificación estética
// global, LIGHT/DARK ya adoptan estos mismos tonos como colors.brand,
// colors.surface, colors.success, etc. Estos tokens quedan disponibles para
// las pantallas que prefieren consumir el literal explícito directamente
// (ej. componentes que no reciben `colors` del ThemeContext).
export const COBALT_UI = {
  primary: "#2563EB",
  primaryDark: "#1D4ED8",
  screenBg: "#F8FAFC",
  screenBgAlt: "#F1F5F9",
  card: "#FFFFFF",
  cardRadius: 20,
  cardShadow: { shadowColor: "#0F172A", shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  titleColor: "#0F172A",
  subtitleColor: "#64748B",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  pillRadius: 24,
  pillHeight: 52,
};
