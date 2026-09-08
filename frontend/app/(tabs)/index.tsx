import { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, FlatList, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { PAN_ASSETS } from "@/src/constants/mascot";
import { useAuth } from "@/src/context/AuthContext";
import { useData, daysUntil, type Cycle } from "@/src/context/DataContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
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
            <Text style={styles.walletAmount}>{formatMoney(carteraTotal, "PEN")}</Text>
            <View style={styles.walletSplitRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.walletSplitLabel}>EFECTIVO:</Text>
                <Text style={styles.walletSplitValue}>S/ {wallet.carteraEfectivo.toFixed(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.walletSplitLabel}>DIGITAL:</Text>
                <Text style={styles.walletSplitValue}>S/ {wallet.carteraDigital.toFixed(0)}</Text>
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
            <Pressable
              style={styles.budgetCalcIcon}
              onPress={() => {
                setBudgetInitialTab("vital");
                setShowBudget(true);
              }}
              testID="home-budget-calculator-button"
            >
              <Feather name="divide-circle" size={16} color={colors.onSurfaceTertiary} />
              <Text style={[styles.budgetTotal, { color: colors.onSurface }]}>TOTAL: {formatMoney(presupuestoTotal, "PEN")}</Text>
            </Pressable>
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
              <Text style={[styles.budgetPillText, { color: colors.onSurface }]}>VITAL: {formatMoney(vitalTotal, "PEN")}</Text>
              <Feather name="edit-2" size={13} color={colors.onSurfaceTertiary} />
            </Pressable>
            <Pressable
              style={[styles.budgetPill, { backgroundColor: colors.surfaceTertiary }]}
              onPress={() => {
                setBudgetInitialTab("secundario");
                setShowBudget(true);
              }}
              testID="home-budget-secundario-pill"
            >
              <Text style={[styles.budgetPillText, { color: colors.onSurface }]}>SECO: {formatMoney(secoTotal, "PEN")}</Text>
              <Feather name="edit-2" size={13} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>
        </View>

        {/* Tarjetas de resumen */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.summaryTitle, { color: colors.onSurface }]}>CAJA CHICA</Text>
            <Text style={[styles.summarySub, { color: colors.success }]}>(+{formatMoney(wallet.cajaChica, "PEN")} TOTAL)</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.summaryTitle, { color: colors.onSurface }]}>AHORRO</Text>
            <Text style={[styles.summarySub, { color: colors.success }]}>(+{formatMoney(wallet.ahorro, "PEN")} TOTAL)</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.summaryTitle, { color: colors.onSurface }]}>NETO</Text>
            <Text style={[styles.summarySub, { color: colors.brand }]}>({formatMoney(neto, "PEN")})</Text>
          </View>
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
                      CAJA CHICA <Text style={{ color: colors.onSurface, fontFamily: FONTS.bold }}>{formatMoney(cycle.caja_chica_snapshot, "PEN")}</Text>
                      {"  "}AHORRO <Text style={{ color: colors.onSurface, fontFamily: FONTS.bold }}>{formatMoney(cycle.ahorro_snapshot, "PEN")}</Text>
                    </Text>
                    <Text style={[styles.cycleDetail, { color: colors.onSurfaceTertiary }]}>
                      RESTO DE CAJA <Text style={{ color: colors.success, fontFamily: FONTS.bold }}>+{formatMoney(cycle.resto_caja, "PEN")}</Text>
                      {"  "}TOTAL <Text style={{ color: colors.success, fontFamily: FONTS.bold }}>+{formatMoney(total, "PEN")}</Text>
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
  settingsBtn: { width: 42, height: 42, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },

  reminderBanner: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1 },
  reminderText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  reminderMeta: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, marginTop: 2 },

  walletRow: { flexDirection: "row", gap: SPACING.sm },
  walletCard: { flex: 1, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.sm, justifyContent: "space-between" },
  walletAmount: { fontFamily: FONTS.black, fontSize: FONT_SIZE["3xl"], color: "#4EE3A5" },
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
  budgetPill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: RADIUS.pill },
  budgetPillText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm },

  summaryRow: { flexDirection: "row", gap: SPACING.sm },
  summaryCard: { flex: 1, borderRadius: RADIUS.md, padding: SPACING.md, gap: 4, alignItems: "center" },
  summaryTitle: { fontFamily: FONTS.bold, fontSize: 11, textAlign: "center" },
  summarySub: { fontFamily: FONTS.medium, fontSize: 11, textAlign: "center" },

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
