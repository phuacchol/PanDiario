import React from "react";
import {
  Text,
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  ScrollView,
  TextInputProps,
  ViewStyle,
  StyleProp,
  Modal as RNModal,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";

/* ---------------- Button ---------------- */
export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  testID,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "outline-light" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  testID?: string;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const bg =
    variant === "primary" ? colors.brand : variant === "secondary" ? colors.brandSecondary : "transparent";
  const fg =
    variant === "primary"
      ? colors.onBrand
      : variant === "secondary"
        ? colors.onBrandSecondary
        : variant === "outline-light"
          ? "#FFFFFF"
          : colors.brand;
  const isOutline = variant === "outline" || variant === "outline-light";
  const border = variant === "outline-light" ? "#FFFFFF" : variant === "outline" ? colors.brand : "transparent";

  const handle = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      onPress={handle}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: border, borderWidth: isOutline ? 1.5 : 0, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnRow}>
          {icon ? <Feather name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/* ---------------- Card ---------------- */
export function Card({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceSecondary,
          shadowOpacity: isDark ? 0 : 0.04,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ---------------- StockBadge ---------------- */
export function StockBadge({ stock, minStock }: { stock: number; minStock: number }) {
  const { colors } = useTheme();
  let label = "En stock";
  let color = colors.success;
  if (stock <= 0) {
    label = "Sin stock";
    color = colors.error;
  } else if (stock <= minStock) {
    label = "Stock bajo";
    color = colors.warning;
  }
  return (
    <View style={[styles.badge, { backgroundColor: color + "22" }]} testID="stock-badge">
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

/* ---------------- ChipRow (horizontal, sticky-header friendly) ---------------- */
export function ChipRow({
  options,
  value,
  onChange,
  testID,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ height: 56, justifyContent: "center" }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: SPACING.sm, paddingHorizontal: SPACING.lg }}
        testID={testID}
      >
        {options.map((o) => {
          const active = o.key === value;
          return (
            <Pressable
              key={o.key}
              testID={`chip-${o.key}`}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChange(o.key);
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.brand : colors.surfaceTertiary,
                  borderColor: active ? colors.brand : colors.border,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? colors.onBrand : colors.onSurfaceTertiary }]}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ---------------- SegmentedControl ---------------- */
export function Segmented({
  options,
  value,
  onChange,
  testID,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: colors.surfaceTertiary }]} testID={testID}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={`segment-${o.key}`}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.key);
            }}
            style={[styles.segmentItem, active && { backgroundColor: colors.surfaceSecondary }]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: active ? colors.brand : colors.onSurfaceTertiary, fontFamily: active ? FONTS.bold : FONTS.medium },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------- Field ---------------- */
export function Field({
  label,
  icon,
  containerStyle,
  ...props
}: TextInputProps & { label?: string; icon?: keyof typeof Feather.glyphMap; containerStyle?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View style={[{ gap: SPACING.xs }, containerStyle]}>
      {label ? <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>{label}</Text> : null}
      <View style={[styles.inputWrap, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
        {icon ? <Feather name={icon} size={18} color={colors.onSurfaceTertiary} /> : null}
        <TextInput
          placeholderTextColor={colors.onSurfaceTertiary}
          style={[styles.input, { color: colors.onSurface }]}
          {...props}
        />
      </View>
    </View>
  );
}

/* ---------------- IconButton ---------------- */
export function IconButton({
  icon,
  onPress,
  color,
  bg,
  size = 40,
  testID,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  color?: string;
  bg?: string;
  size?: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", backgroundColor: bg ?? colors.surfaceTertiary, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Feather name={icon} size={size * 0.45} color={color ?? colors.onSurface} />
    </Pressable>
  );
}

/* ---------------- InputPrompt (modal for quick text entry) ---------------- */
export function InputPrompt({
  visible,
  title,
  placeholder,
  onSubmit,
  onClose,
  extraToggleLabel,
}: {
  visible: boolean;
  title: string;
  placeholder?: string;
  onSubmit: (value: string, toggle: boolean) => void;
  onClose: () => void;
  extraToggleLabel?: string;
}) {
  const { colors } = useTheme();
  const [text, setTextValue] = React.useState("");
  const [toggle, setToggle] = React.useState(false);
  React.useEffect(() => {
    if (visible) {
      setTextValue("");
      setToggle(false);
    }
  }, [visible]);
  if (!visible) return null;
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={promptStyles.backdrop} onPress={onClose} testID="prompt-backdrop">
        <Pressable style={[promptStyles.card, { backgroundColor: colors.surfaceSecondary }]} onPress={() => {}}>
          <Text style={[promptStyles.title, { color: colors.onSurface }]}>{title}</Text>
          <View style={[promptStyles.inputWrap, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
            <TextInput
              autoFocus
              value={text}
              onChangeText={setTextValue}
              placeholder={placeholder}
              placeholderTextColor={colors.onSurfaceTertiary}
              style={[promptStyles.input, { color: colors.onSurface }]}
              testID="prompt-input"
            />
          </View>
          {extraToggleLabel ? (
            <Pressable style={promptStyles.toggleRow} onPress={() => setToggle((t) => !t)} testID="prompt-toggle">
              <Feather name={toggle ? "check-square" : "square"} size={20} color={colors.brand} />
              <Text style={[promptStyles.toggleLabel, { color: colors.onSurfaceTertiary }]}>{extraToggleLabel}</Text>
            </Pressable>
          ) : null}
          <View style={promptStyles.actions}>
            <Pressable style={promptStyles.cancel} onPress={onClose} testID="prompt-cancel">
              <Text style={[promptStyles.cancelText, { color: colors.onSurfaceTertiary }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[promptStyles.confirm, { backgroundColor: colors.brand }]}
              onPress={() => {
                if (text.trim()) onSubmit(text.trim(), toggle);
              }}
              testID="prompt-confirm"
            >
              <Text style={[promptStyles.confirmText, { color: colors.onBrand }]}>Guardar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

const promptStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.55)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  card: { width: "100%", maxWidth: 380, borderRadius: RADIUS.lg, padding: SPACING.xl, gap: SPACING.md },
  title: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  inputWrap: { borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md, height: 52, justifyContent: "center" },
  input: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.lg },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  toggleLabel: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, flex: 1 },
  actions: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.xs },
  cancel: { flex: 1, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  cancelText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  confirm: { flex: 1, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  confirmText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
});

const styles = StyleSheet.create({
  btn: { height: 52, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: SPACING.xl },
  btnRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  btnText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  card: { borderRadius: RADIUS.lg, padding: SPACING.lg, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.pill, alignSelf: "flex-start" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontFamily: FONTS.bold, fontSize: 11 },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  chipText: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base },
  segment: { flexDirection: "row", borderRadius: RADIUS.md, padding: 4, gap: 4 },
  segmentItem: { flex: 1, height: 40, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  segmentText: { fontSize: FONT_SIZE.base },
  label: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, marginLeft: 2 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md, height: 52 },
  input: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.lg, height: "100%" },
});
