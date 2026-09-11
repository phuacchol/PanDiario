import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TextInput } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { useAuth } from "@/src/context/AuthContext";
import { Button, Segmented } from "@/src/components/ui";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatMoney, currencySymbol } from "@/src/utils/format";
import type { BudgetCategory, BudgetType } from "@/src/context/DataContext";

// Calculadora de Presupuesto: pestañas Vital/Secundario, lista de
// categorías con monto editable + papelera, una sola fila de creación
// (nombre + "+") y un botón explícito de Guardar que confirma cualquier
// monto que haya quedado sin persistir (ej. si el usuario cierra el
// teclado sin salir del campo).
export function BudgetCalculatorModal({
  visible,
  initialTab,
  categories,
  onAdd,
  onUpdateAmount,
  onDelete,
  onClose,
}: {
  visible: boolean;
  initialTab: BudgetType;
  categories: BudgetCategory[];
  onAdd: (p: { type: BudgetType; name: string; amount: number }) => void;
  onUpdateAmount: (id: string, amount: number) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [tab, setTab] = useState<Exclude<BudgetType, "ingreso">>(initialTab === "ingreso" ? "vital" : initialTab);
  const [newName, setNewName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      setTab(initialTab === "ingreso" ? "vital" : initialTab);
      setNewName("");
      setDrafts({});
    }
  }, [visible, initialTab]);

  const filtered = categories.filter((c) => c.type === tab);
  const total = useMemo(() => {
    return filtered.reduce((sum, c) => {
      const draft = drafts[c.id];
      const amount = draft !== undefined ? parseFloat(draft.replace(",", ".")) || 0 : c.amount;
      return sum + amount;
    }, 0);
  }, [filtered, drafts]);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    onAdd({ type: tab, name, amount: 0 });
    setNewName("");
  };

  const commitDraft = (id: string) => {
    const raw = drafts[id];
    if (raw === undefined) return;
    const amount = parseFloat(raw.replace(",", ".")) || 0;
    onUpdateAmount(id, amount);
  };

  const handleSave = () => {
    Object.keys(drafts).forEach(commitDraft);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <KeyboardAwareScrollView contentContainerStyle={{ gap: SPACING.md }} bottomOffset={20}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.onSurface }]}>Calculadora de Presupuesto</Text>
              <Pressable onPress={onClose} hitSlop={8} testID="budget-calc-close">
                <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>

            <Segmented
              testID="budget-calc-tabs"
              options={[
                { key: "vital", label: "Vital" },
                { key: "secundario", label: "Secundario" },
              ]}
              value={tab}
              onChange={(k) => setTab(k as Exclude<BudgetType, "ingreso">)}
            />

            <View style={{ gap: SPACING.sm }}>
              {filtered.length === 0 ? (
                <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.medium, textAlign: "center", paddingVertical: SPACING.lg }}>
                  Sin categorías {tab === "vital" ? "vitales" : "secundarias"} todavía.
                </Text>
              ) : (
                filtered.map((item) => (
                  <View key={item.id} style={[styles.catRow, { backgroundColor: colors.surfaceSecondary }]}>
                    <Text style={[styles.catName, { color: colors.onSurface }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={[styles.amountWrap, { backgroundColor: colors.surfaceTertiary }]}>
                      <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm }}>{currencySymbol(user?.currency)}</Text>
                      <TextInput
                        defaultValue={String(item.amount)}
                        keyboardType="decimal-pad"
                        style={[styles.amountInput, { color: colors.onSurface }]}
                        onChangeText={(v) => setDrafts((d) => ({ ...d, [item.id]: v }))}
                        onBlur={() => commitDraft(item.id)}
                        onSubmitEditing={() => commitDraft(item.id)}
                        testID={`budget-cat-amount-${item.id}`}
                      />
                    </View>
                    <Pressable onPress={() => onDelete(item.id)} hitSlop={8} testID={`budget-cat-delete-${item.id}`}>
                      <Feather name="trash-2" size={18} color={colors.error} />
                    </Pressable>
                  </View>
                ))
              )}
            </View>

            <View style={[styles.addRow, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Nueva categoría"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.addNameInput, { color: colors.onSurface }]}
                onSubmitEditing={handleAdd}
                testID="budget-new-category-name"
              />
              <Pressable style={[styles.addBtn, { backgroundColor: colors.brand }]} onPress={handleAdd} testID="budget-new-category-submit">
                <Feather name="plus" size={20} color={colors.onBrand} />
              </Pressable>
            </View>

            <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.totalLabel, { color: colors.onSurfaceTertiary }]}>TOTAL {tab === "vital" ? "VITAL" : "SECUNDARIO"}</Text>
              <Text style={[styles.totalValue, { color: colors.onSurface }]} testID="budget-calc-total">
                {formatMoney(total, user?.currency)}
              </Text>
            </View>

            <Button title="Guardar" icon="check" onPress={handleSave} testID="budget-calc-save" />
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl, maxHeight: "85%" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  catRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md },
  catName: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base },
  amountWrap: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, height: 36, width: 100 },
  amountInput: { flex: 1, fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, textAlign: "right" },
  addRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, paddingLeft: SPACING.md, paddingRight: 6, height: 52 },
  addNameInput: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, height: "100%" },
  addBtn: { width: 40, height: 40, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, paddingTop: SPACING.md },
  totalLabel: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm },
  totalValue: { fontFamily: FONTS.black, fontSize: FONT_SIZE.lg },
});
