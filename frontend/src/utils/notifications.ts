import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let configured = false;

// Pide permiso de notificaciones y crea el canal de Android. Se llama una
// sola vez desde el layout raíz; nunca lanza (best-effort, silencioso).
export async function configureNotificationsAsync(): Promise<void> {
  if (configured) return;
  configured = true;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("recordatorios", {
        name: "Recordatorios",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      await Notifications.requestPermissionsAsync();
    }
  } catch (err) {
    console.warn("No se pudo configurar notificaciones:", err);
  }
}

// Programa el recordatorio de una nota para (remindAt - leadMinutes). Si esa
// hora ya pasó, se dispara de inmediato. Devuelve el id de la notificación
// programada (para poder cancelarla luego) o null si falló/no aplica.
export async function scheduleReminder(p: { id: string; text: string; remindAt: string; leadMinutes: number }): Promise<string | null> {
  try {
    const target = new Date(p.remindAt);
    if (isNaN(target.getTime())) return null;
    const triggerDate = new Date(target.getTime() - p.leadMinutes * 60000);
    const seconds = Math.max(1, Math.round((triggerDate.getTime() - Date.now()) / 1000));

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: "PanDiario · Recordatorio",
        body: p.text,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        channelId: Platform.OS === "android" ? "recordatorios" : undefined,
      },
    });
    return identifier;
  } catch (err) {
    console.warn("No se pudo programar el recordatorio:", err);
    return null;
  }
}

export async function cancelReminder(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // Silencioso: si ya se disparó o no existe, no hay nada que cancelar.
  }
}
