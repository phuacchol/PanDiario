import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  Platform,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { setAudioModeAsync } from "expo-audio";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorEvent,
} from "expo-speech-recognition";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Image } from "expo-image";
import { Button } from "@/src/components/ui";
import { DatePickerModal } from "@/src/components/DatePickerModal";
import { PAN_ASSETS } from "@/src/constants/mascot";
import { useData } from "@/src/context/DataContext";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE, COBALT_UI } from "@/src/theme/theme";
import { formatMoney, currencySymbol } from "@/src/utils/format";
import { formatExpiryDateFull } from "@/src/utils/expiry";
import {
  analyzeVoiceIntent,
  saveAssistantMemory,
  getAssistantMemory,
  parseAdditionalSaleClauses,
  parseAdditionalStockClauses,
  parseSingleExpense,
  parsePaymentCommand,
  classifyConfirmCommand,
  isKnownAssistantPhrase,
  TTS_ECHO_GUARD_MS,
  validateBatchSaleForConfirm,
  ParsedBatchSaleItem,
  ParsedStockItem,
} from "@/src/utils/assistantEngine";

type ActiveCard = "none" | "stock_in" | "batch_sale" | "expense" | "query_result";

// Orden de preferencia de idioma para el reconocimiento; si el dispositivo
// reporta "language-not-supported" para uno, se reintenta con el siguiente.
const LANGUAGE_FALLBACKS = ["es-PE", "es-ES", "es-US"];

// Respuestas variadas a un chequeo de atención ("¿me escuchas?", "hola").
const ATTENTION_REPLIES = [
  "¡Sí, te escucho fuerte y claro! ¿Qué registramos?",
  "Dime, te escucho.",
  "Aquí estoy, a tu orden.",
];

// Ciclo half-duplex estricto: el micrófono se apaga por completo antes de
// que Pan empiece a hablar y solo vuelve a abrirse este tiempo DESPUÉS de
// que termine de hablar (onDone/onStopped/onError), nunca antes. Reemplaza
// el diseño full-duplex anterior (reconocedor corriendo durante el TTS +
// barge-in por software), que en la práctica seguía dejando pasar eco
// residual del parlante como si fuera una orden nueva.
const TTS_MIC_COOLDOWN_MS = 400;

// Tiempo de inactividad antes de procesar el texto acumulado (antes 1200ms):
// se amplía para no cortar la frase justo cuando el usuario dice la
// preposición ("...vendí 20 polos a...") y todavía le falta el monto.
const SILENCE_DEBOUNCE_MS = 2000;
// Si al vencer el debounce la frase termina en una palabra conectiva, se
// concede esta espera adicional una sola vez antes de procesarla igual.
const INCOMPLETE_PHRASE_EXTRA_MS = 3000;
// Palabras con las que una orden nunca termina de forma natural: indican
// que el usuario iba a seguir hablando (el monto, el producto, etc.).
const TRAILING_CONNECTOR_RE = /\b(?:a|por|de|cada|en)$/i;
// Vigencia máxima de una frase incompleta conservada entre sesiones del
// reconocedor (tras un reinicio automático): pasado esto se descarta en vez
// de anteponerla a lo próximo que diga el usuario, que podría no tener nada
// que ver con la orden interrumpida.
const PENDING_PREFIX_MAX_AGE_MS = 8000;

// El tipo publicado de expo-speech-recognition declara `results` como
// `{ transcript: string; ... }[]`, pero en hardware real conviene no asumir
// ciegamente esa forma: se tolera tanto el objeto esperado como (por si
// algún servicio de reconocimiento del dispositivo difiere) un string suelto.
function extractTranscript(results: unknown): string {
  if (!Array.isArray(results) || results.length === 0) return "";
  const first = results[0];
  if (typeof first === "string") return first;
  if (first && typeof (first as any).transcript === "string") return (first as any).transcript;
  return "";
}

export default function Voice() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    createSale,
    createExpense,
    createPurchase,
    products,
    sales,
    expenses,
  } = useData() as any;
  const { user } = useAuth();
  const cur = user?.currency || "PEN";

  // Estados visuales y de flujo desacoplados
  const [isRecordingUI, setIsRecordingUI] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isProcessingUI, setIsProcessingUI] = useState(false);
  const [activeCard, setActiveCard] = useState<ActiveCard>("none");
  const [transcript, setTranscript] = useState("");
  const [queryAnswer, setQueryAnswer] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  // Estado breve tipo "Dime, te escucho..." tras un saludo/chequeo de
  // atención; se limpia en cuanto llega la siguiente orden.
  const [assistantStatus, setAssistantStatus] = useState("");

  const [showHelpModal, setShowHelpModal] = useState(false);
  const [expandedHelpCategory, setExpandedHelpCategory] = useState<string | null>("sales");

  const [continuousMode, setContinuousMode] = useState(false);
  const continuousActiveRef = useRef(false);
  const isAwaitingVoiceConfirmRef = useRef(false);
  // Se activa en el instante en que se clasifica "sí guardar"/"no cancelar"
  // y se apaga recién cuando esa acción terminó por completo (persistencia +
  // TTS de confirmación, o el reseteo tras cancelar). Cubre el hueco entre
  // detectar el comando y que isSpeakingRef se active con el TTS de
  // respuesta: sin esto, cualquier resultado de voz que llegue mientras la
  // venta/gasto/ingreso se está guardando en SQLite (ruido, eco residual,
  // una repetición tardía del propio "sí guardar") se cuela como si fuera
  // una orden nueva y termina en un "No entendí bien" repetido.
  const isProcessingActionRef = useRef(false);
  // Se activa solo en la limpieza de desmontaje del componente y en close(),
  // justo antes de su Speech.stop(). Distingue ese Speech.stop() (la
  // pantalla ya se está yendo, no debe tocar más estado) de cualquier otro
  // -por ejemplo el que dispara speakWithCallback al empezar a hablar, cuyo
  // callback (reset() tras un guardado exitoso) sí debe ejecutarse aunque
  // la locución se corte a la mitad-.
  const isUnmountingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  // Ventana de gracia tras terminar de hablar (onDone/onStopped/onError):
  // el audio del parlante puede seguir "sonando"/reverberando un instante
  // después de que isSpeakingRef pase a false y el micrófono ya se haya
  // reabierto (ver finishSpeaking/TTS_MIC_COOLDOWN_MS). Cualquier resultado
  // dentro de esta ventana se descarta igual que si isSpeakingRef siguiera
  // en true -defensa adicional sobre el cooldown físico del micrófono, no
  // el mecanismo principal.
  const speechGuardUntilRef = useRef(0);
  const recognizingRef = useRef(false);
  const activeCardRef = useRef<ActiveCard>("none");

  // Recuperación automática del reconocimiento nativo continuo
  const restartTimerRef = useRef<any>(null);
  const restartAttemptsRef = useRef<{ count: number; windowStart: number }>({ count: 0, windowStart: 0 });
  // Disparador por silencio: en Android continuo, isFinal a veces nunca
  // llega. Si no hay palabras nuevas en 1.2s, se procesa igual el texto
  // acumulado más reciente en vez de quedar esperando para siempre.
  const silenceTimeoutRef = useRef<any>(null);
  const latestTranscriptRef = useRef("");
  // Texto del último evento "result" (cambie o no isFinal). Solo se reinicia
  // el temporizador de silencio cuando este valor realmente cambia, para que
  // resultados repetidos (ruido, reintentos de red) no lo posterguen sin fin.
  const lastSeenTextRef = useRef("");
  // Frase incompleta ("...vendí 20 polos a") retenida entre el "end" de una
  // sesión y el "result" de la siguiente (tras scheduleRestart), para no
  // perderla cuando el reconocedor nativo cierra la sesión a media orden.
  const pendingPrefixRef = useRef("");
  const pendingPrefixSetAtRef = useRef(0);
  // Evita extender el debounce más de una vez por frase pendiente.
  const incompleteExtendedRef = useRef(false);
  // Empieza en falso: el reconocimiento en el dispositivo requiere el modelo
  // offline ya descargado, y forzarlo sin esa garantía es lo que dejaba el
  // micrófono "mudo" en hardware real. Solo se activa tras confirmar una
  // descarga exitosa (ver startContinuousMode).
  const onDeviceRef = useRef(false);
  const langIndexRef = useRef(0);
  const lastFinalRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  // Datos de la orden
  const [saleItems, setSaleItems] = useState<ParsedBatchSaleItem[]>([]);
  const [salePaymentMethod, setSalePaymentMethod] = useState<"cash" | "transfer" | "mixed">("cash");
  const [saleCashAmount, setSaleCashAmount] = useState("");
  const [saleTransferAmount, setSaleTransferAmount] = useState("");

  const [stockItems, setStockItems] = useState<ParsedStockItem[]>([]);
  const [stockNote, setStockNote] = useState("");
  // Índice del ítem de stock cuya fecha de vencimiento se está eligiendo
  // (un solo modal compartido por todas las filas de la tarjeta).
  const [expiryPickerIndex, setExpiryPickerIndex] = useState<number | null>(null);

  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("Operativos");
  const [expenseAmount, setExpenseAmount] = useState("0");
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<"cash" | "transfer">("cash");

  // Referencias para asegurar persistencia al confirmar por voz
  const saleItemsRef = useRef(saleItems);
  saleItemsRef.current = saleItems;
  const salePaymentMethodRef = useRef(salePaymentMethod);
  salePaymentMethodRef.current = salePaymentMethod;
  const saleCashAmountRef = useRef(saleCashAmount);
  saleCashAmountRef.current = saleCashAmount;
  const saleTransferAmountRef = useRef(saleTransferAmount);
  saleTransferAmountRef.current = saleTransferAmount;

  const stockItemsRef = useRef(stockItems);
  stockItemsRef.current = stockItems;
  const stockNoteRef = useRef(stockNote);
  stockNoteRef.current = stockNote;

  const expenseDescriptionRef = useRef(expenseDescription);
  expenseDescriptionRef.current = expenseDescription;
  const expenseCategoryRef = useRef(expenseCategory);
  expenseCategoryRef.current = expenseCategory;
  const expenseAmountRef = useRef(expenseAmount);
  expenseAmountRef.current = expenseAmount;
  const expensePaymentMethodRef = useRef(expensePaymentMethod);
  expensePaymentMethodRef.current = expensePaymentMethod;

  const scale = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  useEffect(() => {
    return () => {
      isUnmountingRef.current = true;
      cancelAnimation(scale);
      continuousActiveRef.current = false;
      clearRestartTimer();
      clearSilenceTimer();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {}
      deactivateKeepAwake();
      Speech.stop();
    };
  }, [scale]);

  const clearRestartTimer = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const clearSilenceTimer = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  };

  const startPulse = () => {
    scale.value = withRepeat(withTiming(1.22, { duration: 550 }), -1, true);
  };
  const stopPulse = () => {
    cancelAnimation(scale);
    scale.value = withTiming(1);
  };

  const close = () => {
    // Marca el cierre como definitivo ANTES de Speech.stop(): si el usuario
    // cierra manualmente (X) mientras Pan todavía lee "Venta guardada...",
    // ese Speech.stop() dispara "onStopped" -que sí ejecuta su callback
    // (reset/close) cuando la locución se corta por cualquier otro motivo-,
    // y sin esta bandera terminaría llamando a close() una segunda vez
    // sobre una pantalla que ya se está yendo.
    isUnmountingRef.current = true;
    continuousActiveRef.current = false;
    clearRestartTimer();
    clearSilenceTimer();
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {}
    deactivateKeepAwake();
    Speech.stop();
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    router.back();
  };

  // Se ejecuta al terminar de hablar por cualquier vía (onDone/onStopped/
  // onError): siempre el mismo tratamiento, porque para el half-duplex
  // estricto da igual SI la locución terminó sola o fue cortada -lo único
  // que importa es que Pan ya no está hablando, así que el micrófono puede
  // (tras el cooldown) volver a escuchar.
  const finishSpeaking = (onDoneCallback?: () => void) => {
    isSpeakingRef.current = false;
    speechGuardUntilRef.current = Date.now() + TTS_ECHO_GUARD_MS;
    if (onDoneCallback && !isUnmountingRef.current) onDoneCallback();

    // Reapertura controlada del micrófono: solo si el Modo Mostrador sigue
    // activo (si no, no hay nada que escuchar) y solo después del cooldown
    // -nunca antes-, para que el eco residual del parlante se extinga
    // primero. clearRestartTimer() cancela cualquier reintento de
    // recuperación (scheduleRestart) que pudiera seguir pendiente de una
    // sesión cortada por error, así ambos mecanismos nunca compiten por
    // reabrir el micrófono en momentos distintos.
    if (!continuousActiveRef.current || isUnmountingRef.current) return;
    clearRestartTimer();
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (!continuousActiveRef.current || isSpeakingRef.current || isUnmountingRef.current) return;
      beginRecognition(true);
    }, TTS_MIC_COOLDOWN_MS);
  };

  const speakWithCallback = (text: string, onDoneCallback?: () => void) => {
    // Half-duplex estricto: el micrófono se apaga por completo ANTES de
    // empezar a hablar -nunca escucha y habla a la vez-, y solo se reabre
    // (ver finishSpeaking) tras el cooldown posterior a que Pan termine.
    // Sustituye el diseño full-duplex + barge-in por software anterior,
    // que en dispositivos sin cancelación de eco por hardware seguía
    // dejando pasar fragmentos de la propia voz de Pan como si fueran
    // órdenes nuevas.
    isSpeakingRef.current = true;
    clearRestartTimer();
    clearSilenceTimer();
    // Cualquier transcripción parcial pendiente se descarta: no debe
    // sobrevivir al corte de la sesión de reconocimiento que sigue.
    latestTranscriptRef.current = "";
    pendingPrefixRef.current = "";
    incompleteExtendedRef.current = false;
    if (recognizingRef.current) {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {}
    }

    Speech.stop();
    Speech.speak(text, {
      language: "es-ES",
      rate: 1.05,
      onDone: () => finishSpeaking(onDoneCallback),
      onStopped: () => finishSpeaking(onDoneCallback),
      onError: () => finishSpeaking(onDoneCallback),
    });
  };

  // Construye y arranca una sesión de reconocimiento nativo en el dispositivo.
  const beginRecognition = (continuous: boolean) => {
    try {
      ExpoSpeechRecognitionModule.start({
        lang: LANGUAGE_FALLBACKS[langIndexRef.current] || LANGUAGE_FALLBACKS[0],
        interimResults: true,
        continuous,
        requiresOnDeviceRecognition: onDeviceRef.current,
        addsPunctuation: false,
        iosCategory: {
          category: "playAndRecord",
          categoryOptions: ["defaultToSpeaker", "allowBluetooth"],
          mode: "measurement",
        },
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2000,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 1200,
          EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 15000,
        },
      });
    } catch (e: any) {
      setErrorMsg(e?.message || "No se pudo iniciar el reconocimiento de voz");
    }
  };

  const endRecognitionCompletely = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {}
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  };

  // El reconocedor nativo puede terminar una sesión por sí solo (silencio,
  // límites del SO en Android) aunque continuous:true esté activo; esto la
  // reanuda automáticamente para que el micrófono nunca quede apagado.
  const scheduleRestart = () => {
    if (!continuousActiveRef.current) return;
    clearRestartTimer();
    restartTimerRef.current = setTimeout(() => {
      if (!continuousActiveRef.current) return;
      if (isSpeakingRef.current) {
        scheduleRestart();
        return;
      }
      const now = Date.now();
      if (now - restartAttemptsRef.current.windowStart > 5000) {
        restartAttemptsRef.current = { count: 0, windowStart: now };
      }
      restartAttemptsRef.current.count += 1;
      if (restartAttemptsRef.current.count > 6) {
        setErrorMsg("El reconocimiento de voz se interrumpió repetidamente. Vuelve a activar el Modo Mostrador.");
        forceStopContinuousMode();
        return;
      }
      beginRecognition(true);
    }, 300);
  };

  const forceStopContinuousMode = () => {
    continuousActiveRef.current = false;
    isAwaitingVoiceConfirmRef.current = false;
    clearRestartTimer();
    clearSilenceTimer();
    setContinuousMode(false);
    endRecognitionCompletely();
    deactivateKeepAwake();
  };

  const startContinuousMode = async () => {
    setErrorMsg("");
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setErrorMsg("Permiso de micrófono o reconocimiento de voz no otorgado");
      return;
    }

    continuousActiveRef.current = true;
    restartAttemptsRef.current = { count: 0, windowStart: Date.now() };
    setContinuousMode(true);
    await activateKeepAwakeAsync();
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: "duckOthers",
    }).catch(() => {});

    if (Platform.OS === "android") {
      ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: LANGUAGE_FALLBACKS[langIndexRef.current] })
        .then((res) => {
          // Solo se activa el reconocimiento en el dispositivo una vez
          // confirmado que el modelo offline ya está descargado; de lo
          // contrario se sigue transcribiendo en línea sin bloquear la UI.
          if (res?.status === "download_success") onDeviceRef.current = true;
        })
        .catch(() => {});
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    // No se inicia el reconocimiento mientras Pan saluda: en Android ambos
    // compiten por el Audio Focus y el micrófono queda inutilizable. La
    // escucha arranca sola (ver finishSpeaking) tras el cooldown posterior
    // al saludo, igual que después de cualquier otra locución.
    speakWithCallback("Modo mostrador activado. Puedes decir Pan, Oye Pan o tu orden.");
  };

  const stopContinuousMode = () => {
    continuousActiveRef.current = false;
    isAwaitingVoiceConfirmRef.current = false;
    activeCardRef.current = "none";
    setActiveCard("none");
    clearRestartTimer();
    clearSilenceTimer();
    setContinuousMode(false);
    endRecognitionCompletely();
    deactivateKeepAwake();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    speakWithCallback("Ahora si me voy a mimir.", () => {
      close();
    });
  };

  // Desactivación MANUAL del Modo Mostrador (botón, no el comando de voz
  // "descansa Pan"): solo pausa la escucha continua. A diferencia de
  // stopContinuousMode, nunca cierra el panel de voz — el cierre real solo
  // debe ocurrir con la cruz (X) o el botón "Cerrar".
  const stopContinuousModeManual = () => {
    continuousActiveRef.current = false;
    isAwaitingVoiceConfirmRef.current = false;
    clearRestartTimer();
    clearSilenceTimer();
    setContinuousMode(false);
    endRecognitionCompletely();
    deactivateKeepAwake();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const startManualListening = async () => {
    if (recognizingRef.current) return;
    setErrorMsg("");
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setErrorMsg("Permiso de micrófono o reconocimiento de voz no otorgado");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: "duckOthers",
    }).catch(() => {});
    beginRecognition(false);
  };

  const stopManualListening = () => {
    // El botón manual no espera al evento nativo "end": si ya hay texto
    // acumulado, se procesa de inmediato al tocar.
    if (latestTranscriptRef.current) {
      commitTranscript(latestTranscriptRef.current);
    }
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {}
  };

  // --- Eventos nativos del reconocedor continuo ---

  useSpeechRecognitionEvent("start", () => {
    recognizingRef.current = true;
    setIsSessionActive(true);
  });

  useSpeechRecognitionEvent("end", () => {
    recognizingRef.current = false;
    setIsSessionActive(false);
    setIsRecordingUI(false);
    stopPulse();

    // Ejecución garantizada: si la sesión terminó (Android la cerró sola,
    // o el usuario la detuvo) dejando una frase sin procesar, se envía de
    // inmediato en vez de confiar únicamente en el temporizador de silencio
    // (que puede no llegar a disparar si el reconocedor ya se reinició) —
    // salvo que la frase quede claramente incompleta ("...a", "...por") y
    // siga en Modo Mostrador: ahí se conserva para la sesión que continúa.
    flushPendingTranscript();

    // isSpeakingRef true aquí significa que este "end" es el resultado del
    // propio stop() que speakWithCallback dispara al empezar a hablar
    // (half-duplex estricto): la reapertura del micrófono para ese caso ya
    // la programa finishSpeaking con su propio cooldown de
    // TTS_MIC_COOLDOWN_MS, así que scheduleRestart debe abstenerse -de lo
    // contrario ambos mecanismos compiten por reabrir el micrófono en
    // momentos distintos, uno de ellos sin esperar el cooldown-. Fuera de
    // eso (sesión cortada por el propio sistema operativo mientras nadie
    // hablaba), scheduleRestart sigue siendo la recuperación normal.
    if (continuousActiveRef.current && !isSpeakingRef.current) {
      scheduleRestart();
    } else if (!continuousActiveRef.current) {
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
  });

  useSpeechRecognitionEvent("speechstart", () => {
    // Sin barge-in: en half-duplex estricto el reconocedor está apagado
    // mientras Pan habla (ver speakWithCallback), así que este evento no
    // debería dispararse durante una locución. Si de todos modos llegara a
    // ocurrir, no se interrumpe nada aquí -isSpeakingRef en el handler de
    // "result" ya descarta cualquier resultado mientras tanto.
    setIsRecordingUI(true);
    startPulse();
  });

  useSpeechRecognitionEvent("speechend", () => {
    setIsRecordingUI(false);
    stopPulse();
  });

  // Envía el texto a procesar una sola vez por enunciado: si "isFinal" y el
  // disparador por silencio llegaran a coincidir para el mismo texto, este
  // filtro evita ejecutarlo dos veces. Limpia el buffer pendiente de
  // inmediato para que "end" no vuelva a reenviar el mismo texto después.
  const commitTranscript = (rawText: string) => {
    latestTranscriptRef.current = "";
    pendingPrefixRef.current = "";
    incompleteExtendedRef.current = false;
    clearSilenceTimer();
    const text = rawText.toLowerCase().trim();
    if (!text) return;
    const now = Date.now();
    if (text === lastFinalRef.current.text && now - lastFinalRef.current.at < 1200) return;
    lastFinalRef.current = { text, at: now };
    console.log("[RUN_PARSE_TRIGGERED]", text);
    runParse(text);
  };

  // Compromete cualquier transcripción pendiente antes de reanudar o cerrar
  // la sesión nativa. Se llama tanto desde "end" como desde los errores
  // transitorios de "error" (network/no-speech/busy/aborted/audio-capture):
  // en ciertos dispositivos, un error de red corta la sesión y dispara un
  // reinicio (scheduleRestart) SIN que "end" llegue a fisar después, así
  // que sin este flush una orden ya transcrita y visible en pantalla -ej.
  // "sí guardar" mientras se espera confirmación- se perdía en silencio: el
  // temporizador de silencio nunca vencía y el texto quedaba pisado por el
  // siguiente resultado de la sesión reiniciada, sin ejecutar nunca
  // handleConfirmSave()/handleCancel().
  const flushPendingTranscript = () => {
    if (isSpeakingRef.current || !latestTranscriptRef.current) return;
    const pending = latestTranscriptRef.current;
    if (continuousActiveRef.current && TRAILING_CONNECTOR_RE.test(pending.trim())) {
      pendingPrefixRef.current = pending;
      pendingPrefixSetAtRef.current = Date.now();
      latestTranscriptRef.current = "";
      clearSilenceTimer();
    } else {
      commitTranscript(pending);
    }
  };

  // Si al vencer el debounce la frase acumulada termina en una palabra
  // conectiva ("...a", "...por"), probablemente sigue incompleta: se
  // concede una espera adicional (una sola vez) antes de procesarla igual.
  const scheduleSilenceCommit = (delay: number) => {
    clearSilenceTimer();
    silenceTimeoutRef.current = setTimeout(() => {
      silenceTimeoutRef.current = null;
      const pending = latestTranscriptRef.current;
      if (!pending) return;
      if (!incompleteExtendedRef.current && TRAILING_CONNECTOR_RE.test(pending.trim())) {
        incompleteExtendedRef.current = true;
        scheduleSilenceCommit(INCOMPLETE_PHRASE_EXTRA_MS);
        return;
      }
      incompleteExtendedRef.current = false;
      commitTranscript(pending);
    }, delay);
  };

  useSpeechRecognitionEvent("result", (event) => {
    // Defensa en profundidad: en half-duplex estricto el reconocedor está
    // físicamente apagado mientras Pan habla y durante el cooldown previo a
    // reabrirlo (ver speakWithCallback/finishSpeaking), así que este evento
    // no debería dispararse en ese lapso. isSpeakingRef y speechGuardUntilRef
    // igual se revisan aquí por si algún resultado en cola llegara justo
    // cuando el micrófono recién se reabre. isProcessingActionRef cubre la
    // otra ventana crítica: mientras se persiste la confirmación de "sí
    // guardar"/"no cancelar" en SQLite, antes de que empiece a sonar el TTS
    // de respuesta (isSpeakingRef todavía no se activó en ese instante).
    if (isSpeakingRef.current || isProcessingActionRef.current || Date.now() < speechGuardUntilRef.current) return;

    const rawText = extractTranscript(event.results).trim();
    if (!rawText) {
      // Depuración: en dispositivo real (build standalone, sin Metro a la
      // vista) esto permite confirmar si el evento llegó pero sin texto
      // extraíble, o si simplemente fue un tramo de silencio.
      console.log("[SpeechResult] resultado sin texto:", JSON.stringify(event));
      if (event.isFinal) {
        setErrorMsg(`Voz detectada pero sin texto reconocible (${event.results?.length || 0} resultado(s)).`);
      }
      return;
    }

    // Filtro de eco por lista negra: si lo "escuchado" coincide con una
    // frase que la propia app emite por TTS, se descarta en silencio (sin
    // tocar transcript ni pendingPrefix) en vez de procesarlo como si fuera
    // una instrucción del usuario.
    if (isKnownAssistantPhrase(rawText)) {
      console.log("[SpeechResult] descartado por lista negra de eco:", rawText);
      return;
    }

    // Si la sesión anterior terminó a media frase, se retoma aquí
    // anteponiendo lo pendiente en vez de perderlo al reiniciar el
    // reconocedor. Un prefijo demasiado viejo (silencio largo de por
    // medio) se descarta: seguramente ya no tiene relación con lo nuevo.
    const hasFreshPrefix =
      !!pendingPrefixRef.current && Date.now() - pendingPrefixSetAtRef.current < PENDING_PREFIX_MAX_AGE_MS;
    const text = hasFreshPrefix ? `${pendingPrefixRef.current} ${rawText}`.trim() : rawText;
    if (!hasFreshPrefix && pendingPrefixRef.current) pendingPrefixRef.current = "";

    setErrorMsg("");
    // Feedback visual inmediato: se muestra lo que el usuario va diciendo
    // aunque el resultado todavía sea provisional (isFinal === false).
    setTranscript(text);
    latestTranscriptRef.current = text;

    if (event.isFinal) {
      commitTranscript(text);
      return;
    }

    // Disparador por silencio: en Modo Mostrador continuo, Android a veces
    // nunca marca isFinal aunque el reconocedor ya terminó de oír la frase.
    // Si no llegan palabras nuevas en el debounce, se procesa igual el
    // texto. Solo se reinicia el conteo cuando el texto realmente cambió:
    // un evento repetido (mismo resultado, ruido, reintento de red) no debe
    // posponer el disparo indefinidamente.
    if (text === lastSeenTextRef.current) {
      if (!silenceTimeoutRef.current) {
        scheduleSilenceCommit(SILENCE_DEBOUNCE_MS);
      }
      return;
    }

    lastSeenTextRef.current = text;
    incompleteExtendedRef.current = false;
    scheduleSilenceCommit(SILENCE_DEBOUNCE_MS);
  });

  // "A final result is returned with no significant recognition" (Web
  // Speech API). Android emite este evento y, a continuación, "error" con
  // "no-speech" — ya tolerado más abajo — así que aquí no hace falta
  // ninguna acción: la reanudación ocurre vía el evento "end".
  useSpeechRecognitionEvent("nomatch", () => {});

  useSpeechRecognitionEvent("error", (event: ExpoSpeechRecognitionErrorEvent) => {
    // Códigos habituales en Android que NO deben cerrar el Modo Mostrador ni
    // mostrarse como error en pantalla: "no-speech" cubre tanto silencio
    // como ERROR_NO_MATCH ("no-match"), "busy" ocurre si el reconocedor del
    // sistema tarda en liberarse entre sesiones, y "network"/"audio-capture"
    // son fallos transitorios de conectividad o del micrófono del sistema
    // (ej. "Other network related errors.") que Android suele resolver solo
    // en el siguiente intento. Ninguno de estos debe vaciar ni bloquear una
    // tarjeta de confirmación ya abierta (isAwaitingVoiceConfirmRef): el
    // usuario sigue pudiendo confirmar/descartar por voz o por pantalla en
    // cuanto la escucha se reanude. Se reanuda con un pequeño debounce sin
    // esperar solamente al evento "end" (puede no llegar a dispararse tras
    // ciertos errores nativos).
    if (
      event.error === "no-speech" ||
      event.error === "speech-timeout" ||
      event.error === "busy" ||
      event.error === "aborted" ||
      event.error === "network" ||
      event.error === "audio-capture"
    ) {
      // Igual que en "end": si ya había una frase transcrita en pantalla
      // (ej. "sí guardar" respondiendo a la tarjeta de confirmación), se
      // procesa ahora mismo -sin esto, un "end" que nunca llega a fisar
      // tras este error la dejaría pisada por el siguiente resultado de la
      // sesión reiniciada, sin ejecutar nunca la confirmación/cancelación-.
      flushPendingTranscript();
      if (continuousActiveRef.current) scheduleRestart();
      return;
    }
    if (event.error === "language-not-supported") {
      if (onDeviceRef.current) {
        // Reintenta el mismo idioma sin exigir el modelo offline.
        onDeviceRef.current = false;
        return;
      }
      if (langIndexRef.current < LANGUAGE_FALLBACKS.length - 1) {
        langIndexRef.current += 1;
        setErrorMsg("");
        return;
      }
      setErrorMsg("Ningún idioma de reconocimiento de voz está disponible en este equipo.");
      forceStopContinuousMode();
      return;
    }
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      setErrorMsg("Permiso de micrófono o reconocimiento de voz no otorgado.");
      forceStopContinuousMode();
      return;
    }
    // Cualquier otro código: se informa solo si no hay una tarjeta de
    // confirmación abierta (no tiene sentido asustar con un banner rojo
    // mientras el usuario está editando/confirmando una orden ya capturada).
    if (activeCardRef.current === "none") {
      setErrorMsg(event.message || "Error del reconocimiento de voz");
    }
  });

  const computeLocalFinancialReport = (period: string) => {
    const todayStr = new Date().toISOString().split("T")[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const sList = (sales || []).filter((s: any) => {
      const sDate = s.created_at || "";
      if (period === "today") return sDate.startsWith(todayStr);
      if (period === "week") return new Date(sDate) >= sevenDaysAgo;
      if (period === "month") return sDate.startsWith(todayStr.slice(0, 7));
      return true;
    });

    const eList = (expenses || []).filter((e: any) => {
      const eDate = e.created_at || "";
      if (period === "today") return eDate.startsWith(todayStr);
      if (period === "week") return new Date(eDate) >= sevenDaysAgo;
      if (period === "month") return eDate.startsWith(todayStr.slice(0, 7));
      return true;
    });

    const totalIncome = sList.reduce((acc: number, s: any) => acc + (Number(s.total) || 0), 0);
    const cogs = sList.reduce((acc: number, s: any) => acc + (Number(s.cost_total) || 0), 0);
    const operatingExpenses = eList
      .filter((e: any) => e.type !== "Mercancía" && e.category !== "Compra de Stock")
      .reduce((acc: number, e: any) => acc + (Number(e.amount) || 0), 0);

    const totalExpenses = cogs + operatingExpenses;
    const netProfit = totalIncome - totalExpenses;

    return {
      periodLabel: period === "today" ? "del día" : period === "week" ? "de la semana" : "del mes",
      totalIncome,
      totalExpenses,
      cogs,
      operatingExpenses,
      netProfit,
      salesCount: sList.length,
    };
  };

  // Envoltorio con captura global: si algo en runParseInner lanza una
  // excepción en cualquier punto (no solo dentro de su propio try interno),
  // esto evita que la promesa quede rechazada en silencio -exactamente el
  // síntoma reportado de "queda flotando sin abrir tarjeta ni responder"-
  // y en su lugar avisa al usuario.
  const runParse = async (text: string) => {
    console.log("[RUN_PARSE_TRIGGERED]", text);
    try {
      await runParseInner(text);
    } catch (outerErr: any) {
      console.log("[RUN_PARSE_UNCAUGHT_ERROR]", outerErr);
      setErrorMsg(outerErr?.message || "Ocurrió un error inesperado al procesar la orden.");
      speakWithCallback("Tuve un problema procesando eso. Intenta de nuevo.");
      setIsProcessingUI(false);
    }
  };

  const runParseInner = async (text: string) => {
    setTranscript(text);
    setAssistantStatus("");

    if (/(?:descansa|duerme|reposo|apagar|apagate|apágate|mimir)\s*(?:pan|pam)?/i.test(text)) {
      stopContinuousMode();
      return;
    }

    if (isAwaitingVoiceConfirmRef.current) {
      // Comando de método de pago ("pagar todo en efectivo", "pagar mixto",
      // "120 en efectivo"): ajusta el reparto sin confirmar ni cancelar.
      if (activeCardRef.current === "batch_sale") {
        const totalNow = saleItemsRef.current.reduce((acc, it) => acc + it.qty * it.unit_price, 0);
        const payCmd = parsePaymentCommand(text, totalNow);
        if (payCmd) {
          setSalePaymentMethod(payCmd.method);
          if (payCmd.method === "mixed") {
            setSaleCashAmount(payCmd.cashAmount !== undefined ? String(payCmd.cashAmount) : "");
            setSaleTransferAmount(payCmd.transferAmount !== undefined ? String(payCmd.transferAmount) : "");
          }
          const methodText = payCmd.method === "cash" ? "efectivo" : payCmd.method === "transfer" ? "transferencia" : "pago mixto";
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          speakWithCallback(`Listo, ${methodText}. ¿Algo más?`);
          return;
        }
      }

      const confirmCommand = classifyConfirmCommand(text);
      if (confirmCommand === "confirm") {
        // Se apaga la escucha de comandos de voz (vía isProcessingActionRef,
        // consultado en el handler de "result") en el mismo instante en que
        // se reconoce "sí guardar": cualquier resultado de voz que llegue
        // mientras se persiste en SQLite -eco residual, ruido, una repetición
        // tardía del propio "sí guardar"- se descarta en vez de procesarse
        // como una orden nueva.
        isAwaitingVoiceConfirmRef.current = false;
        isProcessingActionRef.current = true;
        setIsProcessingUI(true);
        try {
          let completed = false;
          if (activeCardRef.current === "batch_sale") {
            completed = await onConfirmBatchSale();
          } else if (activeCardRef.current === "expense") {
            completed = await onConfirmExpense();
          } else if (activeCardRef.current === "stock_in") {
            completed = await onConfirmStockIn();
          }
          // Si la validación bloqueó el guardado (precio faltante, pago
          // mixto que no cuadra, error de persistencia), la tarjeta sigue
          // abierta para corregir: el modo confirmación debe seguir activo,
          // o "sí guardar" dicho de nuevo caería en el flujo genérico de
          // órdenes nuevas y terminaría en "No entendí bien".
          if (!completed) isAwaitingVoiceConfirmRef.current = true;
        } finally {
          setIsProcessingUI(false);
          isProcessingActionRef.current = false;
        }
        return;
      }

      if (confirmCommand === "cancel") {
        isAwaitingVoiceConfirmRef.current = false;
        isProcessingActionRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        speakWithCallback("Operación cancelada.", () => {
          reset();
          isProcessingActionRef.current = false;
          // Mismo criterio que al guardar: en Modo Mostrador el panel se
          // queda abierto y reseteado, listo para la siguiente orden; en
          // modo manual (una sola pulsación, sin escucha continua) se
          // cierra solo, igual que "sí guardar" -antes solo el guardado
          // cerraba el panel en modo manual, y "no cancelar" lo dejaba
          // trabado abierto sin ninguna tarjeta que mostrar.
          if (!continuousActiveRef.current) close();
        });
        return;
      }

      // Buffer acumulativo: si la orden de venta sigue abierta, intenta sumar
      // el nuevo producto dictado en lugar de descartar la tarjeta.
      if (activeCardRef.current === "batch_sale") {
        const memory = await getAssistantMemory();
        const additions = parseAdditionalSaleClauses(text, products || [], memory);
        if (additions.length > 0) {
          setSaleItems((prev) => mergeSaleItems(prev, additions));
          const addedNames = additions.map((a) => `${a.qty} ${a.name}`).join(" y ");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          speakWithCallback(`Anotado ${addedNames}. ¿Algo más?`);
          return;
        }
      }

      // Mismo buffer acumulativo para el ingreso de stock: la tarjeta admite
      // múltiples productos sin cerrarse.
      if (activeCardRef.current === "stock_in") {
        const additions = parseAdditionalStockClauses(text, products || []);
        if (additions.length > 0) {
          setStockItems((prev) => mergeStockItems(prev, additions));
          const addedNames = additions.map((a) => `${a.qty} ${a.name}`).join(" y ");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          speakWithCallback(`Anotado ${addedNames}. ¿Algo más?`);
          return;
        }
      }

      // La tarjeta de gasto es un formulario único (no una lista de ítems
      // como venta/stock): una corrección dictada ("cincuenta soles en
      // chocolate") reemplaza los campos editables con la nueva lectura en
      // vez de perderse, sin romper el contexto de confirmación pendiente.
      if (activeCardRef.current === "expense") {
        const memory = await getAssistantMemory();
        const updated = parseSingleExpense(text, memory);
        if (updated && updated.amount > 0) {
          setExpenseDescription(updated.note || "Gasto general");
          setExpenseCategory(updated.category || "Operativos");
          setExpenseAmount(String(updated.amount));
          if (!updated.methodUnspecified) setExpensePaymentMethod(updated.method);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          speakWithCallback(`Actualizado: ${updated.note} por ${formatMoney(updated.amount, cur, 2)}. ¿Guardo o corrijo algo más?`);
          return;
        }
      }

      // Silencio, ruido o frase no reconocida: la tarjeta permanece abierta
      // para edición táctil, tal como exige el modo mostrador.
      return;
    }

    const cleanWord = text.toLowerCase().replace(/[^a-záéíóúñ]/g, "").trim();
    if (["pan", "pam", "pancito", "oyepan", "oyepam", "holapan", "eypan"].includes(cleanWord)) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      speakWithCallback("¡Dime!");
      return;
    }

    setIsProcessingUI(true);
    try {
      const p = await analyzeVoiceIntent(text, products || []);

      if (p.kind === "sleep_assistant") {
        stopContinuousMode();
        return;
      }

      if (p.kind === "attention_check") {
        const reply = ATTENTION_REPLIES[Math.floor(Math.random() * ATTENTION_REPLIES.length)];
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setAssistantStatus("Dime, te escucho...");
        speakWithCallback(reply);
        return;
      }

      if (p.kind === "stock_in") {
        const itemsWithStock = (p.items || []).map((it: any) => {
          const matched = it.product || (products || []).find(
            (pr: any) => pr.name.toLowerCase().trim() === it.name.toLowerCase().trim()
          );
          return { ...it, product: matched, currentStock: matched ? Number(matched.stock) || 0 : undefined };
        });

        setStockItems(itemsWithStock);
        setStockNote(p.note || "");
        activeCardRef.current = "stock_in";
        setActiveCard("stock_in");
        isAwaitingVoiceConfirmRef.current = true;

        const itemNames = itemsWithStock.map((i: any) => `${i.qty} ${i.name}`).join(" y ");
        speakWithCallback(`Anotado ${itemNames}. ¿Algo más?`);
        return;
      }

      if (p.kind === "quote_query" || p.kind === "query") {
        let ans = "";
        const period = p.range || (text.includes("semana") ? "week" : text.includes("mes") ? "month" : "today");

        if (p.kind === "quote_query") {
          const match = (products || []).find((pr: any) =>
            pr.name.toLowerCase().includes((p.targetProduct || "").toLowerCase())
          );
          if (match) {
            const tot = (Number(match.price) || 0) * (p.qty || 1);
            ans = `Para ${p.qty} ${match.name} a ${formatMoney(match.price, cur, 2)}, el total es ${formatMoney(tot, cur, 2)}. Stock disponible: ${match.stock}.`;
          } else {
            ans = `No encontré ${p.targetProduct} en el inventario.`;
          }
        } else if (p.metric === "inventory_value") {
          const totalCost = (products || []).reduce(
            (acc: number, item: any) => acc + (Number(item.stock) || 0) * (Number(item.cost) || 0),
            0
          );
          ans = `Tienes ${formatMoney(totalCost, cur, 2)} invertidos en inventario.`;
        } else if (p.metric === "stock_item") {
          const match = (products || []).find((pr: any) =>
            pr.name.toLowerCase().includes((p.targetProduct || "").toLowerCase())
          );
          ans = match
            ? `Quedan ${match.stock} unidades de ${match.name} en almacén.`
            : `No se encontró el producto ${p.targetProduct}.`;
        } else {
          const report = computeLocalFinancialReport(period);
          if (p.metric === "expenses") {
            ans = `Tus egresos totales ${report.periodLabel} son ${formatMoney(report.totalExpenses, cur, 2)}.`;
          } else if (p.metric === "profit") {
            ans = `Tu ganancia neta ${report.periodLabel} es de ${formatMoney(report.netProfit, cur, 2)}.`;
          } else {
            ans = `Informe ${report.periodLabel}: Ventas por ${formatMoney(report.totalIncome, cur, 2)}, egresos por ${formatMoney(report.totalExpenses, cur, 2)}, dejando ganancia neta de ${formatMoney(report.netProfit, cur, 2)}.`;
          }
        }

        setQueryAnswer(ans);
        activeCardRef.current = "query_result";
        setActiveCard("query_result");
        speakWithCallback(ans);
        return;
      }

      if (p.kind === "disambiguation") {
        // El nombre dictado coincide (fuzzy match) con más de un producto
        // del catálogo: en vez de morir con el error genérico de "no
        // entendí", se abre la tarjeta igual con el primer candidato
        // preseleccionado y una advertencia, para que el cajero solo tenga
        // que corregirlo en pantalla si no era el correcto.
        const resolvedItems = (p.allItems || []).map((it: any) => {
          if (!it.candidates || it.candidates.length <= 1) return it;
          const best = it.candidates[0];
          return {
            ...it,
            name: best.name,
            product: best,
            unit_price: it.unit_price > 0 ? it.unit_price : Number(best.price) || 0,
            currentStock: Number(best.stock) || 0,
            warning: `Verifica el producto (coincide con ${it.candidates.length})`,
          };
        });

        setSaleItems(resolvedItems);
        setSalePaymentMethod(p.method || "cash");
        activeCardRef.current = "batch_sale";
        setActiveCard("batch_sale");
        isAwaitingVoiceConfirmRef.current = true;

        const itemNames = resolvedItems.map((i: any) => `${i.qty} ${i.name}`).join(" y ");
        speakWithCallback(`Anotado ${itemNames}, pero revisa el producto en pantalla. ¿Algo más?`);
        return;
      }

      if (p.kind === "batch_sale") {
        const itemsWithStock = (p.items || []).map((it: any) => {
          const matched = (products || []).find(
            (pr: any) => pr.name.toLowerCase().trim() === it.name.toLowerCase().trim()
          );
          const currentStock = matched ? Number(matched.stock) || 0 : undefined;
          let warn = it.warning;
          if (currentStock !== undefined && it.qty > currentStock) {
            warn = `Stock insuficiente (Disponible: ${currentStock})`;
          } else if (!matched) {
            warn = "Producto no catalogado";
          }
          return {
            ...it,
            product: matched || it.product,
            currentStock,
            warning: warn,
          };
        });

        const allUncatalogued = itemsWithStock.every((it: any) => it.warning === "Producto no catalogado");
        if (allUncatalogued) {
          const names = itemsWithStock.map((it: any) => it.name).join(", ");
          setErrorMsg(`No encontré el producto "${names}" en inventario.`);
          speakWithCallback("No encontré ese producto, repítemelo por favor.");
          return;
        }

        setSaleItems(itemsWithStock);
        setSalePaymentMethod(p.method || "cash");
        activeCardRef.current = "batch_sale";
        setActiveCard("batch_sale");
        isAwaitingVoiceConfirmRef.current = true;

        const itemNames = itemsWithStock.map((i: any) => `${i.qty} ${i.name}`).join(" y ");
        const hasWarning = itemsWithStock.some((it: any) => it.warning);
        const readback = hasWarning
          ? "Anotado, pero revisa el producto en pantalla. ¿Algo más?"
          : `Anotado ${itemNames}. ¿Algo más?`;

        speakWithCallback(readback);
        return;
      }

      if (p.kind === "expense") {
        // El tipo de retorno de analyzeVoiceIntent se infiere como una unión
        // muy grande (13+ formas distintas de "kind"); TS no logra reducir
        // "category"/"amount" a este miembro específico pese al chequeo de
        // arriba, así que se afirma explícitamente la forma ya validada en
        // tiempo de ejecución por parseSingleExpense().
        const exp = p as { note: string; category: string; amount: number; method: "cash" | "transfer" };
        setExpenseDescription(exp.note || "Gasto general");
        setExpenseCategory(exp.category || "Operativos");
        setExpenseAmount(String(exp.amount || 0));
        setExpensePaymentMethod(exp.method || "cash");
        activeCardRef.current = "expense";
        setActiveCard("expense");
        isAwaitingVoiceConfirmRef.current = true;

        // La sugerencia hablada "Di: sí guardar o no cancelar" solo tiene
        // sentido en Modo Mostrador (el micrófono sigue escuchando). Con
        // una pulsación manual el micrófono ya se apagó al capturar esta
        // frase, así que decirla en voz alta sería una instrucción que el
        // usuario no puede seguir sin volver a tocar el botón.
        const base = `¿Confirmo gasto de ${exp.note} por ${formatMoney(exp.amount || 0, cur, 2)} ${exp.method === "cash" ? "en efectivo" : "por transferencia"}?`;
        const readback = continuousActiveRef.current ? `${base} Di: "Sí guardar" o "No cancelar".` : base;
        speakWithCallback(readback);
        return;
      }

      // Ninguna intención reconocida (incluye "unknown" y cualquier otro
      // kind que esta pantalla todavía no maneja): se avisa por voz y en
      // pantalla en vez de quedar en silencio sin abrir ninguna tarjeta.
      setErrorMsg('No logré entender el producto o precio. Prueba diciendo: "vendí 5 polos a 10 soles".');
      speakWithCallback("No entendí bien. Intenta de nuevo, por ejemplo: vendí cinco polos a diez soles.");
    } catch (e: any) {
      setErrorMsg(e?.message || "Error al interpretar orden");
    } finally {
      setIsProcessingUI(false);
    }
  };

  const mergeSaleItems = (existing: ParsedBatchSaleItem[], additions: ParsedBatchSaleItem[]): ParsedBatchSaleItem[] => {
    const merged = [...existing];
    additions.forEach((add) => {
      const idx = merged.findIndex((it) => it.name.toLowerCase().trim() === add.name.toLowerCase().trim());
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], qty: merged[idx].qty + add.qty };
        return;
      }
      const matched = (products || []).find(
        (pr: any) => pr.name.toLowerCase().trim() === add.name.toLowerCase().trim()
      );
      const currentStock = matched ? Number(matched.stock) || 0 : undefined;
      let warn = add.warning;
      if (currentStock !== undefined && add.qty > currentStock) {
        warn = `Stock insuficiente (Disponible: ${currentStock})`;
      } else if (!matched) {
        warn = "Producto no catalogado";
      }
      merged.push({ ...add, product: matched || add.product, currentStock, warning: warn } as any);
    });
    return merged;
  };

  const updateSaleItemField = (index: number, field: "name" | "qty" | "unit_price", val: any) => {
    setSaleItems((prev) => {
      const copy = [...prev];
      if (field === "name") {
        const matched = (products || []).find(
          (pr: any) => pr.name.toLowerCase().trim() === String(val).toLowerCase().trim()
        );
        copy[index] = {
          ...copy[index],
          name: val,
          product: matched,
          currentStock: matched ? Number(matched.stock) || 0 : undefined,
        };
      } else {
        const num = parseFloat(val) || 0;
        copy[index] = { ...copy[index], [field]: num };
      }
      return copy;
    });
  };

  // Quita un ítem puntual de la lista sin descartar el resto de la orden;
  // los totales se recalculan solos porque dependen de este mismo estado.
  const removeSaleItem = (index: number) => {
    setSaleItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Al elegir "Efectivo" edita el remanente en Transferencia y viceversa,
  // para que ambos campos siempre sumen el total de la venta.
  const onChangeSaleCashAmount = (val: string) => {
    setSaleCashAmount(val);
    const total = saleItemsRef.current.reduce((acc, it) => acc + it.qty * it.unit_price, 0);
    const cashNum = parseFloat(val) || 0;
    setSaleTransferAmount(String(Math.max(0, Math.round((total - cashNum) * 100) / 100)));
  };

  const onChangeSaleTransferAmount = (val: string) => {
    setSaleTransferAmount(val);
    const total = saleItemsRef.current.reduce((acc, it) => acc + it.qty * it.unit_price, 0);
    const transferNum = parseFloat(val) || 0;
    setSaleCashAmount(String(Math.max(0, Math.round((total - transferNum) * 100) / 100)));
  };

  // Devuelve true solo si la venta quedó persistida (o al menos se intentó
  // sin quedar bloqueada por una validación). false indica que la tarjeta
  // sigue abierta para corregir algo -el llamador debe reactivar el modo
  // confirmación por voz en ese caso, o "sí guardar" repetido caería en el
  // flujo de órdenes nuevas y terminaría como "No entendí bien".
  const onConfirmBatchSale = async (): Promise<boolean> => {
    const currentItems = saleItemsRef.current;
    const currentMethod = salePaymentMethodRef.current;

    const validation = validateBatchSaleForConfirm(
      currentItems,
      currentMethod,
      parseFloat(saleCashAmountRef.current) || 0,
      parseFloat(saleTransferAmountRef.current) || 0
    );
    // Purga silenciosa de ítems fantasma (precio <= 0): si quedó al menos
    // un ítem válido, se refleja en pantalla el recorte antes de intentar
    // guardar -así la tarjeta no muestra productos que en realidad no se
    // van a facturar-.
    if (validation.validItems.length !== currentItems.length) {
      setSaleItems(validation.validItems);
    }
    if (!validation.ok) {
      speakWithCallback(validation.reason!);
      return false;
    }
    const validItems = validation.validItems;
    const totalAmount = validation.totalAmount;
    const payments = validation.payments!;

    try {
      const itemsPayload = validItems.map((it) => ({
        product_id: it.product?.id || undefined,
        name: it.name.trim(),
        qty: it.qty,
        unit_price: it.unit_price,
        unit_cost: Number(it.product?.cost) || 0,
      }));

      const res = await createSale({
        items: itemsPayload,
        payments,
        note: `[Voz] ${transcript}`,
      });

      await saveAssistantMemory({
        preferredPaymentMethod: currentMethod === "mixed" ? "cash" : currentMethod,
        lastAction: {
          id: res?.id || "",
          type: "sale",
          timestamp: Date.now(),
          description: validItems.map((i) => `${i.qty}x ${i.name}`).join(", "),
          total: totalAmount,
        },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      speakWithCallback(`Venta guardada por ${formatMoney(totalAmount, cur, 2)}.`, () => {
        reset();
        if (!continuousActiveRef.current) close();
      });
      return true;
    } catch {
      speakWithCallback("Error al registrar venta.");
      return false;
    }
  };

  const onConfirmExpense = async (): Promise<boolean> => {
    const amt = parseFloat(expenseAmountRef.current) || 0;
    const desc = expenseDescriptionRef.current;
    const cat = expenseCategoryRef.current;
    const meth = expensePaymentMethodRef.current;

    try {
      const res = await createExpense({
        type: cat === "Insumos" || cat === "Mercancía" ? cat : "Operativos",
        category: cat || "Otros",
        amount: amt,
        method: meth,
        note: desc ? `[Voz] ${desc}` : `[Voz] ${transcript}`,
      });

      await saveAssistantMemory({
        lastAction: {
          id: res?.id || "",
          type: "expense",
          timestamp: Date.now(),
          description: desc,
          total: amt,
        },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      speakWithCallback(`Gasto registrado por ${formatMoney(amt, cur, 2)}.`, () => {
        reset();
        if (!continuousActiveRef.current) close();
      });
      return true;
    } catch {
      speakWithCallback("Error al guardar el gasto.");
      return false;
    }
  };

  const mergeStockItems = (existing: ParsedStockItem[], additions: ParsedStockItem[]): ParsedStockItem[] => {
    const merged = [...existing];
    additions.forEach((add) => {
      const idx = merged.findIndex((it) => it.name.toLowerCase().trim() === add.name.toLowerCase().trim());
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], qty: merged[idx].qty + add.qty };
        return;
      }
      const matched = add.product || (products || []).find(
        (pr: any) => pr.name.toLowerCase().trim() === add.name.toLowerCase().trim()
      );
      merged.push({ ...add, product: matched, currentStock: matched ? Number(matched.stock) || 0 : undefined } as any);
    });
    return merged;
  };

  const updateStockItemField = (index: number, field: "name" | "qty" | "cost", val: any) => {
    setStockItems((prev) => {
      const copy = [...prev];
      if (field === "name") {
        const matched = (products || []).find(
          (pr: any) => pr.name.toLowerCase().trim() === String(val).toLowerCase().trim()
        );
        copy[index] = {
          ...copy[index],
          name: val,
          product: matched,
          currentStock: matched ? Number(matched.stock) || 0 : undefined,
        } as any;
      } else {
        const num = parseFloat(val) || 0;
        copy[index] = { ...copy[index], [field]: num };
      }
      return copy;
    });
  };

  // Quita un producto puntual del ingreso de stock sin descartar el resto.
  const removeStockItem = (index: number) => {
    setStockItems((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleStockItemPerishable = (index: number) => {
    const next = !stockItems[index]?.isPerishable;
    setStockItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], isPerishable: next, expiryDate: next ? copy[index].expiryDate : null };
      return copy;
    });
    // Al marcarlo, despliega de inmediato el selector de fecha.
    setExpiryPickerIndex(next ? index : null);
  };

  const setStockItemExpiry = (index: number, date: string) => {
    setStockItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], expiryDate: date, isPerishable: true };
      return copy;
    });
    setExpiryPickerIndex(null);
  };

  const onConfirmStockIn = async (): Promise<boolean> => {
    const currentItems = stockItemsRef.current;
    const note = stockNoteRef.current.trim();

    if (currentItems.length === 0) {
      speakWithCallback("No hay productos en el ingreso de stock.");
      return false;
    }

    try {
      if (createPurchase) {
        for (const it of currentItems) {
          const nameTrimmed = it.name.trim();
          const matched = it.product || (products || []).find((p: any) => p.name.toLowerCase() === nameTrimmed.toLowerCase());
          await createPurchase({
            product_id: matched?.id,
            product_name: nameTrimmed,
            qty: it.qty,
            unit_cost: it.cost,
            payment_method: "cash",
            note: note || `[Voz Ingreso] ${transcript}`,
            createExpenseRecord: it.cost > 0,
            is_perishable: it.isPerishable,
            expiry_date: it.expiryDate || undefined,
          });
        }
      }

      const itemNames = currentItems.map((i) => `${i.qty} ${i.name}`).join(" y ");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      speakWithCallback(`Se añadió ${itemNames} al almacén.`, () => {
        reset();
        if (!continuousActiveRef.current) close();
      });
      return true;
    } catch {
      speakWithCallback("Error al añadir stock.");
      return false;
    }
  };

  const reset = () => {
    isAwaitingVoiceConfirmRef.current = false;
    activeCardRef.current = "none";
    setActiveCard("none");
    setTranscript("");
    setQueryAnswer("");
    setErrorMsg("");
    setSaleItems([]);
    setSalePaymentMethod("cash");
    setSaleCashAmount("");
    setSaleTransferAmount("");
    setStockItems([]);
    setStockNote("");
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => !continuousMode && close()}>
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,12,16,0.55)" }]} />
      </Pressable>

      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surfaceSecondary,
            paddingBottom: insets.bottom + SPACING.md,
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sheetTitle, { color: colors.onSurface }]}>Asistente PanDiario</Text>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 11, color: colors.onSurfaceTertiary }}>
              Palabras clave: &quot;Pan&quot; · &quot;Oye Pan&quot; · Reposo: &quot;Descansa Pan&quot;
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable
              onPress={() => setShowHelpModal(true)}
              style={[styles.helpIconBtn, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}
              hitSlop={8}
            >
              <Feather name="help-circle" size={18} color={colors.brand} />
            </Pressable>
            <Pressable onPress={close} hitSlop={8}>
              <Feather name="x" size={24} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: SPACING.xl, marginBottom: SPACING.xs }}>
          <Pressable
            onPress={continuousMode ? stopContinuousModeManual : startContinuousMode}
            style={[
              styles.mostradorToggleBtn,
              {
                backgroundColor: continuousMode ? colors.brand : colors.surface,
                borderColor: colors.brand,
              },
            ]}
          >
            <Feather
              name={continuousMode ? "radio" : "mic"}
              size={14}
              color={continuousMode ? "#FFF" : colors.brand}
            />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={{
                color: continuousMode ? "#FFF" : colors.onSurface,
                fontFamily: FONTS.bold,
                fontSize: 12.5,
                flexShrink: 1,
              }}
            >
              {continuousMode ? "🟢 Modo Mostrador Activo (Di 'Descansa Pan')" : "🎙️ Iniciar Modo Mostrador"}
            </Text>
          </Pressable>
        </View>

        {(isRecordingUI || isProcessingUI) && (
          <View style={styles.listeningBadge}>
            <View style={[styles.statusDot, { backgroundColor: isRecordingUI ? colors.error : colors.brand }]} />
            <Text style={{ fontFamily: FONTS.bold, fontSize: 12, color: colors.onSurface }}>
              {isRecordingUI ? "Escuchando orden..." : "Procesando..."}
            </Text>
          </View>
        )}

        {errorMsg && activeCard === "none" ? (
          <Text style={{ color: colors.error, fontSize: 11, textAlign: "center", marginHorizontal: SPACING.xl }}>
            {errorMsg}
          </Text>
        ) : null}

        <KeyboardAwareScrollView
          contentContainerStyle={{ gap: SPACING.md, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg }}
          bottomOffset={20}
          keyboardShouldPersistTaps="handled"
        >
          {activeCard === "none" && (
            <View style={styles.center}>
              <Text style={styles.listenHeader}>Hable para registrar:</Text>

              {isProcessingUI || assistantStatus || transcript ? (
                <Text style={styles.listenSubtext}>
                  {isProcessingUI ? "Procesando..." : assistantStatus ? assistantStatus : `"${transcript}"`}
                </Text>
              ) : null}

              <View style={styles.listenRow}>
                <Image
                  source={PAN_ASSETS.listening}
                  style={styles.listenMascot}
                  contentFit="contain"
                  testID="mascot-listening"
                />
                <View style={styles.listenChipsCol}>
                  <View style={styles.listenChip}>
                    <Text style={styles.listenChipText}>VENDÍ</Text>
                  </View>
                  <View style={styles.listenChip}>
                    <Text style={styles.listenChipText}>GASTÉ</Text>
                  </View>
                  <View style={styles.listenChip}>
                    <Text style={styles.listenChipText}>AÑADIR</Text>
                  </View>
                </View>
              </View>

              {isProcessingUI ? (
                <ActivityIndicator size="large" color={COBALT_UI.primary} style={{ marginTop: SPACING.md }} />
              ) : continuousMode ? (
                <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: SPACING.md }}>
                  <Animated.View style={[styles.micOuter, { backgroundColor: COBALT_UI.primary + "22" }, pulseStyle]}>
                    <View style={[styles.micInner, { backgroundColor: isRecordingUI ? colors.error : COBALT_UI.primary }]}>
                      <Feather name={isRecordingUI ? "activity" : "radio"} size={32} color="#FFF" />
                    </View>
                  </Animated.View>
                </View>
              ) : (
                <Pressable
                  onPress={isSessionActive ? stopManualListening : startManualListening}
                  style={{ alignItems: "center", justifyContent: "center", paddingVertical: SPACING.md }}
                >
                  <Animated.View style={[styles.micOuter, { backgroundColor: COBALT_UI.primary + "22" }, pulseStyle]}>
                    <View style={[styles.micInner, { backgroundColor: isSessionActive ? colors.error : COBALT_UI.primary }]}>
                      <Feather name={isSessionActive ? "square" : "mic"} size={32} color="#FFF" />
                    </View>
                  </Animated.View>
                </Pressable>
              )}

              <Pressable onPress={close} style={styles.cancelListenBtn} hitSlop={8} testID="voice-cancel-btn">
                <Text style={styles.cancelListenText}>Cerrar</Text>
              </Pressable>
            </View>
          )}

          {activeCard === "stock_in" && (
            <View style={{ gap: SPACING.sm }}>
              <Text style={[styles.transcript, { color: colors.onSurfaceTertiary }]}>{`"${transcript}"`}</Text>
              <View style={[styles.confirmCard, { backgroundColor: colors.brand + "12", borderColor: colors.brand }]}>
                <View style={styles.confirmHeader}>
                  <Feather name="package" size={20} color={colors.brand} />
                  <Text style={[styles.confirmType, { color: colors.onSurface }]}>Añadir al Inventario (Editable)</Text>
                </View>

                {stockItems.map((item: any, index) => (
                  <View key={index} style={{ gap: 4, paddingVertical: 2 }}>
                    <View style={styles.editItemRow}>
                      <View style={{ flex: 2 }}>
                        <Text style={styles.inputLabel}>Producto:</Text>
                        <TextInput
                          style={[styles.fullInputBox, { color: colors.onSurface, borderColor: colors.border }]}
                          value={item.name}
                          onChangeText={(t) => updateStockItemField(index, "name", t)}
                        />
                      </View>

                      <View style={styles.inputWrap}>
                        <Text style={styles.inputLabel}>Cant:</Text>
                        <TextInput
                          style={[styles.inputBox, { color: colors.onSurface, borderColor: colors.border }]}
                          keyboardType="numeric"
                          value={String(item.qty)}
                          onChangeText={(t) => updateStockItemField(index, "qty", t)}
                        />
                      </View>

                      <View style={styles.inputWrap}>
                        <Text style={styles.inputLabel}>Costo ({currencySymbol(cur)}):</Text>
                        <TextInput
                          style={[styles.inputBox, { color: colors.onSurface, borderColor: colors.border }]}
                          keyboardType="decimal-pad"
                          value={String(item.cost)}
                          onChangeText={(t) => updateStockItemField(index, "cost", t)}
                        />
                      </View>

                      <Pressable onPress={() => removeStockItem(index)} hitSlop={8} style={{ paddingTop: 16 }}>
                        <Feather name="trash-2" size={18} color={colors.error || "#EF4444"} />
                      </Pressable>
                    </View>

                    <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: colors.onSurfaceTertiary }}>
                      {item.currentStock !== undefined
                        ? `Vincula con existente · Stock actual: ${item.currentStock}`
                        : "Producto nuevo (se creará en el inventario)"}
                    </Text>

                    <Pressable
                      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                      onPress={() => toggleStockItemPerishable(index)}
                    >
                      <Feather name={item.isPerishable ? "check-square" : "square"} size={16} color={colors.brand} />
                      <Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: colors.onSurface }}>
                        Producto perecible
                      </Text>
                    </Pressable>

                    {item.isPerishable ? (
                      <Pressable
                        onPress={() => setExpiryPickerIndex(index)}
                        style={[styles.expiryBox, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}
                      >
                        <Feather name="calendar" size={14} color={colors.brand} />
                        <Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: colors.onSurface }}>
                          {item.expiryDate ? `Vence: ${formatExpiryDateFull(item.expiryDate)}` : "Elegir fecha de vencimiento"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}

                <View style={{ gap: 4 }}>
                  <Text style={styles.inputLabel}>Nota / Proveedor:</Text>
                  <TextInput
                    style={[styles.fullInputBox, { color: colors.onSurface, borderColor: colors.border }]}
                    value={stockNote}
                    onChangeText={setStockNote}
                    placeholder="Ej. Señor Pepe 987654"
                  />
                </View>

                {continuousMode ? (
                  <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: colors.brand, textAlign: "center", marginTop: 4 }}>
                    Di: &quot;Sí guardar&quot; para confirmar o &quot;No cancelar&quot; para descartar
                  </Text>
                ) : null}
              </View>

              <Button title="✓ Confirmar Ingreso de Stock" icon="check" onPress={onConfirmStockIn} />
              <Button title="Descartar" variant="ghost" onPress={reset} />
            </View>
          )}

          {activeCard === "batch_sale" && (
            <View style={{ gap: SPACING.sm }}>
              <Text style={[styles.transcript, { color: colors.onSurfaceTertiary }]}>{`"${transcript}"`}</Text>
              <View style={[styles.confirmCard, { backgroundColor: (colors.success || "#10B981") + "12", borderColor: colors.success || "#10B981" }]}>
                <View style={styles.confirmHeader}>
                  <Feather name="shopping-cart" size={20} color={colors.success || "#10B981"} />
                  <Text style={[styles.confirmType, { color: colors.onSurface }]}>Confirmar Venta (Editable)</Text>
                </View>

                {saleItems.map((item: any, index) => (
                  <View key={index} style={{ gap: 4, paddingVertical: 2 }}>
                    <View style={styles.editItemRow}>
                      <View style={{ flex: 2 }}>
                        <Text style={styles.inputLabel}>Producto:</Text>
                        <TextInput
                          style={[styles.fullInputBox, { color: colors.onSurface, borderColor: colors.border }]}
                          value={item.name}
                          onChangeText={(t) => updateSaleItemField(index, "name", t)}
                        />
                      </View>

                      <View style={styles.inputWrap}>
                        <Text style={styles.inputLabel}>Cant:</Text>
                        <TextInput
                          style={[styles.inputBox, { color: colors.onSurface, borderColor: colors.border }]}
                          keyboardType="numeric"
                          value={String(item.qty)}
                          onChangeText={(t) => updateSaleItemField(index, "qty", t)}
                        />
                      </View>

                      <View style={styles.inputWrap}>
                        <Text style={styles.inputLabel}>Precio:</Text>
                        <TextInput
                          style={[styles.inputBox, { color: colors.onSurface, borderColor: colors.border }]}
                          keyboardType="decimal-pad"
                          value={String(item.unit_price)}
                          onChangeText={(t) => updateSaleItemField(index, "unit_price", t)}
                        />
                      </View>

                      <Pressable onPress={() => removeSaleItem(index)} hitSlop={8} style={{ paddingTop: 16 }}>
                        <Feather name="trash-2" size={18} color={colors.error || "#EF4444"} />
                      </Pressable>
                    </View>

                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: colors.onSurfaceTertiary }}>
                        Stock disponible: {item.currentStock !== undefined ? item.currentStock : "No catalogado"}
                      </Text>
                      {item.warning ? (
                        <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: colors.error || "#EF4444" }}>
                          ⚠️ {item.warning}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}

                <View style={styles.methodRow}>
                  <Pressable
                    onPress={() => setSalePaymentMethod("cash")}
                    style={[
                      styles.methodBadge,
                      {
                        backgroundColor: salePaymentMethod === "cash" ? colors.brand : colors.surface,
                        borderColor: colors.brand,
                      },
                    ]}
                  >
                    <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: salePaymentMethod === "cash" ? "#FFF" : colors.onSurface }}>
                      💵 Efectivo
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setSalePaymentMethod("transfer")}
                    style={[
                      styles.methodBadge,
                      {
                        backgroundColor: salePaymentMethod === "transfer" ? colors.brand : colors.surface,
                        borderColor: colors.brand,
                      },
                    ]}
                  >
                    <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: salePaymentMethod === "transfer" ? "#FFF" : colors.onSurface }}>
                      📲 Transferencia
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setSalePaymentMethod("mixed")}
                    style={[
                      styles.methodBadge,
                      {
                        backgroundColor: salePaymentMethod === "mixed" ? colors.brand : colors.surface,
                        borderColor: colors.brand,
                      },
                    ]}
                  >
                    <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: salePaymentMethod === "mixed" ? "#FFF" : colors.onSurface }}>
                      🔀 Mixto
                    </Text>
                  </Pressable>
                </View>

                {salePaymentMethod === "mixed" ? (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Efectivo ({currencySymbol(cur)}):</Text>
                      <TextInput
                        style={[styles.fullInputBox, { color: colors.onSurface, borderColor: colors.border }]}
                        keyboardType="decimal-pad"
                        value={saleCashAmount}
                        onChangeText={onChangeSaleCashAmount}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Transferencia ({currencySymbol(cur)}):</Text>
                      <TextInput
                        style={[styles.fullInputBox, { color: colors.onSurface, borderColor: colors.border }]}
                        keyboardType="decimal-pad"
                        value={saleTransferAmount}
                        onChangeText={onChangeSaleTransferAmount}
                      />
                    </View>
                  </View>
                ) : null}

                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.row}>
                  <Text style={[styles.rowLabel, { color: colors.onSurfaceTertiary }]}>Total:</Text>
                  <Text style={[styles.rowValue, { color: colors.success || "#10B981", fontSize: FONT_SIZE.lg }]}>
                    {formatMoney(saleItems.reduce((acc, it) => acc + it.qty * it.unit_price, 0), cur, 2)}
                  </Text>
                </View>

                {continuousMode ? (
                  <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: colors.brand, textAlign: "center" }}>
                    Di: &quot;Sí guardar&quot; para confirmar o &quot;No cancelar&quot; para descartar
                  </Text>
                ) : null}
              </View>

              <Button title="✓ Guardar Venta" icon="check" onPress={onConfirmBatchSale} />
              <Button title="Descartar" variant="ghost" onPress={reset} />
            </View>
          )}

          {activeCard === "expense" && (
            <View style={{ gap: SPACING.sm }}>
              <Text style={[styles.transcript, { color: colors.onSurfaceTertiary }]}>{`"${transcript}"`}</Text>
              <View style={[styles.confirmCard, { backgroundColor: (colors.error || "#EF4444") + "12", borderColor: colors.error || "#EF4444" }]}>
                <View style={styles.confirmHeader}>
                  <Feather name="trending-down" size={20} color={colors.error || "#EF4444"} />
                  <Text style={[styles.confirmType, { color: colors.onSurface }]}>Confirmar Gasto (Editable)</Text>
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={styles.inputLabel}>Concepto / Descripción:</Text>
                  <TextInput
                    style={[styles.fullInputBox, { color: colors.onSurface, borderColor: colors.border }]}
                    value={expenseDescription}
                    onChangeText={setExpenseDescription}
                    placeholder="Ej. Pasaje o Almuerzo"
                  />

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Monto ({currencySymbol(cur)}):</Text>
                      <TextInput
                        style={[styles.fullInputBox, { color: colors.onSurface, borderColor: colors.border }]}
                        keyboardType="decimal-pad"
                        value={expenseAmount}
                        onChangeText={setExpenseAmount}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Categoría:</Text>
                      <TextInput
                        style={[styles.fullInputBox, { color: colors.onSurface, borderColor: colors.border }]}
                        value={expenseCategory}
                        onChangeText={setExpenseCategory}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.methodRow}>
                  <Pressable
                    onPress={() => setExpensePaymentMethod("cash")}
                    style={[
                      styles.methodBadge,
                      {
                        backgroundColor: expensePaymentMethod === "cash" ? colors.brand : colors.surface,
                        borderColor: colors.brand,
                      },
                    ]}
                  >
                    <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: expensePaymentMethod === "cash" ? "#FFF" : colors.onSurface }}>
                      💵 Efectivo
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setExpensePaymentMethod("transfer")}
                    style={[
                      styles.methodBadge,
                      {
                        backgroundColor: expensePaymentMethod === "transfer" ? colors.brand : colors.surface,
                        borderColor: colors.brand,
                      },
                    ]}
                  >
                    <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: expensePaymentMethod === "transfer" ? "#FFF" : colors.onSurface }}>
                      📲 Transferencia
                    </Text>
                  </Pressable>
                </View>

                {continuousMode ? (
                  <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: colors.brand, textAlign: "center", marginTop: 4 }}>
                    Di: &quot;Sí guardar&quot; para confirmar o &quot;No cancelar&quot; para descartar
                  </Text>
                ) : null}
              </View>

              <Button title="✓ Guardar Gasto" icon="check" onPress={onConfirmExpense} />
              <Button title="Descartar" variant="ghost" onPress={reset} />
            </View>
          )}

          {activeCard === "query_result" && (
            <View style={{ gap: SPACING.sm }}>
              <View style={[styles.confirmCard, { backgroundColor: colors.brand + "15", borderColor: colors.brand }]}>
                <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, color: colors.onSurface, lineHeight: 22 }}>
                  {queryAnswer}
                </Text>
              </View>
              <Button title="Listo" icon="check" onPress={reset} />
            </View>
          )}
        </KeyboardAwareScrollView>
      </View>

      <Modal visible={showHelpModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.helpModalBox, { backgroundColor: colors.surface }]}>
            <View style={styles.helpModalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="book-open" size={20} color={colors.brand} />
                <Text style={[styles.helpModalTitle, { color: colors.onSurface }]}>Guía de Comandos</Text>
              </View>
              <Pressable onPress={() => setShowHelpModal(false)} hitSlop={8}>
                <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 6 }}>
              <HelpAccordionItem
                title="🛍️ Ventas"
                isOpen={expandedHelpCategory === "sales"}
                onToggle={() => setExpandedHelpCategory(expandedHelpCategory === "sales" ? null : "sales")}
                colors={colors}
                examples={[
                  '"Vendí 2 polos a 25 soles"',
                  '"Cobrar 1 buzo por 40 en efectivo" o "Vender 1 buzo a 40 soles"',
                  'Con la venta abierta, di "5 polos a 20" o "3 pantalones más" para sumar productos directamente.',
                  'Palabras clave: "Vendí", "Vender" o "Cobrar" — no hace falta decir "Pan" antes',
                  'Cada producto tiene su botón de papelera para quitarlo sin descartar toda la venta',
                ]}
              />

              <HelpAccordionItem
                title="💳 Métodos de Pago"
                isOpen={expandedHelpCategory === "payment"}
                onToggle={() => setExpandedHelpCategory(expandedHelpCategory === "payment" ? null : "payment")}
                colors={colors}
                examples={[
                  '"Pagar en efectivo" o "pagar todo en efectivo"',
                  '"Pagar por transferencia"',
                  '"Pagar mixto" -> abre los campos de Efectivo y Transferencia',
                  '"120 en efectivo" -> asigna 120 a Efectivo y calcula solo el resto en Transferencia',
                ]}
              />

              <HelpAccordionItem
                title="📦 Añadir Stock"
                isOpen={expandedHelpCategory === "stock"}
                onToggle={() => setExpandedHelpCategory(expandedHelpCategory === "stock" ? null : "stock")}
                colors={colors}
                examples={[
                  '"Pan, registrar 5 polos a 10 soles"',
                  '"Añadir 10 buzos a costo de 15 soles"',
                  '"Ingresar 10 casacas a 30 con nota señor Pepe 987654" -> dicta la Nota/Proveedor en el mismo comando',
                  'Con la tarjeta abierta, sigue dictando más productos para sumarlos al mismo ingreso',
                  'Si el producto ya existe se suma a su stock; si no, se crea uno nuevo',
                ]}
              />

              <HelpAccordionItem
                title="💸 Gastos Operativos"
                isOpen={expandedHelpCategory === "expense"}
                onToggle={() => setExpandedHelpCategory(expandedHelpCategory === "expense" ? null : "expense")}
                colors={colors}
                examples={[
                  '"Gasté 15 soles en pasaje"',
                  '"Pagué 50 soles de luz"',
                  '"Pagar servicio de internet"',
                ]}
              />

              <HelpAccordionItem
                title="🎙️ Comandos de Control"
                isOpen={expandedHelpCategory === "control"}
                onToggle={() => setExpandedHelpCategory(expandedHelpCategory === "control" ? null : "control")}
                colors={colors}
                examples={[
                  '"Pan" -> Responde "¡Dime!" de inmediato',
                  '"Sí guardar", "confirmar" o "listo" -> Guarda la tarjeta en pantalla',
                  '"No cancelar" o "borrar" -> Descarta la tarjeta',
                  '"Descansa Pan" -> "Ahora si me voy a mimir."',
                  "Puedes interrumpir a Pan hablando mientras te responde",
                ]}
              />
            </ScrollView>

            <Button title="Entendido" onPress={() => setShowHelpModal(false)} />
          </View>
        </View>
      </Modal>

      <DatePickerModal
        visible={expiryPickerIndex !== null}
        colors={colors}
        title="Fecha de vencimiento"
        initialDate={expiryPickerIndex !== null ? stockItems[expiryPickerIndex]?.expiryDate || undefined : undefined}
        onSelect={(date) => {
          if (expiryPickerIndex !== null) setStockItemExpiry(expiryPickerIndex, date);
        }}
        onRequestClose={() => setExpiryPickerIndex(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  listenHeader: { fontFamily: FONTS.bold, fontSize: 18, fontWeight: "700", color: COBALT_UI.titleColor, textAlign: "center" },
  listenSubtext: { fontFamily: FONTS.medium, fontSize: 13, color: COBALT_UI.subtitleColor, textAlign: "center", lineHeight: 18 },
  listenRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.lg,
    paddingVertical: SPACING.md,
    width: "100%",
  },
  listenMascot: { width: 150, height: 150 },
  listenChipsCol: { gap: SPACING.sm },
  listenChip: {
    backgroundColor: "#EEF2FF",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  listenChipText: { fontFamily: FONTS.bold, fontWeight: "600", fontSize: FONT_SIZE.base, color: COBALT_UI.primary },
  cancelListenBtn: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg },
  cancelListenText: { fontFamily: FONTS.medium, fontSize: 13, color: COBALT_UI.subtitleColor },
  sheet: {
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingTop: SPACING.xs,
    maxHeight: "92%",
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: SPACING.xs,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    marginBottom: 6,
  },
  sheetTitle: { fontFamily: FONTS.black, fontSize: FONT_SIZE.base },
  helpIconBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mostradorToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
  },
  listeningBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 4,
    marginBottom: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  center: { alignItems: "center", gap: SPACING.xs },
  micOuter: { width: 110, height: 110, borderRadius: 55, alignItems: "center", justifyContent: "center" },
  micInner: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  transcript: { fontFamily: FONTS.medium, fontSize: 13, fontStyle: "italic", textAlign: "center" },
  confirmCard: { borderRadius: RADIUS.md, borderWidth: 1.5, padding: SPACING.md, gap: SPACING.xs },
  confirmHeader: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, marginBottom: 4 },
  confirmType: { fontFamily: FONTS.black, fontSize: FONT_SIZE.base },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel: { fontFamily: FONTS.medium, fontSize: 13 },
  rowValue: { fontFamily: FONTS.bold, fontSize: 15 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  editItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingVertical: 2,
  },
  inputWrap: {
    flexDirection: "column",
    gap: 2,
  },
  inputLabel: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: "#777",
  },
  inputBox: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 6,
    paddingVertical: 4,
    minWidth: 50,
    textAlign: "center",
    fontFamily: FONTS.bold,
    fontSize: 13,
  },
  fullInputBox: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontFamily: FONTS.bold,
    fontSize: 13,
  },
  methodRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  expiryBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  methodBadge: {
    flex: 1,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  helpModalBox: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
    maxHeight: "80%",
  },
  helpModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    paddingBottom: SPACING.sm,
  },
  helpModalTitle: {
    fontFamily: FONTS.black,
    fontSize: FONT_SIZE.base,
  },
  accordionBox: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  accordionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.md,
  },
  accordionTitle: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.sm,
  },
  accordionContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    gap: 6,
  },
  exampleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  exampleText: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
});

function HelpAccordionItem({
  title,
  isOpen,
  onToggle,
  examples,
  colors,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  examples: string[];
  colors: any;
}) {
  return (
    <View style={[styles.accordionBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <Pressable onPress={onToggle} style={styles.accordionHeader}>
        <Text style={[styles.accordionTitle, { color: colors.onSurface }]}>{title}</Text>
        <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.onSurfaceTertiary} />
      </Pressable>
      {isOpen ? (
        <View style={styles.accordionContent}>
          {examples.map((ex, idx) => (
            <View key={idx} style={styles.exampleRow}>
              <Feather name="corner-down-right" size={13} color={colors.brand} style={{ marginTop: 2 }} />
              <Text style={[styles.exampleText, { color: colors.onSurfaceSecondary }]}>{ex}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
