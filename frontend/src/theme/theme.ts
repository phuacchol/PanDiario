export const LIGHT = {
  surface: "#F8FAFC",
  onSurface: "#0F172A",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#0F172A",
  surfaceTertiary: "#EEF2F8",
  onSurfaceTertiary: "#64748B",
  surfaceInverse: "#0F172A",
  onSurfaceInverse: "#FFFFFF",
  brand: "#2563EB",
  onBrand: "#FFFFFF",
  brandSecondary: "#1D4ED8",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E6EEF8",
  onBrandTertiary: "#1D4ED8",
  accent: "#E89A3E",
  onAccent: "#FFFFFF",
  accentSoft: "#FDF0D5",
  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#2563EB",
  border: "#E2E8F0",
  borderStrong: "#CBD5E6",
  divider: "#EEF2F8",
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
  brand: "#3B82F6",
  onBrand: "#0F1830",
  brandSecondary: "#2563EB",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#22314F",
  onBrandTertiary: "#BFD3F0",
  accent: "#F5A623",
  onAccent: "#0F1830",
  accentSoft: "#2E2716",
  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#0F1830",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  border: "#26324D",
  borderStrong: "#39476690",
  divider: "#1E2A44",
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
