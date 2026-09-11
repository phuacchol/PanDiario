import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, TextInputProps, ViewStyle, StyleProp, ImageSourcePropType } from "react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { SPACING, RADIUS, FONTS, FONT_SIZE, MODAL_FORM_BUTTON_GRADIENT } from "@/src/theme/theme";
import { ORIGIN_OPTIONS } from "@/src/constants";
import type { Origin } from "@/src/context/DataContext";

// Sistema visual compartido de los paneles modales de creación (Nuevo
// Gasto/Ingreso/Lista/Nota): fijo -blanco con degradado lavanda muy sutil,
// bordes muy redondeados, inputs en pastilla con sombra suave- igual en
// claro y oscuro, igual que DarkHeader es siempre oscuro. NO reemplaza a
// Field/Segmented/Button/OriginGrid de ui.tsx -esos siguen usándose en
// login, ajustes, categorías, etc.-, son exclusivos de estos 4 modales.
const INK = "#1E1B38";
const SUBTLE = "#94A3B8";
const BORDER = "#E2E8F0";
const TRACK = "#EEF1F8";

// Ilustración flotante centrada que sobresale del borde superior del panel
// -mitad afuera, mitad adentro-. El contenedor del panel debe tener
// overflow: "visible" (ModalForm ya lo aplica en su propio sheet; las
// pantallas que arman el suyo deben hacerlo también) para que no se recorte
// en Android/iOS. position:"absolute" en RN se ancla al View padre más
// cercano sin necesitar position:"relative" explícito en ese padre.
export function FloatingMascot({ source }: { source: ImageSourcePropType }) {
  return (
    <View style={mascotStyles.wrap} pointerEvents="none">
      <Image source={source} style={mascotStyles.image} contentFit="contain" />
    </View>
  );
}

export function ModalFormHeader({ icon, title }: { icon: keyof typeof Feather.glyphMap; title: string }) {
  return (
    <View style={headerStyles.row}>
      <View style={headerStyles.iconWrap}>
        <Feather name={icon} size={20} color="#4A72FF" />
      </View>
      <Text style={headerStyles.title}>{title}</Text>
    </View>
  );
}

export function ModalFormField({
  label,
  icon,
  multiline,
  style,
  containerStyle,
  ...props
}: TextInputProps & { label?: string; icon?: keyof typeof Feather.glyphMap; containerStyle?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: SPACING.xs }, containerStyle]}>
      {label ? <Text style={fieldStyles.label}>{label}</Text> : null}
      <View style={[fieldStyles.wrap, multiline && fieldStyles.wrapMultiline]}>
        {icon ? <Feather name={icon} size={18} color="#4A72FF" /> : null}
        <TextInput
          placeholderTextColor={SUBTLE}
          multiline={multiline}
          style={[fieldStyles.input, multiline && fieldStyles.inputMultiline, style]}
          {...props}
        />
      </View>
    </View>
  );
}

export function ModalFormSegmented({
  options,
  value,
  onChange,
  testID,
}: {
  options: { key: string; label: string; icon?: keyof typeof Feather.glyphMap }[];
  value: string;
  onChange: (k: string) => void;
  testID?: string;
}) {
  return (
    <View style={segStyles.track} testID={testID}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={`${testID}-${o.key}`}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.key);
            }}
            style={[segStyles.item, active && segStyles.itemActive]}
          >
            {o.icon ? <Feather name={o.icon} size={22} color={active ? INK : SUBTLE} /> : null}
            <Text style={[segStyles.text, { color: active ? INK : SUBTLE, fontFamily: active ? FONTS.bold : FONTS.medium }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const ORIGIN_ICONS: Record<Origin, keyof typeof Feather.glyphMap> = {
  cuenta: "credit-card",
  vital: "user",
  secundario: "copy",
  caja_chica: "box",
  ahorro: "shield",
};

export function ModalFormOriginGrid({ value, onChange, testID }: { value: Origin; onChange: (o: Origin) => void; testID?: string }) {
  return (
    <View style={originStyles.grid} testID={testID}>
      {ORIGIN_OPTIONS.map((o) => {
        const active = o.key === value;
        const cell = (
          <View style={originStyles.cellInner}>
            <View style={[originStyles.iconWrap, active && originStyles.iconWrapActive]}>
              <Feather name={ORIGIN_ICONS[o.key]} size={18} color={active ? "#FFFFFF" : "#4A72FF"} />
            </View>
            <Text style={[originStyles.cellText, { color: active ? "#FFFFFF" : "#334155" }]} numberOfLines={2}>
              {o.label}
            </Text>
          </View>
        );
        return (
          <Pressable
            key={o.key}
            testID={`${testID}-${o.key}`}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.key);
            }}
            style={originStyles.cellWrap}
          >
            {active ? (
              <LinearGradient colors={MODAL_FORM_BUTTON_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={originStyles.cell}>
                {cell}
              </LinearGradient>
            ) : (
              <View style={[originStyles.cell, originStyles.cellInactive]}>{cell}</View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function ModalFormButton({
  title,
  onPress,
  loading,
  disabled,
  testID,
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const handle = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };
  return (
    <Pressable testID={testID} onPress={handle} disabled={disabled || loading} style={[btnStyles.wrap, { opacity: disabled ? 0.6 : 1 }, style]}>
      <LinearGradient colors={MODAL_FORM_BUTTON_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={btnStyles.gradient}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Feather name="check" size={18} color="#FFFFFF" />
            <Text style={btnStyles.text}>{title}</Text>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const headerStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm },
  iconWrap: { width: 34, height: 34, borderRadius: RADIUS.md, backgroundColor: "#EEF1FF", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: FONTS.black, fontSize: FONT_SIZE.xl, letterSpacing: 0.5, color: INK, textTransform: "uppercase" },
});

const fieldStyles = StyleSheet.create({
  label: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, marginLeft: 2, color: INK },
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: SPACING.md,
    height: 52,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  wrapMultiline: { borderRadius: RADIUS.lg, height: undefined, minHeight: 110, alignItems: "flex-start", paddingVertical: SPACING.sm },
  input: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.lg, height: "100%", color: INK },
  inputMultiline: { height: undefined, minHeight: 96, textAlignVertical: "top" },
});

const segStyles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: RADIUS.lg, backgroundColor: TRACK, padding: 6, gap: 4 },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, height: 76, borderRadius: RADIUS.md },
  itemActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  text: { fontSize: FONT_SIZE.sm },
});

const originStyles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  cellWrap: { width: "31%" },
  cell: { borderRadius: RADIUS.md, minHeight: 84, alignItems: "center", justifyContent: "center", padding: SPACING.sm },
  cellInactive: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: BORDER },
  cellInner: { alignItems: "center", gap: 6 },
  iconWrap: { width: 34, height: 34, borderRadius: RADIUS.pill, backgroundColor: "#EEF1FF", alignItems: "center", justifyContent: "center" },
  iconWrapActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  cellText: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, textAlign: "center" },
});

const btnStyles = StyleSheet.create({
  wrap: { borderRadius: RADIUS.lg, overflow: "hidden" },
  gradient: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm },
  text: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg, color: "#FFFFFF" },
});

const mascotStyles = StyleSheet.create({
  wrap: { position: "absolute", top: -55, alignSelf: "center", zIndex: 10 },
  image: { width: 110, height: 110 },
});

// Espacio reservado arriba del contenido del panel para que el título no
// quede tapado por la mitad inferior de la ilustración flotante (ver
// FloatingMascot: sobresale 55px, la otra mitad -~55px- cae dentro del panel).
export const MODAL_FORM_MASCOT_SPACER = 40;
