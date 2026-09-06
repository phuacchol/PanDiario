import { NativeModules, Platform } from "react-native";

type OverlayBubbleNativeModule = {
  hasOverlayPermission(): Promise<boolean>;
  requestOverlayPermission(): void;
  startBubble(): void;
  stopBubble(): void;
  isBubbleRunning(): Promise<boolean>;
};

const NativeMod: OverlayBubbleNativeModule | undefined = (NativeModules as any).OverlayBubbleModule;
const available = Platform.OS === "android" && !!NativeMod;

// Envoltorio JS del módulo nativo de la burbuja flotante (Android). En
// Expo Go / iOS / web el módulo nativo no existe (solo se compila en el
// APK generado vía `expo prebuild` + Gradle), así que cada función es un
// no-op seguro cuando `isAvailable()` es false.
export const overlayBubble = {
  isAvailable(): boolean {
    return available;
  },
  async hasPermission(): Promise<boolean> {
    if (!available) return false;
    try {
      return await NativeMod!.hasOverlayPermission();
    } catch {
      return false;
    }
  },
  requestPermission(): void {
    if (!available) return;
    try {
      NativeMod!.requestOverlayPermission();
    } catch {}
  },
  start(): void {
    if (!available) return;
    try {
      NativeMod!.startBubble();
    } catch {}
  },
  stop(): void {
    if (!available) return;
    try {
      NativeMod!.stopBubble();
    } catch {}
  },
  async isRunning(): Promise<boolean> {
    if (!available) return false;
    try {
      return await NativeMod!.isBubbleRunning();
    } catch {
      return false;
    }
  },
};
