import { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Modal,
  Alert,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { LineChart, PieChart } from "react-native-gifted-charts";
import { Card, Field } from "@/src/components/ui";
import { TopBar } from "@/src/components/TopBar";
import { EmptyState } from "@/src/components/Mascot";
import { DateRangeModal } from "@/src/components/DateRangeModal";
import { PAN_ASSETS } from "@/src/constants/mascot";
import { useData } from "@/src/context/DataContext";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE, DARK_HERO_GRADIENT } from "@/src/theme/theme";
import { formatMoney, formatLocalTime, formatLocalWeekday, toLocalDate } from "@/src/utils/format";

const RANGES = [
  { key: "today", label: "Hoy" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
  { key: "year", label: "Año" },
  { key: "custom", label: "Rango", icon: "calendar" },
];

const PIE_COLORS = ["#E89A3E", "#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#14B8A6"];
const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

function formatTime(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = toLocalDate(dateStr);
  if (isNaN(d.getTime())) return "—";
  return formatLocalTime(d);
}

function formatChartAxisLabel(rawLabel: string, range: string): string {
  if (!rawLabel) return "";

  if (range === "all_years") {
    const match = rawLabel.match(/\b(20\d{2})\b/);
    return match ? match[1] : rawLabel.slice(0, 4);
  }

  if (range === "year") {
    const monthNum = parseInt(rawLabel.slice(-2), 10);
    if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
      return MONTH_NAMES[monthNum - 1];
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

export default function Reports() {
  const { colors } = useTheme();
  const {
    getDashboard,
    currentShift,
    shiftsHistory,
    loadShifts,
    updateInitialCash,
    closeCashShift,
    openCashShift,
    sales,
    expenses,
    products,
    purchases,
    wasteRecords,
  } = useData() as any;
  const { user } = useAuth();
  const cur = user?.currency || "PEN";

  const [range, setRange] = useState("today");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Rango de fechas efectivo de la pestaña "Rango" (derivado del año/modo
  // elegido en sus chips internos, no de un calendario de inicio-fin).
  const [startDateStr, setStartDateStr] = useState(() => new Date().toISOString().split("T")[0]);
  const [endDateStr, setEndDateStr] = useState(() => new Date().toISOString().split("T")[0]);

  // Estados de Caja / Arqueo
  const [openNewShiftModal, setOpenNewShiftModal] = useState(false);
  const [editInitialModal, setEditInitialModal] = useState(false);
  const [newInitialCash, setNewInitialCash] = useState("");
  const [savingInitial, setSavingInitial] = useState(false);
  const [closeShiftModal, setCloseShiftModal] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [shiftNote, setShiftNote] = useState("");
  const [showShiftsHistory, setShowShiftsHistory] = useState(false);

  // Filtro por rango de fechas del historial de arqueos/turnos
  const [shiftsRangeModal, setShiftsRangeModal] = useState(false);
  const [shiftsStartDate, setShiftsStartDate] = useState("");
  const [shiftsEndDate, setShiftsEndDate] = useState("");

  // Selector de año y navegación diaria dentro del rango "Año"
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [yearViewMode, setYearViewMode] = useState<"monthly" | "daily">("monthly");
  const [dailyMonth, setDailyMonth] = useState(() => new Date().getMonth());

  const yearPickerOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const list: number[] = [];
    for (let y = current; y >= current - 10; y--) list.push(y);
    return list;
  }, []);

  const load = useCallback(
    async (r: string, customStart?: string, customEnd?: string) => {
      try {
        if (getDashboard) {
          setData(await getDashboard(r, customStart, customEnd));
        }
        if (loadShifts) {
          await loadShifts();
        }
      } catch {
        setData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getDashboard, loadShifts]
  );

  // Calcula los argumentos de carga para la pestaña "Rango" según el año y
  // el modo (Mensual/Diario) elegidos en sus chips/selector internos —
  // Mensual pide los 12 meses de ese año, Diario pide los días de un mes
  // puntual dentro de él.
  const customRangeLoadArgs = useCallback((): [string, string?, string?] => {
    if (yearViewMode === "monthly") {
      return ["year", `${selectedYear}-01-01`];
    }
    const mm = String(dailyMonth + 1).padStart(2, "0");
    const start = `${selectedYear}-${mm}-01`;
    const end = new Date(selectedYear, dailyMonth + 1, 0).toISOString().split("T")[0];
    return ["custom", start, end];
  }, [yearViewMode, selectedYear, dailyMonth]);

  // Mantiene startDateStr/endDateStr sincronizados con el año/modo elegido
  // en "Rango" (en vez de un calendario de fecha inicio-fin): así el resto
  // de la pantalla (exportaciones, filtros informativos) sigue leyendo un
  // rango de fechas concreto sin duplicar esta lógica en cada lugar.
  useEffect(() => {
    if (range !== "custom") return;
    if (yearViewMode === "monthly") {
      setStartDateStr(`${selectedYear}-01-01`);
      setEndDateStr(`${selectedYear}-12-31`);
    } else {
      const mm = String(dailyMonth + 1).padStart(2, "0");
      setStartDateStr(`${selectedYear}-${mm}-01`);
      setEndDateStr(new Date(selectedYear, dailyMonth + 1, 0).toISOString().split("T")[0]);
    }
  }, [range, yearViewMode, selectedYear, dailyMonth]);

  useFocusEffect(
    useCallback(() => {
      if (range === "custom") {
        load(...customRangeLoadArgs());
      } else {
        load(range);
      }
    }, [load, range, customRangeLoadArgs])
  );

  // Recarga cuando cambia el año, el modo o el mes seleccionado mientras
  // la pestaña "Rango" está activa.
  useEffect(() => {
    if (range !== "custom") return;
    setLoading(true);
    load(...customRangeLoadArgs());
  }, [range, customRangeLoadArgs, load]);

  const onRange = (r: string) => {
    setRange(r);
    if (r === "custom") {
      // El efecto dedicado dispara la carga con el año/modo seleccionado.
      return;
    }
    setLoading(true);
    load(r);
  };

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  const filteredSales = useMemo(() => {
    const list = sales || [];
    if (range === "today") return list.filter((s: any) => s.created_at?.startsWith(todayStr));
    if (range === "custom") {
      return list.filter((s: any) => {
        const d = s.created_at?.split("T")[0] || "";
        return d >= startDateStr && d <= endDateStr;
      });
    }
    return list;
  }, [sales, range, todayStr, startDateStr, endDateStr]);

  const filteredExpenses = useMemo(() => {
    const list = expenses || [];
    if (range === "today") return list.filter((e: any) => e.created_at?.startsWith(todayStr));
    if (range === "custom") {
      return list.filter((e: any) => {
        const d = e.created_at?.split("T")[0] || "";
        return d >= startDateStr && d <= endDateStr;
      });
    }
    return list;
  }, [expenses, range, todayStr, startDateStr, endDateStr]);

  // Mermas por vencimiento en el período seleccionado (incluye el
  // submodo Mensual/Diario dentro de "Rango"). Es solo informativo: nunca
  // se resta de ningún total financiero, ya se explica en la tarjeta.
  const filteredWasteRecords = useMemo(() => {
    const list = wasteRecords || [];
    return list.filter((w: any) => {
      const d = (w.timestamp || "").split("T")[0];
      if (!d) return false;
      if (range === "today") return d === todayStr;
      if (range === "week") {
        const cmp = new Date();
        cmp.setDate(cmp.getDate() - 6);
        const weekStart = cmp.toISOString().split("T")[0];
        return d >= weekStart && d <= todayStr;
      }
      if (range === "month") return d.startsWith(todayStr.slice(0, 7));
      // "Año" ahora es fijo al año en curso, sin selector propio.
      if (range === "year") return d.startsWith(todayStr.slice(0, 4));
      // "Rango" deriva startDateStr/endDateStr del año/modo elegido en sus
      // propios chips (ver el efecto de sincronización más abajo).
      if (range === "custom") return d >= startDateStr && d <= endDateStr;
      return true;
    });
  }, [wasteRecords, range, todayStr, startDateStr, endDateStr]);

  const totalWasteLoss = useMemo(
    () => filteredWasteRecords.reduce((acc: number, w: any) => acc + (Number(w.total_loss_cost) || 0), 0),
    [filteredWasteRecords]
  );

  const shiftOpenedAt = currentShift?.opened_at;

  const currentShiftCashSales = useMemo(() => {
    let sum = 0;
    (sales || []).forEach((s: any) => {
      const matchShift = shiftOpenedAt ? s.created_at >= shiftOpenedAt : s.created_at?.startsWith(todayStr);
      if (matchShift) {
        (s.payments || []).forEach((p: any) => {
          if (p.method === "cash") sum += Number(p.amount) || 0;
        });
      }
    });
    return sum;
  }, [sales, shiftOpenedAt, todayStr]);

  const currentShiftCashExpenses = useMemo(() => {
    let sum = 0;
    (expenses || []).forEach((e: any) => {
      const matchShift = shiftOpenedAt ? e.created_at >= shiftOpenedAt : e.created_at?.startsWith(todayStr);
      const isStockPurchase = e.type === "Mercancía" || e.category === "Compra de Stock";
      if (matchShift && e.method === "cash" && !isStockPurchase) {
        sum += Number(e.amount) || 0;
      }
    });
    return sum;
  }, [expenses, shiftOpenedAt, todayStr]);

  const initialCash = Number(currentShift?.initial_cash) || 0;
  const expectedCash = initialCash + currentShiftCashSales - currentShiftCashExpenses;

  const filteredShiftsHistory = useMemo(() => {
    const list = shiftsHistory || [];
    if (!shiftsStartDate && !shiftsEndDate) return list;
    return list.filter((sh: any) => {
      if (shiftsStartDate && sh.date < shiftsStartDate) return false;
      if (shiftsEndDate && sh.date > shiftsEndDate) return false;
      return true;
    });
  }, [shiftsHistory, shiftsStartDate, shiftsEndDate]);

  const financialMetrics = useMemo(() => {
    const totalIncome = data?.total_income ?? filteredSales.reduce((acc: number, s: any) => acc + (Number(s.total) || 0), 0);
    const cogs = data?.cogs ?? filteredSales.reduce((acc: number, s: any) => acc + (Number(s.cost_total) || 0), 0);
    const operatingExpenses = data?.operating_expenses ?? filteredExpenses
      .filter((e: any) => e.type !== "Mercancía" && e.category !== "Compra de Stock")
      .reduce((acc: number, e: any) => acc + (Number(e.amount) || 0), 0);

    const totalExpenses = data?.total_expenses ?? (cogs + operatingExpenses);
    const netProfit = data?.net_profit ?? (totalIncome - totalExpenses);

    return {
      totalIncome,
      totalExpenses,
      cogs,
      operatingExpenses,
      netProfit,
    };
  }, [data, filteredSales, filteredExpenses]);

  const operationCriteria = useMemo(() => {
    const titleMap: Record<string, string> = {
      today: "Operación: Venta Diaria (Hoy)",
      week: "Operación: Venta Semanal (Últimos 7 días)",
      month: "Operación: Venta Mensual (Mes en curso)",
      year: "Operación: Venta Anual",
      all_years: "Operación: Histórico Multianual",
      custom: `Operación: Rango (${startDateStr} al ${endDateStr})`,
    };

    const cogsVal = formatMoney(financialMetrics.cogs, cur);
    const opExVal = formatMoney(financialMetrics.operatingExpenses, cur);

    return {
      title: titleMap[range] || "Período Seleccionado",
      desc: `Egresos = ${cogsVal} (costo de lo vendido) + ${opExVal} (gastos operativos). La mercadería en almacén no se descuenta como pérdida hasta que se vende.`,
    };
  }, [range, startDateStr, endDateStr, financialMetrics, cur]);

  const handleSaveInitialCash = async () => {
    const val = parseFloat(newInitialCash);
    if (isNaN(val) || val < 0) {
      Alert.alert("Monto inválido", "Por favor ingresa un monto válido para el fondo inicial.");
      return;
    }

    setSavingInitial(true);
    try {
      if (updateInitialCash) {
        await updateInitialCash(val);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setEditInitialModal(false);
      setNewInitialCash("");
      if (loadShifts) await loadShifts();
    } catch (e: any) {
      Alert.alert("Error", "No se pudo actualizar el fondo inicial: " + (e?.message || ""));
    } finally {
      setSavingInitial(false);
    }
  };

  const handleCloseShift = async () => {
    const actual = parseFloat(countedCash);
    if (isNaN(actual) || actual < 0) {
      Alert.alert("Monto inválido", "Ingresa el dinero físico total contado en caja.");
      return;
    }
    if (closeCashShift) {
      await closeCashShift(actual, shiftNote);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCloseShiftModal(false);
    setCountedCash("");
    setShiftNote("");
    if (loadShifts) await loadShifts();
    Alert.alert("Caja Cerrada", "El arqueo de caja se ha registrado exitosamente.");
  };

  // ================= EXPORTACIÓN A PDF =================
  const exportToPDF = async () => {
    try {
      setExporting(true);
      const rangeLabel =
        range === "today"
          ? "Hoy"
          : range === "week"
          ? "Semana"
          : range === "month"
          ? "Mes"
          : range === "year"
          ? "Año"
          : range === "all_years"
          ? "Histórico Años"
          : `${startDateStr} al ${endDateStr}`;
      const now = new Date().toLocaleString("es-PE");

      const totalInc = financialMetrics.totalIncome;
      const totalExp = financialMetrics.totalExpenses;
      const netGain = financialMetrics.netProfit;

      const totalPurchasesCost = (purchases || []).reduce((acc: number, p: any) => acc + (Number(p.total_cost) || 0), 0);
      const inventoryCurrentCost = (products || []).reduce((acc: number, p: any) => acc + ((Number(p.stock) || 0) * (Number(p.cost) || 0)), 0);
      const inventorySalesValue = (products || []).reduce((acc: number, p: any) => acc + ((Number(p.stock) || 0) * (Number(p.price) || 0)), 0);

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 24px; color: #1e293b; }
            .header { text-align: center; border-bottom: 2px solid #E89A3E; padding-bottom: 12px; margin-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; color: #1e293b; margin: 0; }
            .subtitle { font-size: 14px; color: #64748b; margin-top: 4px; }
            .metrics-grid { display: flex; justify-content: space-between; margin-bottom: 20px; gap: 10px; }
            .metric-box { flex: 1; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
            .metric-label { font-size: 11px; color: #64748b; text-transform: uppercase; }
            .metric-val { font-size: 18px; font-weight: bold; margin-top: 4px; color: #0f172a; }
            .note-box { background-color: #f1f5f9; border-left: 4px solid #E89A3E; padding: 10px 14px; margin-bottom: 20px; font-size: 12px; color: #475569; }
            .section-title { font-size: 16px; font-weight: bold; margin-top: 20px; margin-bottom: 8px; color: #334155; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 20px; }
            th, td { padding: 8px 10px; text-align: left; font-size: 12px; border-bottom: 1px solid #e2e8f0; }
            th { background-color: #f1f5f9; font-weight: bold; color: #475569; }
            .amount { text-align: right; font-weight: bold; }
            .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">PanCon Miel — Estado de Resultados</h1>
            <div class="subtitle">Período: ${rangeLabel} | Generado el: ${now}</div>
          </div>

          <div class="metrics-grid">
            <div class="metric-box">
              <div class="metric-label">Ingresos por Ventas</div>
              <div class="metric-val" style="color: #10B981;">${formatMoney(totalInc, cur)}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Egresos Totales</div>
              <div class="metric-val" style="color: #EF4444;">${formatMoney(totalExp, cur)}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Ganancia Neta Real</div>
              <div class="metric-val" style="color: #E89A3E;">${formatMoney(netGain, cur)}</div>
            </div>
          </div>

          <div class="note-box">
            <strong>Criterio Contable:</strong> Egresos calculados como Costo de Mercadería Vendida COGS (${formatMoney(financialMetrics.cogs, cur)}) + Gastos Operativos (${formatMoney(financialMetrics.operatingExpenses, cur)}). El stock no vendido permanece en almacén como activo.
          </div>

          <div class="metrics-grid">
            <div class="metric-box">
              <div class="metric-label">Capital Compras Total</div>
              <div class="metric-val">${formatMoney(totalPurchasesCost, cur)}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Costo Inventario Actual</div>
              <div class="metric-val">${formatMoney(inventoryCurrentCost, cur)}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Valor Venta Estimado</div>
              <div class="metric-val" style="color: #3B82F6;">${formatMoney(inventorySalesValue, cur)}</div>
            </div>
          </div>

          <div class="section-title">Auditoría de Productos Registrados (${(products || []).length})</div>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th class="amount">Stock</th>
                <th class="amount">Costo Compra</th>
                <th class="amount">Precio Venta</th>
                <th class="amount">Valor Total Venta</th>
              </tr>
            </thead>
            <tbody>
              ${(products || []).map((p: any) => `
                <tr>
                  <td>${p.name}</td>
                  <td>${p.category || "General"}</td>
                  <td class="amount">${p.stock}</td>
                  <td class="amount">${formatMoney(p.cost || 0, cur)}</td>
                  <td class="amount">${formatMoney(p.price || 0, cur)}</td>
                  <td class="amount">${formatMoney((p.stock || 0) * (p.price || 0), cur)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <div class="section-title">Ventas Registradas (${filteredSales.length})</div>
          <table>
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Artículos</th>
                <th>Método</th>
                <th class="amount">Total</th>
              </tr>
            </thead>
            <tbody>
              ${filteredSales.slice(0, 40).map((s: any) => `
                <tr>
                  <td>${new Date(s.created_at).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>${(s.items || []).map((i: any) => `${i.qty}x ${i.name}`).join(", ")}</td>
                  <td>${(s.payments || []).map((p: any) => (p.method === "cash" ? "Efectivo" : p.detail || "Transf.")).join(" + ")}</td>
                  <td class="amount">${formatMoney(s.total, cur)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <div class="footer">Documento generado automáticamente por la aplicación PanCon Miel.</div>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { UTI: ".pdf", mimeType: "application/pdf" });
    } catch (e: any) {
      Alert.alert("Error", "No se pudo generar el reporte PDF: " + (e?.message || ""));
    } finally {
      setExporting(false);
    }
  };

  // ================= EXPORTACIÓN A EXCEL (.xls) COMPATIBLE =================
  const exportToExcelNative = async () => {
    try {
      setExporting(true);
      setShowExportModal(false);

      const rangeLabel =
        range === "today"
          ? "Hoy"
          : range === "week"
          ? "Semana"
          : range === "month"
          ? "Mes"
          : range === "year"
          ? "Año"
          : range === "all_years"
          ? "Histórico Años"
          : `${startDateStr} al ${endDateStr}`;

      const totalInc = financialMetrics.totalIncome;
      const totalExp = financialMetrics.totalExpenses;
      const cogs = financialMetrics.cogs;
      const opEx = financialMetrics.operatingExpenses;
      const netGain = financialMetrics.netProfit;

      let tsv = "\uFEFF";
      tsv += "REPORTE GENERAL - PANCON MIEL\n";
      tsv += `Período:\t${rangeLabel}\n`;
      tsv += `Fecha de generación:\t${new Date().toLocaleString("es-PE")}\n\n`;

      tsv += "ESTADO DE RESULTADOS (RESUMEN FINANCIERO)\n";
      tsv += "Concepto\tMonto (" + cur + ")\n";
      tsv += `Ingresos por Ventas\t${totalInc}\n`;
      tsv += `Costo de Mercadería (COGS)\t${cogs}\n`;
      tsv += `Gastos Operativos\t${opEx}\n`;
      tsv += `Egresos Totales\t${totalExp}\n`;
      tsv += `Ganancia Neta Real\t${netGain}\n\n`;

      tsv += "AUDITORÍA DE INVENTARIO Y STOCK\n";
      tsv += "Producto\tCategoría\tStock Actual\tCosto Compra\tPrecio Venta\tCapital Invertido\tValor Venta Estimado\n";
      (products || []).forEach((p: any) => {
        const stk = Number(p.stock) || 0;
        const cst = Number(p.cost) || 0;
        const prc = Number(p.price) || 0;
        tsv += `${p.name || ""}\t${p.category || "General"}\t${stk}\t${cst}\t${prc}\t${stk * cst}\t${stk * prc}\n`;
      });

      tsv += "\nHISTORIAL DE VENTAS\n";
      tsv += "ID\tFecha y Hora\tArtículos Vendidos\tMétodo de Pago\tTotal (" + cur + ")\n";
      filteredSales.forEach((s: any) => {
        const itemsStr = (s.items || []).map((i: any) => `${i.qty}x ${i.name}`).join(" | ");
        const payStr = (s.payments || []).map((p: any) => (p.method === "cash" ? "Efectivo" : "Transferencia")).join(" + ");
        tsv += `${s.id}\t${s.created_at}\t${itemsStr}\t${payStr}\t${s.total}\n`;
      });

      const fileUri = `${FileSystem.documentDirectory}Reporte_PanConMiel_${todayStr}.xls`;
      await FileSystem.writeAsStringAsync(fileUri, tsv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri, {
        UTI: "com.microsoft.excel.xls",
        mimeType: "application/vnd.ms-excel",
      });
    } catch (e: any) {
      Alert.alert("Error", "No se pudo exportar a Excel: " + (e?.message || ""));
    } finally {
      setExporting(false);
    }
  };

  // ================= EXPORTACIÓN A CSV (.csv) =================
  const exportToCSV = async () => {
    try {
      setExporting(true);
      setShowExportModal(false);
      let csvContent = "\uFEFFESTADO DE RESULTADOS Y AUDITORIA - PANCON MIEL\n\n";

      const rangeLabel =
        range === "today"
          ? "Hoy"
          : range === "week"
          ? "Semana"
          : range === "month"
          ? "Mes"
          : range === "year"
          ? "Año"
          : range === "all_years"
          ? "Histórico Años"
          : `${startDateStr} al ${endDateStr}`;

      const totalInc = financialMetrics.totalIncome;
      const totalExp = financialMetrics.totalExpenses;
      const cogs = financialMetrics.cogs;
      const opEx = financialMetrics.operatingExpenses;
      const netGain = financialMetrics.netProfit;

      csvContent += `Periodo:,${rangeLabel}\n`;
      csvContent += `Fecha de exportación:,${new Date().toLocaleString("es-PE")}\n\n`;

      csvContent += "RESUMEN FINANCIERO (ESTADO DE RESULTADOS)\n";
      csvContent += `Ingresos por Ventas,${totalInc}\n`;
      csvContent += `Costo de Mercadería Vendida (COGS),${cogs}\n`;
      csvContent += `Gastos Operativos,${opEx}\n`;
      csvContent += `Egresos Totales del Período (COGS + OpEx),${totalExp}\n`;
      csvContent += `Ganancia Neta Real,${netGain}\n\n`;

      csvContent += "INVENTARIO Y COMPARATIVA DE PRECIOS\n";
      csvContent += "Producto,Categoría,Stock Actual,Costo Compra Unitario,Precio Venta Unitario,Capital Invertido en Stock,Valor Total Venta,Ganancia Estimada\n";
      (products || []).forEach((p: any) => {
        const stk = Number(p.stock) || 0;
        const cst = Number(p.cost) || 0;
        const prc = Number(p.price) || 0;
        const totCost = stk * cst;
        const totSale = stk * prc;
        const diff = totSale - totCost;
        csvContent += `"${p.name}",${p.category || "General"},${stk},${cst},${prc},${totCost},${totSale},${diff}\n`;
      });

      csvContent += "\nHISTORIAL DE INGRESOS Y COMPRAS\n";
      csvContent += "ID,Fecha,Producto,Cantidad,Costo Unitario,Total Invertido,Nota\n";
      (purchases || []).forEach((pu: any) => {
        csvContent += `${pu.id},${pu.created_at},"${pu.product_name}",${pu.qty},${pu.unit_cost},${pu.total_cost},"${pu.note || ""}"\n`;
      });

      csvContent += "\nVENTAS DETALLADAS\n";
      csvContent += "ID,Fecha,Artículos,Método de Pago,Nota,Total\n";
      filteredSales.forEach((s: any) => {
        const itemsStr = (s.items || []).map((i: any) => `${i.qty}x ${i.name}`).join(" | ").replace(/,/g, " ");
        const payStr = (s.payments || []).map((p: any) => p.method).join(" + ");
        const noteStr = (s.note || "").replace(/,/g, " ");
        csvContent += `${s.id},${s.created_at},"${itemsStr}",${payStr},"${noteStr}",${s.total}\n`;
      });

      const fileUri = `${FileSystem.documentDirectory}Reporte_PanConMiel_${todayStr}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri, { UTI: "text/csv", mimeType: "text/csv" });
    } catch (e: any) {
      Alert.alert("Error", "No se pudo exportar el archivo CSV: " + (e?.message || ""));
    } finally {
      setExporting(false);
    }
  };

  // Garantía cliente de zero-filling: si el dashboard vino del backend
  // remoto (no de la rama local, que ya rellena con 0), la serie podría
  // llegar vacía o con un solo punto. Nunca se muestra el gráfico así.
  const rawSalesSeries = data?.sales_series ?? [];
  const paddedSalesSeries =
    rawSalesSeries.length === 0
      ? [{ label: "Inicio", value: 0 }, { label: "Hoy", value: 0 }]
      : rawSalesSeries.length === 1
      ? [{ label: "Inicio", value: 0 }, rawSalesSeries[0]]
      : rawSalesSeries;

  // Dentro de "Rango": en modo Diario la serie viene con etiquetas
  // "YYYY-MM-DD" de un solo mes (se formatean como día del mes, igual que
  // "month"); en modo Mensual viene como los 12 "Ene".."Dic" de un año
  // (se formatea igual que "year").
  const axisFormatRange =
    range === "custom" ? (yearViewMode === "daily" ? "month" : "year") : range;
  const lineData = paddedSalesSeries.map((s: any) => ({
    value: s.value || 0,
    label: formatChartAxisLabel(String(s.label || s.date || ""), axisFormatRange),
    dataPointText: s.value > 0 ? String(Math.round(s.value)) : undefined,
  }));

  const maxValSales = useMemo(() => {
    if (!lineData.length) return 0;
    return Math.max(...lineData.map((d: any) => d.value));
  }, [lineData]);

  // Consolidación de gastos: agrupa todos los gastos sin importar método de pago
  const pieData = useMemo(() => {
    const catMap: Record<string, number> = {};
    (filteredExpenses || []).forEach((e: any) => {
      const isStockPurchase = e.type === "Mercancía" || e.category === "Compra de Stock";
      if (!isStockPurchase) {
        const cat = (e.category || e.type || "Otros").trim();
        catMap[cat] = (catMap[cat] || 0) + (Number(e.amount) || 0);
      }
    });

    return Object.entries(catMap).map(([label, val], i) => ({
      value: val,
      color: PIE_COLORS[i % PIE_COLORS.length],
      text: label,
    }));
  }, [filteredExpenses]);

  const topProducts = data?.top_products ?? [];
  const maxTop = Math.max(1, ...topProducts.map((t: any) => t.value));
  const isEmpty =
    !loading && data && data.sales_count === 0 && (filteredExpenses || []).length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <TopBar title="Reportes" mascotSource={PAN_ASSETS.executive} />

      {/* Barra de Exportación con Menú Selector */}
      <View style={[styles.exportBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.exportBarTitle, { color: colors.onSurface }]}>Exportar Datos</Text>
        <View style={{ flexDirection: "row", gap: SPACING.sm }}>
          <Pressable
            onPress={exportToPDF}
            disabled={exporting}
            style={[styles.exportBtn, { backgroundColor: (colors.error || "#EF4444") + "18", borderColor: colors.error || "#EF4444" }]}
          >
            <Feather name="file-text" size={14} color={colors.error || "#EF4444"} />
            <Text style={[styles.exportBtnText, { color: colors.error || "#EF4444" }]}>PDF</Text>
          </Pressable>

          <Pressable
            onPress={() => setShowExportModal(true)}
            disabled={exporting}
            style={[styles.exportBtn, { backgroundColor: (colors.success || "#10B981") + "18", borderColor: colors.success || "#10B981" }]}
          >
            <Feather name="download" size={14} color={colors.success || "#10B981"} />
            <Text style={[styles.exportBtnText, { color: colors.success || "#10B981" }]}>Excel / CSV</Text>
          </Pressable>
        </View>
      </View>

      {/* Selector de Rango */}
      <View style={[styles.rangeChipsContainer, { backgroundColor: colors.surface }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: SPACING.xs }}>
          {RANGES.map((r) => {
            const active = range === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => onRange(r.key)}
                style={[
                  styles.rangeChip,
                  {
                    backgroundColor: active ? colors.brand : colors.surfaceSecondary,
                    borderColor: active ? colors.brand : colors.border,
                  },
                ]}
              >
                {r.icon ? (
                  <Feather name={r.icon as any} size={14} color={active ? "#FFF" : colors.onSurfaceTertiary} />
                ) : null}
                <Text style={[styles.rangeChipText, { color: active ? "#FFF" : colors.onSurface }]}>
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: SPACING.lg,
          paddingTop: SPACING.sm,
          paddingBottom: SPACING["3xl"],
          gap: SPACING.lg,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(range);
            }}
            tintColor={colors.brand}
          />
        }
      >
        {/* MÓDULO DE CAJA DEL DÍA — mismo degradado azul marino que el Hero
            Card de Balance en Inicio, para que ambas pantallas compartan la
            misma identidad visual en vez de un recuadro blanco plano. */}
        <LinearGradient
          colors={DARK_HERO_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.cashCard}
        >
          <View style={styles.cashHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
              <View style={[styles.cashIconBox, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
                <Feather name="inbox" size={20} color="#FFF" />
              </View>
              <View>
                <Text style={[styles.cardTitle, { color: "#FFF" }]}>Caja del Día</Text>
                <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.xs, color: "rgba(255,255,255,0.7)" }}>
                  {currentShift?.status === "open" ? (
                    <Text style={{ color: colors.success || "#10B981" }}>
                      🟢 Abierta a las {formatTime(currentShift?.opened_at)}
                    </Text>
                  ) : currentShift?.status === "closed_manual" ? (
                    <Text style={{ color: colors.error || "#EF4444" }}>
                      🔴 Cerrada a las {formatTime(currentShift?.closed_at)}
                    </Text>
                  ) : (
                    "Turno finalizado"
                  )}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 6 }}>
              {currentShift?.status !== "open" ? (
                <Pressable
                  onPress={() => {
                    setNewInitialCash("0");
                    setOpenNewShiftModal(true);
                  }}
                  style={[styles.editInitialBtn, { backgroundColor: colors.brand }]}
                >
                  <Feather name="plus-circle" size={13} color="#FFF" />
                  <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.xs, color: "#FFF" }}>
                    Abrir Caja
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    setNewInitialCash(initialCash > 0 ? String(initialCash) : "");
                    setEditInitialModal(true);
                  }}
                  style={[styles.editInitialBtn, { backgroundColor: "rgba(255,255,255,0.14)" }]}
                >
                  <Feather name="edit-2" size={13} color="#FFF" />
                  <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.xs, color: "#FFF" }}>
                    Fondo
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={[styles.cashGrid, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
            <View style={styles.cashCol}>
              <Text style={[styles.cashLabel, { color: "rgba(255,255,255,0.7)" }]}>Fondo inicial</Text>
              <Text style={[styles.cashValue, { color: "#FFF" }]}>
                {formatMoney(initialCash, cur)}
              </Text>
            </View>
            <View style={styles.cashCol}>
              <Text style={[styles.cashLabel, { color: "rgba(255,255,255,0.7)" }]}>Ventas Efectivo (+)</Text>
              <Text style={[styles.cashValue, { color: colors.success || "#10B981" }]}>
                +{formatMoney(currentShiftCashSales, cur)}
              </Text>
            </View>
            <View style={styles.cashCol}>
              <Text style={[styles.cashLabel, { color: "rgba(255,255,255,0.7)" }]}>Gastos Efectivo (-)</Text>
              <Text style={[styles.cashValue, { color: colors.error || "#EF4444" }]}>
                -{formatMoney(currentShiftCashExpenses, cur)}
              </Text>
            </View>
          </View>

          <View style={styles.cashFooter}>
            <View>
              <Text style={[styles.cashLabel, { color: "rgba(255,255,255,0.7)" }]}>Efectivo esperado</Text>
              <Text style={[styles.cashTotalVal, { color: "#FFF" }]}>
                {formatMoney(expectedCash, cur, 2)}
              </Text>
            </View>

            {currentShift?.status === "open" ? (
              <Pressable
                onPress={() => {
                  setCountedCash(String(expectedCash));
                  setCloseShiftModal(true);
                }}
                style={[styles.arqueoBtn, { backgroundColor: colors.warning || "#F59E0B" }]}
              >
                <Feather name="check-square" size={16} color="#0F172A" />
                <Text style={[styles.arqueoBtnText, { color: "#0F172A" }]}>Hacer Arqueo</Text>
              </Pressable>
            ) : (
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: "rgba(255,255,255,0.7)" }}>
                  Diferencia de cierre:
                </Text>
                <Text
                  style={{
                    fontFamily: FONTS.black,
                    fontSize: FONT_SIZE.base,
                    color:
                      (currentShift?.difference || 0) === 0
                        ? colors.success || "#10B981"
                        : (currentShift?.difference || 0) > 0
                        ? colors.warning || "#F59E0B"
                        : colors.error || "#EF4444",
                  }}
                >
                  {(currentShift?.difference || 0) >= 0 ? "+" : ""}
                  {formatMoney(currentShift?.difference || 0, cur)}
                </Text>
              </View>
            )}
          </View>
        </LinearGradient>

        {/* Historial de arqueos/turnos: tarjeta separada (fondo claro
            normal), no forma parte del degradado oscuro de "Caja del Día". */}
        <Card style={{ gap: SPACING.xs }}>
          <Pressable
            onPress={() => setShowShiftsHistory(!showShiftsHistory)}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.xs, color: colors.brand }}>
              {showShiftsHistory ? "Ocultar historial de cajas" : "Ver historial de arqueos y turnos anteriores"}
            </Text>
            <Feather name={showShiftsHistory ? "chevron-up" : "chevron-down"} size={16} color={colors.brand} />
          </Pressable>

          {showShiftsHistory ? (
            <View style={{ gap: SPACING.xs, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: SPACING.sm }}>
              <Pressable
                onPress={() => setShiftsRangeModal(true)}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
              >
                <Feather name="calendar" size={12} color={colors.onSurfaceTertiary} />
                <Text style={{ fontFamily: FONTS.medium, fontSize: 11, color: colors.onSurfaceTertiary }}>
                  {shiftsStartDate || shiftsEndDate
                    ? `${shiftsStartDate || "…"} al ${shiftsEndDate || "…"}`
                    : "Filtrar por rango de fechas"}
                </Text>
                {shiftsStartDate || shiftsEndDate ? (
                  <Pressable
                    onPress={() => {
                      setShiftsStartDate("");
                      setShiftsEndDate("");
                    }}
                    hitSlop={8}
                  >
                    <Feather name="x-circle" size={12} color={colors.onSurfaceTertiary} />
                  </Pressable>
                ) : null}
              </Pressable>

              {filteredShiftsHistory.length === 0 ? (
                <Text style={{ fontFamily: FONTS.regular, fontSize: FONT_SIZE.xs, color: colors.onSurfaceTertiary, textAlign: "center" }}>
                  {shiftsStartDate || shiftsEndDate
                    ? "Ningún arqueo en el rango seleccionado."
                    : "Aún no hay arqueos anteriores registrados."}
                </Text>
              ) : (
                filteredShiftsHistory.slice(0, 10).map((sh: any) => (
                  <View key={sh.id} style={[styles.shiftHistoryItem, { backgroundColor: colors.surfaceSecondary }]}>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.xs, color: colors.onSurface }}>
                        📅 {sh.date} · ⏱️ {formatTime(sh.opened_at)} a {formatTime(sh.closed_at)}
                      </Text>
                      <Text style={{ fontFamily: FONTS.regular, fontSize: 10, color: colors.onSurfaceTertiary }}>
                        Fondo: {formatMoney(sh.initial_cash || 0, cur)} · Estado: {sh.status === "open" ? "Abierta" : "Cerrada"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={{
                          fontFamily: FONTS.black,
                          fontSize: FONT_SIZE.xs,
                          color: (sh.difference || 0) >= 0 ? colors.success || "#10B981" : colors.error || "#EF4444",
                        }}
                      >
                        Dif: {(sh.difference || 0) >= 0 ? "+" : ""}{formatMoney(sh.difference || 0, cur)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </Card>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: SPACING["2xl"] }} />
        ) : (
          <>
            <View style={styles.strip}>
              <Card style={styles.stripCard}>
                <Text style={[styles.stripLabel, { color: colors.onSurfaceTertiary }]}>Ingresos</Text>
                <Text style={[styles.stripValue, { color: colors.success || "#10B981" }]}>
                  {formatMoney(financialMetrics.totalIncome, cur)}
                </Text>
              </Card>

              <Card style={styles.stripCard}>
                <Text style={[styles.stripLabel, { color: colors.onSurfaceTertiary }]}>Egresos</Text>
                <Text style={[styles.stripValue, { color: colors.error || "#EF4444" }]}>
                  {formatMoney(financialMetrics.totalExpenses, cur)}
                </Text>
              </Card>

              <Card style={styles.stripCard}>
                <Text style={[styles.stripLabel, { color: colors.onSurfaceTertiary }]}>Ganancia</Text>
                <Text
                  style={[
                    styles.stripValue,
                    {
                      color: financialMetrics.netProfit >= 0 ? colors.brand : colors.error || "#EF4444",
                    },
                  ]}
                >
                  {formatMoney(financialMetrics.netProfit, cur)}
                </Text>
              </Card>
            </View>

            <View style={[styles.criteriaBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="info" size={14} color={colors.brand} />
                <Text style={[styles.criteriaTitle, { color: colors.onSurface }]}>
                  {operationCriteria.title}
                </Text>
              </View>
              <Text style={[styles.criteriaDesc, { color: colors.onSurfaceTertiary }]}>
                {operationCriteria.desc}
              </Text>
            </View>

            {totalWasteLoss > 0 ? (
              <View
                style={[
                  styles.criteriaBox,
                  { backgroundColor: (colors.warning || "#F59E0B") + "14", borderColor: colors.warning || "#F59E0B" },
                ]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Feather name="trash-2" size={14} color={colors.warning || "#F59E0B"} />
                  <Text style={[styles.criteriaTitle, { color: colors.onSurface }]}>
                    Mercadería Desechada / Pérdida por Vencimiento
                  </Text>
                </View>
                <Text style={[styles.stripValue, { color: colors.warning || "#F59E0B", marginTop: 2 }]}>
                  {formatMoney(totalWasteLoss, cur)}
                </Text>
                <Text style={[styles.criteriaDesc, { color: colors.onSurfaceTertiary }]}>
                  Indicador informativo de control. No se resta de los totales financieros del período: el costo ya
                  se registró como egreso al momento de la compra.
                </Text>
              </View>
            ) : null}

            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Evolución de ventas</Text>
                {maxValSales > 0 ? (
                  <View style={styles.chartLegend}>
                    <View style={[styles.legendDot, { backgroundColor: colors.brand }]} />
                    <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: colors.onSurfaceTertiary }}>
                      Pico: {formatMoney(maxValSales, cur)}
                    </Text>
                  </View>
                ) : null}
              </View>

              {range === "custom" ? (
                <View style={{ gap: SPACING.xs, marginTop: SPACING.sm }}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: SPACING.xs }}
                  >
                    {yearPickerOptions.map((y) => {
                      const active = y === selectedYear;
                      return (
                        <Pressable
                          key={y}
                          onPress={() => setSelectedYear(y)}
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

                  <View style={{ flexDirection: "row", gap: SPACING.xs }}>
                    <Pressable
                      onPress={() => setYearViewMode("monthly")}
                      style={[
                        styles.yearModeBtn,
                        {
                          backgroundColor: yearViewMode === "monthly" ? colors.brand : colors.surfaceSecondary,
                          borderColor: yearViewMode === "monthly" ? colors.brand : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.xs, color: yearViewMode === "monthly" ? "#FFF" : colors.onSurface }}>
                        Mensual
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setYearViewMode("daily")}
                      style={[
                        styles.yearModeBtn,
                        {
                          backgroundColor: yearViewMode === "daily" ? colors.brand : colors.surfaceSecondary,
                          borderColor: yearViewMode === "daily" ? colors.brand : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.xs, color: yearViewMode === "daily" ? "#FFF" : colors.onSurface }}>
                        Diario
                      </Text>
                    </Pressable>
                  </View>

                  {yearViewMode === "daily" ? (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.md }}>
                      <Pressable
                        onPress={() => {
                          if (dailyMonth === 0) {
                            setDailyMonth(11);
                            setSelectedYear((y) => y - 1);
                          } else {
                            setDailyMonth((m) => m - 1);
                          }
                        }}
                        hitSlop={8}
                      >
                        <Feather name="chevron-left" size={20} color={colors.onSurface} />
                      </Pressable>
                      <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm, color: colors.onSurface }}>
                        {MONTH_NAMES[dailyMonth]} {selectedYear}
                      </Text>
                      <Pressable
                        onPress={() => {
                          if (dailyMonth === 11) {
                            setDailyMonth(0);
                            setSelectedYear((y) => y + 1);
                          } else {
                            setDailyMonth((m) => m + 1);
                          }
                        }}
                        hitSlop={8}
                      >
                        <Feather name="chevron-right" size={20} color={colors.onSurface} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {isEmpty ? (
                // El estado vacío se monta SOLO dentro de este contenedor del
                // gráfico: la botonera superior de rango y, si aplica, los
                // selectores de año/Mensual-Diario/paginador de "Rango" de
                // arriba nunca se desmontan, así el usuario siempre puede
                // volver a un período con datos sin quedar atrapado.
                <EmptyState
                  variant="sad"
                  title="No hay suficientes datos todavía"
                  subtitle="Registra ventas y gastos para ver tus reportes."
                />
              ) : lineData.length > 1 ? (
                <View style={{ marginTop: SPACING.lg, alignItems: "center" }}>
                  {range === "month" || (range === "custom" && yearViewMode === "daily") ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <LineChart
                        data={lineData}
                        areaChart
                        curved
                        color={colors.brand}
                        startFillColor={colors.brand}
                        endFillColor={colors.surfaceSecondary}
                        startOpacity={0.4}
                        endOpacity={0.05}
                        thickness={3}
                        hideRules
                        xAxisThickness={1}
                        xAxisColor={colors.border}
                        yAxisThickness={0}
                        yAxisTextStyle={{
                          color: colors.onSurfaceTertiary,
                          fontSize: 10,
                          fontFamily: FONTS.regular,
                        }}
                        xAxisLabelTextStyle={{
                          color: colors.onSurface,
                          fontSize: 10,
                          fontFamily: FONTS.bold,
                          width: 28,
                          textAlign: "center",
                        }}
                        dataPointsColor={colors.brand}
                        textColor={colors.onSurface}
                        textFontSize={9}
                        noOfSections={3}
                        height={160}
                        width={Math.max(320, lineData.length * 26)}
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
                      endFillColor={colors.surfaceSecondary}
                      startOpacity={0.4}
                      endOpacity={0.05}
                      thickness={3}
                      hideRules
                      xAxisThickness={1}
                      xAxisColor={colors.border}
                      yAxisThickness={0}
                      yAxisTextStyle={{
                        color: colors.onSurfaceTertiary,
                        fontSize: 10,
                        fontFamily: FONTS.regular,
                      }}
                      xAxisLabelTextStyle={{
                        color: colors.onSurface,
                        fontSize: 10,
                        fontFamily: FONTS.bold,
                        width: 42,
                        textAlign: "center",
                      }}
                      dataPointsColor={colors.brand}
                      textColor={colors.onSurface}
                      textFontSize={9}
                      noOfSections={3}
                      height={160}
                      adjustToWidth
                      initialSpacing={14}
                    />
                  )}
                </View>
              ) : (
                <Text style={[styles.noData, { color: colors.onSurfaceTertiary }]}>
                  Datos insuficientes para el gráfico
                </Text>
              )}
            </Card>

            <Card>
              <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Distribución de gastos</Text>
              {pieData.length > 0 ? (
                <View
                  style={{
                    marginTop: SPACING.lg,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: SPACING.lg,
                  }}
                >
                  <PieChart
                    data={pieData}
                    donut
                    radius={70}
                    innerRadius={45}
                    innerCircleColor={colors.surfaceSecondary}
                    centerLabelComponent={() => (
                      <Text
                        style={{
                          color: colors.onSurface,
                          fontFamily: FONTS.bold,
                          fontSize: FONT_SIZE.sm,
                        }}
                      >
                        Gastos
                      </Text>
                    )}
                  />
                  <View style={{ flex: 1, gap: SPACING.sm }}>
                    {pieData.map((p: any, i: number) => (
                      <View key={i} style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: p.color }]} />
                        <Text
                          style={[styles.legendLabel, { color: colors.onSurface }]}
                          numberOfLines={1}
                        >
                          {p.text}
                        </Text>
                        <Text style={[styles.legendValue, { color: colors.onSurfaceTertiary }]}>
                          {formatMoney(p.value, cur)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <Text style={[styles.noData, { color: colors.onSurfaceTertiary }]}>
                  Sin gastos en este período
                </Text>
              )}
            </Card>

            <Card>
              <Text style={[styles.cardTitle, { color: colors.onSurface }]}>
                Productos más vendidos
              </Text>
              {topProducts.length > 0 ? (
                <View style={{ marginTop: SPACING.md, gap: SPACING.md }}>
                  {topProducts.map((t: any, i: number) => (
                    <View key={i} style={styles.topRow}>
                      <Text
                        style={[styles.topName, { color: colors.onSurface }]}
                        numberOfLines={1}
                      >
                        {t.label}
                      </Text>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barTrackBg,
                            { backgroundColor: colors.surfaceTertiary },
                          ]}
                        >
                          <View
                            style={[
                              styles.barFill,
                              {
                                backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                                width: `${(t.value / maxTop) * 100}%`,
                              },
                            ]}
                          />
                        </View>
                      </View>
                      <Text
                        style={[styles.topValue, { color: colors.onSurfaceTertiary }]}
                      >
                        {t.value}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.noData, { color: colors.onSurfaceTertiary }]}>
                  Aún no hay ventas registradas
                </Text>
              )}
            </Card>
          </>
        )}
      </ScrollView>

      {/* MODAL: ELEGIR EXCEL O CSV */}
      <Modal visible={showExportModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Selecciona formato de exportación</Text>
            <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, color: colors.onSurfaceTertiary }}>
              Elige cómo deseas descargar la auditoría de ventas, inventario y balance.
            </Text>

            <View style={{ gap: SPACING.sm, marginTop: 4 }}>
              <Pressable
                onPress={exportToExcelNative}
                style={[styles.formatOptionBtn, { borderColor: colors.success || "#10B981", backgroundColor: (colors.success || "#10B981") + "14" }]}
              >
                <Feather name="file-text" size={22} color={colors.success || "#10B981"} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, color: colors.onSurface }}>
                    Microsoft Excel (.xls)
                  </Text>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: FONT_SIZE.xs, color: colors.onSurfaceTertiary }}>
                    Formato compatible estructurado listo para abrir directamente.
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={exportToCSV}
                style={[styles.formatOptionBtn, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
              >
                <Feather name="grid" size={22} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, color: colors.onSurface }}>
                    Archivo CSV (.csv)
                  </Text>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: FONT_SIZE.xs, color: colors.onSurfaceTertiary }}>
                    Texto delimitado por comas compatible con cualquier hoja de cálculo.
                  </Text>
                </View>
              </Pressable>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowExportModal(false)}
                style={[styles.modalBtn, { backgroundColor: colors.surfaceSecondary }]}
              >
                <Text style={{ fontFamily: FONTS.bold, color: colors.onSurfaceTertiary }}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <DateRangeModal
        visible={shiftsRangeModal}
        colors={colors}
        title="Filtrar cajas por fecha"
        initialStart={shiftsStartDate}
        initialEnd={shiftsEndDate}
        onRequestClose={() => setShiftsRangeModal(false)}
        onClear={() => {
          setShiftsStartDate("");
          setShiftsEndDate("");
          setShiftsRangeModal(false);
        }}
        onApply={(start, end) => {
          setShiftsStartDate(start);
          setShiftsEndDate(end);
          setShiftsRangeModal(false);
        }}
      />

      {/* MODALES DE CAJA */}
      <Modal visible={openNewShiftModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>
              Abrir Nueva Caja
            </Text>
            <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, color: colors.onSurfaceTertiary }}>
              Inicia un nuevo turno. Se registrará la fecha y hora de apertura automáticamente.
            </Text>

            <Field
              label={`Fondo inicial (${cur})`}
              keyboardType="numeric"
              placeholder="0.00"
              value={newInitialCash}
              onChangeText={setNewInitialCash}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setOpenNewShiftModal(false);
                  setNewInitialCash("");
                }}
                style={[styles.modalBtn, { backgroundColor: colors.surfaceSecondary }]}
              >
                <Text style={{ fontFamily: FONTS.bold, color: colors.onSurfaceTertiary }}>
                  Cancelar
                </Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  const val = parseFloat(newInitialCash) || 0;
                  try {
                    if (openCashShift) {
                      await openCashShift(val);
                    }
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    setOpenNewShiftModal(false);
                    setNewInitialCash("");
                    if (loadShifts) await loadShifts();
                  } catch (e: any) {
                    Alert.alert("Error", "No se pudo abrir la caja: " + (e?.message || ""));
                  }
                }}
                style={[styles.modalBtn, { backgroundColor: colors.brand }]}
              >
                <Text style={{ fontFamily: FONTS.bold, color: "#FFF" }}>Iniciar Turno</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editInitialModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>
              Modificar Fondo Inicial
            </Text>
            <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, color: colors.onSurfaceTertiary }}>
              Ajusta el dinero inicial con el que empezó el turno actual ({formatTime(currentShift?.opened_at)}).
            </Text>

            <Field
              label={`Monto (${cur})`}
              keyboardType="numeric"
              placeholder="0.00"
              value={newInitialCash}
              onChangeText={setNewInitialCash}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setEditInitialModal(false);
                  setNewInitialCash("");
                }}
                disabled={savingInitial}
                style={[styles.modalBtn, { backgroundColor: colors.surfaceSecondary }]}
              >
                <Text style={{ fontFamily: FONTS.bold, color: colors.onSurfaceTertiary }}>
                  Cancelar
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSaveInitialCash}
                disabled={savingInitial}
                style={[styles.modalBtn, { backgroundColor: colors.brand, opacity: savingInitial ? 0.6 : 1 }]}
              >
                {savingInitial ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={{ fontFamily: FONTS.bold, color: "#FFF" }}>Guardar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={closeShiftModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>
              Cierre y Arqueo de Turno
            </Text>

            <View style={[styles.arqueoSummary, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: colors.onSurfaceTertiary }}>
                Turno iniciado a las {formatTime(currentShift?.opened_at)}
              </Text>
              <Text style={{ fontFamily: FONTS.black, fontSize: FONT_SIZE.xl, color: colors.brand }}>
                {formatMoney(expectedCash, cur, 2)}
              </Text>
              <Text style={{ fontFamily: FONTS.medium, fontSize: 10, color: colors.onSurfaceTertiary }}>
                Efectivo esperado en este turno
              </Text>
            </View>

            <Field
              label={`Efectivo Físico Contado (${cur})`}
              keyboardType="numeric"
              placeholder="0.00"
              value={countedCash}
              onChangeText={setCountedCash}
            />

            {countedCash !== "" && !isNaN(parseFloat(countedCash)) ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, color: colors.onSurfaceTertiary }}>
                  Diferencia:
                </Text>
                <Text
                  style={{
                    fontFamily: FONTS.black,
                    fontSize: FONT_SIZE.base,
                    color:
                      parseFloat(countedCash) - expectedCash === 0
                        ? colors.success || "#10B981"
                        : parseFloat(countedCash) - expectedCash > 0
                        ? colors.warning || "#F59E0B"
                        : colors.error || "#EF4444",
                  }}
                >
                  {parseFloat(countedCash) - expectedCash >= 0 ? "+" : ""}
                  {formatMoney(parseFloat(countedCash) - expectedCash, cur, 2)} (
                  {parseFloat(countedCash) - expectedCash === 0
                    ? "Cuadrado ✅"
                    : parseFloat(countedCash) - expectedCash > 0
                    ? "Sobrante"
                    : "Faltante"}
                  )
                </Text>
              </View>
            ) : null}

            <Field
              label="Nota de cierre (opcional)"
              placeholder="Ej: Se retiró efectivo para banco..."
              value={shiftNote}
              onChangeText={setShiftNote}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setCloseShiftModal(false)}
                style={[styles.modalBtn, { backgroundColor: colors.surfaceSecondary }]}
              >
                <Text style={{ fontFamily: FONTS.bold, color: colors.onSurfaceTertiary }}>
                  Cancelar
                </Text>
              </Pressable>
              <Pressable
                onPress={handleCloseShift}
                style={[styles.modalBtn, { backgroundColor: colors.brand }]}
              >
                <Text style={{ fontFamily: FONTS.bold, color: "#FFF" }}>Confirmar Cierre</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  exportBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  exportBarTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  exportBtnText: { fontFamily: FONTS.bold, fontSize: 11 },
  rangeChipsContainer: {
    paddingVertical: SPACING.xs,
  },
  rangeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  rangeChipText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.xs },
  yearChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  strip: { flexDirection: "row", gap: SPACING.sm },
  stripCard: { flex: 1, padding: SPACING.md, gap: 4 },
  stripLabel: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs },
  stripValue: { fontFamily: FONTS.black, fontSize: FONT_SIZE.lg },
  criteriaBox: {
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: 4,
    marginTop: -SPACING.sm,
  },
  criteriaTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.xs },
  criteriaDesc: { fontFamily: FONTS.regular, fontSize: 11, lineHeight: 15 },
  cardTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  chartLegend: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  noData: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.base,
    textAlign: "center",
    paddingVertical: SPACING.xl,
  },
  legendRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  legendLabel: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm },
  legendValue: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm },
  topRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  topName: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, width: 90 },
  barTrack: { flex: 1 },
  barTrackBg: { height: 12, borderRadius: RADIUS.pill, overflow: "hidden" },
  barFill: { height: 12, borderRadius: RADIUS.pill },
  topValue: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, width: 30, textAlign: "right" },
  cashCard: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
    shadowColor: "#0E172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  cashHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cashIconBox: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  editInitialBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  cashGrid: {
    flexDirection: "row",
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    justifyContent: "space-between",
  },
  cashCol: { gap: 2 },
  cashLabel: { fontFamily: FONTS.medium, fontSize: 11 },
  cashValue: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm },
  cashFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cashTotalVal: { fontFamily: FONTS.black, fontSize: FONT_SIZE.xl },
  arqueoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  arqueoBtnText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm, color: "#FFF" },
  shiftHistoryItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  modalBox: { padding: SPACING.xl, borderRadius: RADIUS.lg, gap: SPACING.md },
  modalTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: SPACING.md, marginTop: SPACING.xs },
  modalBtn: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.md },
  formatOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
  },
  arqueoSummary: { padding: SPACING.md, borderRadius: RADIUS.md, gap: 2, alignItems: "center" },
  rangeTargetBox: {
    flex: 1,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    alignItems: "center",
  },
  yearModeBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
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
