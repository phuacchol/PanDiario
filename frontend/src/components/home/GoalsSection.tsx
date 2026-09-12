import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { useAuth } from "@/src/context/AuthContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatMoney, currencySymbol } from "@/src/utils/format";

const GOAL_COLOR = "#32CD32";

function GoalBar({ label, current, target, currency, testID }: { label: string; current: number; target: number; currency?: string; testID: string }) {
  const { colors } = useTheme();
  const percent = target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0;
  return (
    <View style={{ gap: SPACING.xs }} testID={testID}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[goalStyles.label, { color: colors.onSurface }]}>{label}</Text>
        <Text style={[goalStyles.target, { color: colors.onSurfaceTertiary }]}>{formatMoney(target, currency)}</Text>
      </View>
      <View style={[goalStyles.track, { backgroundColor: colors.border }]}>
        <View style={[goalStyles.fill, { width: `${percent}%` }]} />
      </View>
      <Text style={[goalStyles.percent, { color: colors.onSurfaceTertiary }]}>{Math.round(percent)}%</Text>
    </View>
  );
}

export function GoalsSection({
  ahorro,
  cajaChica,
  targetAhorro,
  targetCajaChica,
  onSave,
}: {
  ahorro: number;
  cajaChica: number;
  targetAhorro: number;
  targetCajaChica: number;
  onSave: (p: { targetAhorro: number; targetCajaChica: number }) => void;
}) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [showEdit, setShowEdit] = useState(false);
  const [ahorroInput, setAhorroInput] = useState("");
  const [cajaInput, setCajaInput] = useState("");

  useEffect(() => {
    if (showEdit) {
      setAhorroInput(targetAhorro > 0 ? String(targetAhorro) : "");
      setCajaInput(targetCajaChica > 0 ? String(targetCajaChica) : "");
    }
  }, [showEdit, targetAhorro, targetCajaChica]);

  const handleSave = () => {
    onSave({
      targetAhorro: parseFloat(ahorroInput.replace(",", ".")) || 0,
      targetCajaChica: parseFloat(cajaInput.replace(",", ".")) || 0,
    });
    setShowEdit(false);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.onSurface }]}>MIS OBJETIVOS</Text>
        <Pressable onPress={() => setShowEdit(true)} hitSlop={8} testID="goals-edit-button">
          <Feather name="edit-2" size={16} color={colors.onSurfaceTertiary} />
        </Pressable>
      </View>

      <GoalBar label="Ahorro" current={ahorro} target={targetAhorro} currency={user?.currency} testID="goal-bar-ahorro" />
      <GoalBar label="Caja Chica" current={cajaChica} target={targetCajaChica} currency={user?.currency} testID="goal-bar-caja-chica" />

      <Modal visible={showEdit} transparent animationType="fade" onRequestClose={() => setShowEdit(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowEdit(false)}>
          <Pressable style={[styles.editCard, { backgroundColor: colors.surfaceSecondary }]} onPress={() => {}}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.onSurface }]}>Editar Objetivos</Text>
              <Pressable onPress={() => setShowEdit(false)} hitSlop={8} testID="goals-edit-close">
                <Feather name="x" size={20} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>

            <Text style={[goalStyles.fieldLabel, { color: colors.onSurface }]}>Meta de Ahorro</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
              <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.bold }}>{currencySymbol(user?.currency)}</Text>
              <TextInput
                value={ahorroInput}
                onChangeText={setAhorroInput}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.input, { color: colors.onSurface }]}
                testID="goals-target-ahorro-input"
              />
            </View>

            <Text style={[goalStyles.fieldLabel, { color: colors.onSurface }]}>Meta de Caja Chica</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
              <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.bold }}>{currencySymbol(user?.currency)}</Text>
              <TextInput
                value={cajaInput}
                onChangeText={setCajaInput}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.input, { color: colors.onSurface }]}
                testID="goals-target-caja-input"
              />
            </View>

            <Pressable style={[styles.confirmBtn, { backgroundColor: colors.brand }]} onPress={handleSave} testID="goals-save-button">
              <Feather name="check" size={18} color={colors.onBrand} />
              <Text style={[styles.confirmText, { color: colors.onBrand }]}>Guardar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.md, padding: SPACING.lg, gap: SPACING.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: FONTS.black, fontSize: FONT_SIZE.base, letterSpacing: 0.3 },
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.55)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  editCard: { width: "100%", maxWidth: 380, borderRadius: RADIUS.lg, padding: SPACING.xl, gap: SPACING.md },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md, height: 48 },
  input: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.lg, height: "100%" },
  confirmBtn: { flexDirection: "row", height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", gap: SPACING.sm, marginTop: SPACING.xs },
  confirmText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
});

const goalStyles = StyleSheet.create({
  label: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm },
  target: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs },
  track: { height: 10, borderRadius: RADIUS.pill, overflow: "hidden" },
  fill: { height: "100%", borderRadius: RADIUS.pill, backgroundColor: GOAL_COLOR },
  percent: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.xs, alignSelf: "flex-end" },
  fieldLabel: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm, marginTop: -SPACING.xs },
});
