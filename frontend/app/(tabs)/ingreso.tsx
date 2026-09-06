import { useState, useMemo } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Feather } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { EmptyState } from "@/src/components/Mascot";
import { Card, Button, Field, Segmented, ChipRow } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { useData } from "@/src/context/DataContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatMoney, formatLocalDate, formatLocalTime } from "@/src/utils/format";

export default function IngresoScreen() {
  const { colors } = useTheme();
  const { transactions, budgetCategories, addIncome, deleteTransaction } = useData();

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"efectivo" | "transferencia">("efectivo");
  const [category, setCategory] = useState("Otros");
  const [note, setNote] = useState("");

  const ingresos = useMemo(() => transactions.filter((t) => t.kind === "ingreso"), [transactions]);
  const categoryOptions = useMemo(
    () => [{ key: "Otros", label: "Otros" }, ...budgetCategories.map((c) => ({ key: c.name, label: c.name }))],
    [budgetCategories]
  );

  const onSubmit = async () => {
    const amt = parseFloat(amount.replace(",", "."));
    if (!amt || amt <= 0) {
      Alert.alert("Monto inválido", "Ingresa un monto mayor a cero.");
      return;
    }
    await addIncome({ amount: amt, method, category, note: note.trim() || undefined });
    setAmount("");
    setNote("");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <TopBar title="Ingreso" />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.lg }} bottomOffset={20}>
        <Card style={{ gap: SPACING.md }}>
          <Field
            label="Monto"
            icon="dollar-sign"
            keyboardType="decimal-pad"
            placeholder="0.00"
            value={amount}
            onChangeText={setAmount}
            testID="ingreso-amount-input"
          />
          <Segmented
            testID="ingreso-method"
            options={[
              { key: "efectivo", label: "Efectivo" },
              { key: "transferencia", label: "Transferencia" },
            ]}
            value={method}
            onChange={(k) => setMethod(k as any)}
          />
          <View style={{ gap: SPACING.xs }}>
            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Categoría</Text>
            <ChipRow testID="ingreso-category-chips" options={categoryOptions} value={category} onChange={setCategory} />
          </View>
          <Field label="Nota (opcional)" icon="edit-2" placeholder="Detalle del ingreso" value={note} onChangeText={setNote} testID="ingreso-note-input" />
          <Button title="Registrar Ingreso" icon="plus-circle" onPress={onSubmit} testID="ingreso-submit-button" />
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Ingresos del ciclo</Text>
        {ingresos.length === 0 ? (
          <EmptyState variant="box" title="Sin ingresos todavía" subtitle="Registra tu primer ingreso arriba o dilo por voz." />
        ) : (
          <FlatList
            data={ingresos}
            scrollEnabled={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: SPACING.sm }}
            renderItem={({ item }) => (
              <View style={[styles.txRow, { backgroundColor: colors.surfaceSecondary }]}>
                <View style={[styles.txIcon, { backgroundColor: colors.success + "22" }]}>
                  <Feather name="arrow-down-circle" size={18} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txCategory, { color: colors.onSurface }]}>{item.category || "Otros"}</Text>
                  <Text style={[styles.txMeta, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>
                    {formatLocalDate(item.created_at)} · {formatLocalTime(item.created_at)} · {item.method === "transferencia" ? "Transferencia" : "Efectivo"}
                    {item.note ? ` · ${item.note}` : ""}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: colors.success }]}>+{formatMoney(item.amount, "PEN")}</Text>
                <Pressable onPress={() => deleteTransaction(item.id)} hitSlop={8} testID={`ingreso-delete-${item.id}`}>
                  <Feather name="trash-2" size={18} color={colors.onSurfaceTertiary} />
                </Pressable>
              </View>
            )}
          />
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, marginLeft: 2 },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  txRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md },
  txIcon: { width: 36, height: 36, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  txCategory: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  txMeta: { fontFamily: FONTS.regular, fontSize: FONT_SIZE.xs, marginTop: 2 },
  txAmount: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
});
