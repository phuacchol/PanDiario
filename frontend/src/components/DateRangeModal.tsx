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

interface DateRangeModalProps {
  visible: boolean;
  initialStart?: string;
  initialEnd?: string;
  colors: any;
  title?: string;
  onApply: (start: string, end: string) => void;
  onClear: () => void;
  onRequestClose: () => void;
}

// Selector interactivo de rango de fechas (Desde/Hasta) con calendario y año
// deslizable. Componente compartido para no repetir la misma UI en Ventas,
// Reportes, Inicio, Gastos e Historial de Arqueos.
export function DateRangeModal({
  visible,
  initialStart,
  initialEnd,
  colors,
  title = "Filtrar por Calendario",
  onApply,
  onClear,
  onRequestClose,
}: DateRangeModalProps) {
  const [selectingTarget, setSelectingTarget] = useState<"start" | "end">("start");
  const [startDate, setStartDate] = useState(() => initialStart || getLocalDateStr());
  const [endDate, setEndDate] = useState(() => initialEnd || getLocalDateStr());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const yearScrollRef = useRef<ScrollView>(null);

  const availableYears = useMemo(() => {
    const current = new Date().getFullYear();
    const list: number[] = [];
    for (let y = current - 25; y <= current + 5; y++) list.push(y);
    return list;
  }, []);

  useEffect(() => {
    if (!visible) return;
    const seedStart = initialStart || getLocalDateStr();
    const seedEnd = initialEnd || getLocalDateStr();
    setStartDate(seedStart);
    setEndDate(seedEnd);
    setSelectingTarget("start");

    const current = new Date().getFullYear();
    const initialY = parseInt(seedStart.split("-")[0], 10) || current;
    setCalYear(initialY);
    setCalMonth((parseInt(seedStart.split("-")[1], 10) - 1) || new Date().getMonth());

    const index = availableYears.indexOf(initialY);
    if (index >= 0) {
      setTimeout(() => {
        yearScrollRef.current?.scrollTo({ x: Math.max(0, (index - 2) * 58), animated: true });
      }, 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const daysInMonth = useMemo(() => new Date(calYear, calMonth + 1, 0).getDate(), [calYear, calMonth]);
  const firstDayOfWeek = useMemo(() => new Date(calYear, calMonth, 1).getDay(), [calYear, calMonth]);

  const handleDaySelect = (dayNum: number) => {
    const dStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    if (selectingTarget === "start") {
      setStartDate(dStr);
      if (dStr > endDate) setEndDate(dStr);
      setSelectingTarget("end");
    } else {
      if (dStr < startDate) {
        setStartDate(dStr);
      } else {
        setEndDate(dStr);
      }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <Text style={[styles.section, { color: colors.onSurface, marginBottom: SPACING.xs }]}>{title}</Text>

          <View style={{ flexDirection: "row", gap: SPACING.sm, marginBottom: 8 }}>
            <Pressable
              onPress={() => setSelectingTarget("start")}
              style={[
                styles.rangeTargetBox,
                {
                  borderColor: selectingTarget === "start" ? colors.brand : colors.border,
                  backgroundColor: selectingTarget === "start" ? colors.brandTertiary : colors.surfaceSecondary,
                },
              ]}
            >
              <Text style={{ fontFamily: FONTS.medium, fontSize: 10, color: colors.onSurfaceTertiary }}>Desde</Text>
              <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm, color: colors.onSurface }}>{startDate}</Text>
            </Pressable>

            <Pressable
              onPress={() => setSelectingTarget("end")}
              style={[
                styles.rangeTargetBox,
                {
                  borderColor: selectingTarget === "end" ? colors.brand : colors.border,
                  backgroundColor: selectingTarget === "end" ? colors.brandTertiary : colors.surfaceSecondary,
                },
              ]}
            >
              <Text style={{ fontFamily: FONTS.medium, fontSize: 10, color: colors.onSurfaceTertiary }}>Hasta</Text>
              <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm, color: colors.onSurface }}>{endDate}</Text>
            </Pressable>
          </View>

          <View style={{ marginTop: 6 }}>
            <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: colors.onSurfaceTertiary, marginBottom: 6 }}>
              Seleccionar Año ({availableYears[0]} – {availableYears[availableYears.length - 1]})
            </Text>
            <ScrollView
              ref={yearScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: SPACING.xs }}
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
          </View>

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
              const isSelected = cellStr === startDate || cellStr === endDate;
              const isInRange = cellStr >= startDate && cellStr <= endDate;

              return (
                <Pressable
                  key={`day-${dayNum}`}
                  onPress={() => handleDaySelect(dayNum)}
                  style={[
                    styles.dayCell,
                    isInRange && { backgroundColor: colors.brandTertiary },
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

          <View style={styles.modalButtons}>
            <Pressable
              onPress={onClear}
              style={[styles.modalBtn, { backgroundColor: colors.surfaceSecondary }]}
            >
              <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.bold }}>Limpiar</Text>
            </Pressable>
            <Pressable
              onPress={() => onApply(startDate, endDate)}
              style={[styles.modalBtn, { backgroundColor: colors.brand }]}
            >
              <Text style={{ color: colors.onBrand || "#FFF", fontFamily: FONTS.bold }}>Aplicar Filtro</Text>
            </Pressable>
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
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  modalBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  rangeTargetBox: {
    flex: 1,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    alignItems: "center",
  },
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
