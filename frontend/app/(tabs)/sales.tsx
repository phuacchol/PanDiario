import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  Modal,
} from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Card, Field, Segmented, IconButton } from "@/src/components/ui";
import { TopBar } from "@/src/components/TopBar";
import { TRANSFER_SUBTYPES } from "@/src/constants";
import { EmptyState } from "@/src/components/Mascot";
import { useData, Product, Sale } from "@/src/context/DataContext";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE, COBALT_UI } from "@/src/theme/theme";
import { formatMoney, formatLocalDate, formatLocalTime, toLocalDate } from "@/src/utils/format";
import { getExpiryStatus, formatExpiryDateShort } from "@/src/utils/expiry";

type CartItem = {
  product_id?: string;
  name: string;
  qty: number;
  unit_price: number;
  unit_cost: number;
};
type DateFilter = "all" | "today" | "yesterday" | "7days" | "custom";

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

function getLocalDateStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function Sales() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { products, loadProducts, sales, loadSales, createSale, deleteSale, updateSale } =
    useData() as any;
  const { user } = useAuth();
  const cur = user?.currency || "PEN";

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Filtro de categoría del catálogo (independiente del filtro de categoría
  // del historial de ventas más abajo: son dos listas distintas).
  const [catalogCategory, setCatalogCategory] = useState<string>("all");
  const [saleNote, setSaleNote] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [method, setMethod] = useState("cash");
  const [cashAmt, setCashAmt] = useState("");
  const [transferDetail, setTransferDetail] = useState(TRANSFER_SUBTYPES[0]);
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState("");
  const params = useLocalSearchParams<{ q?: string }>();

  // Filtros de historial de ventas
  const [historySearch, setHistorySearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Rango personalizado de fechas con Calendario
  const [rangeModal, setRangeModal] = useState(false);
  const [selectingTarget, setSelectingTarget] = useState<"start" | "end">("start");
  const [startDate, setStartDate] = useState(() => getLocalDateStr());
  const [endDate, setEndDate] = useState(() => getLocalDateStr());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const yearScrollRef = useRef<ScrollView>(null);

  const availableYears = useMemo(() => {
    const current = new Date().getFullYear();
    const list: number[] = [];
    for (let y = current - 25; y <= current + 5; y++) {
      list.push(y);
    }
    return list;
  }, []);

  useEffect(() => {
    if (rangeModal) {
      const current = new Date().getFullYear();
      const initialY = startDate ? parseInt(startDate.split("-")[0], 10) || current : current;
      setCalYear(initialY);
      setCalMonth(startDate ? (parseInt(startDate.split("-")[1], 10) - 1) || new Date().getMonth() : new Date().getMonth());

      const index = availableYears.indexOf(initialY);
      if (index >= 0) {
        setTimeout(() => {
          yearScrollRef.current?.scrollTo({ x: Math.max(0, (index - 2) * 58), animated: true });
        }, 150);
      }
    }
  }, [rangeModal, startDate, availableYears]);

  // Modal de edición de venta
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editMethod, setEditMethod] = useState("cash");
  const [editTransferDetail, setEditTransferDetail] = useState(TRANSFER_SUBTYPES[0]);

  // Modal de detalle de transacción (al tocar una tarjeta del historial)
  const [detailSale, setDetailSale] = useState<Sale | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        loadProducts ? loadProducts() : Promise.resolve(),
        loadSales ? loadSales() : Promise.resolve(),
      ]).finally(() => setLoading(false));
    }, [loadProducts, loadSales])
  );

  useEffect(() => {
    if (params.q) setSearch(String(params.q));
  }, [params.q]);

  const consolidatedProducts = useMemo(() => {
    const map = new Map<string, any>();
    (products || []).forEach((p: Product) => {
      const cleanName = (p.name || "").trim().toLowerCase();
      if (!map.has(cleanName)) {
        map.set(cleanName, {
          ...p,
          stock: Number(p.stock) || 0,
          price: Number(p.price) || 0,
          cost: Number(p.cost) || 0,
          ids: [p.id],
        });
      } else {
        const existing = map.get(cleanName);
        existing.stock += Number(p.stock) || 0;
        existing.ids.push(p.id);
        if ((!existing.price || existing.price === 0) && Number(p.price) > 0) {
          existing.price = Number(p.price);
        }
        if (p.is_perishable) existing.is_perishable = true;
        if (
          p.nearest_expiry_date &&
          (!existing.nearest_expiry_date || p.nearest_expiry_date < existing.nearest_expiry_date)
        ) {
          existing.nearest_expiry_date = p.nearest_expiry_date;
          existing.nearest_expiry_qty = p.nearest_expiry_qty;
        }
      }
    });
    return Array.from(map.values());
  }, [products]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    consolidatedProducts.forEach((p: any) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [consolidatedProducts]);

  const filtered = useMemo(
    () =>
      consolidatedProducts.filter(
        (p: any) =>
          p.name.toLowerCase().includes(search.toLowerCase()) &&
          (catalogCategory === "all" || p.category === catalogCategory)
      ),
    [consolidatedProducts, search, catalogCategory]
  );

  const total = useMemo(() => {
    const sum = cart.reduce((s, i) => s + (Number(i.unit_price) || 0) * (Number(i.qty) || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [cart]);

  const addToCart = (p: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.name.toLowerCase().trim() === p.name.toLowerCase().trim());
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [
        ...prev,
        {
          product_id: p.id,
          name: p.name,
          qty: 1,
          unit_price: Number(p.price) || 0,
          unit_cost: Number(p.cost) || 0,
        },
      ];
    });
  };

  const updateItem = (idx: number, patch: Partial<CartItem>) => {
    setCart((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx: number) => setCart((prev) => prev.filter((_, i) => i !== idx));

  const buildPayments = () => {
    const tdetail = method !== "cash" ? transferDetail : undefined;
    if (method === "cash") return [{ method: "cash", amount: total }];
    if (method === "transfer") return [{ method: "transfer", amount: total, detail: tdetail }];
    const cash = parseFloat(cashAmt) || 0;
    return [
      { method: "cash", amount: cash },
      { method: "transfer", amount: Math.max(0, Math.round((total - cash) * 100) / 100), detail: tdetail },
    ];
  };

  const onCheckout = async () => {
    if (cart.length === 0) return;
    setProcessing(true);
    try {
      await createSale({
        items: cart,
        payments: buildPayments(),
        note: saleNote.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCart([]);
      setCashAmt("");
      setSaleNote("");
      setMethod("cash");
      setToast("¡Venta registrada! 🎉");
      setTimeout(() => setToast(""), 2200);
      if (loadSales) await loadSales();
      if (loadProducts) await loadProducts();
    } catch {
      setToast("Error al registrar la venta");
      setTimeout(() => setToast(""), 2200);
    } finally {
      setProcessing(false);
    }
  };

  const filteredSalesHistory = useMemo(() => {
    const sList: Sale[] = sales || [];
    const q = historySearch.toLowerCase();
    const todayStr = getLocalDateStr();

    const yDate = new Date();
    yDate.setDate(yDate.getDate() - 1);
    const yesterdayStr = `${yDate.getFullYear()}-${String(yDate.getMonth() + 1).padStart(2, "0")}-${String(yDate.getDate()).padStart(2, "0")}`;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return sList.filter((s) => {
      const itemNames = (s.items || []).map((i) => i.name).join(" ");
      const matchesSearch =
        !q || (itemNames + " " + (s.note || "")).toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (categoryFilter !== "all") {
        const hasCat = (s.items || []).some((item) => {
          const prod = (products || []).find((p: Product) => p.id === item.product_id || p.name === item.name);
          return prod && prod.category === categoryFilter;
        });
        if (!hasCat) return false;
      }

      const sDateStr = s.created_at ? s.created_at.split("T")[0] : "";

      if (dateFilter === "today") return sDateStr === todayStr;
      if (dateFilter === "yesterday") return sDateStr === yesterdayStr;
      if (dateFilter === "7days") return new Date(s.created_at || "") >= sevenDaysAgo;
      if (dateFilter === "custom") {
        if (startDate && sDateStr < startDate) return false;
        if (endDate && sDateStr > endDate) return false;
      }

      return true;
    });
  }, [sales, historySearch, categoryFilter, dateFilter, products, startDate, endDate]);

  const confirmDeleteSale = (id: string) => {
    Alert.alert(
      "Eliminar Venta",
      "¿Estás seguro de que deseas eliminar esta venta? El stock se restaurará automáticamente.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              if (deleteSale) await deleteSale(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              setToast("Venta eliminada");
              setTimeout(() => setToast(""), 2000);
              if (loadProducts) await loadProducts();
            } catch {
              setToast("Error al eliminar");
              setTimeout(() => setToast(""), 2000);
            }
          },
        },
      ]
    );
  };

  const openEditSaleModal = (s: Sale) => {
    setEditingSale(s);
    setEditNote(s.note || "");
    const firstPay = s.payments?.[0];
    setEditMethod(firstPay?.method || "cash");
    setEditTransferDetail(firstPay?.detail || TRANSFER_SUBTYPES[0]);
  };

  const saveEditSale = async () => {
    if (!editingSale) return;
    try {
      const newPayments = [
        {
          method: editMethod,
          amount: editingSale.total,
          detail: editMethod === "transfer" ? editTransferDetail : undefined,
        },
      ];

      if (updateSale) {
        await updateSale(editingSale.id, {
          note: editNote.trim() || undefined,
          payments: newPayments,
        });
      }
      setEditingSale(null);
      setToast("Venta actualizada");
      setTimeout(() => setToast(""), 2000);
      if (loadSales) loadSales();
    } catch {
      Alert.alert("Error", "No se pudo actualizar la venta.");
    }
  };

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

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    const d = toLocalDate(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${formatLocalDate(d)} · ${formatLocalTime(d)}`;
  };

  // Formato exacto DD/MM/YYYY - HH:mm para el encabezado del detalle de venta.
  const formatFullDateTime = (dateStr?: string) => {
    if (!dateStr) return "";
    const d = toLocalDate(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} - ${hh}:${min}`;
  };

  // Efectivo/Transferencia (con su subtipo) o "Mixto" cuando la venta se
  // repartió entre más de un método de pago.
  const getPaymentLabel = (s: Sale) => {
    if (!s.payments || s.payments.length === 0) return "—";
    if (s.payments.length > 1) return "Mixto";
    const p = s.payments[0];
    return p.method === "cash" ? "Efectivo" : p.detail || "Transferencia";
  };

  const mixedCash = parseFloat(cashAmt) || 0;
  const mixedTransfer = Math.max(0, Math.round((total - mixedCash) * 100) / 100);

  return (
    <View style={{ flex: 1, backgroundColor: COBALT_UI.screenBg }}>
      <TopBar title="Punto de Venta" />
      <View style={{ paddingHorizontal: SPACING.lg }}>
        <Field
          icon="search"
          placeholder="Buscar artículo..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catalogCategoryBar}
        >
          <Pressable
            onPress={() => setCatalogCategory("all")}
            style={[
              styles.catalogCategoryChip,
              { backgroundColor: catalogCategory === "all" ? COBALT_UI.primary : "#F1F5F9" },
            ]}
          >
            <Text
              style={{
                fontFamily: FONTS.bold,
                fontSize: FONT_SIZE.sm,
                color: catalogCategory === "all" ? "#FFFFFF" : "#64748B",
              }}
            >
              Todos
            </Text>
          </Pressable>
          {categories.map((c) => {
            const active = catalogCategory === c;
            return (
              <Pressable
                key={c}
                onPress={() => setCatalogCategory(c)}
                style={[
                  styles.catalogCategoryChip,
                  { backgroundColor: active ? COBALT_UI.primary : "#F1F5F9" },
                ]}
              >
                <Text
                  style={{
                    fontFamily: FONTS.bold,
                    fontSize: FONT_SIZE.sm,
                    color: active ? "#FFFFFF" : "#64748B",
                  }}
                >
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: SPACING["2xl"] }} />
      ) : (
        <KeyboardAwareScrollView
          contentContainerStyle={{
            padding: SPACING.lg,
            paddingTop: SPACING.sm,
            paddingBottom: 220,
            gap: SPACING.md,
          }}
          bottomOffset={200}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.section, { color: COBALT_UI.titleColor }]}>Artículos</Text>
          {consolidatedProducts.length === 0 ? (
            <EmptyState
              variant="box"
              title="Sin productos"
              subtitle="Agrega productos en Inventario para venderlos."
            />
          ) : (
            <View style={{ gap: SPACING.sm }}>
              {filtered.map((p: any) => {
                const expiry =
                  p.is_perishable && p.nearest_expiry_date
                    ? getExpiryStatus(p.nearest_expiry_date, p.is_perishable)
                    : null;
                return (
                  <Pressable key={p.name} onPress={() => addToCart(p)}>
                    <Card style={styles.productRow}>
                      <View style={styles.productIconBox}>
                        <Feather name="tag" size={18} color={COBALT_UI.primary} />
                      </View>

                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.productName} numberOfLines={1}>
                          {p.name}
                        </Text>
                        {p.category ? (
                          <Text style={styles.productSubtitle} numberOfLines={1}>
                            {p.category}
                          </Text>
                        ) : null}
                        {expiry ? (
                          <Text
                            style={[styles.productSubtitle, { color: expiry.color || COBALT_UI.subtitleColor }]}
                            numberOfLines={1}
                          >
                            {expiry.level === "green"
                              ? `Vence: ${formatExpiryDateShort(p.nearest_expiry_date)} · ${p.nearest_expiry_qty} unid.`
                              : `${expiry.label} · ${p.nearest_expiry_qty} unid.`}
                          </Text>
                        ) : null}
                        <Text
                          style={[
                            styles.productStock,
                            { color: p.stock <= 0 ? COBALT_UI.error : COBALT_UI.subtitleColor },
                          ]}
                        >
                          {p.stock <= 0 ? "Sin stock" : `Stock: ${p.stock}`}
                        </Text>
                      </View>

                      <View style={styles.productRight}>
                        <Text style={styles.productPrice}>{formatMoney(Number(p.price) || 0, cur, 2)}</Text>
                        <View style={styles.addPill}>
                          <Feather name="plus" size={16} color="#FFFFFF" />
                        </View>
                      </View>
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text
            style={[styles.section, { color: colors.onSurface, marginTop: SPACING.md }]}
          >
            Carrito ({cart.length})
          </Text>
          {cart.length === 0 ? (
            <Card>
              <Text style={[styles.emptyCart, { color: colors.onSurfaceTertiary }]}>
                Toca un artículo para agregarlo
              </Text>
            </Card>
          ) : (
            cart.map((it, idx) => (
              <Card key={idx}>
                <View style={styles.cartRow}>
                  <Text
                    style={[styles.cartName, { color: colors.onSurface }]}
                    numberOfLines={1}
                  >
                    {it.name}
                  </Text>
                  <Pressable onPress={() => removeItem(idx)} hitSlop={8}>
                    <Feather name="trash-2" size={18} color={colors.error} />
                  </Pressable>
                </View>
                <View style={styles.cartControls}>
                  <View style={styles.qtyRow}>
                    <IconButton
                      icon="minus"
                      size={34}
                      onPress={() => updateItem(idx, { qty: Math.max(1, it.qty - 1) })}
                    />
                    <Text style={[styles.qtyText, { color: colors.onSurface }]}>
                      {it.qty}
                    </Text>
                    <IconButton
                      icon="plus"
                      size={34}
                      onPress={() => updateItem(idx, { qty: it.qty + 1 })}
                    />
                  </View>
                  <View style={styles.priceEdit}>
                    <Text
                      style={[
                        styles.priceEditLabel,
                        { color: colors.onSurfaceTertiary },
                      ]}
                    >
                      Precio c/u
                    </Text>
                    <Field
                      keyboardType="numeric"
                      value={String(it.unit_price)}
                      onChangeText={(v) => {
                        const val = parseFloat(v);
                        updateItem(idx, { unit_price: isNaN(val) ? 0 : val });
                      }}
                      containerStyle={{ width: 110 }}
                    />
                  </View>
                </View>
                <Text
                  style={[styles.lineTotal, { color: colors.onSurfaceTertiary }]}
                >
                  Subtotal: {formatMoney((Number(it.unit_price) || 0) * (Number(it.qty) || 0), cur, 2)}
                </Text>
              </Card>
            ))
          )}

          {cart.length > 0 ? (
            <>
              <Field
                label="Nota de venta (opcional)"
                placeholder="Ej: Cliente frecuente, pedido especial..."
                value={saleNote}
                onChangeText={setSaleNote}
              />
              <Text
                style={[styles.section, { color: colors.onSurface, marginTop: SPACING.xs }]}
              >
                Método de pago
              </Text>
              <Segmented
                options={[
                  { key: "cash", label: "Efectivo" },
                  { key: "transfer", label: "Transfer." },
                  { key: "mixed", label: "Mixto" },
                ]}
                value={method}
                onChange={setMethod}
              />
              {method !== "cash" ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: SPACING.sm, paddingVertical: 2 }}
                >
                  {TRANSFER_SUBTYPES.map((s) => {
                    const active = s === transferDetail;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => setTransferDetail(s)}
                        style={[
                          styles.tChip,
                          {
                            backgroundColor: active ? colors.brand : colors.surfaceTertiary,
                            borderColor: active ? colors.brand : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? colors.onBrand : colors.onSurfaceTertiary,
                            fontFamily: FONTS.medium,
                            fontSize: FONT_SIZE.sm,
                          }}
                        >
                          {s}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
              {method === "mixed" ? (
                <Card>
                  <Field
                    label={`Efectivo (${cur})`}
                    keyboardType="numeric"
                    placeholder="0"
                    value={cashAmt}
                    onChangeText={setCashAmt}
                  />
                  <View style={{ height: SPACING.md }} />
                  <View style={styles.mixedRow}>
                    <Text
                      style={[
                        styles.priceEditLabel,
                        { color: colors.onSurfaceTertiary },
                      ]}
                    >
                      Por transferencia
                    </Text>
                    <Text
                      style={[styles.cartName, { color: colors.brandSecondary }]}
                    >
                      {formatMoney(mixedTransfer, cur, 2)}
                    </Text>
                  </View>
                </Card>
              ) : null}
            </>
          ) : null}

          <View style={{ gap: SPACING.sm, marginTop: SPACING.xl }}>
            <Text style={[styles.section, { color: colors.onSurface }]}>
              Historial de Ventas
            </Text>

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
              ].map((f) => {
                const active = dateFilter === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setDateFilter(f.key as DateFilter)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active ? colors.brand : colors.surfaceSecondary,
                        borderColor: active ? colors.brand : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? colors.onBrand : colors.onSurfaceTertiary,
                        fontFamily: FONTS.medium,
                        fontSize: FONT_SIZE.xs,
                      }}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => setRangeModal(true)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: dateFilter === "custom" ? colors.brand : colors.surfaceSecondary,
                    borderColor: dateFilter === "custom" ? colors.brand : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: dateFilter === "custom" ? colors.onBrand : colors.onSurfaceTertiary,
                    fontFamily: FONTS.medium,
                    fontSize: FONT_SIZE.xs,
                  }}
                >
                  {dateFilter === "custom" && startDate ? `📅 ${startDate.slice(5)} al ${endDate.slice(5)}` : "📅 Rango"}
                </Text>
              </Pressable>
            </ScrollView>

            {categories.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: SPACING.xs }}
              >
                <Pressable
                  onPress={() => setCategoryFilter("all")}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        categoryFilter === "all" ? colors.brandSecondary : colors.surfaceSecondary,
                      borderColor:
                        categoryFilter === "all" ? colors.brandSecondary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        categoryFilter === "all" ? colors.onBrandSecondary : colors.onSurfaceTertiary,
                      fontFamily: FONTS.medium,
                      fontSize: FONT_SIZE.xs,
                    }}
                  >
                    Todas las categorías
                  </Text>
                </Pressable>
                {categories.map((c) => {
                  const active = categoryFilter === c;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setCategoryFilter(c)}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: active ? colors.brandSecondary : colors.surfaceSecondary,
                          borderColor: active ? colors.brandSecondary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: active ? colors.onBrandSecondary : colors.onSurfaceTertiary,
                          fontFamily: FONTS.medium,
                          fontSize: FONT_SIZE.xs,
                        }}
                      >
                        {c}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <Field
              icon="search"
              placeholder="Buscar en historial de ventas..."
              value={historySearch}
              onChangeText={setHistorySearch}
            />

            {filteredSalesHistory.length === 0 ? (
              <Card>
                <Text style={[styles.emptyCart, { color: colors.onSurfaceTertiary }]}>
                  No hay ventas registradas con los filtros seleccionados.
                </Text>
              </Card>
            ) : (
              filteredSalesHistory.map((s) => (
                <Pressable key={s.id} onPress={() => setDetailSale(s)}>
                  <Card style={styles.saleCard}>
                    <View style={styles.saleTopRow}>
                      <View style={{ flex: 1, gap: 6 }}>
                        {s.items.map((it, idx) => (
                          <View key={idx} style={styles.saleItemRow}>
                            <Text style={styles.saleItemName} numberOfLines={1}>
                              {it.name} (x{it.qty})
                            </Text>
                            <Text style={styles.saleItemUnit}>{formatMoney(it.unit_price, cur, 2)} c/u</Text>
                          </View>
                        ))}
                      </View>

                      <View style={styles.saleRight}>
                        <Text style={styles.saleTotal}>{formatMoney(s.total, cur, 2)}</Text>
                        <View style={styles.paymentChip}>
                          <Text style={styles.paymentChipText}>{getPaymentLabel(s)}</Text>
                        </View>
                      </View>
                    </View>

                    {s.note ? <Text style={styles.saleNote}>📝 {s.note}</Text> : null}

                    <View style={styles.saleFooterRow}>
                      <Text style={styles.saleDate}>📅 {formatDate(s.created_at)}</Text>
                      <View style={{ flexDirection: "row", gap: 14 }}>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation?.();
                            openEditSaleModal(s);
                          }}
                          hitSlop={8}
                        >
                          <Feather name="edit-2" size={16} color={COBALT_UI.primary} />
                        </Pressable>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation?.();
                            confirmDeleteSale(s.id);
                          }}
                          hitSlop={8}
                        >
                          <Feather name="trash-2" size={16} color={COBALT_UI.error} />
                        </Pressable>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              ))
            )}
          </View>
        </KeyboardAwareScrollView>
      )}

      {/* Modal: Calendario Interactivo con Año Deslizable */}
      <Modal visible={rangeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.section, { color: colors.onSurface, marginBottom: SPACING.xs }]}>
              Filtrar por Calendario
            </Text>

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
                {MONTH_NAMES[calMonth]}
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
                onPress={() => {
                  setDateFilter("all");
                  setRangeModal(false);
                }}
                style={[styles.modalBtn, { backgroundColor: colors.surfaceSecondary }]}
              >
                <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.bold }}>
                  Limpiar
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setDateFilter("custom");
                  setRangeModal(false);
                }}
                style={[styles.modalBtn, { backgroundColor: colors.brand }]}
              >
                <Text style={{ color: colors.onBrand, fontFamily: FONTS.bold }}>Aplicar Filtro</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de edición de venta */}
      <Modal visible={!!editingSale} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.section, { color: colors.onSurface, marginBottom: SPACING.xs }]}>
              Editar Venta
            </Text>

            <View style={{ gap: SPACING.xs }}>
              <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Método de pago</Text>
              <View style={styles.methodRow}>
                <MethodBtn
                  label="Efectivo"
                  icon="dollar-sign"
                  active={editMethod === "cash"}
                  onPress={() => setEditMethod("cash")}
                  colors={colors}
                />
                <MethodBtn
                  label="Transferencia"
                  icon="credit-card"
                  active={editMethod === "transfer"}
                  onPress={() => setEditMethod("transfer")}
                  colors={colors}
                />
              </View>
            </View>

            {editMethod === "transfer" ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: SPACING.xs, paddingVertical: 4 }}
              >
                {TRANSFER_SUBTYPES.map((s) => {
                  const active = s === editTransferDetail;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setEditTransferDetail(s)}
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
                          color: active ? colors.onBrand : colors.onSurfaceTertiary,
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
            ) : null}

            <Field
              label="Nota de venta"
              placeholder="Detalle..."
              value={editNote}
              onChangeText={setEditNote}
            />

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setEditingSale(null)}
                style={[styles.modalBtn, { backgroundColor: colors.surfaceSecondary }]}
              >
                <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.bold }}>
                  Cancelar
                </Text>
              </Pressable>
              <Pressable
                onPress={saveEditSale}
                style={[styles.modalBtn, { backgroundColor: colors.brand }]}
              >
                <Text style={{ color: colors.onBrand, fontFamily: FONTS.bold }}>Guardar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de detalle de transacción */}
      <Modal visible={!!detailSale} transparent animationType="fade" onRequestClose={() => setDetailSale(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.detailModalBox}>
            <View style={styles.detailHeader}>
              <View>
                <Text style={styles.detailTitle}>
                  Venta #{detailSale ? detailSale.id.slice(-6).toUpperCase() : ""}
                </Text>
                <Text style={styles.detailSubtitle}>{formatFullDateTime(detailSale?.created_at)}</Text>
              </View>
              <Pressable onPress={() => setDetailSale(null)} hitSlop={8}>
                <Feather name="x" size={22} color={COBALT_UI.subtitleColor} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              <View style={styles.detailTableHeader}>
                <Text style={[styles.detailTableHeaderText, { flex: 2 }]}>Producto</Text>
                <Text style={[styles.detailTableHeaderText, { width: 34, textAlign: "center" }]}>Cant.</Text>
                <Text style={[styles.detailTableHeaderText, { width: 66, textAlign: "right" }]}>P. Unit.</Text>
                <Text style={[styles.detailTableHeaderText, { width: 72, textAlign: "right" }]}>Subtotal</Text>
              </View>
              {(detailSale?.items || []).map((it, idx) => (
                <View key={idx} style={styles.detailItemRow}>
                  <Text style={[styles.detailItemText, { flex: 2 }]} numberOfLines={1}>
                    {it.name}
                  </Text>
                  <Text style={[styles.detailItemText, { width: 34, textAlign: "center" }]}>{it.qty}</Text>
                  <Text style={[styles.detailItemText, { width: 66, textAlign: "right" }]}>
                    {formatMoney(it.unit_price, cur, 2)}
                  </Text>
                  <Text style={[styles.detailItemTextBold, { width: 72, textAlign: "right" }]}>
                    {formatMoney((Number(it.qty) || 0) * (Number(it.unit_price) || 0), cur, 2)}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.detailDivider} />

            <View style={{ gap: 6 }}>
              <Text style={styles.detailSectionLabel}>Pago</Text>
              {detailSale && detailSale.payments.length > 1
                ? detailSale.payments.map((p, idx) => (
                    <View key={idx} style={styles.detailPayRow}>
                      <Text style={styles.detailPayLabel}>
                        {p.method === "cash" ? "Monto en Efectivo" : "Monto en Transferencia"}
                      </Text>
                      <Text style={styles.detailPayValue}>{formatMoney(p.amount, cur, 2)}</Text>
                    </View>
                  ))
                : detailSale && detailSale.payments.length === 1
                ? (
                    <View style={styles.detailPayRow}>
                      <Text style={styles.detailPayLabel}>
                        {detailSale.payments[0].method === "cash"
                          ? "Efectivo"
                          : detailSale.payments[0].detail || "Transferencia"}
                      </Text>
                      <Text style={styles.detailPayValue}>{formatMoney(detailSale.payments[0].amount, cur, 2)}</Text>
                    </View>
                  )
                : null}
            </View>

            <View style={styles.detailTotalBox}>
              <Text style={styles.detailTotalLabel}>Total Final</Text>
              <Text style={styles.detailTotalValue}>{formatMoney(detailSale?.total || 0, cur, 2)}</Text>
            </View>
          </View>
        </View>
      </Modal>

      {toast ? (
        <View
          style={[
            styles.toast,
            { backgroundColor: colors.onSurface, bottom: insets.bottom + 90 },
          ]}
        >
          <Text style={[styles.toastText, { color: colors.surface }]}>{toast}</Text>
        </View>
      ) : null}

      {cart.length > 0 ? (
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          <View
            style={[
              styles.checkout,
              {
                backgroundColor: colors.surfaceSecondary,
                borderTopColor: colors.border,
                paddingBottom: insets.bottom + SPACING.sm,
              },
            ]}
          >
            <View style={styles.checkoutInner}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.totalLabel, { color: colors.onSurfaceTertiary }]}>
                  Total
                </Text>
                <Text style={[styles.totalValue, { color: colors.onSurface }]}>
                  {formatMoney(total, cur, 2)}
                </Text>
              </View>
              <Pressable
                onPress={onCheckout}
                disabled={processing}
                style={[
                  styles.cobrarBtn,
                  { backgroundColor: colors.brand, opacity: processing ? 0.6 : 1 },
                ]}
              >
                {processing ? (
                  <ActivityIndicator color={colors.onBrand} />
                ) : (
                  <>
                    <Feather name="check-circle" size={20} color={colors.onBrand} />
                    <Text style={[styles.cobrarText, { color: colors.onBrand }]}>Cobrar</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardStickyView>
      ) : null}
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
          backgroundColor: active ? colors.brandTertiary : colors.surfaceTertiary,
          borderColor: active ? colors.brand : colors.border,
        },
      ]}
    >
      <Feather name={icon} size={16} color={active ? colors.brand : colors.onSurfaceTertiary} />
      <Text
        style={{
          color: active ? colors.onBrandTertiary : colors.onSurfaceTertiary,
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
  label: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, marginLeft: 2 },
  section: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  catalogCategoryBar: {
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    alignItems: "center",
  },
  catalogCategoryChip: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    borderRadius: 18,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  productIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  productName: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, fontWeight: "700", color: COBALT_UI.titleColor },
  productSubtitle: { fontFamily: FONTS.medium, fontSize: 13, color: COBALT_UI.subtitleColor },
  productStock: { fontFamily: FONTS.medium, fontSize: 13 },
  productRight: { alignItems: "flex-end", gap: SPACING.sm },
  productPrice: { fontFamily: FONTS.black, fontSize: 18, fontWeight: "800", color: COBALT_UI.primary },
  addPill: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.pill,
    backgroundColor: COBALT_UI.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCart: {
    fontFamily: FONTS.medium,
    fontSize: FONT_SIZE.base,
    textAlign: "center",
    paddingVertical: SPACING.md,
  },
  cartRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cartName: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg, flex: 1 },
  cartControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: SPACING.sm,
  },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  qtyText: { fontFamily: FONTS.black, fontSize: FONT_SIZE.xl, minWidth: 24, textAlign: "center" },
  priceEdit: { gap: 2 },
  priceEditLabel: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm },
  lineTotal: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, marginTop: SPACING.sm },
  mixedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  checkout: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: SPACING.sm,
  },
  checkoutInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: SPACING.md,
  },
  totalLabel: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base },
  totalValue: { fontFamily: FONTS.black, fontSize: FONT_SIZE["2xl"] },
  cobrarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    height: 54,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING["2xl"],
    minWidth: 150,
  },
  cobrarText: { fontFamily: FONTS.black, fontSize: FONT_SIZE.lg },
  tChip: {
    flexShrink: 0,
    height: 34,
    paddingHorizontal: SPACING.md,
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
  yearChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
  saleCard: {
    gap: 8,
    borderRadius: 18,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  saleTopRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.md },
  saleItemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACING.sm },
  saleItemName: { flex: 1, fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, fontWeight: "700", color: COBALT_UI.titleColor },
  saleItemUnit: { fontFamily: FONTS.medium, fontSize: 12, color: COBALT_UI.subtitleColor },
  saleRight: { alignItems: "flex-end", gap: 6 },
  saleTotal: { fontFamily: FONTS.black, fontSize: 18, fontWeight: "800", color: COBALT_UI.titleColor },
  paymentChip: { backgroundColor: "#EEF2FF", borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  paymentChipText: { fontFamily: FONTS.bold, fontSize: 11, color: COBALT_UI.primary },
  saleNote: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, fontStyle: "italic", color: COBALT_UI.subtitleColor },
  saleFooterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  saleDate: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: COBALT_UI.subtitleColor },
  toast: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
    zIndex: 100,
  },
  toastText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  modalContent: { padding: SPACING.xl, borderRadius: RADIUS.lg, gap: SPACING.sm },
  detailModalBox: {
    backgroundColor: COBALT_UI.card,
    borderRadius: 20,
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  detailTitle: { fontFamily: FONTS.black, fontSize: FONT_SIZE.lg, fontWeight: "800", color: COBALT_UI.titleColor },
  detailSubtitle: { fontFamily: FONTS.medium, fontSize: 13, color: COBALT_UI.subtitleColor, marginTop: 2 },
  detailTableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingBottom: 6,
    marginBottom: 4,
  },
  detailTableHeaderText: { fontFamily: FONTS.bold, fontSize: 11, color: COBALT_UI.subtitleColor },
  detailItemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  detailItemText: { fontFamily: FONTS.medium, fontSize: 13, color: COBALT_UI.titleColor },
  detailItemTextBold: { fontFamily: FONTS.bold, fontSize: 13, fontWeight: "700", color: COBALT_UI.titleColor },
  detailDivider: { height: 1, backgroundColor: "#E2E8F0" },
  detailSectionLabel: { fontFamily: FONTS.bold, fontSize: 12, color: COBALT_UI.subtitleColor },
  detailPayRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailPayLabel: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, color: COBALT_UI.titleColor },
  detailPayValue: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, fontWeight: "700", color: COBALT_UI.titleColor },
  detailTotalBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  detailTotalLabel: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, color: COBALT_UI.subtitleColor },
  detailTotalValue: { fontFamily: FONTS.black, fontSize: 20, fontWeight: "800", color: COBALT_UI.titleColor },
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
