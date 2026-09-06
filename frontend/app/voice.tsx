import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { setAudioModeAsync } from "expo-audio";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { Image } from "expo-image";
import { Button, Segmented, ChipRow, Field } from "@/src/components/ui";
import { PAN_ASSETS } from "@/src/constants/mascot";
import { useData } from "@/src/context/DataContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { analyzeFinanceIntent, type FinanceIntentKind, type FinanceIntentResult } from "@/src/utils/financeVoice";

// Half-duplex estricto: cada frase requiere una pulsación explícita del
// micrófono. Nunca se reactiva la escucha sola (ni tras hablar, ni tras
// guardar) — el usuario siempre decide cuándo empieza la siguiente orden.
const LANGUAGE_FALLBACKS = ["es-PE", "es-ES", "es-US"];

type Phase = "idle" | "listening" | "processing" | "confirm" | "error";

const KIND_META: Record<Exclude<FinanceIntentKind, "unknown">, { label: string; icon: keyof typeof Feather.glyphMap; color: string }> = {
  ingreso: { label: "Ingreso", icon: "arrow-down-circle", color: "#10B981" },
  gasto: { label: "Gasto", icon: "arrow-up-circle", color: "#EF4444" },
  nota: { label: "Nota", icon: "edit-3", color: "#F59E0B" },
};

export default function Voice() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { budgetCategories, addBudgetCategory, addIncome, addExpense, addNote } = useData();

  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<FinanceIntentResult | null>(null);

  const [editAmount, setEditAmount] = useState("");
  const [editMethod, setEditMethod] = useState<"efectivo" | "transferencia">("efectivo");
  const [editCategory, setEditCategory] = useState("Otros");
  const [editNote, setEditNote] = useState("");

  const transcriptRef = useRef("");
  const langIndexRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  const close = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {}
    Speech.stop();
    router.back();
  };

  useEffect(() => {
    return () => {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {}
      Speech.stop();
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    };
  }, []);

  useSpeechRecognitionEvent("result", (event: any) => {
    const text = event.results?.[0]?.transcript || "";
    transcriptRef.current = text;
    setTranscript(text);
  });

  useSpeechRecognitionEvent("end", () => {
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    if (phaseRef.current !== "listening") return;
    processTranscript();
  });

  useSpeechRecognitionEvent("error", (event: any) => {
    if (event.error === "language-not-supported" && langIndexRef.current < LANGUAGE_FALLBACKS.length - 1) {
      langIndexRef.current += 1;
      return;
    }
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    setErrorMsg("No se pudo escuchar. Intenta de nuevo.");
    setPhase("error");
  });

  const processTranscript = () => {
    setPhase("processing");
    const text = transcriptRef.current.trim();
    if (!text) {
      setErrorMsg("No escuché nada. Intenta de nuevo.");
      setPhase("error");
      return;
    }
    const analyzed = analyzeFinanceIntent(text, budgetCategories);
    if (analyzed.kind === "unknown") {
      setResult(null);
      setErrorMsg('No entendí si es un Ingreso, Gasto o Nota. Intenta algo como "gasté 20 soles en pasaje".');
      setPhase("error");
      return;
    }
    setResult(analyzed);
    setEditAmount(analyzed.amount ? String(analyzed.amount) : "");
    setEditMethod(analyzed.method || "efectivo");
    setEditCategory(analyzed.category || "Otros");
    setEditNote(analyzed.note || "");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setPhase("confirm");
  };

  const startListening = async () => {
    setErrorMsg("");
    setTranscript("");
    transcriptRef.current = "";
    setResult(null);

    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setErrorMsg("Permiso de micrófono no otorgado.");
      setPhase("error");
      return;
    }

    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: "duckOthers" }).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPhase("listening");

    try {
      ExpoSpeechRecognitionModule.start({
        lang: LANGUAGE_FALLBACKS[langIndexRef.current] || LANGUAGE_FALLBACKS[0],
        interimResults: true,
        continuous: false,
        addsPunctuation: false,
        iosCategory: {
          category: "playAndRecord",
          categoryOptions: ["defaultToSpeaker", "allowBluetooth"],
          mode: "measurement",
        },
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1600,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 1000,
          EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 15000,
        },
      });
    } catch (e: any) {
      setErrorMsg(e?.message || "No se pudo iniciar el reconocimiento de voz");
      setPhase("error");
    }
  };

  const stopListening = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {}
  };

  const reset = () => {
    setErrorMsg("");
    setResult(null);
    setTranscript("");
    setPhase("idle");
  };

  const handleConfirm = async () => {
    if (!result) return;
    const amt = parseFloat(editAmount.replace(",", ".")) || 0;

    // Si el usuario dictó o escribió una categoría que todavía no existe,
    // se crea aquí (igual que el "+Añadir categoría" de Ingreso/Gasto) para
    // que quede disponible como cupo real en Presupuesto y como chip en
    // las próximas veces, en vez de quedar como una etiqueta suelta que
    // solo vive en esta transacción.
    const cleanCategory = editCategory.trim();
    if (cleanCategory && cleanCategory !== "Otros" && !budgetCategories.some((c) => c.name === cleanCategory)) {
      await addBudgetCategory({ type: "vital", name: cleanCategory, amount: 0 });
    }

    if (result.kind === "ingreso") {
      if (amt <= 0) return;
      await addIncome({ amount: amt, method: editMethod, category: cleanCategory || "Otros", note: editNote || undefined });
      Speech.speak("Ingreso guardado", { language: "es-ES" });
    } else if (result.kind === "gasto") {
      if (amt <= 0) return;
      await addExpense({ amount: amt, method: editMethod, category: cleanCategory || "Otros", note: editNote || undefined });
      Speech.speak("Gasto guardado", { language: "es-ES" });
    } else if (result.kind === "nota") {
      if (!editNote.trim()) return;
      await addNote({ text: editNote.trim() });
      Speech.speak("Nota guardada", { language: "es-ES" });
    }

    close();
  };

  const categoryOptions = [{ key: "Otros", label: "Otros" }, ...budgetCategories.map((c) => ({ key: c.name, label: c.name }))];
  const meta = result ? KIND_META[result.kind as Exclude<FinanceIntentKind, "unknown">] : null;

  return (
    <View style={styles.overlay}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </BlurView>

      <View style={[styles.sheet, { backgroundColor: colors.surfaceSecondary, paddingBottom: insets.bottom + SPACING.lg }]}>
        <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: colors.onSurface }]}>Asistente PanDiario</Text>
          <Pressable onPress={close} hitSlop={8} testID="voice-close">
            <Feather name="x" size={24} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>

        {phase === "idle" || phase === "listening" || phase === "processing" ? (
          <View style={styles.centerArea}>
            <Image
              source={phase === "listening" ? PAN_ASSETS.listening : PAN_ASSETS.avatar}
              style={styles.mascot}
              contentFit="contain"
              testID="voice-mascot"
            />
            <Text style={[styles.transcript, { color: colors.onSurface }]} numberOfLines={3}>
              {phase === "listening" ? transcript || "Escuchando..." : phase === "processing" ? "Procesando..." : "Presiona el micrófono y di tu orden"}
            </Text>

            <Pressable
              onPress={phase === "listening" ? stopListening : startListening}
              style={[styles.micBtn, { backgroundColor: phase === "listening" ? colors.error : colors.brand }]}
              testID="voice-mic-button"
            >
              <Feather name={phase === "listening" ? "square" : "mic"} size={30} color="#FFFFFF" />
            </Pressable>

            {phase === "idle" ? (
              <View style={styles.chipsRow}>
                <View style={[styles.exampleChip, { backgroundColor: colors.surfaceTertiary }]}>
                  <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs }}>&quot;Gasté 20 en pasaje&quot;</Text>
                </View>
                <View style={[styles.exampleChip, { backgroundColor: colors.surfaceTertiary }]}>
                  <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs }}>&quot;Me pagaron 50&quot;</Text>
                </View>
                <View style={[styles.exampleChip, { backgroundColor: colors.surfaceTertiary }]}>
                  <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs }}>&quot;Anota comprar pan&quot;</Text>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {phase === "error" ? (
          <View style={styles.centerArea}>
            <Feather name="alert-circle" size={40} color={colors.error} />
            <Text style={[styles.transcript, { color: colors.onSurface }]}>{errorMsg}</Text>
            <Button title="Intentar de nuevo" icon="mic" onPress={reset} testID="voice-retry-button" />
          </View>
        ) : null}

        {phase === "confirm" && result && meta ? (
          <KeyboardAwareScrollView contentContainerStyle={{ gap: SPACING.md }} bottomOffset={20}>
            <View style={[styles.kindBadge, { backgroundColor: meta.color + "22" }]}>
              <Feather name={meta.icon} size={18} color={meta.color} />
              <Text style={[styles.kindLabel, { color: meta.color }]}>{meta.label}</Text>
            </View>

            {result.kind !== "nota" ? (
              <>
                <Field
                  label="Monto"
                  icon="dollar-sign"
                  keyboardType="decimal-pad"
                  value={editAmount}
                  onChangeText={setEditAmount}
                  testID="voice-confirm-amount"
                />
                <Segmented
                  testID="voice-confirm-method"
                  options={[
                    { key: "efectivo", label: "Efectivo" },
                    { key: "transferencia", label: "Transferencia" },
                  ]}
                  value={editMethod}
                  onChange={(k) => setEditMethod(k as any)}
                />
                <View style={{ gap: SPACING.xs }}>
                  <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Categoría</Text>
                  <ChipRow testID="voice-confirm-category" options={categoryOptions} value={editCategory} onChange={setEditCategory} />
                  <Field
                    placeholder="O escribe una categoría nueva"
                    value={editCategory}
                    onChangeText={setEditCategory}
                    testID="voice-confirm-category-input"
                  />
                </View>
                <Field label="Nota (opcional)" value={editNote} onChangeText={setEditNote} testID="voice-confirm-note" />
              </>
            ) : (
              <Field label="Nota" multiline value={editNote} onChangeText={setEditNote} testID="voice-confirm-note-text" />
            )}

            <View style={styles.confirmActions}>
              <Pressable style={styles.cancelBtn} onPress={reset} testID="voice-cancel">
                <Text style={[styles.cancelText, { color: colors.onSurfaceTertiary }]}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, { backgroundColor: colors.brand }]} onPress={handleConfirm} testID="voice-confirm-save">
                <Text style={[styles.saveText, { color: colors.onBrand }]}>Guardar</Text>
              </Pressable>
            </View>
          </KeyboardAwareScrollView>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl,
    gap: SPACING.md,
    maxHeight: "80%",
  },
  grabber: { width: 40, height: 5, borderRadius: RADIUS.pill, alignSelf: "center" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  centerArea: { alignItems: "center", gap: SPACING.md, paddingVertical: SPACING.lg },
  mascot: { width: 120, height: 120 },
  transcript: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, textAlign: "center", minHeight: 40 },
  micBtn: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: SPACING.xs },
  exampleChip: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: RADIUS.pill },
  kindBadge: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, alignSelf: "flex-start", paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: RADIUS.pill },
  kindLabel: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  label: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, marginLeft: 2 },
  confirmActions: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.xs },
  cancelBtn: { flex: 1, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  cancelText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  saveBtn: { flex: 1, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  saveText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
});
