import { useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, FlatList } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { Segmented } from "@/src/components/ui";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatMoney, formatLocalDate, formatLocalTime } from "@/src/utils/format";
import type { Cycle, Transaction, Note, ListItem } from "@/src/context/DataContext";

type DetailTab = "ingresos" | "gastos" | "notas" | "listas";

// Detalle auditado de un cierre: Ingresos, Gastos, Notas y Listas
// registrados durante ese ciclo específico.
export function CierreDetailModal({
  visible,
  cycle,
  transactions,
  notes,
  listItems,
  onClose,
}: {
  visible: boolean;
  cycle: Cycle | null;
  transactions: Transaction[];
  notes: Note[];
  listItems: ListItem[];
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [tab, setTab] = useState<DetailTab>("ingresos");

  if (!cycle) return null;

  const ingresos = transactions.filter((t) => t.cycle_id === cycle.id && t.kind === "ingreso");
  const gastos = transactions.filter((t) => t.cycle_id === cycle.id && t.kind === "gasto");
  const cycleNotes = notes.filter((n) => n.cycle_id === cycle.id);
  const cycleList = listItems.filter((i) => i.cycle_id === cycle.id);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.onSurface }]}>{cycle.label || "Cierre"}</Text>
            <Pressable onPress={onClose} hitSlop={8} testID="cierre-detail-close">
              <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>

          <Segmented
            testID="cierre-detail-tabs"
            options={[
              { key: "ingresos", label: "Ingresos" },
              { key: "gastos", label: "Gastos" },
              { key: "notas", label: "Notas" },
              { key: "listas", label: "Listas" },
            ]}
            value={tab}
            onChange={(k) => setTab(k as DetailTab)}
          />

          <View style={{ flex: 1, marginTop: SPACING.md }}>
            {tab === "ingresos" ? (
              <FlatList
                data={ingresos}
                keyExtractor={(i) => i.id}
                ListEmptyComponent={<EmptyRow colors={colors} text="Sin ingresos en este cierre." />}
                contentContainerStyle={{ gap: SPACING.sm }}
                renderItem={({ item }) => (
                  <View style={[styles.row, { backgroundColor: colors.surfaceSecondary }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.onSurface }]}>{item.category || "Otros"}</Text>
                      <Text style={[styles.rowMeta, { color: colors.onSurfaceTertiary }]}>
                        {formatLocalDate(item.created_at)} · {formatLocalTime(item.created_at)}
                      </Text>
                    </View>
                    <Text style={[styles.rowAmount, { color: colors.success }]}>+{formatMoney(item.amount, "PEN")}</Text>
                  </View>
                )}
              />
            ) : null}

            {tab === "gastos" ? (
              <FlatList
                data={gastos}
                keyExtractor={(i) => i.id}
                ListEmptyComponent={<EmptyRow colors={colors} text="Sin gastos en este cierre." />}
                contentContainerStyle={{ gap: SPACING.sm }}
                renderItem={({ item }) => (
                  <View style={[styles.row, { backgroundColor: colors.surfaceSecondary }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.onSurface }]}>{item.category || "Otros"}</Text>
                      <Text style={[styles.rowMeta, { color: colors.onSurfaceTertiary }]}>
                        {formatLocalDate(item.created_at)} · {formatLocalTime(item.created_at)}
                      </Text>
                    </View>
                    <Text style={[styles.rowAmount, { color: colors.error }]}>-{formatMoney(item.amount, "PEN")}</Text>
                  </View>
                )}
              />
            ) : null}

            {tab === "notas" ? (
              <FlatList
                data={cycleNotes}
                keyExtractor={(i) => i.id}
                ListEmptyComponent={<EmptyRow colors={colors} text="Sin notas en este cierre." />}
                contentContainerStyle={{ gap: SPACING.sm }}
                renderItem={({ item }) => (
                  <View style={[styles.row, { backgroundColor: colors.surfaceSecondary }]}>
                    <Feather name={item.done ? "check-circle" : "circle"} size={16} color={item.done ? colors.success : colors.onSurfaceTertiary} />
                    <Text style={[styles.rowTitle, { color: colors.onSurface, flex: 1, marginLeft: SPACING.sm }]}>{item.text}</Text>
                  </View>
                )}
              />
            ) : null}

            {tab === "listas" ? (
              <FlatList
                data={cycleList}
                keyExtractor={(i) => i.id}
                ListEmptyComponent={<EmptyRow colors={colors} text="Sin ítems de lista en este cierre." />}
                contentContainerStyle={{ gap: SPACING.sm }}
                renderItem={({ item }) => (
                  <View style={[styles.row, { backgroundColor: colors.surfaceSecondary }]}>
                    <Feather name={item.done ? "check-circle" : "circle"} size={16} color={item.done ? colors.success : colors.onSurfaceTertiary} />
                    <Text style={[styles.rowTitle, { color: colors.onSurface, flex: 1, marginLeft: SPACING.sm }]}>{item.text}</Text>
                  </View>
                )}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function EmptyRow({ colors, text }: { colors: any; text: string }) {
  return (
    <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.medium, textAlign: "center", paddingVertical: SPACING.xl }}>{text}</Text>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl, gap: SPACING.md, height: "75%" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  row: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderRadius: RADIUS.md },
  rowTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  rowMeta: { fontFamily: FONTS.regular, fontSize: FONT_SIZE.xs, marginTop: 2 },
  rowAmount: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
});
