import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Card, Field, InputPrompt } from "@/src/components/ui";
import { DateRangeModal } from "@/src/components/DateRangeModal";
import { TopBar } from "@/src/components/TopBar";
import { useData, Expense } from "@/src/context/DataContext";
import { useTaxonomy, DEFAULT_EXPENSE_CATEGORIES } from "@/src/context/TaxonomyContext";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatMoney, formatLocalTime, toLocalDate } from "@/src/utils/format";
import { TRANSFER_SUBTYPES } from "@/src/constants";

type DateFilter = "all" | "today" | "yesterday" | "7days" | "custom";

const TAXONOMY_STORAGE_KEY = "@pan_custom_taxonomy";

function formatExpenseDateTime(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = toLocalDate(dateStr);
  if (isNaN(d.getTime())) return "—";

  const day = String(d.getDate()).padStart(2, "0");
  const months = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "set.", "oct.", "nov.", "dic."];
  const month = months[d.getMonth()] || "";
  const time = formatLocalTime(d);

  return `${day}-${month} · ${time}`;
}

// Generador de 5 subcategorías coherentes según el tipo creado
function generateSubcategoriesForType(typeName: string): string[] {
  const norm = typeName.toLowerCase().trim();
  if (/salud|m[eé]dic|farmac/i.test(norm)) {
    return ["Farmacia", "Consultas", "Medicamentos", "Dental", "Imprevistos"];
  }
  if (/animal|mascot|veterin/i.test(norm)) {
    return ["Alimento", "Veterinaria", "Accesorios", "Higiene", "Vacunas"];
  }
  if (/educaci[oó]n|curso|estudio|capacit/i.test(norm)) {
    return ["Cursos", "Materiales", "Certificaciones", "Libros", "Talleres"];
  }
  if (/marketing|publicidad|redes/i.test(norm)) {
    return ["Anuncios", "Diseño", "Redes Sociales", "Impresiones", "Promociones"];
  }
  return ["General", "Imprevistos", "Mantenimiento", "Insumos", "Varios"];
}

export default function Expenses() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { expenses: expenseRecords, loadExpenses, createExpense, deleteExpense } = useData() as any;
  const tax = useTaxonomy() as any;
  const { user } = useAuth();
  const cur = user?.currency || "PEN";
  const params = useLocalSearchParams<{ q?: string }>();

  // Mapa inicial seguro a partir del contexto o valores predeterminados
  const initialMap = useMemo(() => {
    const baseList = (tax?.expenses && tax.expenses.length > 0) ? tax.expenses : DEFAULT_EXPENSE_CATEGORIES;
    const map: Record<string, string[]> = {};
    baseList.forEach((e: any) => {
      const name = e.name || e.label || e.key;
      const subs = e.subcategories || e.categories || [];
      if (name) map[name] = subs.length > 0 ? subs : ["General", "Varios"];
    });
    return map;
  }, [tax?.expenses]);

  const [categoriesMap, setCategoriesMap] = useState<Record<string, string[]>>(initialMap);
  const [types, setTypes] = useState<string[]>(Object.keys(initialMap));

  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<string>("Transporte");
  const [category, setCategory] = useState<string>("Pasajes");
  const [method, setMethod] = useState("cash");
  const [transferDetail, setTransferDetail] = useState<string>(TRANSFER_SUBTYPES[0]);
  const [customDetail, setCustomDetail] = useState("");
  const [note, setNote] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const [showAddTypeModal, setShowAddTypeModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);

  // Filtros de historial
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  // Reservado para un futuro filtro por tipo de gasto (Operativos/Mercancía/
  // etc.); sin setter todavía porque no hay control en pantalla que lo
  // cambie, así que se deja fijo en "all" (sin filtrar) en vez de simular
  // una función que no hace nada.
  const [selectedTypeFilter] = useState<string>("all");
  const [rangeModal, setRangeModal] = useState(false);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Sincronización limpia
  const syncTaxonomy = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(TAXONOMY_STORAGE_KEY);
      let parsed = stored ? JSON.parse(stored) : null;
      const rawExp = (tax?.expenses && tax.expenses.length > 0) ? tax.expenses : (parsed?.expenses || DEFAULT_EXPENSE_CATEGORIES);

      if (rawExp && rawExp.length > 0) {
        const newMap: Record<string, string[]> = {};
        rawExp.forEach((e: any) => {
          const tName = e.name || e.label || e.key;
          const subs = e.subcategories || e.categories || [];
          if (tName) {
            newMap[tName] = subs.length > 0 ? subs : ["General", "Varios"];
          }
        });
        setCategoriesMap(newMap);
        const keys = Object.keys(newMap);
        setTypes(keys);
        if (!keys.includes(type) && keys.length > 0) {
          setType(keys[0]);
          setCategory(newMap[keys[0]][0] || "General");
        }
      }
    } catch {}
  }, [tax?.expenses, type]);

  useFocusEffect(
    useCallback(() => {
      syncTaxonomy();
      if (loadExpenses) {
        loadExpenses().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }, [syncTaxonomy, loadExpenses])
  );

  useEffect(() => {
    if (params.q) setHistorySearch(String(params.q));
  }, [params.q]);

  const handleSelectType = (selectedType: string) => {
    setType(selectedType);
    const availableCats = categoriesMap[selectedType] || ["General", "Varios"];
    setCategory(availableCats[0] || "General");
    if ((selectedType === "Mercadería" || selectedType === "Mercancía") && method === "cash") {
      setMethod("transfer");
    }
  };

  const handleCreateNewType = async (newTypeName: string) => {
    const trimmed = newTypeName.trim();
    if (!trimmed) return;

    const fiveSubs = generateSubcategoriesForType(trimmed);
    const updatedMap = { ...categoriesMap, [trimmed]: fiveSubs };
    const updatedTypes = Array.from(new Set([...types, trimmed]));

    setCategoriesMap(updatedMap);
    setTypes(updatedTypes);
    setType(trimmed);
    setCategory(fiveSubs[0]);
    setShowAddTypeModal(false);

    try {
      if (tax?.addExpenseCategory) {
        await tax.addExpenseCategory(trimmed);
        for (const s of fiveSubs) {
          if (tax?.addExpenseSubcategory) {
            await tax.addExpenseSubcategory(trimmed, s);
          }
        }
      }

      const rawStored = await AsyncStorage.getItem(TAXONOMY_STORAGE_KEY);
      const parsedStored = rawStored ? JSON.parse(rawStored) : { inventory: [], expenses: [] };
      const currentExp = parsedStored.expenses || [];
      const existsIndex = currentExp.findIndex((item: any) => (item.name || item.key) === trimmed);

      let newExpList = [];
      if (existsIndex >= 0) {
        newExpList = [...currentExp];
        newExpList[existsIndex] = { name: trimmed, subcategories: fiveSubs };
      } else {
        newExpList = [...currentExp, { name: trimmed, subcategories: fiveSubs }];
      }

      await AsyncStorage.setItem(
        TAXONOMY_STORAGE_KEY,
        JSON.stringify({ ...parsedStored, expenses: newExpList })
      );
      if (tax?.load) await tax.load();
    } catch {}
  };

  const handleCreateNewSubcategory = async (newSubName: string) => {
    const trimmed = newSubName.trim();
    if (!trimmed) return;

    const currentSubs = categoriesMap[type] || [];
    if (!currentSubs.includes(trimmed)) {
      const updatedSubs = [...currentSubs, trimmed];
      const updatedMap = { ...categoriesMap, [type]: updatedSubs };

      setCategoriesMap(updatedMap);
      setCategory(trimmed);

      try {
        if (tax?.addExpenseSubcategory) {
          await tax.addExpenseSubcategory(type, trimmed);
        }
        const rawStored = await AsyncStorage.getItem(TAXONOMY_STORAGE_KEY);
        const parsedStored = rawStored ? JSON.parse(rawStored) : { inventory: [], expenses: [] };
        const updatedExp = (parsedStored.expenses || []).map((e: any) => {
          if ((e.name || e.label || e.key) === type) {
            return { ...e, subcategories: Array.from(new Set([...(e.subcategories || []), trimmed])) };
          }
          return e;
        });

        await AsyncStorage.setItem(
          TAXONOMY_STORAGE_KEY,
          JSON.stringify({ ...parsedStored, expenses: updatedExp })
        );
        if (tax?.load) await tax.load();
      } catch {}
    }
    setShowAddCategoryModal(false);
  };

  const currentCategories = useMemo(() => {
    return categoriesMap[type] || ["General", "Varios"];
  }, [categoriesMap, type]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase();
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const yDate = new Date();
    yDate.setDate(yDate.getDate() - 1);
    const yesterdayStr = yDate.toISOString().split("T")[0];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return (expenseRecords || []).filter((e: Expense) => {
      const matchesSearch =
        !q ||
        (e.category + " " + (e.note || "") + " " + (e.type || "")).toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (selectedTypeFilter !== "all" && e.type !== selectedTypeFilter) {
        return false;
      }

      const eDateStr = (e.created_at || "").split("T")[0];

      if (dateFilter === "today") return eDateStr === todayStr;
      if (dateFilter === "yesterday") return eDateStr === yesterdayStr;
      if (dateFilter === "7days") return new Date(e.created_at || "") >= sevenDaysAgo;
      if (dateFilter === "custom") {
        if (startDate && eDateStr < startDate) return false;
        if (endDate && eDateStr > endDate) return false;
      }

      return true;
    });
  }, [expenseRecords, historySearch, selectedTypeFilter, dateFilter, startDate, endDate]);

  const historyMetrics = useMemo(() => {
    let operating = 0;
    let stock = 0;

    filteredHistory.forEach((e: Expense) => {
      const isStock = e.type === "Mercancía" || e.type === "Mercadería" || e.category === "Compra de Stock";
      if (isStock) stock += Number(e.amount) || 0;
      else operating += Number(e.amount) || 0;
    });

    return { operating, stock, total: operating + stock };
  }, [filteredHistory]);

  const onRegister = async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) {
      setToast("Ingresa un monto válido");
      setTimeout(() => setToast(""), 2000);
      return;
    }
    const detail =
      method === "transfer"
        ? transferDetail === "Otros"
          ? customDetail.trim() || "Otros"
          : transferDetail
        : undefined;

    setSaving(true);
    try {
      const normalizedType =
        type === "Mercadería" || type === "Mercancía"
          ? "Mercancía"
          : type === "Insumos"
          ? "Insumos"
          : "Operativos";

      await createExpense({
        type: normalizedType,
        category,
        amount: amt,
        method,
        method_detail: detail,
        note: note.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setAmount("");
      setNote("");
      setToast("¡Gasto registrado! ✅");
      setTimeout(() => setToast(""), 2000);
      if (loadExpenses) loadExpenses();
    } catch {
      setToast("Error al registrar");
      setTimeout(() => setToast(""), 2000);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (id: string) => {
    Alert.alert(
      "Eliminar Gasto",
      "¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteExpense(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              setToast("Gasto eliminado");
              setTimeout(() => setToast(""), 2000);
              if (loadExpenses) loadExpenses();
            } catch {
              setToast("Error al eliminar");
              setTimeout(() => setToast(""), 2000);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <TopBar title="Gastos" />

      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: SPACING.lg,
          paddingTop: SPACING.sm,
          paddingBottom: 160,
          gap: SPACING.lg,
        }}
        bottomOffset={100}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ gap: SPACING.md }}>
          <Field
            label={`Monto (${cur})`}
            keyboardType="numeric"
            placeholder="0"
            icon="dollar-sign"
            value={amount}
            onChangeText={setAmount}
            testID="expense-amount"
          />

          {/* Selector de Tipo de Gasto */}
          <View style={{ gap: SPACING.xs }}>
            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Tipo de salida</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: SPACING.sm, alignItems: "center" }}
            >
              {types.map((t: string) => {
                const active = t === type;
                return (
                  <Pressable
                    key={t}
                    onPress={() => handleSelectType(t)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? colors.brand : colors.surfaceTertiary,
                        borderColor: active ? colors.brand : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? "#FFF" : colors.onSurfaceTertiary,
                        fontFamily: FONTS.medium,
                        fontSize: FONT_SIZE.base,
                      }}
                    >
                      {t}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => setShowAddTypeModal(true)}
                style={[styles.addChip, { borderColor: colors.brand }]}
              >
                <Feather name="plus" size={18} color={colors.brand} />
              </Pressable>
            </ScrollView>
          </View>

          {type === "Mercadería" || type === "Mercancía" ? (
            <View style={[styles.infoNotice, { backgroundColor: (colors.brandSecondary || "#3B82F6") + "15", borderColor: colors.brandSecondary }]}>
              <Feather name="package" size={16} color={colors.brandSecondary || "#3B82F6"} />
              <Text style={[styles.infoNoticeText, { color: colors.onSurface }]}>
                Inversión en Inventario: Este egreso suma a tu activo en mercadería. No se resta dos veces en la ganancia neta.
              </Text>
            </View>
          ) : null}

          {/* Categorías con Botón '+' para añadir subcategorías */}
          <View style={{ gap: SPACING.xs }}>
            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>
              Categoría ({type})
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: SPACING.sm, alignItems: "center" }}
            >
              {currentCategories.map((c: string) => {
                const active = c === category;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? colors.brandSecondary : colors.surfaceTertiary,
                        borderColor: active ? colors.brandSecondary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? "#FFF" : colors.onSurfaceTertiary,
                        fontFamily: FONTS.medium,
                        fontSize: FONT_SIZE.sm,
                      }}
                    >
                      {c}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => setShowAddCategoryModal(true)}
                style={[styles.addChip, { borderColor: colors.brandSecondary, width: 34, height: 34 }]}
              >
                <Feather name="plus" size={16} color={colors.brandSecondary} />
              </Pressable>
            </ScrollView>
          </View>

          {/* Método de pago */}
          <View style={{ gap: SPACING.xs }}>
            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Método de pago</Text>
            <View style={styles.methodRow}>
              <MethodBtn
                label="Efectivo (Caja del Día)"
                icon="dollar-sign"
                active={method === "cash"}
                onPress={() => setMethod("cash")}
                colors={colors}
              />
              <MethodBtn
                label="Transferencia / Banco"
                icon="credit-card"
                active={method === "transfer"}
                onPress={() => {
                  setMethod("transfer");
                  if (!transferDetail) setTransferDetail(TRANSFER_SUBTYPES[0]);
                }}
                colors={colors}
              />
            </View>
          </View>

          {method === "cash" && (type === "Mercadería" || type === "Mercancía") ? (
            <Text style={{ fontFamily: FONTS.medium, fontSize: 11, color: colors.error || "#EF4444" }}>
              ⚠️ Se descontará de la caja física del día ({cur}). Usa Transferencia si pagaste desde banco/ahorros.
            </Text>
          ) : null}

          {method === "transfer" ? (
            <View style={{ gap: SPACING.xs }}>
              <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Detalle digital</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: SPACING.sm, alignItems: "center" }}
              >
                {TRANSFER_SUBTYPES.map((s) => {
                  const active = s === transferDetail;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setTransferDetail(s)}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: active ? colors.brand : colors.surfaceTertiary,
                          borderColor: active ? colors.brand : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: active ? "#FFF" : colors.onSurfaceTertiary,
                          fontFamily: FONTS.medium,
                          fontSize: FONT_SIZE.xs,
                        }}
                      >
                        {s}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {transferDetail === "Otros" ? (
                <Field
                  placeholder="Nombre del método..."
                  value={customDetail}
                  onChangeText={setCustomDetail}
                />
              ) : null}
            </View>
          ) : null}

          <Field
            label="Nota (opcional)"
            placeholder="Ej: Proveedor, recibo, factura..."
            value={note}
            onChangeText={setNote}
          />
        </Card>

        {/* Historial con Desglose */}
        <View style={{ gap: SPACING.sm }}>
          <View style={styles.histHeader}>
            <Text style={[styles.section, { color: colors.onSurface }]}>Historial de Salidas</Text>
          </View>

          <View style={styles.metricsRow}>
            <Card style={styles.metricCard}>
              <Text style={[styles.metricLabel, { color: colors.onSurfaceTertiary }]}>Gastos Operativos</Text>
              <Text style={[styles.metricValue, { color: colors.error || "#EF4444" }]}>
                {formatMoney(historyMetrics.operating, cur)}
              </Text>
              <Text style={styles.metricSub}>Pérdida del período</Text>
            </Card>

            <Card style={styles.metricCard}>
              <Text style={[styles.metricLabel, { color: colors.onSurfaceTertiary }]}>Inversión en Stock</Text>
              <Text style={[styles.metricValue, { color: colors.brandSecondary || "#3B82F6" }]}>
                {formatMoney(historyMetrics.stock, cur)}
              </Text>
              <Text style={styles.metricSub}>Mercadería en almacén</Text>
            </Card>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: SPACING.xs }}
          >
            {[
              { key: "all", label: "Todos" },
              { key: "today", label: "Hoy" },
              { key: "yesterday", label: "Ayer" },
              { key: "7days", label: "Últimos 7 días" },
              { key: "custom", label: "Rango", icon: "calendar" as const },
            ].map((f) => {
              const active = dateFilter === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => {
                    if (f.key === "custom") {
                      setRangeModal(true);
                      return;
                    }
                    setDateFilter(f.key as DateFilter);
                  }}
                  style={[
                    styles.filterChip,
                    { flexDirection: "row", alignItems: "center", gap: 4 },
                    {
                      backgroundColor: active ? colors.brand : colors.surfaceSecondary,
                      borderColor: active ? colors.brand : colors.border,
                    },
                  ]}
                >
                  {f.icon ? (
                    <Feather name={f.icon} size={11} color={active ? "#FFF" : colors.onSurfaceTertiary} />
                  ) : null}
                  <Text
                    style={{
                      color: active ? "#FFF" : colors.onSurfaceTertiary,
                      fontFamily: FONTS.medium,
                      fontSize: FONT_SIZE.xs,
                    }}
                  >
                    {f.key === "custom" && active ? `${startDate.slice(5)} al ${endDate.slice(5)}` : f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Field
            icon="search"
            placeholder="Buscar por concepto o nota..."
            value={historySearch}
            onChangeText={setHistorySearch}
          />
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : filteredHistory.length === 0 ? (
          <Card>
            <Text style={[styles.empty, { color: colors.onSurfaceTertiary }]}>
              {expenseRecords?.length === 0
                ? "Aún no hay registros de gastos."
                : "Sin coincidencias para los filtros aplicados."}
            </Text>
          </Card>
        ) : (
          filteredHistory.map((e: Expense) => {
            const isStock = e.type === "Mercancía" || e.type === "Mercadería" || e.category === "Compra de Stock";
            return (
              <Card key={e.id}>
                <View style={styles.histRow}>
                  <View
                    style={[
                      styles.histIcon,
                      {
                        backgroundColor: isStock
                          ? (colors.brandSecondary || "#3B82F6") + "18"
                          : (colors.error || "#EF4444") + "18",
                      },
                    ]}
                  >
                    <Feather
                      name={isStock ? "package" : "trending-down"}
                      size={18}
                      color={isStock ? (colors.brandSecondary || "#3B82F6") : (colors.error || "#EF4444")}
                    />
                  </View>

                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.histCat, { color: colors.onSurface }]}>{e.category}</Text>
                    <Text style={[styles.histType, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>
                      {e.type || "Operativos"} ·{" "}
                      {e.method === "cash" ? "Efectivo" : e.method_detail || "Transferencia"}
                    </Text>

                    {/* Fecha y hora exacta */}
                    <View style={styles.dateRow}>
                      <Feather name="calendar" size={11} color={colors.onSurfaceTertiary} />
                      <Text style={[styles.histDate, { color: colors.onSurfaceTertiary }]}>
                        {formatExpenseDateTime(e.created_at)}
                      </Text>
                    </View>

                    {e.note ? (
                      <Text style={[styles.histNote, { color: colors.onSurfaceSecondary }]}>
                        📝 {e.note}
                      </Text>
                    ) : null}
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 8 }}>
                    <Text
                      style={[
                        styles.histAmt,
                        { color: isStock ? (colors.brandSecondary || "#3B82F6") : (colors.error || "#EF4444") },
                      ]}
                    >
                      -{formatMoney(e.amount, cur, 2)}
                    </Text>
                    <Pressable onPress={() => confirmDelete(e.id)} hitSlop={8}>
                      <Feather name="trash-2" size={16} color={colors.error || "#EF4444"} />
                    </Pressable>
                  </View>
                </View>
              </Card>
            );
          })
        )}
      </KeyboardAwareScrollView>

      {/* Modales de Adición Rápida */}
      <InputPrompt
        visible={showAddTypeModal}
        title="Nuevo Tipo de Salida"
        placeholder="Ej: Salud, Marketing, Mascotas..."
        onSubmit={handleCreateNewType}
        onClose={() => setShowAddTypeModal(false)}
      />

      <InputPrompt
        visible={showAddCategoryModal}
        title={`Nueva Subcategoría en ${type}`}
        placeholder="Ej: Consultas, Farmacia, Envíos..."
        onSubmit={handleCreateNewSubcategory}
        onClose={() => setShowAddCategoryModal(false)}
      />

      <DateRangeModal
        visible={rangeModal}
        colors={colors}
        title="Filtrar gastos por fecha"
        initialStart={startDate}
        initialEnd={endDate}
        onRequestClose={() => setRangeModal(false)}
        onClear={() => {
          setDateFilter("all");
          setRangeModal(false);
        }}
        onApply={(start, end) => {
          setStartDate(start);
          setEndDate(end);
          setDateFilter("custom");
          setRangeModal(false);
        }}
      />

      {toast ? (
        <View style={[styles.toast, { backgroundColor: colors.onSurface, bottom: insets.bottom + 90 }]}>
          <Text style={[styles.toastText, { color: colors.surface }]}>{toast}</Text>
        </View>
      ) : null}

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + SPACING.sm,
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
          ]}
        >
          <Pressable
            onPress={onRegister}
            disabled={saving}
            style={[
              styles.regBtn,
              { backgroundColor: colors.error || "#EF4444", opacity: saving ? 0.6 : 1 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Feather name="check" size={20} color="#FFF" />
                <Text style={styles.regText}>Registrar Salida</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

function MethodBtn({ label, icon, active, onPress, colors }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.methodBtn,
        {
          backgroundColor: active ? (colors.brandTertiary || colors.surfaceTertiary) : colors.surfaceTertiary,
          borderColor: active ? colors.brand : colors.border,
        },
      ]}
    >
      <Feather name={icon} size={16} color={active ? colors.brand : colors.onSurfaceTertiary} />
      <Text
        style={{
          color: active ? colors.brand : colors.onSurfaceTertiary,
          fontFamily: FONTS.medium,
          fontSize: FONT_SIZE.sm,
          flexShrink: 1,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
    zIndex: 100,
  },
  toastText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  label: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, marginLeft: 2 },
  chip: {
    flexDirection: "row",
    flexShrink: 0,
    height: 38,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChip: {
    height: 30,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  addChip: {
    flexShrink: 0,
    width: 38,
    height: 38,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  infoNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  infoNoticeText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 11,
    lineHeight: 15,
  },
  methodRow: { flexDirection: "row", gap: SPACING.sm },
  methodBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    height: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
  },
  histHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  section: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  metricsRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.xs },
  metricCard: { flex: 1, padding: SPACING.md, gap: 2 },
  metricLabel: { fontFamily: FONTS.medium, fontSize: 11 },
  metricValue: { fontFamily: FONTS.black, fontSize: FONT_SIZE.lg },
  metricSub: { fontFamily: FONTS.regular, fontSize: 10, color: "#94a3b8" },
  empty: {
    fontFamily: FONTS.medium,
    fontSize: FONT_SIZE.base,
    textAlign: "center",
    paddingVertical: SPACING.md,
  },
  histRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  histIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  histCat: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  histType: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  histDate: { fontFamily: FONTS.regular, fontSize: 11 },
  histNote: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, fontStyle: "italic" },
  histAmt: { fontFamily: FONTS.black, fontSize: FONT_SIZE.lg },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  regBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    height: 54,
    borderRadius: RADIUS.md,
  },
  regText: { fontFamily: FONTS.black, fontSize: FONT_SIZE.lg, color: "#FFF" },
});
