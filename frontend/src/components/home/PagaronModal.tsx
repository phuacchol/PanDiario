import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { Segmented } from "@/src/components/ui";
import { DatePickerModal } from "@/src/components/DatePickerModal";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatMoney, formatLocalDate } from "@/src/utils/format";

export type SalaryMethod = "efectivo" | "transferencia" | "mixto";

// Botón "PAGARON": registra el nuevo sueldo y cierra el ciclo actual
// (el remanente de Cartera se traslada a Caja Chica en DataContext).
export function PagaronModal({
  visible,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  onConfirm: (p: { amount: number; method: SalaryMethod; cashAmount?: number; nextPaymentDate: string }) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<SalaryMethod>("efectivo");
  const [cashAmount, setCashAmount] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setAmount("");
      setMethod("efectivo");
      setCashAmount("");
      const suggested = new Date();
      suggested.setDate(suggested.getDate() + 30);
      const y = suggested.getFullYear();
      const m = String(suggested.getMonth() + 1).padStart(2, "0");
      const d = String(suggested.getDate()).padStart(2, "0");
      setNextDate(`${y}-${m}-${d}`);
    }
  }, [visible]);

  const amt = parseFloat(amount.replace(",", ".")) || 0;
  const cash = parseFloat(cashAmount.replace(",", ".")) || 0;
  const digitalRemainder = method === "mixto" ? Math.max(0, amt - cash) : 0;

  const handleConfirm = () => {
    if (amt <= 0 || !nextDate) return;
    onConfirm({ amount: amt, method, cashAmount: method === "mixto" ? cash : undefined, nextPaymentDate: nextDate });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.surfaceSecondary }]} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ gap: SPACING.md }} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <Feather name="dollar-sign" size={20} color={colors.brand} />
              <Text style={[styles.title, { color: colors.onSurface }]}>Me pagaron</Text>
            </View>

            <View style={{ gap: SPACING.xs }}>
              <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Monto recibido</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
                <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.bold }}>S/</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  style={[styles.input, { color: colors.onSurface }]}
                  testID="pagaron-amount-input"
                />
              </View>
            </View>

            <View style={{ gap: SPACING.xs }}>
              <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Tipo</Text>
              <Segmented
                testID="pagaron-method"
                options={[
                  { key: "efectivo", label: "Efectivo" },
                  { key: "transferencia", label: "Transferencia" },
                  { key: "mixto", label: "Mixto" },
                ]}
                value={method}
                onChange={(k) => setMethod(k as SalaryMethod)}
              />
            </View>

            {method === "mixto" ? (
              <View style={{ gap: SPACING.xs }}>
                <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Efectivo recibido</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
                  <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.bold }}>S/</Text>
                  <TextInput
                    value={cashAmount}
                    onChangeText={setCashAmount}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    style={[styles.input, { color: colors.onSurface }]}
                    testID="pagaron-cash-input"
                  />
                </View>
                <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm }}>
                  Digital (calculado): {formatMoney(digitalRemainder, "PEN")}
                </Text>
              </View>
            ) : null}

            <View style={{ gap: SPACING.xs }}>
              <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Próxima fecha de pago</Text>
              <Pressable
                style={[styles.dateBtn, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}
                onPress={() => setShowDatePicker(true)}
                testID="pagaron-date-button"
              >
                <Feather name="calendar" size={16} color={colors.onSurfaceTertiary} />
                <Text style={{ color: colors.onSurface, fontFamily: FONTS.medium }}>
                  {nextDate ? formatLocalDate(nextDate, { withYear: true }) : "Elegir fecha"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.actions}>
              <Pressable style={styles.cancelBtn} onPress={onClose} testID="pagaron-cancel">
                <Text style={[styles.cancelText, { color: colors.onSurfaceTertiary }]}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.confirmBtn, { backgroundColor: colors.brand }]} onPress={handleConfirm} testID="pagaron-confirm">
                <Text style={[styles.confirmText, { color: colors.onBrand }]}>Guardar</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>

      <DatePickerModal
        visible={showDatePicker}
        initialDate={nextDate || undefined}
        colors={colors}
        title="Próxima fecha de pago"
        onSelect={(d) => {
          setNextDate(d);
          setShowDatePicker(false);
        }}
        onRequestClose={() => setShowDatePicker(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.55)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  card: { width: "100%", maxWidth: 400, maxHeight: "85%", borderRadius: RADIUS.lg, padding: SPACING.xl },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  title: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  label: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, marginLeft: 2 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md, height: 52 },
  input: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.lg, height: "100%" },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, height: 48, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md },
  actions: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.xs },
  cancelBtn: { flex: 1, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  cancelText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  confirmBtn: { flex: 1, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  confirmText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
});
