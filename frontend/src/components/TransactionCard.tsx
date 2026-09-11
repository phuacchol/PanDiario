import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { useAuth } from "@/src/context/AuthContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatMoney, formatLocalDate, formatLocalTime } from "@/src/utils/format";
import type { Transaction } from "@/src/context/DataContext";

const METHOD_LABEL: Record<string, string> = {
  efectivo: "EFECTIVO",
  transferencia: "TRANSFERENCIA",
  mixto: "MIXTO",
};

export function TransactionCard({
  transaction,
  headerColor,
  amountColor,
  amountPrefix,
  onEdit,
  onDelete,
  testIDPrefix,
}: {
  transaction: Transaction;
  headerColor: string;
  amountColor: string;
  amountPrefix: "" | "-";
  onEdit: () => void;
  onDelete: () => void;
  testIDPrefix: string;
}) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const methodLabel = METHOD_LABEL[transaction.method || "efectivo"] || "EFECTIVO";
  const dateLabel = formatLocalDate(transaction.created_at, { withYear: true }).toUpperCase().replace(/\./g, "");

  return (
    <View>
      <View style={[styles.header, { backgroundColor: headerColor }]}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {(transaction.category || "Otros").toUpperCase()}
        </Text>
        <View style={styles.checkBadge}>
          <Feather name="check" size={13} color="#FFFFFF" />
        </View>
      </View>
      <View style={[styles.body, { backgroundColor: colors.surfaceSecondary }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.amount, { color: amountColor }]}>
            {amountPrefix}{formatMoney(transaction.amount, user?.currency)}
          </Text>
          <Text style={[styles.method, { color: colors.onSurfaceTertiary }]}>{methodLabel}</Text>
          <Text style={[styles.dateLine, { color: colors.onSurfaceTertiary }]}>{dateLabel}</Text>
          <Text style={[styles.dateLine, { color: colors.onSurfaceTertiary }]}>{formatLocalTime(transaction.created_at)}</Text>
        </View>
        <View style={styles.rightCol}>
          {transaction.note ? (
            <Text style={[styles.note, { color: colors.onSurfaceTertiary }]} numberOfLines={2}>
              Nota: {transaction.note}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable style={[styles.actionBtn, { backgroundColor: colors.brand }]} onPress={onEdit} hitSlop={8} testID={`${testIDPrefix}-edit-${transaction.id}`}>
              <Feather name="edit-2" size={15} color="#FFFFFF" />
            </Pressable>
            <Pressable style={[styles.actionBtn, { backgroundColor: colors.error }]} onPress={onDelete} hitSlop={8} testID={`${testIDPrefix}-delete-${transaction.id}`}>
              <Feather name="trash-2" size={15} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { flex: 1, fontFamily: FONTS.black, fontSize: FONT_SIZE.base, color: "#FFFFFF" },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    borderRadius: RADIUS.lg,
    marginTop: -SPACING.lg,
    padding: SPACING.md,
    flexDirection: "row",
    gap: SPACING.sm,
  },
  amount: { fontFamily: FONTS.black, fontSize: FONT_SIZE.xl },
  method: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.xs, marginTop: 2 },
  dateLine: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, marginTop: 4 },
  rightCol: { alignItems: "flex-end", justifyContent: "space-between", gap: SPACING.sm, maxWidth: 140 },
  note: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, textAlign: "right" },
  actions: { flexDirection: "row", gap: SPACING.sm },
  actionBtn: { width: 32, height: 32, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
});
