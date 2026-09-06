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

export default function GastoScreen() {
  const { colors } = useTheme();
  const { transactions, budgetCategories, addExpense, deleteTransaction } = useData();

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"efectivo" | "transferencia">("efectivo");
  const [budgetTab, setBudgetTab] = useState<"vital" | "secundario">("vital");
  const [category, setCategory] = useState("Otros");
  const [note, setNote] = useState("");

  const gastos = useMemo(() => transactions.filter((t) => t.kind === "gasto"), [transactions]);
  const categoryOptions = useMemo(() => {
    const filtered = budgetCategories.filter((c) => c.type === budgetTab);
    return [{ key: "Otros", label: "Otros" }, ...filtered.map((c) => ({ key: c.name, label: c.name }))];
  }, [budgetCategories, budgetTab]);

  const onSubmit = async () => {
    const amt = parseFloat(amount.replace(",", "."));
    if (!amt || amt <= 0) {
      Alert.alert("Monto inválido", "Ingresa un monto mayor a cero.");
      return;
    }
    await addExpense({ amount: amt, method, category, note: note.trim() || undefined });
    setAmount("");
    setNote("");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <TopBar title="Gasto" />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.lg }} bottomOffset={20}>
        <Card style={{ gap: SPACING.md }}>
          <Field
            label="Monto"
            icon="dollar-sign"
            keyboardType="decimal-pad"
            placeholder="0.00"
            value={amount}
            onChangeText={setAmount}
            testID="gasto-amount-input"
          />
          <Segmented
            testID="gasto-method"
            options={[
              { key: "efectivo", label: "Efectivo" },
              { key: "transferencia", label: "Transferencia" },
            ]}
            value={method}
            onChange={(k) => setMethod(k as any)}
          />
          <View style={{ gap: SPACING.xs }}>
            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Presupuesto</Text>
            <Segmented
              testID="gasto-budget-type"
              options={[
                { key: "vital", label: "Vital" },
                { key: "secundario", label: "Secundario" },
              ]}
              value={budgetTab}
              onChange={(k) => {
                setBudgetTab(k as any);
                setCategory("Otros");
              }}
            />
          </View>
          <View style={{ gap: SPACING.xs }}>
            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Categoría</Text>
            <ChipRow testID="gasto-category-chips" options={categoryOptions} value={category} onChange={setCategory} />
          </View>
          <Field label="Nota (opcional)" icon="edit-2" placeholder="Detalle del gasto" value={note} onChangeText={setNote} testID="gasto-note-input" />
          <Button title="Registrar Gasto" icon="minus-circle" onPress={onSubmit} testID="gasto-submit-button" style={{ backgroundColor: colors.error }} />
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Gastos del ciclo</Text>
        {gastos.length === 0 ? (
          <EmptyState variant="box" title="Sin gastos todavía" subtitle="Registra tu primer gasto arriba o dilo por voz." />
        ) : (
          <FlatList
            data={gastos}
            scrollEnabled={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: SPACING.sm }}
            renderItem={({ item }) => (
              <View style={[styles.txRow, { backgroundColor: colors.surfaceSecondary }]}>
                <View style={[styles.txIcon, { backgroundColor: colors.error + "22" }]}>
                  <Feather name="arrow-up-circle" size={18} color={colors.error} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txCategory, { color: colors.onSurface }]}>{item.category || "Otros"}</Text>
                  <Text style={[styles.txMeta, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>
                    {formatLocalDate(item.created_at)} · {formatLocalTime(item.created_at)} · {item.method === "transferencia" ? "Transferencia" : "Efectivo"}
                    {item.note ? ` · ${item.note}` : ""}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: colors.error }]}>-{formatMoney(item.amount, "PEN")}</Text>
                <Pressable onPress={() => deleteTransaction(item.id)} hitSlop={8} testID={`gasto-delete-${item.id}`}>
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
