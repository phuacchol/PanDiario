import { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, FlatList, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { PAN_ASSETS } from "@/src/constants/mascot";
import { useAuth } from "@/src/context/AuthContext";
import { useData, daysUntil, type Cycle } from "@/src/context/DataContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE, CAJA_CHICA_GRADIENT, AHORRO_GRADIENT, NETO_GRADIENT, BUDGET_VITAL_COLOR, BUDGET_SECO_COLOR } from "@/src/theme/theme";
import { formatMoney, formatLocalDate, formatLocalTime } from "@/src/utils/format";
import { AhorrarModal } from "@/src/components/home/AhorrarModal";
import { PagaronModal, type SalaryMethod } from "@/src/components/home/PagaronModal";
import { BudgetCalculatorModal } from "@/src/components/home/BudgetCalculatorModal";
import { CierreDetailModal } from "@/src/components/home/CierreDetailModal";

export default function Home() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const {
    wallet,
    cycles,
    budgetCategories,
    transactions,
    notes,
    lists,
    addSavings,
    registerSalary,
    addBudgetCategory,
    updateBudgetCategoryAmount,
    deleteBudgetCategory,
    deleteCycle,
    refresh,
    openCycleId,
  } = useData();

  const [refreshing, setRefreshing] = useState(false);
  const onRefreshPress = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const [showAhorrar, setShowAhorrar] = useState(false);
  const [showPagaron, setShowPagaron] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [budgetInitialTab, setBudgetInitialTab] = useState<"vital" | "secundario">("vital");
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [detailCycle, setDetailCycle] = useState<Cycle | null>(null);

  const carteraTotal = wallet.carteraEfectivo + wallet.carteraDigital;
  const dias = daysUntil(wallet.nextPaymentDate);

  const vitalTotal = useMemo(() => budgetCategories.filter((c) => c.type === "vital").reduce((s, c) => s + c.amount, 0), [budgetCategories]);
  const secoTotal = useMemo(() => budgetCategories.filter((c) => c.type === "secundario").reduce((s, c) => s + c.amount, 0), [budgetCategories]);
  const presupuestoTotal = vitalTotal + secoTotal;
  const neto = carteraTotal + wallet.cajaChica + wallet.ahorro;

  // budget_categories.amount YA ES el cupo restante (se descuenta en cada
  // gasto, ver applyTxEffect en DataContext). No hay una columna aparte con
  // el monto originalmente asignado, así que el "asignado" del ciclo en
  // curso se reconstruye sumando de vuelta lo gastado este ciclo -sin tocar
  // el esquema ni los datos guardados-, solo para pintar el % de la barra.
  const vitalSpentCycle = useMemo(
    () => transactions.filter((t) => t.origin === "vital" && t.cycle_id === openCycleId).reduce((s, t) => s + t.amount, 0),
    [transactions, openCycleId]
  );
  const secoSpentCycle = useMemo(
    () => transactions.filter((t) => t.origin === "secundario" && t.cycle_id === openCycleId).reduce((s, t) => s + t.amount, 0),
    [transactions, openCycleId]
  );
  const vitalAssigned = vitalTotal + vitalSpentCycle;
  const secoAssigned = secoTotal + secoSpentCycle;
  const vitalPercent = vitalAssigned > 0 ? Math.max(0, Math.min(100, (vitalTotal / vitalAssigned) * 100)) : 0;
  const secoPercent = secoAssigned > 0 ? Math.max(0, Math.min(100, (secoTotal / secoAssigned) * 100)) : 0;

  const closedCycles = useMemo(() => cycles.filter((c) => !!c.end_date).sort((a, b) => (b.end_date || "").localeCompare(a.end_date || "")), [cycles]);
  const availableYears = useMemo(() => {
    const years = new Set(closedCycles.map((c) => new Date(c.end_date as string).getFullYear()));
    if (years.size === 0) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [closedCycles]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const yearCycles = useMemo(
    () => closedCycles.filter((c) => new Date(c.end_date as string).getFullYear() === selectedYear),
    [closedCycles, selectedYear]
  );

  const nearestReminder = useMemo(() => {
    const now = Date.now();
    return notes
      .filter((n) => n.is_reminder && !n.done && n.remind_at)
      .sort((a, b) => new Date(a.remind_at!).getTime() - new Date(b.remind_at!).getTime())
      .find((n) => new Date(n.remind_at!).getTime() >= now - 60000);
  }, [notes]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + 100, paddingHorizontal: SPACING.lg, gap: SPACING.lg }}>
        {/* Cabecera */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Image source={PAN_ASSETS.avatar} style={styles.avatar} contentFit="contain" />
            <View>
              <Text style={[styles.greeting, { color: colors.onSurfaceTertiary }]}>Hola,</Text>
              <Text style={[styles.userName, { color: colors.onSurface }]} numberOfLines={1}>
                {user?.name || "PanDiario"}
              </Text>
            </View>
          </View>
          <View style={styles.headerRightGroup}>
            <Pressable onPress={onRefreshPress} disabled={refreshing} style={[styles.settingsBtn, { backgroundColor: colors.surfaceTertiary }]} testID="home-refresh-button">
              {refreshing ? <ActivityIndicator size="small" color={colors.brand} /> : <Feather name="refresh-cw" size={20} color={colors.onSurface} />}
            </Pressable>
            <Pressable onPress={() => router.push("/settings")} style={[styles.settingsBtn, { backgroundColor: colors.surfaceTertiary }]} testID="home-settings-button">
              <Feather name="settings" size={20} color={colors.onSurface} />
            </Pressable>
          </View>
        </View>

        {/* Banner de recordatorio más próximo */}
        {nearestReminder ? (
          <Pressable
            style={[styles.reminderBanner, { backgroundColor: colors.brand + "18", borderColor: colors.brand }]}
            onPress={() => router.push("/(tabs)/nota")}
            testID="home-reminder-banner"
          >
            <Feather name="bell" size={18} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.reminderText, { color: colors.onSurface }]} numberOfLines={1}>
                {nearestReminder.text}
              </Text>
              <Text style={[styles.reminderMeta, { color: colors.onSurfaceTertiary }]}>
                {formatLocalDate(nearestReminder.remind_at!)} · {formatLocalTime(nearestReminder.remind_at!)}
              </Text>
            </View>
          </Pressable>
        ) : null}

        {/* Tarjeta superior de Cartera + Ahorrar/Pagaron */}
        <View style={styles.walletRow}>
          <View style={[styles.walletCard, { backgroundColor: colors.heroBg }]}>
            <Text style={styles.walletAmount}>{formatMoney(carteraTotal, user?.currency)}</Text>
            <View style={styles.walletSplitRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.walletSplitLabel}>EFECTIVO:</Text>
                <Text style={styles.walletSplitValue}>{formatMoney(wallet.carteraEfectivo, user?.currency)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.walletSplitLabel}>DIGITAL:</Text>
                <Text style={styles.walletSplitValue}>{formatMoney(wallet.carteraDigital, user?.currency)}</Text>
              </View>
            </View>
            <View style={styles.walletFooter}>
              <Feather name="info" size={12} color="rgba(255,255,255,0.6)" />
              <Text style={styles.walletFooterText}>{dias !== null ? `${dias} días para el cierre` : "Registra tu primer sueldo"}</Text>
            </View>
          </View>

          <View style={{ gap: SPACING.sm }}>
            <Pressable style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary }]} onPress={() => setShowAhorrar(true)} testID="home-ahorrar-button">
              <Feather name="pie-chart" size={20} color={colors.brand} />
              <Text style={[styles.actionBtnText, { color: colors.onSurface }]}>AHORRAR</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary }]} onPress={() => setShowPagaron(true)} testID="home-pagaron-button">
              <Feather name="dollar-sign" size={20} color={colors.success} />
              <Text style={[styles.actionBtnText, { color: colors.onSurface }]}>PAGARON</Text>
            </Pressable>
          </View>
        </View>

        {/* Presupuesto */}
        <View style={[styles.budgetCard, { backgroundColor: colors.surfaceSecondary }]}>
          <View style={styles.budgetHeader}>
            <Text style={[styles.budgetTitle, { color: colors.onSurface }]}>PRESUPUESTO</Text>
            <View style={styles.budgetCalcIcon}>
              <Feather name="minus-circle" size={16} color={colors.onSurfaceTertiary} />
              <Text style={[styles.budgetTotal, { color: colors.onSurface }]}>TOTAL: {formatMoney(presupuestoTotal, user?.currency)}</Text>
            </View>
          </View>
          <View style={styles.budgetPillRow}>
            <Pressable
              style={[styles.budgetPill, { backgroundColor: colors.surfaceTertiary }]}
              onPress={() => {
                setBudgetInitialTab("vital");
                setShowBudget(true);
              }}
              testID="home-budget-vital-pill"
            >
              <View style={styles.budgetPillTop}>
                <View style={[styles.budgetIconWrap, { backgroundColor: BUDGET_VITAL_COLOR + "22" }]}>
                  <Feather name="bar-chart-2" size={13} color={BUDGET_VITAL_COLOR} />
                </View>
                <Text style={[styles.budgetPillText, { color: colors.onSurface }]} numberOfLines={1}>
                  VITAL: {formatMoney(vitalTotal, user?.currency)}
                </Text>
                <Feather name="edit-2" size={13} color={colors.onSurfaceTertiary} />
              </View>
              <View style={[styles.budgetProgressTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.budgetProgressFill, { width: `${vitalPercent}%`, backgroundColor: BUDGET_VITAL_COLOR }]} />
              </View>
            </Pressable>
            <Pressable
              style={[styles.budgetPill, { backgroundColor: colors.surfaceTertiary }]}
              onPress={() => {
                setBudgetInitialTab("secundario");
                setShowBudget(true);
              }}
              testID="home-budget-secundario-pill"
            >
              <View style={styles.budgetPillTop}>
                <View style={[styles.budgetIconWrap, { backgroundColor: BUDGET_SECO_COLOR + "22" }]}>
                  <Feather name="slash" size={13} color={BUDGET_SECO_COLOR} />
                </View>
                <Text style={[styles.budgetPillText, { color: colors.onSurface }]} numberOfLines={1}>
                  SECO: {formatMoney(secoTotal, user?.currency)}
                </Text>
                <Feather name="edit-2" size={13} color={colors.onSurfaceTertiary} />
              </View>
              <View style={[styles.budgetProgressTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.budgetProgressFill, { width: `${secoPercent}%`, backgroundColor: BUDGET_SECO_COLOR }]} />
              </View>
            </Pressable>
          </View>
        </View>

        {/* Tarjetas de resumen */}
        <View style={styles.summaryRow}>
          <LinearGradient colors={CAJA_CHICA_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryCard}>
            <Feather name="archive" size={20} color="#FFFFFF" />
            <Text style={styles.summaryTitle}>CAJA CHICA</Text>
            <Text style={styles.summaryAmount}>{formatMoney(wallet.cajaChica, user?.currency)}</Text>
          </LinearGradient>
          <LinearGradient colors={AHORRO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryCard}>
            <MaterialCommunityIcons name="piggy-bank" size={20} color="#FFFFFF" />
            <Text style={styles.summaryTitle}>AHORRO</Text>
            <Text style={styles.summaryAmount}>{formatMoney(wallet.ahorro, user?.currency)}</Text>
          </LinearGradient>
          <LinearGradient colors={NETO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryCard}>
            <MaterialCommunityIcons name="cash" size={20} color="#FFFFFF" />
            <Text style={styles.summaryTitle}>NETO</Text>
            <Text style={styles.summaryAmount}>{formatMoney(neto, user?.currency)}</Text>
          </LinearGradient>
        </View>

        {/* Historial de Cierres */}
        <View style={{ gap: SPACING.md }}>
          <View style={styles.historyHeader}>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>HISTORIAL DE CIERRE</Text>
            <Pressable
              style={[styles.yearBtn, { backgroundColor: colors.surfaceTertiary }]}
              onPress={() => setShowYearPicker(true)}
              testID="home-year-picker-button"
            >
              <Text style={{ color: colors.onSurface, fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm }}>AÑO {selectedYear}</Text>
              <Feather name="chevron-down" size={14} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>

          {yearCycles.length === 0 ? (
            <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.medium, textAlign: "center", paddingVertical: SPACING.lg }}>
              Sin cierres registrados en {selectedYear}.
            </Text>
          ) : (
            yearCycles.map((cycle) => {
              const total = cycle.caja_chica_snapshot + cycle.ahorro_snapshot;
              const start = new Date(cycle.start_date);
              const end = new Date(cycle.end_date as string);
              const rangeLabel = `${String(start.getDate()).padStart(2, "0")}/${String(start.getMonth() + 1).padStart(2, "0")} al ${String(end.getDate()).padStart(2, "0")}/${String(end.getMonth() + 1).padStart(2, "0")}`;
              return (
                <Pressable key={cycle.id} style={[styles.cycleCard, { backgroundColor: colors.surfaceSecondary }]} onPress={() => setDetailCycle(cycle)} testID={`home-cycle-card-${cycle.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cycleMonth, { color: colors.onSurface }]}>{(cycle.label || "").toUpperCase()}</Text>
                    <Text style={[styles.cycleRange, { color: colors.onSurfaceTertiary }]}>{rangeLabel}</Text>
                    <Text style={[styles.cycleDetail, { color: colors.onSurfaceTertiary }]}>
                      CAJA CHICA <Text style={{ color: colors.onSurface, fontFamily: FONTS.bold }}>{formatMoney(cycle.caja_chica_snapshot, user?.currency)}</Text>
                      {"  "}AHORRO <Text style={{ color: colors.onSurface, fontFamily: FONTS.bold }}>{formatMoney(cycle.ahorro_snapshot, user?.currency)}</Text>
                    </Text>
                    <Text style={[styles.cycleDetail, { color: colors.onSurfaceTertiary }]}>
                      RESTO DE CAJA <Text style={{ color: colors.success, fontFamily: FONTS.bold }}>+{formatMoney(cycle.resto_caja, user?.currency)}</Text>
                      {"  "}TOTAL <Text style={{ color: colors.success, fontFamily: FONTS.bold }}>+{formatMoney(total, user?.currency)}</Text>
                    </Text>
                  </View>
                  <Pressable onPress={() => deleteCycle(cycle.id)} hitSlop={8} testID={`home-cycle-delete-${cycle.id}`}>
                    <Feather name="trash-2" size={18} color={colors.error} />
                  </Pressable>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      <AhorrarModal visible={showAhorrar} lastSalary={wallet.lastSalary} onClose={() => setShowAhorrar(false)} onConfirm={(amount) => { addSavings(amount); setShowAhorrar(false); }} />

      <PagaronModal
        visible={showPagaron}
        onClose={() => setShowPagaron(false)}
        onConfirm={(p: { amount: number; method: SalaryMethod; cashAmount?: number; nextPaymentDate: string }) => {
          registerSalary(p);
          setShowPagaron(false);
        }}
      />

      <BudgetCalculatorModal
        visible={showBudget}
        initialTab={budgetInitialTab}
        categories={budgetCategories}
        onAdd={addBudgetCategory}
        onUpdateAmount={updateBudgetCategoryAmount}
        onDelete={deleteBudgetCategory}
        onClose={() => setShowBudget(false)}
      />

      <CierreDetailModal
        visible={!!detailCycle}
        cycle={detailCycle}
        transactions={transactions}
        notes={notes}
        lists={lists}
        onClose={() => setDetailCycle(null)}
      />

      <Modal visible={showYearPicker} transparent animationType="fade" onRequestClose={() => setShowYearPicker(false)}>
        <Pressable style={styles.yearBackdrop} onPress={() => setShowYearPicker(false)}>
          <View style={[styles.yearSheet, { backgroundColor: colors.surfaceSecondary }]}>
            <FlatList
              data={availableYears}
              keyExtractor={(y) => String(y)}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.yearOption}
                  onPress={() => {
                    setSelectedYear(item);
                    setShowYearPicker(false);
                  }}
                  testID={`home-year-option-${item}`}
                >
                  <Text style={{ color: item === selectedYear ? colors.brand : colors.onSurface, fontFamily: item === selectedYear ? FONTS.bold : FONTS.medium, fontSize: FONT_SIZE.lg }}>
                    {item}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  headerRightGroup: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  avatar: { width: 44, height: 44 },
  greeting: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm },
  userName: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg, maxWidth: 180 },
  settingsBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  reminderBanner: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1 },
  reminderText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  reminderMeta: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, marginTop: 2 },

  walletRow: { flexDirection: "row", gap: SPACING.sm },
  walletCard: { flex: 1, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.sm, justifyContent: "space-between" },
  walletAmount: { fontFamily: FONTS.black, fontSize: FONT_SIZE["3xl"], color: "#FFFFFF" },
  walletSplitRow: { flexDirection: "row" },
  walletSplitLabel: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: "rgba(255,255,255,0.7)" },
  walletSplitValue: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, color: "#FFFFFF" },
  walletFooter: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.xs },
  walletFooterText: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: "rgba(255,255,255,0.7)" },

  actionBtn: { width: 96, height: 68, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", gap: 4 },
  actionBtnText: { fontFamily: FONTS.bold, fontSize: 11 },

  budgetCard: { borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.md },
  budgetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  budgetTitle: { fontFamily: FONTS.black, fontSize: FONT_SIZE.lg },
  budgetCalcIcon: { flexDirection: "row", alignItems: "center", gap: 6 },
  budgetTotal: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  budgetPillRow: { flexDirection: "row", gap: SPACING.sm },
  budgetPill: { flex: 1, gap: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md },
  budgetPillTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  budgetIconWrap: { width: 22, height: 22, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  budgetPillText: { flex: 1, fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm },
  budgetProgressTrack: { height: 5, borderRadius: RADIUS.pill, overflow: "hidden" },
  budgetProgressFill: { height: "100%", borderRadius: RADIUS.pill },

  summaryRow: { flexDirection: "row", gap: SPACING.sm },
  summaryCard: { flex: 1, borderRadius: RADIUS.md, paddingVertical: SPACING.lg, paddingHorizontal: SPACING.sm, gap: 6, alignItems: "center" },
  summaryTitle: { fontFamily: FONTS.bold, fontSize: 11, textAlign: "center", color: "#FFFFFF" },
  summaryAmount: { fontFamily: FONTS.black, fontSize: FONT_SIZE.lg, textAlign: "center", color: "#FFFFFF" },

  historyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontFamily: FONTS.black, fontSize: FONT_SIZE.base },
  yearBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: SPACING.md, height: 36, borderRadius: RADIUS.pill },

  cycleCard: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md },
  cycleMonth: { fontFamily: FONTS.black, fontSize: FONT_SIZE.base },
  cycleRange: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, marginTop: 2 },
  cycleDetail: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, marginTop: 4 },

  yearBackdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.4)", alignItems: "center", justifyContent: "center" },
  yearSheet: { width: 160, maxHeight: 280, borderRadius: RADIUS.lg, paddingVertical: SPACING.sm },
  yearOption: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, alignItems: "center" },
});
