import { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput, Alert } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Feather } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { EmptyState } from "@/src/components/Mascot";
import { Button, Field, Segmented, ChipRow, InputPrompt } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { useData, type Transaction, type Origin } from "@/src/context/DataContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { ORIGIN_OPTIONS } from "@/src/constants";
import { formatMoney, formatLocalDate, formatLocalTime } from "@/src/utils/format";

function originColor(origin: Origin, colors: any): string {
  if (origin === "vital" || origin === "secundario") return colors.success;
  if (origin === "caja_chica") return colors.cajaChica;
  if (origin === "ahorro") return colors.error;
  return colors.warning;
}

export default function GastoScreen() {
  const { colors } = useTheme();
  const { transactions, budgetCategories, addBudgetCategory, addExpense, updateTransaction, deleteTransaction } = useData();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [showEditor, setShowEditor] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"efectivo" | "transferencia">("efectivo");
  const [origin, setOrigin] = useState<Origin>("cuenta");
  const [category, setCategory] = useState("Otros");
  const [note, setNote] = useState("");

  const categoryNames = useMemo(() => Array.from(new Set(budgetCategories.map((c) => c.name))), [budgetCategories]);
  const filterOptions = useMemo(() => [{ key: "Todas", label: "Todas" }, ...categoryNames.map((c) => ({ key: c, label: c }))], [categoryNames]);
  const editorOptions = useMemo(() => {
    if (origin === "vital" || origin === "secundario") {
      const filtered = budgetCategories.filter((c) => c.type === origin).map((c) => c.name);
      return [{ key: "Otros", label: "Otros" }, ...filtered.map((c) => ({ key: c, label: c }))];
    }
    return [{ key: "Otros", label: "Otros" }, ...categoryNames.map((c) => ({ key: c, label: c }))];
  }, [budgetCategories, categoryNames, origin]);

  const query = search.trim().toLowerCase();
  const gastos = useMemo(
    () =>
      transactions
        .filter((t) => t.kind === "gasto")
        .filter((t) => categoryFilter === "Todas" || t.category === categoryFilter)
        .filter((t) => !query || (t.category || "").toLowerCase().includes(query) || (t.note || "").toLowerCase().includes(query))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [transactions, categoryFilter, query]
  );

  const openNew = () => {
    setEditingId(null);
    setAmount("");
    setMethod("efectivo");
    setOrigin("cuenta");
    setCategory("Otros");
    setNote("");
    setShowEditor(true);
  };

  const openEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setAmount(String(tx.amount));
    setMethod((tx.method as any) || "efectivo");
    setOrigin(tx.origin);
    setCategory(tx.category || "Otros");
    setNote(tx.note || "");
    setShowEditor(true);
  };

  const onAddCategory = async (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    const type = origin === "secundario" ? "secundario" : "vital";
    await addBudgetCategory({ type, name: clean, amount: 0 });
    setCategory(clean);
    setShowNewCategory(false);
  };

  const onSubmit = async () => {
    const amt = parseFloat(amount.replace(",", ".")) || 0;
    if (amt <= 0) {
      Alert.alert("Monto inválido", "Ingresa un monto mayor a cero.");
      return;
    }
    if (editingId) {
      await updateTransaction(editingId, { amount: amt, method, origin, category, note: note.trim() || undefined });
    } else {
      await addExpense({ amount: amt, method, origin, category, note: note.trim() || undefined });
    }
    setShowEditor(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <TopBar title="Gasto" />

      <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.md }}>
        <View style={[styles.searchWrap, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.onSurfaceTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por categoría o nota..."
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[styles.searchInput, { color: colors.onSurface }]}
            testID="gasto-search-input"
          />
        </View>

        <Pressable style={[styles.addCatChip, { backgroundColor: colors.brandTertiary, alignSelf: "flex-start" }]} onPress={() => setShowNewCategory(true)} testID="gasto-add-category">
          <Feather name="plus" size={14} color={colors.brand} />
          <Text style={{ color: colors.brand, fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm }}>Añadir categoría</Text>
        </Pressable>

        <ChipRow options={filterOptions} value={categoryFilter} onChange={setCategoryFilter} testID="gasto-category-filter" />
      </View>

      <FlatList
        data={gastos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm }}
        ListEmptyComponent={<EmptyState variant="box" title="Sin gastos" subtitle="Registra el primero con el botón + o dilo por voz." />}
        renderItem={({ item }) => (
          <View style={[styles.txRow, { backgroundColor: colors.surfaceSecondary, borderLeftColor: originColor(item.origin, colors), borderLeftWidth: 4 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.txCategory, { color: colors.onSurface }]}>{item.category || "Otros"}</Text>
              <Text style={[styles.txMeta, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>
                {formatLocalDate(item.created_at)} · {formatLocalTime(item.created_at)} · {item.method === "transferencia" ? "Transferencia" : "Efectivo"}
                {item.note ? ` · ${item.note}` : ""}
              </Text>
            </View>
            <Text style={[styles.txAmount, { color: colors.error }]}>-{formatMoney(item.amount, "PEN")}</Text>
            <Pressable onPress={() => openEdit(item)} hitSlop={8} testID={`gasto-edit-${item.id}`}>
              <Feather name="edit-2" size={17} color={colors.onSurfaceTertiary} />
            </Pressable>
            <Pressable onPress={() => deleteTransaction(item.id)} hitSlop={8} testID={`gasto-delete-${item.id}`}>
              <Feather name="trash-2" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>
        )}
      />

      <Pressable style={[styles.fab, { backgroundColor: colors.error }]} onPress={openNew} testID="gasto-fab">
        <Feather name="plus" size={26} color="#FFFFFF" />
      </Pressable>

      <Modal visible={showEditor} transparent animationType="slide" onRequestClose={() => setShowEditor(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <KeyboardAwareScrollView contentContainerStyle={{ gap: SPACING.md }} bottomOffset={20}>
              <View style={styles.sheetHeader}>
                <Text style={[styles.sheetTitle, { color: colors.onSurface }]}>{editingId ? "Editar gasto" : "Nuevo gasto"}</Text>
                <Pressable onPress={() => setShowEditor(false)} hitSlop={8} testID="gasto-editor-close">
                  <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
                </Pressable>
              </View>

              <Field label="Monto" icon="dollar-sign" keyboardType="decimal-pad" placeholder="0.00" value={amount} onChangeText={setAmount} testID="gasto-amount-input" />
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
                <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Origen del dinero</Text>
                <ChipRow testID="gasto-origin-chips" options={ORIGIN_OPTIONS.map((o) => ({ key: o.key, label: o.label }))} value={origin} onChange={(k) => setOrigin(k as Origin)} />
              </View>

              <View style={{ gap: SPACING.xs }}>
                <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Categoría</Text>
                <ChipRow testID="gasto-category-chips" options={editorOptions} value={category} onChange={setCategory} />
                <Field placeholder="O escribe una categoría nueva" value={category} onChangeText={setCategory} testID="gasto-category-input" />
              </View>

              <Field label="Nota (opcional)" icon="edit-2" placeholder="Detalle del gasto" value={note} onChangeText={setNote} testID="gasto-note-input" />
              <Button title={editingId ? "Guardar cambios" : "Registrar Gasto"} icon="check" onPress={onSubmit} testID="gasto-submit-button" style={{ backgroundColor: colors.error }} />
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
  searchWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md, height: 48 },
  searchInput: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, height: "100%" },
  addCatChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: SPACING.md, height: 32, borderRadius: RADIUS.pill },
  label: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, marginLeft: 2 },
  txRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md },
  txCategory: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  txMeta: { fontFamily: FONTS.regular, fontSize: FONT_SIZE.xs, marginTop: 2 },
  txAmount: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  fab: { position: "absolute", right: SPACING.lg, bottom: SPACING.xl, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl, maxHeight: "85%" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.sm },
  sheetTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
});
