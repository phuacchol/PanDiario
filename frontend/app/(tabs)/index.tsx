import { useState, useCallback, useMemo, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { LineChart } from "react-native-gifted-charts";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { Card } from "@/src/components/ui";
import { PAN_ASSETS } from "@/src/constants/mascot";
import { DateRangeModal } from "@/src/components/DateRangeModal";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE, DARK_HERO_GRADIENT } from "@/src/theme/theme";
import { formatMoney, formatLocalWeekday, formatLocalTime } from "@/src/utils/format";
import { getDb } from "@/src/utils/localDb";

const DEFAULT_CHART_RANGE_KEY = "@pan_default_chart_range";

const RANGES = [
  { key: "today", label: "Hoy" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
  { key: "year", label: "Año" },
  { key: "custom", label: "Rango" },
];

function formatChartAxisLabel(rawLabel: string, range: string): string {
  if (!rawLabel) return "";

  if (range === "year") {
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
    const monthNum = parseInt(rawLabel.slice(-2), 10);
    if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
      return months[monthNum - 1];
    }
    return rawLabel.slice(0, 3);
  }

  if (range === "month") {
    if (rawLabel.includes("-")) {
      const parts = rawLabel.split("-");
      const dayNum = parts.length >= 3 ? parseInt(parts[2], 10) : NaN;
      if (isNaN(dayNum)) return rawLabel.slice(-2);
      // Paso de etiquetas cada 5 días (1, 5, 10, 15, 20, 25, 30): con una
      // etiqueta por cada uno de los ~30 días el eje queda ilegible incluso
      // con scroll horizontal. Los puntos sin etiqueta visible siguen
      // trazando la curva igual, solo no muestran número debajo.
      return dayNum === 1 || dayNum % 5 === 0 ? String(dayNum) : "";
    }
    return rawLabel.slice(-2);
  }

  if (range === "week") {
    if (rawLabel.includes("-")) {
      const d = new Date(rawLabel + (rawLabel.length === 10 ? "T12:00:00" : ""));
      return formatLocalWeekday(d);
    }
    return rawLabel.slice(0, 3);
  }

  if (range === "today") {
    if (rawLabel.includes("T")) {
      const d = new Date(rawLabel);
      return formatLocalTime(d);
    }
    return rawLabel.slice(0, 5);
  }

  return rawLabel.slice(-5);
}

export default function Home() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const cur = user?.currency || "PEN";

  const [range, setRange] = useState("today");
  // Espejo del range actual para useFocusEffect (más abajo): ese efecto
  // solo debe re-ejecutarse al reenfocar la pantalla, nunca al cambiar
  // range -onRange ya dispara su propio load() explícito-, pero necesita
  // leer el valor MÁS RECIENTE en ese momento, no el capturado por closure
  // en el render donde useCallback([load]) se memoizó por última vez.
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selector de Rango personalizado (Fecha Inicio - Fecha Fin)
  const [customRangeModal, setCustomRangeModal] = useState(false);
  const [startDateStr, setStartDateStr] = useState(() => new Date().toISOString().split("T")[0]);
  const [endDateStr, setEndDateStr] = useState(() => new Date().toISOString().split("T")[0]);

  // Cálculo local con criterio contable consistente
  const loadLocalDashboard = useCallback(async (r: string, customStart?: string, customEnd?: string) => {
    try {
      const db = await getDb();
      if (!db) return null;

      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const allSales = await db.getAllAsync<any>(`SELECT * FROM sales`).catch(() => []);
      const allExpenses = await db.getAllAsync<any>(`SELECT * FROM expenses`).catch(() => []);
      const allProds = await db.getAllAsync<any>(`SELECT stock, min_stock FROM products`).catch(() => []);

      const filteredSales = allSales.filter((s) => {
        const sDate = s.created_at || "";
        if (r === "today") return sDate.startsWith(todayStr);
        if (r === "week") {
          const d = new Date();
          d.setDate(d.getDate() - 7);
          return new Date(sDate) >= d;
        }
        if (r === "month") return sDate.startsWith(todayStr.slice(0, 7));
        if (r === "year") return sDate.startsWith(todayStr.slice(0, 4));
        if (r === "custom") {
          const d = sDate.split("T")[0];
          return (!customStart || d >= customStart) && (!customEnd || d <= customEnd);
        }
        return true;
      });

      const filteredExpenses = allExpenses.filter((e) => {
        const eDate = e.created_at || "";
        if (r === "today") return eDate.startsWith(todayStr);
        if (r === "week") {
          const d = new Date();
          d.setDate(d.getDate() - 7);
          return new Date(eDate) >= d;
        }
        if (r === "month") return eDate.startsWith(todayStr.slice(0, 7));
        if (r === "year") return eDate.startsWith(todayStr.slice(0, 4));
        if (r === "custom") {
          const d = eDate.split("T")[0];
          return (!customStart || d >= customStart) && (!customEnd || d <= customEnd);
        }
        return true;
      });

      // 1. Ingresos brutos por ventas
      const total_income = filteredSales.reduce((acc, s) => acc + (Number(s.total) || 0), 0);

      // 2. Costo de la mercadería vendida (COGS)
      const cogs = filteredSales.reduce((acc, s) => acc + (Number(s.cost_total) || 0), 0);

      // 3. Gastos operativos (excluyendo compras de stock que permanecen como activo)
      const operating_expenses = filteredExpenses
        .filter((e) => e.type !== "Mercancía" && e.category !== "Compra de Stock")
        .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

      // 4. Egresos del período y Ganancia Neta
      const total_expenses = cogs + operating_expenses;
      const net_profit = total_income - total_expenses;
      const low_stock_count = allProds.filter((p) => Number(p.stock) <= Number(p.min_stock)).length;

      let balance_cash = 0;
      let balance_transfer = 0;
      allSales.forEach((s) => {
        const pays = typeof s.payments === "string" ? JSON.parse(s.payments || "[]") : s.payments || [];
        pays.forEach((p: any) => {
          if (p.method === "cash") balance_cash += Number(p.amount) || 0;
          else balance_transfer += Number(p.amount) || 0;
        });
      });
      allExpenses.forEach((e) => {
        if (e.method === "cash") balance_cash -= Number(e.amount) || 0;
      });

      let sales_series: { label: string; value: number }[] = [];
      if (r === "year") {
        const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
        const monthMap = new Array(12).fill(0);
        filteredSales.forEach((s) => {
          const m = new Date(s.created_at).getMonth();
          if (!isNaN(m)) monthMap[m] += Number(s.total) || 0;
        });
        sales_series = months.map((m, idx) => ({ label: m, value: monthMap[idx] }));
      } else if (r === "today") {
        const hourMap = new Map<string, number>();
        filteredSales.forEach((s) => {
          const d = new Date(s.created_at);
          const hr = !isNaN(d.getHours()) ? `${String(d.getHours()).padStart(2, "0")}:00` : "00:00";
          hourMap.set(hr, (hourMap.get(hr) || 0) + (Number(s.total) || 0));
        });
        sales_series = Array.from(hourMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([hr, val]) => ({ label: hr, value: val }));
        if (sales_series.length === 0) sales_series = [{ label: "Hoy", value: total_income }];
      } else {
        const dayMap = new Map<string, number>();
        filteredSales.forEach((s) => {
          const d = (s.created_at || "").split("T")[0];
          dayMap.set(d, (dayMap.get(d) || 0) + (Number(s.total) || 0));
        });

        // Relleno con 0 para los días sin ventas dentro del período, así
        // la curva siempre traza el rango completo (ej. de 0 a 80) en vez
        // de saltar directo al único día con datos.
        let rangeStart: Date | null = null;
        let rangeEnd: Date | null = null;
        if (r === "week") {
          rangeEnd = new Date(todayStr);
          rangeStart = new Date(todayStr);
          rangeStart.setDate(rangeStart.getDate() - 6);
        } else if (r === "month") {
          // Abarca el mes completo (día 1 al último), no solo hasta hoy,
          // para que el eje X del gráfico siempre trace todos los días.
          rangeStart = new Date(todayStr.slice(0, 7) + "-01");
          rangeEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 0);
        } else if (r === "custom" && customStart && customEnd) {
          rangeStart = new Date(customStart);
          rangeEnd = new Date(customEnd);
        }

        if (rangeStart && rangeEnd && rangeEnd >= rangeStart) {
          const diffDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000);
          if (diffDays <= 92) {
            const cursor = new Date(rangeStart);
            while (cursor <= rangeEnd) {
              const key = cursor.toISOString().split("T")[0];
              if (!dayMap.has(key)) dayMap.set(key, 0);
              cursor.setDate(cursor.getDate() + 1);
            }
          }
        }

        sales_series = Array.from(dayMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([d, val]) => ({ label: d, value: val }));
      }

      // Garantía final: el gráfico nunca debe verse vacío ni con un solo
      // punto (que se renderiza como si "no hubiera datos suficientes").
      // Con 0 o 1 valores se antepone un punto en 0 para que la curva
      // siempre trace ambos ejes.
      if (sales_series.length === 0) {
        sales_series = [{ label: "Inicio", value: 0 }, { label: "Hoy", value: 0 }];
      } else if (sales_series.length === 1) {
        sales_series = [{ label: "Inicio", value: 0 }, sales_series[0]];
      }

      return {
        balance_total: balance_cash + balance_transfer,
        balance_cash,
        balance_transfer,
        total_income,
        total_expenses,
        cogs,
        operating_expenses,
        net_profit,
        sales_count: filteredSales.length,
        low_stock_count,
        sales_series,
      };
    } catch {
      return null;
    }
  }, []);

  const load = useCallback(
    async (r: string, customStart?: string, customEnd?: string) => {
      // Solo se usa el cálculo local (SQLite): el endpoint remoto de
      // /dashboard no rellena con ceros los días sin ventas ni los días
      // futuros del mes/año en curso, así que su sales_series llega
      // incompleta (el gráfico se corta en el día de hoy en vez de trazar
      // el mes/año completo). Sobrescribir el resultado local, ya correcto,
      // con esa respuesta más pobre era la causa del corte visual.
      const localData = await loadLocalDashboard(r, customStart, customEnd);
      if (localData) {
        setData(localData);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [loadLocalDashboard]
  );

  useFocusEffect(
    useCallback(() => {
      let currentR = rangeRef.current;
      AsyncStorage.getItem(DEFAULT_CHART_RANGE_KEY).then((saved) => {
        if (saved && ["today", "week", "month", "year"].includes(saved)) {
          setRange(saved);
          currentR = saved;
        }
        if (currentR === "custom") return;
        load(currentR);
      });
    }, [load])
  );

  const onRange = (r: string) => {
    if (r === "custom") {
      setCustomRangeModal(true);
      return;
    }
    setRange(r);
    load(r);
  };

  const safeData = {
    balance_total: data?.balance_total ?? 0,
    balance_cash: data?.balance_cash ?? 0,
    balance_transfer: data?.balance_transfer ?? 0,
    total_income: data?.total_income ?? 0,
    total_expenses: data?.total_expenses ?? 0,
    cogs: data?.cogs ?? 0,
    operating_expenses: data?.operating_expenses ?? 0,
    net_profit: data?.net_profit ?? 0,
    sales_count: data?.sales_count ?? 0,
    low_stock_count: data?.low_stock_count ?? 0,
    // Garantía cliente de zero-filling: si el dashboard remoto respondió
    // antes que el cálculo local (o en vez de él) con una serie vacía o de
    // un solo punto, igual se completa para que el gráfico nunca se vea
    // vacío.
    sales_series: (() => {
      const raw = Array.isArray(data?.sales_series) ? data.sales_series : [];
      if (raw.length === 0) return [{ label: "Inicio", value: 0 }, { label: "Hoy", value: 0 }];
      if (raw.length === 1) return [{ label: "Inicio", value: 0 }, raw[0]];
      return raw;
    })(),
  };

  // Criterio y descripción contable dinámica
  const periodDetails = useMemo(() => {
    const titles: Record<string, string> = {
      today: "Operación: Venta Diaria (Hoy)",
      week: "Operación: Venta Semanal (Últimos 7 días)",
      month: "Operación: Venta Mensual (Mes en curso)",
      year: "Operación: Venta Anual",
      custom: `Operación: Rango ${startDateStr} al ${endDateStr}`,
    };

    const cogsFormatted = formatMoney(safeData.cogs, cur);
    const opExFormatted = formatMoney(safeData.operating_expenses, cur);

    return {
      title: titles[range] || "Período actual",
      desc: `Egresos = ${cogsFormatted} (costo de lo vendido) + ${opExFormatted} (gastos operativos). La mercadería en almacén no se descuenta hasta su venta.`,
    };
  }, [range, safeData.cogs, safeData.operating_expenses, cur, startDateStr, endDateStr]);

  // Serie completa sin truncar: un recorte fijo (ej. slice(-10)) cortaba a
  // mitad de camino rangos con más de 10 puntos, como los 12 meses de "Año"
  // o los días de "Mes". El scroll horizontal de la card se encarga de que
  // quepan sin apelmazar etiquetas.
  const series = safeData.sales_series;
  const lineData = series
    .filter((s: any) => s && typeof s.value === "number")
    .map((s: any) => ({
      value: s.value || 0,
      label: formatChartAxisLabel(String(s.label || s.date || ""), range),
      dataPointText: s.value > 0 ? String(Math.round(s.value)) : undefined,
    }));

  const maxValSales = useMemo(() => {
    if (!lineData.length) return 0;
    return Math.max(...lineData.map((d: any) => d.value));
  }, [lineData]);

  const isEmpty = !loading && safeData.sales_count === 0 && safeData.total_expenses === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm, backgroundColor: colors.surface }]}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, flex: 1 }}>
            <View style={[styles.avatar, { backgroundColor: colors.brandTertiary }]}>
              <Image source={PAN_ASSETS.avatar} style={{ width: 48, height: 48 }} contentFit="cover" testID="header-avatar" />
            </View>
            <View>
              <Text style={[styles.brand, { color: colors.onSurface }]}>¡Saludos de PanConMiel!</Text>
            </View>
          </View>
          <Pressable onPress={() => router.push("/settings")} testID="open-settings" style={[styles.iconBtn, { backgroundColor: colors.surfaceTertiary }]}>
            <Feather name="settings" size={20} color={colors.onSurface} />
          </Pressable>
        </View>
        <PeriodTabs value={range} onChange={onRange} />
      </View>

      <DateRangeModal
        visible={customRangeModal}
        colors={colors}
        initialStart={startDateStr}
        initialEnd={endDateStr}
        onRequestClose={() => setCustomRangeModal(false)}
        onClear={() => setCustomRangeModal(false)}
        onApply={(start, end) => {
          setStartDateStr(start);
          setEndDateStr(end);
          setCustomRangeModal(false);
          setRange("custom");
          setLoading(true);
          load("custom", start, end);
        }}
      />

      <ScrollView
        contentContainerStyle={
          isEmpty
            ? { flexGrow: 1, padding: SPACING.lg, alignItems: "center", justifyContent: "center" }
            : { padding: SPACING.lg, paddingBottom: SPACING["3xl"], gap: SPACING.lg }
        }
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(range); }} tintColor={colors.brand} />}
      >
        {loading && !data ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: SPACING["2xl"] }} />
        ) : isEmpty ? (
          <View style={styles.emptyState}>
            <Image
              source={PAN_ASSETS.welcomeHome}
              style={styles.emptyImage}
              contentFit="contain"
              testID="empty-mascot"
            />
            <Text style={styles.emptyTitle}>¡BIENVENIDO!</Text>
            <Text style={styles.emptySub}>
              Registra tu primera venta para ver tus números brillar.
            </Text>
            <Pressable onPress={() => router.push("/(tabs)/sales")} style={styles.cta} testID="empty-new-sale">
              <Text style={styles.ctaText}>+ Nueva Venta</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Balance disponible */}
            <LinearGradient
              colors={DARK_HERO_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.balanceCard}
            >
              <Text style={styles.balanceLabel}>Balance disponible</Text>
              <Text style={styles.balanceValue} testID="balance-total">{formatMoney(safeData.balance_total, cur, 2)}</Text>
              <View style={styles.balanceRow}>
                <View style={styles.balanceSubCard}>
                  <Feather name="dollar-sign" size={14} color="#FFF" />
                  <Text style={styles.balanceItemValue}>Efectivo: {formatMoney(safeData.balance_cash, cur)}</Text>
                </View>
                <View style={styles.balanceSubCard}>
                  <Feather name="credit-card" size={14} color="#FFF" />
                  <Text style={styles.balanceItemValue}>Transferencia: {formatMoney(safeData.balance_transfer, cur)}</Text>
                </View>
              </View>
            </LinearGradient>

            {/* Ingresos vs Egresos (lado a lado) */}
            <View style={styles.dualRow}>
              <Card style={styles.metricCard} testID="income-card">
                <View style={[styles.microIcon, { backgroundColor: "#DCFCE7" }]}>
                  <Feather name="arrow-down-left" size={18} color="#10B981" />
                </View>
                <Text style={styles.metricLabel}>Ingresos</Text>
                <Text style={[styles.metricValue, { color: "#10B981" }]}>
                  {formatMoney(safeData.total_income, cur)}
                </Text>
              </Card>
              <Card style={styles.metricCard} testID="expense-card">
                <View style={[styles.microIcon, { backgroundColor: "#FEE2E2" }]}>
                  <Feather name="arrow-up-right" size={18} color="#EF4444" />
                </View>
                <Text style={styles.metricLabel}>Egresos</Text>
                <Text style={[styles.metricValue, { color: "#EF4444" }]}>
                  {formatMoney(safeData.total_expenses, cur)}
                </Text>
              </Card>
            </View>

            {/* Ganancia Neta */}
            <Card testID="profit-card">
              <View style={styles.profitRow}>
                <View style={[styles.miniIcon, { backgroundColor: colors.brandSecondary + "22" }]}>
                  <Feather name="trending-up" size={18} color={colors.brandSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.miniLabel, { color: colors.onSurfaceTertiary }]}>Ganancia Neta del período</Text>
                  <Text style={[styles.profitValue, { color: safeData.net_profit >= 0 ? (colors.success || "#10B981") : (colors.error || "#EF4444") }]}>
                    {formatMoney(safeData.net_profit, cur, 2)}
                  </Text>
                </View>
              </View>
            </Card>

            {/* Nota explicativa de la operación y cálculo */}
            <View style={[styles.criteriaBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="info" size={14} color={colors.brand} />
                <Text style={[styles.criteriaTitle, { color: colors.onSurface }]}>
                  {periodDetails.title}
                </Text>
              </View>
              <Text style={[styles.criteriaDesc, { color: colors.onSurfaceTertiary }]}>
                {periodDetails.desc}
              </Text>
            </View>

            {/* Gráfico de evolución de ventas */}
            <Card style={styles.chartCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.chartTitle}>Evolución de ventas</Text>
                {maxValSales > 0 ? (
                  <View style={styles.chartLegend}>
                    <View style={[styles.legendDot, { backgroundColor: colors.brand }]} />
                    <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: "#94A3B8" }}>
                      Pico: {formatMoney(maxValSales, cur)}
                    </Text>
                  </View>
                ) : null}
              </View>

              {lineData.length > 1 ? (
                <View style={{ marginTop: SPACING.md, alignItems: "center" }}>
                  {lineData.length > 12 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <LineChart
                        data={lineData}
                        areaChart
                        curved
                        color={colors.brand}
                        startFillColor={colors.brand}
                        endFillColor={colors.brand}
                        startOpacity={0.35}
                        endOpacity={0.02}
                        thickness={3}
                        hideRules
                        xAxisThickness={1}
                        xAxisColor="#E2E8F0"
                        yAxisThickness={0}
                        yAxisTextStyle={{ color: "#94A3B8", fontFamily: FONTS.regular, fontSize: 11 }}
                        xAxisLabelTextStyle={{
                          color: "#94A3B8",
                          fontFamily: FONTS.medium,
                          fontSize: 11,
                          width: 28,
                          textAlign: "center",
                        }}
                        dataPointsColor={colors.brand}
                        textColor="#1E293B"
                        textFontSize={9}
                        noOfSections={3}
                        height={140}
                        width={lineData.length * 28}
                        initialSpacing={14}
                      />
                    </ScrollView>
                  ) : (
                    <LineChart
                      data={lineData}
                      areaChart
                      curved
                      color={colors.brand}
                      startFillColor={colors.brand}
                      endFillColor={colors.brand}
                      startOpacity={0.35}
                      endOpacity={0.02}
                      thickness={3}
                      hideRules
                      xAxisThickness={1}
                      xAxisColor="#E2E8F0"
                      yAxisThickness={0}
                      yAxisTextStyle={{ color: "#94A3B8", fontFamily: FONTS.regular, fontSize: 11 }}
                      xAxisLabelTextStyle={{
                        color: "#94A3B8",
                        fontFamily: FONTS.medium,
                        fontSize: 11,
                        width: 42,
                        textAlign: "center",
                      }}
                      dataPointsColor={colors.brand}
                      textColor="#1E293B"
                      textFontSize={9}
                      noOfSections={3}
                      height={140}
                      adjustToWidth
                      initialSpacing={14}
                    />
                  )}
                </View>
              ) : (
                <Text style={[styles.emptyChart, { color: colors.onSurfaceTertiary }]}>Sin ventas en este período</Text>
              )}
            </Card>

            {/* Accesos rápidos */}
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Acceso rápido</Text>
            <View style={styles.quickRow}>
              <QuickAction icon="shopping-cart" label="Vender" color={colors.brand} onPress={() => router.push("/(tabs)/sales")} testID="quick-sell" />
              <QuickAction icon="trending-down" label="Gasto" color={colors.error || "#EF4444"} onPress={() => router.push("/(tabs)/expenses")} testID="quick-expense" />
              <QuickAction icon="plus-square" label="Producto" color={colors.brandSecondary} onPress={() => router.push("/product-form")} testID="quick-product" />
              <QuickAction icon="mic" label="Voz" color={colors.warning || "#F59E0B"} onPress={() => router.push("/voice")} testID="quick-voice" />
            </View>

            {safeData.low_stock_count > 0 ? (
              <Pressable onPress={() => router.push("/(tabs)/inventory")}>
                <Card style={{ borderColor: colors.warning || "#F59E0B", borderWidth: 1 }}>
                  <View style={styles.alertRow}>
                    <Feather name="alert-triangle" size={20} color={colors.warning || "#F59E0B"} />
                    <Text style={[styles.alertText, { color: colors.onSurface }]}>
                      {safeData.low_stock_count} producto(s) con stock bajo
                    </Text>
                    <Feather name="chevron-right" size={18} color={colors.onSurfaceTertiary} />
                  </View>
                </Card>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PeriodTabs({ value, onChange }: { value: string; onChange: (r: string) => void }) {
  return (
    <View style={styles.periodTabs} testID="range-chips">
      {RANGES.map((r) => {
        const active = value === r.key;
        return (
          <Pressable
            key={r.key}
            onPress={() => onChange(r.key)}
            style={[styles.periodTab, active && styles.periodTabActive]}
            testID={`chip-${r.key}`}
          >
            <Text style={[styles.periodTabText, active && styles.periodTabTextActive]}>{r.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function QuickAction({ icon, label, color, onPress, testID }: any) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.quickItem} testID={testID}>
      <View style={[styles.quickIcon, { backgroundColor: color + "1F" }]}>
        <Feather name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.quickLabel, { color: colors.onSurfaceTertiary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 0, paddingBottom: SPACING.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "transparent" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  hello: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base },
  brand: { fontFamily: FONTS.black, fontSize: FONT_SIZE.xl },
  iconBtn: { width: 42, height: 42, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  avatar: { width: 48, height: 48, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  periodTabs: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    padding: 4,
    borderRadius: 14,
    marginHorizontal: SPACING.lg,
  },
  periodTab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, borderRadius: 10 },
  periodTabActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  periodTabText: { fontFamily: FONTS.medium, fontSize: 12, color: "#64748B", fontWeight: "500" },
  periodTabTextActive: { fontFamily: FONTS.bold, color: "#0F172A", fontWeight: "700" },
  balanceCard: { borderRadius: 24, padding: 20, gap: 4, shadowColor: "#0E172A", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 4 },
  balanceLabel: { color: "rgba(255,255,255,0.7)", fontFamily: FONTS.medium, fontSize: 14 },
  balanceValue: { color: "#FFFFFF", fontFamily: FONTS.black, fontSize: 34, fontWeight: "800" },
  balanceRow: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  balanceSubCard: {
    flex: 1,
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 12,
  },
  balanceItemValue: { color: "#FFF", fontFamily: FONTS.bold, fontSize: 13 },
  dualRow: { flexDirection: "row", gap: SPACING.md },
  miniCard: { flex: 1, gap: 6 },
  miniIcon: { width: 36, height: 36, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  miniLabel: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm },
  miniValue: { fontFamily: FONTS.black, fontSize: FONT_SIZE.xl },
  metricCard: { flex: 1, gap: 6, borderRadius: 20, elevation: 2, shadowOpacity: 0.08 },
  microIcon: { width: 36, height: 36, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  metricLabel: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, color: "#64748B" },
  metricValue: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.xl, fontWeight: "700" },
  profitRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  profitValue: { fontFamily: FONTS.black, fontSize: FONT_SIZE["2xl"] },
  criteriaBox: {
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: 4,
    marginTop: -SPACING.xs,
  },
  criteriaTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.xs },
  criteriaDesc: { fontFamily: FONTS.regular, fontSize: 11, lineHeight: 15 },
  chartCard: { borderRadius: 20, elevation: 2, shadowOpacity: 0.08 },
  chartTitle: { fontFamily: FONTS.bold, fontSize: 16, fontWeight: "700", color: "#0F172A" },
  chartLegend: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  emptyChart: { fontFamily: FONTS.regular, fontSize: FONT_SIZE.base, textAlign: "center", paddingVertical: SPACING.xl },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg, marginTop: SPACING.xs },
  quickRow: { flexDirection: "row", justifyContent: "space-between" },
  quickItem: { alignItems: "center", gap: 6, flex: 1 },
  quickIcon: { width: 56, height: 56, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm },
  alertRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  alertText: { flex: 1, fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  emptyState: { alignItems: "center", justifyContent: "center" },
  emptyImage: { width: 230, height: 230 },
  emptyTitle: { fontFamily: FONTS.black, fontSize: 22, fontWeight: "800", textAlign: "center", marginTop: SPACING.sm, color: "#1E293B" },
  emptySub: {
    fontFamily: FONTS.medium,
    fontSize: FONT_SIZE.base,
    textAlign: "center",
    marginTop: 4,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    color: "#64748B",
  },
  cta: {
    height: 52,
    borderRadius: 24,
    alignSelf: "center",
    paddingHorizontal: SPACING["2xl"],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4361EE",
  },
  ctaText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg, color: "#FFFFFF" },
});
