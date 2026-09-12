import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { useAuth } from "@/src/context/AuthContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatMoney, formatLocalDate, formatLocalTime } from "@/src/utils/format";
import type { Transaction } from "@/src/context/DataContext";

const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  mixto: "Mixto",
};

// Vista de solo lectura al tocar una ficha de Ingreso/Gasto: muestra todo
// el detalle sin abrir el formulario de edición (esa vía queda reservada
// al lápiz).
export function TransactionDetailModal({
  visible,
  transaction,
  amountColor,
  amountPrefix,
  onClose,
}: {
  visible: boolean;
  transaction: Transaction | null;
  amountColor: string;
  amountPrefix: "" | "-";
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { user } = useAuth();
  if (!transaction) return null;

  const rows: { icon: keyof typeof Feather.glyphMap; label: string; value: string }[] = [
    { icon: "tag", label: "Categoría", value: transaction.category || "Otros" },
    { icon: "credit-card", label: "Método de pago", value: METHOD_LABEL[transaction.method || "efectivo"] || "Efectivo" },
    { icon: "calendar", label: "Fecha", value: formatLocalDate(transaction.created_at, { withYear: true }) },
    { icon: "clock", label: "Hora", value: formatLocalTime(transaction.created_at) },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.surfaceSecondary }]} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.onSurface }]}>Detalle</Text>
            <Pressable onPress={onClose} hitSlop={8} testID="tx-detail-close">
              <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>

          <Text style={[styles.amount, { color: amountColor }]} testID="tx-detail-amount">
            {amountPrefix}{formatMoney(transaction.amount, user?.currency)}
          </Text>

          <View style={{ gap: SPACING.md }}>
            {rows.map((r) => (
              <View key={r.label} style={styles.row}>
                <Feather name={r.icon} size={16} color={colors.onSurfaceTertiary} />
                <Text style={[styles.rowLabel, { color: colors.onSurfaceTertiary }]}>{r.label}</Text>
                <Text style={[styles.rowValue, { color: colors.onSurface }]} numberOfLines={1}>{r.value}</Text>
              </View>
            ))}
            {transaction.note ? (
              <View>
                <View style={styles.row}>
                  <Feather name="file-text" size={16} color={colors.onSurfaceTertiary} />
                  <Text style={[styles.rowLabel, { color: colors.onSurfaceTertiary }]}>Nota</Text>
                </View>
                <Text style={[styles.noteText, { color: colors.onSurface }]}>{transaction.note}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.55)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  card: { width: "100%", maxWidth: 380, borderRadius: RADIUS.lg, padding: SPACING.xl, gap: SPACING.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  amount: { fontFamily: FONTS.black, fontSize: FONT_SIZE["3xl"], textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  rowLabel: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, flex: 1 },
  rowValue: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm, maxWidth: "50%" },
  noteText: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, marginTop: SPACING.xs, marginLeft: SPACING.xl },
});
