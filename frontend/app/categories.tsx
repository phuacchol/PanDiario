import { useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Segmented } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { useData } from "@/src/context/DataContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";

type CategoryTab = "ingreso" | "gasto";

// Gestión directa de categorías (Ajustes > Categorías): agrupadas por
// Ingreso o Gasto -la misma clasificación que usa el autocompletado de
// esas dos pantallas-, sin montos ni edición: solo nombre y papelera.
// Los cupos (Vital/Secundario) se administran aparte, en la Calculadora
// de Presupuesto.
export default function CategoriesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { budgetCategories, addBudgetCategory, deleteBudgetCategory } = useData();

  const [tab, setTab] = useState<CategoryTab>("ingreso");
  const [newName, setNewName] = useState("");

  const filtered = budgetCategories.filter((c) => (tab === "ingreso" ? c.type === "ingreso" : c.type === "vital" || c.type === "secundario"));

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    addBudgetCategory({ type: tab === "ingreso" ? "ingreso" : "vital", name, amount: 0 });
    setNewName("");
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
            { key: "ingreso", label: "Ingreso" },
            { key: "gasto", label: "Gasto" },
          ]}
          value={tab}
          onChange={(k) => setTab(k as CategoryTab)}
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
            Sin categorías de {tab === "ingreso" ? "ingreso" : "gasto"} todavía.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.rowName, { color: colors.onSurface }]} numberOfLines={1}>
              {item.name}
            </Text>
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
});
