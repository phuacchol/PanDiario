export const PAN_ASSETS = {
  welcome: require("@/assets/images/pandiario/pan-pijama.png"),
  avatar: require("@/assets/images/pandiario/pan-avatar.png"),
  listening: require("@/assets/images/pandiario/pan-escuchando.png"),
  warehouse: require("@/assets/images/pandiario/pan-almacenero.png"),
  calculator: require("@/assets/images/pandiario/pan-calculadora.png"),
  executive: require("@/assets/images/pandiario/pan-ejecutivo.png"),
  logoText: require("@/assets/images/pandiario/pan-logo-letras.png"),
  welcomeHome: require("@/assets/images/pandiario/pan-bienvenido.png"),
} as const;

export type PanAssetKey = keyof typeof PAN_ASSETS;
