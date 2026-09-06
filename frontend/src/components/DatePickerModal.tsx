import { useState, useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

function getLocalDateStr(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface DatePickerModalProps {
  visible: boolean;
  initialDate?: string;
  colors: any;
  title?: string;
  onSelect: (date: string) => void;
  onRequestClose: () => void;
}

// Selector de una sola fecha (ej. vencimiento de un lote) con el mismo
// lenguaje visual del calendario de rango, pero de un solo clic: tocar un
// día lo confirma de inmediato.
export function DatePickerModal({
  visible,
  initialDate,
  colors,
  title = "Seleccionar fecha",
  onSelect,
  onRequestClose,
}: DatePickerModalProps) {
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const yearScrollRef = useRef<ScrollView>(null);

  const availableYears = useMemo(() => {
    const current = new Date().getFullYear();
    const list: number[] = [];
    for (let y = current - 1; y <= current + 5; y++) list.push(y);
    return list;
  }, []);

  useEffect(() => {
    if (!visible) return;
    const seed = initialDate || getLocalDateStr();
    const y = parseInt(seed.split("-")[0], 10) || new Date().getFullYear();
    const m = (parseInt(seed.split("-")[1], 10) - 1) || new Date().getMonth();
    setCalYear(y);
    setCalMonth(m);

    const index = availableYears.indexOf(y);
    if (index >= 0) {
      setTimeout(() => {
        yearScrollRef.current?.scrollTo({ x: Math.max(0, (index - 2) * 58), animated: true });
      }, 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const daysInMonth = useMemo(() => new Date(calYear, calMonth + 1, 0).getDate(), [calYear, calMonth]);
  const firstDayOfWeek = useMemo(() => new Date(calYear, calMonth, 1).getDay(), [calYear, calMonth]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[styles.section, { color: colors.onSurface }]}>{title}</Text>
            <Pressable onPress={onRequestClose} hitSlop={8}>
              <Feather name="x" size={20} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>

          <ScrollView
            ref={yearScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: SPACING.xs, marginTop: 4 }}
          >
            {availableYears.map((y) => {
              const active = calYear === y;
              return (
                <Pressable
                  key={y}
                  onPress={() => setCalYear(y)}
                  style={[
                    styles.yearChip,
                    {
                      backgroundColor: active ? colors.brand : colors.surfaceSecondary,
                      borderColor: active ? colors.brand : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: active ? FONTS.bold : FONTS.medium,
                      fontSize: FONT_SIZE.xs,
                      color: active ? "#FFF" : colors.onSurface,
                    }}
                  >
                    {y}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 8 }}>
            <Pressable
              onPress={() => {
                if (calMonth === 0) {
                  setCalMonth(11);
                  setCalYear((y) => y - 1);
                } else {
                  setCalMonth((m) => m - 1);
                }
              }}
              style={styles.calNavBtn}
            >
              <Feather name="chevron-left" size={22} color={colors.onSurface} />
            </Pressable>

            <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, color: colors.onSurface }}>
              {MONTH_NAMES[calMonth]} {calYear}
            </Text>

            <Pressable
              onPress={() => {
                if (calMonth === 11) {
                  setCalMonth(0);
                  setCalYear((y) => y + 1);
                } else {
                  setCalMonth((m) => m + 1);
                }
              }}
              style={styles.calNavBtn}
            >
              <Feather name="chevron-right" size={22} color={colors.onSurface} />
            </Pressable>
          </View>

          <View style={styles.daysGrid}>
            {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
              <Text key={i} style={[styles.dayHeader, { color: colors.onSurfaceTertiary }]}>{d}</Text>
            ))}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.dayCell} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const cellStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const isSelected = cellStr === initialDate;

              return (
                <Pressable
                  key={`day-${dayNum}`}
                  onPress={() => onSelect(cellStr)}
                  style={[
                    styles.dayCell,
                    isSelected && { backgroundColor: colors.brand, borderRadius: RADIUS.sm },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: isSelected ? FONTS.black : FONTS.medium,
                      fontSize: 12,
                      color: isSelected ? "#FFF" : colors.onSurface,
                    }}
                  >
                    {dayNum}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  modalContent: { padding: SPACING.xl, borderRadius: RADIUS.lg, gap: SPACING.sm },
  yearChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  calNavBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
  },
  dayHeader: {
    width: "14.28%",
    textAlign: "center",
    fontFamily: FONTS.bold,
    fontSize: 11,
    paddingVertical: 4,
  },
  dayCell: {
    width: "14.28%",
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
