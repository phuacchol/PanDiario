import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView, Switch, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { Button, Field, Segmented } from "@/src/components/ui";
import { OriginGrid } from "@/src/components/OriginGrid";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatMoney } from "@/src/utils/format";
import type { ListRecord, ListEntry, Method, Origin } from "@/src/context/DataContext";

// Modo "Compra" (equivalente en-app al panel flotante de la lista en
// ejecución): checklist con checkboxes y modo Editar. El bloqueo
// estructural de ítems base solo aplica con la lista en ejecución
// (status 'in_progress', Play en verde) -ahí solo los "extra" añadidos
// durante la ejecución, en naranja, se pueden quitar-; con la lista
// todavía inactiva ('active') se puede borrar cualquier ítem, base o
// extra, para permitir gestionarla libremente antes de empezar a
// comprar. Termina con un formulario para cerrar la lista como un gasto
// catalogado "Lista de compras" (o archivarla sin gasto, ver el switch
// "Es una compra").
export function CompraOverlayModal({
  visible,
  list,
  entries,
  initialEditing,
  onToggleEntry,
  onAddEntry,
  onDeleteEntry,
  onComplete,
  onClose,
}: {
  visible: boolean;
  list: ListRecord | null;
  entries: ListEntry[];
  initialEditing?: boolean;
  onToggleEntry: (id: string) => void;
  onAddEntry: (text: string, extra: boolean) => void;
  onDeleteEntry: (id: string) => void;
  onComplete: (p: { registerExpense: boolean; amount?: number; method?: Method; cashAmount?: number; origin?: Origin; note?: string }) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [showFinish, setShowFinish] = useState(false);
  const [registerExpense, setRegisterExpense] = useState(true);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("efectivo");
  const [cashAmount, setCashAmount] = useState("");
  const [origin, setOrigin] = useState<Origin>("cuenta");
  const [note, setNote] = useState("");
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reinicia el formulario de liquidación cada vez que se abre el panel de
  // una lista (evita arrastrar el monto/método de una compra anterior).
  useEffect(() => {
    if (visible) {
      setEditing(!!initialEditing);
      setNewItem("");
      setShowFinish(false);
      setRegisterExpense(true);
      setAmount("");
      setMethod("efectivo");
      setCashAmount("");
      setOrigin("cuenta");
      setNote("");
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [visible, initialEditing]);

  const digitalRemainder = useMemo(() => {
    const amt = parseFloat(amount.replace(",", ".")) || 0;
    const cash = parseFloat(cashAmount.replace(",", ".")) || 0;
    return Math.max(0, amt - cash);
  }, [amount, cashAmount]);

  if (!list) return null;

  const handleAdd = () => {
    const clean = newItem.trim();
    if (!clean) return;
    onAddEntry(clean, true);
    setNewItem("");
  };

  const handleFinish = () => {
    // Bloqueo estricto contra doble pulsación: una vez en vuelo, cualquier
    // toque adicional se ignora hasta que la operación termine (o falle).
    if (submittingRef.current) return;
    if (registerExpense) {
      const amt = parseFloat(amount.replace(",", ".")) || 0;
      if (amt <= 0) return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (registerExpense) {
        const amt = parseFloat(amount.replace(",", ".")) || 0;
        const cash = method === "mixto" ? parseFloat(cashAmount.replace(",", ".")) || 0 : undefined;
        onComplete({ registerExpense: true, amount: amt, method, cashAmount: cash, origin, note: note.trim() || undefined });
      } else {
        onComplete({ registerExpense: false });
      }
      setShowFinish(false);
      onClose();
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
      >
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(SPACING.xl, insets.bottom + SPACING.md) }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.onSurface }]} numberOfLines={1}>
              {list.list_code ? `#${list.list_code} · ` : ""}
              {list.title}
            </Text>
            <View style={{ flexDirection: "row", gap: SPACING.md, alignItems: "center" }}>
              <Pressable onPress={() => setEditing((v) => !v)} hitSlop={8} testID="compra-edit-toggle">
                <Feather name={editing ? "check" : "edit-2"} size={20} color={colors.brand} />
              </Pressable>
              <Pressable onPress={onClose} hitSlop={8} testID="compra-close">
                <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>
          </View>

          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: SPACING.sm }} keyboardShouldPersistTaps="handled">
            {entries.map((item) => (
              <View key={item.id} style={[styles.row, { backgroundColor: colors.surfaceSecondary }]}>
                {!editing ? (
                  <Pressable onPress={() => onToggleEntry(item.id)} hitSlop={8} testID={`compra-toggle-${item.id}`}>
                    <Feather name={item.done ? "check-circle" : "circle"} size={20} color={item.done ? colors.success : colors.onSurfaceTertiary} />
                  </Pressable>
                ) : null}
                <Text
                  style={[
                    styles.rowText,
                    {
                      color: item.extra ? colors.accent : colors.onSurface,
                      textDecorationLine: item.done && !editing ? "line-through" : "none",
                    },
                  ]}
                >
                  {item.text}
                </Text>
                {editing && (item.extra || list.status !== "in_progress") ? (
                  <Pressable onPress={() => onDeleteEntry(item.id)} hitSlop={8} testID={`compra-remove-${item.id}`}>
                    <Feather name="x" size={18} color={colors.error} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </ScrollView>

          {editing ? (
            <View style={[styles.addRow, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
              <TextInput
                value={newItem}
                onChangeText={setNewItem}
                placeholder="Añadir ítem extra"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.addInput, { color: colors.accent }]}
                onSubmitEditing={handleAdd}
                testID="compra-add-item-input"
              />
              <Pressable onPress={handleAdd} style={[styles.addBtn, { backgroundColor: colors.brand }]} testID="compra-add-item-button">
                <Feather name="plus" size={18} color={colors.onBrand} />
              </Pressable>
            </View>
          ) : null}

          {!showFinish ? (
            <Button title="Finalizar lista" icon="check-square" onPress={() => setShowFinish(true)} testID="compra-finish-button" />
          ) : (
            <ScrollView contentContainerStyle={{ gap: SPACING.md }} keyboardShouldPersistTaps="handled">
              <Pressable style={styles.switchRow} onPress={() => setRegisterExpense((v) => !v)} testID="compra-register-expense-toggle">
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.onSurface, fontFamily: FONTS.bold, fontSize: FONT_SIZE.base }}>Es una compra</Text>
                  <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs }}>
                    {registerExpense ? "Se registrará como gasto al finalizar" : "Se archivará sin generar un gasto"}
                  </Text>
                </View>
                <Switch
                  value={registerExpense}
                  onValueChange={setRegisterExpense}
                  trackColor={{ true: colors.brand, false: colors.borderStrong }}
                  thumbColor="#FFF"
                  testID="compra-register-expense-switch"
                />
              </Pressable>

              {registerExpense ? (
                <>
                  <Field label="Monto total gastado" icon="dollar-sign" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} testID="compra-amount-input" />
                  <Segmented
                    testID="compra-method"
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
                      <Field label="Efectivo pagado" icon="dollar-sign" keyboardType="decimal-pad" placeholder="0.00" value={cashAmount} onChangeText={setCashAmount} testID="compra-cash-input" />
                      <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm }}>
                        Digital (calculado): {formatMoney(digitalRemainder, "PEN")}
                      </Text>
                    </View>
                  ) : null}
                  <View style={{ gap: SPACING.xs }}>
                    <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Origen del dinero</Text>
                    <OriginGrid value={origin} onChange={setOrigin} testID="compra-origin-grid" />
                  </View>
                  <Field label="Nota (opcional)" value={note} onChangeText={setNote} testID="compra-note-input" />
                </>
              ) : null}
              <Button
                title={registerExpense ? "Confirmar y registrar gasto" : "Finalizar sin registrar gasto"}
                icon="check"
                onPress={handleFinish}
                loading={isSubmitting}
                disabled={isSubmitting}
                testID="compra-confirm-button"
              />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl, gap: SPACING.md, maxHeight: "88%" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg, flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md },
  rowText: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base },
  addRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, paddingLeft: SPACING.md, paddingRight: 6, height: 48 },
  addInput: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, height: "100%" },
  addBtn: { width: 36, height: 36, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, marginLeft: 2 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
});
