import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Button } from "@/src/components/ui";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";

interface TimePickerModalProps {
  visible: boolean;
  initialHour?: number;
  initialMinute?: number;
  colors: any;
  title?: string;
  onSelect: (hour: number, minute: number) => void;
  onRequestClose: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

// Selector estricto de hora (formato 24h, 00-23 / 00-59): reemplaza los
// inputs numéricos de texto libre -que permitían valores inválidos como
// "089885"- por dos columnas desplazables limitadas a rangos válidos.
export function TimePickerModal({
  visible,
  initialHour = 8,
  initialMinute = 0,
  colors,
  title = "Elegir hora",
  onSelect,
  onRequestClose,
}: TimePickerModalProps) {
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);

  useEffect(() => {
    if (visible) {
      setHour(Math.min(23, Math.max(0, initialHour)));
      setMinute(Math.min(59, Math.max(0, initialMinute)));
    }
  }, [visible, initialHour, initialMinute]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.onSurface }]}>{title}</Text>
            <Pressable onPress={onRequestClose} hitSlop={8} testID="time-picker-close">
              <Feather name="x" size={20} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>

          <View style={styles.columns}>
            <View style={styles.column}>
              <Text style={[styles.columnLabel, { color: colors.onSurfaceTertiary }]}>Hora</Text>
              <ScrollView
                style={styles.wheel}
                contentContainerStyle={{ paddingVertical: 4 }}
                showsVerticalScrollIndicator={false}
                testID="time-picker-hours"
              >
                {HOURS.map((h) => {
                  const active = h === hour;
                  return (
                    <Pressable
                      key={h}
                      onPress={() => setHour(h)}
                      style={[styles.cell, active && { backgroundColor: colors.brand }]}
                      testID={`time-picker-hour-${h}`}
                    >
                      <Text style={{ color: active ? colors.onBrand : colors.onSurface, fontFamily: active ? FONTS.bold : FONTS.medium, fontSize: FONT_SIZE.base }}>
                        {String(h).padStart(2, "0")}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <Text style={[styles.colon, { color: colors.onSurface }]}>:</Text>

            <View style={styles.column}>
              <Text style={[styles.columnLabel, { color: colors.onSurfaceTertiary }]}>Minuto</Text>
              <ScrollView
                style={styles.wheel}
                contentContainerStyle={{ paddingVertical: 4 }}
                showsVerticalScrollIndicator={false}
                testID="time-picker-minutes"
              >
                {MINUTES.map((m) => {
                  const active = m === minute;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setMinute(m)}
                      style={[styles.cell, active && { backgroundColor: colors.brand }]}
                      testID={`time-picker-minute-${m}`}
                    >
                      <Text style={{ color: active ? colors.onBrand : colors.onSurface, fontFamily: active ? FONTS.bold : FONTS.medium, fontSize: FONT_SIZE.base }}>
                        {String(m).padStart(2, "0")}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          <Button title="Confirmar" icon="check" onPress={() => onSelect(hour, minute)} testID="time-picker-confirm" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: SPACING.lg },
  content: { padding: SPACING.xl, borderRadius: RADIUS.lg, gap: SPACING.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  columns: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm },
  column: { alignItems: "center", gap: SPACING.xs },
  columnLabel: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm },
  wheel: { height: 180, width: 88 },
  colon: { fontFamily: FONTS.black, fontSize: FONT_SIZE.lg, marginTop: 20 },
  cell: { height: 44, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
});
