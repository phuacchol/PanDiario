import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatMoney } from "@/src/utils/format";

// Botón "AHORRAR": sugerencias basadas en el último sueldo registrado
// (Básico 10% / Intermedio 20% / Avanzado 30%) + monto personalizado.
export function AhorrarModal({
  visible,
  lastSalary,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  lastSalary: number;
  onConfirm: (amount: number) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (visible) setAmount("");
  }, [visible]);

  const suggestions = [
    { key: "basico", label: "Básico · 10%", pct: 0.1 },
    { key: "intermedio", label: "Intermedio · 20%", pct: 0.2 },
    { key: "avanzado", label: "Avanzado · 30%", pct: 0.3 },
  ];

  const handleConfirm = () => {
    const amt = parseFloat(amount.replace(",", "."));
    if (amt && amt > 0) onConfirm(amt);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.surfaceSecondary }]} onPress={() => {}}>
          <View style={styles.header}>
            <Feather name="pie-chart" size={20} color={colors.brand} />
            <Text style={[styles.title, { color: colors.onSurface }]}>Ahorrar</Text>
          </View>

          {lastSalary > 0 ? (
            <View style={{ gap: SPACING.sm }}>
              {suggestions.map((s) => (
                <Pressable
                  key={s.key}
                  style={[styles.suggestionRow, { backgroundColor: colors.surfaceTertiary }]}
                  onPress={() => setAmount(String(Math.round(lastSalary * s.pct * 100) / 100))}
                  testID={`ahorrar-suggestion-${s.key}`}
                >
                  <Text style={[styles.suggestionLabel, { color: colors.onSurface }]}>{s.label}</Text>
                  <Text style={[styles.suggestionAmount, { color: colors.brand }]}>{formatMoney(lastSalary * s.pct, "PEN")}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={[styles.inputWrap, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
            <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.bold }}>S/</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="Monto personalizado"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={[styles.input, { color: colors.onSurface }]}
              testID="ahorrar-custom-input"
            />
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onClose} testID="ahorrar-cancel">
              <Text style={[styles.cancelText, { color: colors.onSurfaceTertiary }]}>Cancelar</Text>
            </Pressable>
            <Pressable style={[styles.confirmBtn, { backgroundColor: colors.brand }]} onPress={handleConfirm} testID="ahorrar-confirm">
              <Text style={[styles.confirmText, { color: colors.onBrand }]}>Ahorrar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.55)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  card: { width: "100%", maxWidth: 380, borderRadius: RADIUS.lg, padding: SPACING.xl, gap: SPACING.md },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  title: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  suggestionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: SPACING.md, borderRadius: RADIUS.md },
  suggestionLabel: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base },
  suggestionAmount: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md, height: 52 },
  input: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.lg, height: "100%" },
  actions: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.xs },
  cancelBtn: { flex: 1, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  cancelText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  confirmBtn: { flex: 1, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  confirmText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
});
