import { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput, Alert } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Feather } from "@expo/vector-icons";
import { DarkHeader, darkHeaderSearchStyles } from "@/src/components/DarkHeader";
import { EmptyState } from "@/src/components/Mascot";
import { Button, Field, Segmented, ChipRow, InputPrompt } from "@/src/components/ui";
import { CategoryAutocomplete } from "@/src/components/CategoryAutocomplete";
import { TransactionCard } from "@/src/components/TransactionCard";
import { useTheme } from "@/src/theme/ThemeContext";
import { useData, type Transaction, type Method } from "@/src/context/DataContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatMoney } from "@/src/utils/format";

export default function IngresoScreen() {
  const { colors } = useTheme();
  const { transactions, budgetCategories, addBudgetCategory, addIncome, updateTransaction, deleteTransaction } = useData();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [showEditor, setShowEditor] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("efectivo");
  const [cashAmount, setCashAmount] = useState("");
  const [category, setCategory] = useState("Otros");
  const [note, setNote] = useState("");

  const categoryNames = useMemo(() => Array.from(new Set(budgetCategories.map((c) => c.name))), [budgetCategories]);
  const filterOptions = useMemo(() => [{ key: "Todas", label: "Todas" }, ...categoryNames.map((c) => ({ key: c, label: c }))], [categoryNames]);

  const query = search.trim().toLowerCase();
  const ingresos = useMemo(
    () =>
      transactions
        .filter((t) => t.kind === "ingreso")
        .filter((t) => categoryFilter === "Todas" || t.category === categoryFilter)
        .filter((t) => !query || (t.category || "").toLowerCase().includes(query) || (t.note || "").toLowerCase().includes(query))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [transactions, categoryFilter, query]
  );

  const digitalRemainder = useMemo(() => {
    const amt = parseFloat(amount.replace(",", ".")) || 0;
    const cash = parseFloat(cashAmount.replace(",", ".")) || 0;
    return Math.max(0, amt - cash);
  }, [amount, cashAmount]);

  const openNew = () => {
    setEditingId(null);
    setAmount("");
    setMethod("efectivo");
    setCashAmount("");
    setCategory("Otros");
    setNote("");
    setShowEditor(true);
  };

  const openEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setAmount(String(tx.amount));
    setMethod((tx.method as Method) || "efectivo");
    setCashAmount(tx.cashAmount != null ? String(tx.cashAmount) : "");
    setCategory(tx.category || "Otros");
    setNote(tx.note || "");
    setShowEditor(true);
  };

  const onAddCategory = async (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    await addBudgetCategory({ type: "ingreso", name: clean, amount: 0 });
    setCategory(clean);
    setShowNewCategory(false);
  };

  const onSubmit = async () => {
    const amt = parseFloat(amount.replace(",", ".")) || 0;
    if (amt <= 0) {
      Alert.alert("Monto inválido", "Ingresa un monto mayor a cero.");
      return;
    }
    const cleanCategory = category.trim() || "Otros";
    if (cleanCategory !== "Otros" && !budgetCategories.some((c) => c.name === cleanCategory)) {
      await addBudgetCategory({ type: "ingreso", name: cleanCategory, amount: 0 });
    }
    const cash = method === "mixto" ? parseFloat(cashAmount.replace(",", ".")) || 0 : undefined;
    if (editingId) {
      await updateTransaction(editingId, { amount: amt, method, cashAmount: cash, category: cleanCategory, note: note.trim() || undefined });
    } else {
      await addIncome({ amount: amt, method, cashAmount: cash, category: cleanCategory, note: note.trim() || undefined });
    }
    setShowEditor(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <DarkHeader title="Ingreso" testIDPrefix="ingreso">
        <View style={darkHeaderSearchStyles.wrap}>
          <Feather name="search" size={18} color={colors.onSurfaceTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por categoría o nota..."
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[darkHeaderSearchStyles.input, { color: colors.onSurface }]}
            testID="ingreso-search-input"
          />
        </View>
      </DarkHeader>

      <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.md, paddingTop: SPACING.md }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable style={[styles.addCatChip, { backgroundColor: colors.brandTertiary }]} onPress={() => setShowNewCategory(true)} testID="ingreso-add-category">
            <Feather name="plus" size={14} color={colors.brand} />
            <Text style={{ color: colors.brand, fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm }}>Añadir categoría</Text>
          </Pressable>
        </View>

        <ChipRow options={filterOptions} value={categoryFilter} onChange={setCategoryFilter} testID="ingreso-category-filter" />
      </View>

      <FlatList
        data={ingresos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm }}
        ListEmptyComponent={<EmptyState variant="box" title="Sin ingresos" subtitle="Registra el primero con el botón + o dilo por voz." />}
        renderItem={({ item }) => (
          <TransactionCard
            transaction={item}
            headerColor={colors.success}
            amountColor={colors.onSurface}
            amountPrefix=""
            onEdit={() => openEdit(item)}
            onDelete={() => deleteTransaction(item.id)}
            testIDPrefix="ingreso"
          />
        )}
      />

      <Pressable style={[styles.fab, { backgroundColor: colors.success }]} onPress={openNew} testID="ingreso-fab">
        <Feather name="plus" size={26} color="#FFFFFF" />
      </Pressable>

      <Modal visible={showEditor} transparent animationType="slide" onRequestClose={() => setShowEditor(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <KeyboardAwareScrollView contentContainerStyle={{ gap: SPACING.md }} bottomOffset={20}>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderSpacer} />
                <Text style={[styles.sheetTitle, { color: colors.onSurface }]}>{editingId ? "EDITAR INGRESO" : "NUEVO INGRESO"}</Text>
                <Pressable onPress={() => setShowEditor(false)} hitSlop={8} testID="ingreso-editor-close" style={styles.sheetHeaderSpacer}>
                  <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
                </Pressable>
              </View>

              <Field label="Monto" icon="dollar-sign" keyboardType="decimal-pad" placeholder="0.00" value={amount} onChangeText={setAmount} testID="ingreso-amount-input" />
              <Segmented
                testID="ingreso-method"
                options={[
                  { key: "efectivo", label: "Efectivo" },
                  { key: "transferencia", label: "Transferencia" },
                  { key: "mixto", label: "Mixto" },
                ]}
                value={method}
                onChange={(k) => setMethod(k as Method)}
              />

              {method === "mixto" ? (
                <View style={{ gap: SPACING.xs }}>
                  <Field label="Efectivo recibido" icon="dollar-sign" keyboardType="decimal-pad" placeholder="0.00" value={cashAmount} onChangeText={setCashAmount} testID="ingreso-cash-input" />
                  <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm }}>
                    Digital (calculado): {formatMoney(digitalRemainder, "PEN")}
                  </Text>
                </View>
              ) : null}

              <CategoryAutocomplete value={category} onChange={setCategory} categories={budgetCategories} testID="ingreso-category-input" />

              <Field label="Nota (opcional)" icon="edit-2" placeholder="Detalle del ingreso" value={note} onChangeText={setNote} testID="ingreso-note-input" />
              <Button title={editingId ? "Guardar cambios" : "Registrar Ingreso"} icon="check" onPress={onSubmit} testID="ingreso-submit-button" />
            </KeyboardAwareScrollView>
          </View>
        </View>
      </Modal>

      <InputPrompt
        visible={showNewCategory}
        title="Nueva categoría"
        placeholder="Nombre de la categoría"
        onSubmit={(value) => onAddCategory(value)}
        onClose={() => setShowNewCategory(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  addCatChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: SPACING.md, height: 32, borderRadius: RADIUS.pill },
  label: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, marginLeft: 2 },
  fab: { position: "absolute", right: SPACING.lg, bottom: SPACING.xl, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl, maxHeight: "85%" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.sm },
  sheetHeaderSpacer: { width: 22 },
  sheetTitle: { flex: 1, textAlign: "center", fontFamily: FONTS.bold, fontWeight: "700", fontSize: FONT_SIZE.lg },
});
