export const PAN_ASSETS = {
  welcome: require("@/assets/images/pandiario/pan-pijama.png"),
  avatar: require("@/assets/images/pandiario/pan-avatar.png"),
  listening: require("@/assets/images/pandiario/pan-escuchando.png"),
  warehouse: require("@/assets/images/pandiario/pan-almacenero.png"),
  calculator: require("@/assets/images/pandiario/pan-calculadora.png"),
  executive: require("@/assets/images/pandiario/pan-ejecutivo.png"),
  logoText: require("@/assets/images/pandiario/pan-logo-letras.png"),
  welcomeHome: require("@/assets/images/pandiario/pan-bienvenido.png"),
  // Ilustración flotante de cada modal de creación (Nuevo Gasto/Ingreso/
  // Lista/Nota): ver FloatingMascot en ModalForm.tsx.
  modalGasto: require("@/assets/images/pandiario/pan-gasto.png"),
  modalIngreso: require("@/assets/images/pandiario/pan-ingreso.png"),
  modalLista: require("@/assets/images/pandiario/pan-lista.png"),
  modalNota: require("@/assets/images/pandiario/pan-nota.png"),
  // Ilustraciones de acceso/registro (app/(auth)/login.tsx y register.tsx).
  login: require("@/assets/images/pandiario/pan-login.png"),
  register: require("@/assets/images/pandiario/pan-registro.png"),
} as const;

export type PanAssetKey = keyof typeof PAN_ASSETS;
