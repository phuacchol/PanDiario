export const PAN_ASSETS = {
  welcome: require("@/assets/images/panconmiel/pan-pijama.png"),
  avatar: require("@/assets/images/panconmiel/pan-avatar.png"),
  listening: require("@/assets/images/panconmiel/pan-escuchando.png"),
  warehouse: require("@/assets/images/panconmiel/pan-almacenero.png"),
  calculator: require("@/assets/images/panconmiel/pan-calculadora.png"),
  executive: require("@/assets/images/panconmiel/pan-ejecutivo.png"),
  logoText: require("@/assets/images/panconmiel/pan-logo-letras.png"),
  welcomeHome: require("@/assets/images/panconmiel/pan-bienvenido.png"),
} as const;

export type PanAssetKey = keyof typeof PAN_ASSETS;
