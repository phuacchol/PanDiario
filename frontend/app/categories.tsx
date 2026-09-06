import { useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Segmented } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { useData, type BudgetType } from "@/src/context/DataContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";

// Gestión directa de categorías (Ajustes > Categorías): un solo nivel,
// sin subcategorías. Las mismas categorías se usan para clasificar
// Ingresos, Gastos, Notas y Listas en toda la app.
export default function CategoriesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { budgetCategories, addBudgetCategory, updateBudgetCategoryAmount, updateBudgetCategoryName, deleteBudgetCategory } = useData();

  const [tab, setTab] = useState<BudgetType>("vital");
  const [newName, setNewName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const filtered = budgetCategories.filter((c) => c.type === tab);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    addBudgetCategory({ type: tab, name, amount: 0 });
    setNewName("");
  };

  const commitAmount = (id: string) => {
    const raw = drafts[id];
    if (raw === undefined) return;
    updateBudgetCategoryAmount(id, parseFloat(raw.replace(",", ".")) || 0);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} testID="categories-close">
          <Feather name="x" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Categorías</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.md }}>
        <Segmented
          testID="categories-tabs"
          options={[
            { key: "vital", label: "Vital" },
            { key: "secundario", label: "Secundario" },
          ]}
          value={tab}
          onChange={(k) => setTab(k as BudgetType)}
        />

        <View style={[styles.addRow, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="Nueva categoría"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[styles.addInput, { color: colors.onSurface }]}
            onSubmitEditing={handleAdd}
            testID="categories-new-name"
          />
          <Pressable onPress={handleAdd} style={[styles.addBtn, { backgroundColor: colors.brand }]} testID="categories-new-submit">
            <Feather name="plus" size={20} color={colors.onBrand} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm }}
        ListEmptyComponent={
          <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.medium, textAlign: "center", paddingVertical: SPACING.xl }}>
            Sin categorías {tab === "vital" ? "vitales" : "secundarias"} todavía.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.surfaceSecondary }]}>
            {editingId === item.id ? (
              <TextInput
                value={editingName}
                onChangeText={setEditingName}
                autoFocus
                style={[styles.editInput, { color: colors.onSurface, borderColor: colors.border }]}
                onSubmitEditing={() => {
                  // La app usa el nombre como clave de clasificación; renombrar
                  // solo actualiza esta fila (las transacciones ya guardadas
                  // conservan el nombre anterior como texto libre).
                  updateBudgetCategoryName(item.id, editingName);
                  setEditingId(null);
                }}
                onBlur={() => {
                  if (editingId === item.id) {
                    updateBudgetCategoryName(item.id, editingName);
                    setEditingId(null);
                  }
                }}
                testID={`categories-edit-name-${item.id}`}
              />
            ) : (
              <Text style={[styles.rowName, { color: colors.onSurface }]} numberOfLines={1}>
                {item.name}
              </Text>
            )}

            <View style={[styles.amountWrap, { backgroundColor: colors.surfaceTertiary }]}>
              <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm }}>S/</Text>
              <TextInput
                defaultValue={String(item.amount)}
                keyboardType="decimal-pad"
                style={[styles.amountInput, { color: colors.onSurface }]}
                onChangeText={(v) => setDrafts((d) => ({ ...d, [item.id]: v }))}
                onBlur={() => commitAmount(item.id)}
                onSubmitEditing={() => commitAmount(item.id)}
                testID={`categories-amount-${item.id}`}
              />
            </View>

            <Pressable
              onPress={() => {
                setEditingId(item.id === editingId ? null : item.id);
                setEditingName(item.name);
              }}
              hitSlop={8}
              testID={`categories-edit-${item.id}`}
            >
              <Feather name="edit-2" size={17} color={colors.onSurfaceTertiary} />
            </Pressable>
            <Pressable onPress={() => deleteBudgetCategory(item.id)} hitSlop={8} testID={`categories-delete-${item.id}`}>
              <Feather name="trash-2" size={18} color={colors.error} />
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  addRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, paddingLeft: SPACING.md, paddingRight: 6, height: 48 },
  addInput: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, height: "100%" },
  addBtn: { width: 36, height: 36, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md },
  rowName: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base },
  editInput: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, borderBottomWidth: 1, paddingVertical: 2 },
  amountWrap: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, height: 36, width: 100 },
  amountInput: { flex: 1, fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, textAlign: "right" },
});
