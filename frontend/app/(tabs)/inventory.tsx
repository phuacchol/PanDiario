import { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Modal,
  Alert,
  RefreshControl,
  TextInput,
} from "react-native";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Card, Field, StockBadge, InputPrompt } from "@/src/components/ui";
import { TopBar } from "@/src/components/TopBar";
import { EmptyState } from "@/src/components/Mascot";
import { SearchAutoComplete } from "@/src/components/SearchAutoComplete";
import { PAN_ASSETS } from "@/src/constants/mascot";
import { useData, Product, ProductPurchase } from "@/src/context/DataContext";
import { useTaxonomy } from "@/src/context/TaxonomyContext";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatMoney, formatLocalDate, formatLocalTime, toLocalDate } from "@/src/utils/format";
import { getExpiryStatus, formatExpiryDateShort, formatExpiryDateFull } from "@/src/utils/expiry";

type HealthFilter = "all" | "critical" | "warning" | "out" | "expiring";
type InventoryTab = "stock" | "history";

export default function Inventory() {
  const { colors } = useTheme();
  const router = useRouter();
  const {
    products,
    loadProducts,
    purchases,
    loadPurchases,
    deletePurchase,
    updatePurchase,
    sales,
    loadSales,
    discardExpiredBatch,
  } = useData() as any;
  const { inventory, load: loadTax, addInventoryCategory, addInventorySubcategory } = useTaxonomy();
  const { user } = useAuth();
  const cur = user?.currency || "PEN";
  const params = useLocalSearchParams<{ q?: string }>();

  const [activeTab, setActiveTab] = useState<InventoryTab>("stock");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");
  const [sub, setSub] = useState("all");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [prompt, setPrompt] = useState<null | "cat" | "sub">(null);
  const [replenishModal, setReplenishModal] = useState(false);
  const [replenishDays, setReplenishDays] = useState<15 | 30>(15);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyCat, setHistoryCat] = useState("all");
  const [selectedPurchase, setSelectedPurchase] = useState<(ProductPurchase & { category: string }) | null>(null);
  const [editingPurchaseNote, setEditingPurchaseNote] = useState(false);
  const [purchaseNoteDraft, setPurchaseNoteDraft] = useState("");
  const [discardTarget, setDiscardTarget] = useState<any | null>(null);
  const [discardQtyDraft, setDiscardQtyDraft] = useState("");
  const [discarding, setDiscarding] = useState(false);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadProducts ? loadProducts() : Promise.resolve(),
      loadPurchases ? loadPurchases() : Promise.resolve(),
      loadTax ? loadTax() : Promise.resolve(),
      loadSales ? loadSales() : Promise.resolve(),
    ]).finally(() => {
      setLoading(false);
      setRefreshing(false);
    });
  }, [loadProducts, loadPurchases, loadTax, loadSales]);

  useFocusEffect(
    useCallback(() => {
      refreshAll();
    }, [refreshAll])
  );

  useEffect(() => {
    if (params.q) {
      setSearch(String(params.q));
      setCat("all");
      setSub("all");
      setHealthFilter("all");
    }
  }, [params.q]);

  const activeCat = inventory.find((c) => c.name === cat);

  // CONSOLIDACIÓN: Agrupar por nombre sumando stock y tomando el precio/stock mínimo más reciente
  const consolidatedProducts = useMemo(() => {
    const map = new Map<string, any>();
    (products || []).forEach((p: Product) => {
      const cleanName = (p.name || "").trim().toLowerCase();
      if (!map.has(cleanName)) {
        map.set(cleanName, {
          ...p,
          stock: Number(p.stock) || 0,
          ids: [p.id],
          // Producto (id) real dueño del lote más próximo a vencer: la
          // consolidación por nombre puede juntar varias filas/variantes,
          // y el desecho necesita apuntar exactamente a esa fila.
          nearest_expiry_product_id: p.nearest_expiry_date ? p.id : null,
        });
      } else {
        const existing = map.get(cleanName);
        existing.stock += Number(p.stock) || 0;
        existing.ids.push(p.id);
        if (Number(p.price) > 0) {
          existing.price = Number(p.price);
        }
        if (Number(p.cost) > 0) {
          existing.cost = Number(p.cost);
        }
        if (Number(p.min_stock) > 0) {
          existing.min_stock = Number(p.min_stock);
        }
        // Lote más próximo a vencer entre TODAS las filas que comparten
        // nombre (variantes distintas del mismo producto también se
        // consolidan para efectos de alerta de caducidad).
        if (p.is_perishable) existing.is_perishable = true;
        if (
          p.nearest_expiry_date &&
          (!existing.nearest_expiry_date || p.nearest_expiry_date < existing.nearest_expiry_date)
        ) {
          existing.nearest_expiry_date = p.nearest_expiry_date;
          existing.nearest_expiry_qty = p.nearest_expiry_qty;
          existing.nearest_expiry_product_id = p.id;
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase().trim();
    return consolidatedProducts.filter((p: any) => p.name.toLowerCase().includes(q));
  }, [search, consolidatedProducts]);

  const velocityMap = useMemo(() => {
    const map = new Map<string, number>();
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    (sales || []).forEach((s: any) => {
      const sDate = s.created_at ? new Date(s.created_at) : new Date();
      if (sDate >= fourteenDaysAgo) {
        (s.items || []).forEach((it: any) => {
          const key = it.name ? it.name.trim().toLowerCase() : (it.product_id || "");
          const current = map.get(key) || 0;
          map.set(key, current + (Number(it.qty) || 0));
        });
      }
    });

    const dailyMap = new Map<string, number>();
    map.forEach((totalSold, key) => {
      dailyMap.set(key, totalSold / 14);
    });

    return dailyMap;
  }, [sales]);

  const productsWithHealth = useMemo(() => {
    return consolidatedProducts.map((p: any) => {
      const cleanKey = p.name ? p.name.trim().toLowerCase() : p.id;
      const dailySales = velocityMap.get(cleanKey) || velocityMap.get(p.id) || 0;
      let daysLeft: number | null = null;
      let status: "out" | "critical" | "warning" | "optimal" = "optimal";

      if (p.stock <= 0) {
        status = "out";
        daysLeft = 0;
      } else if (dailySales > 0) {
        daysLeft = Math.round(p.stock / dailySales);
        if (daysLeft <= 3 || p.stock <= p.min_stock) {
          status = "critical";
        } else if (daysLeft <= 7) {
          status = "warning";
        }
      } else if (p.stock <= p.min_stock) {
        status = "critical";
      }

      const expiry = getExpiryStatus(p.nearest_expiry_date, p.is_perishable);

      return {
        ...p,
        dailySales,
        daysLeft,
        healthStatus: status,
        expiryLevel: expiry.level,
        expiryLabel: expiry.label,
        expiryColor: expiry.color,
        expiryDaysLeft: expiry.daysLeft,
      };
    });
  }, [consolidatedProducts, velocityMap]);

  const criticalCount = useMemo(
    () => productsWithHealth.filter((p: any) => p.healthStatus === "critical" || p.healthStatus === "out").length,
    [productsWithHealth]
  );

  const expiringCount = useMemo(
    () => productsWithHealth.filter((p: any) => p.is_perishable && !!p.nearest_expiry_date).length,
    [productsWithHealth]
  );
  const warningCount = useMemo(
    () => productsWithHealth.filter((p: any) => p.healthStatus === "warning").length,
    [productsWithHealth]
  );

  const replenishmentList = useMemo(() => {
    return productsWithHealth
      .map((p: any) => {
        const targetUnits = Math.ceil((p.dailySales || 0.5) * replenishDays);
        const needed = Math.max(0, targetUnits - p.stock);
        const estimatedCost = needed * (p.cost || 0);
        return {
          ...p,
          needed,
          estimatedCost,
        };
      })
      .filter((p: any) => p.needed > 0);
  }, [productsWithHealth, replenishDays]);

  const totalReplenishCost = useMemo(
    () => replenishmentList.reduce((acc: number, item: any) => acc + item.estimatedCost, 0),
    [replenishmentList]
  );

  const totalPurchasedAmount = useMemo(
    () => (purchases || []).reduce((acc: number, item: any) => acc + (Number(item.total_cost) || 0), 0),
    [purchases]
  );
  const totalPurchasedUnits = useMemo(
    () => (purchases || []).reduce((acc: number, item: any) => acc + (Number(item.qty) || 0), 0),
    [purchases]
  );

  // Categoría de cada ingreso, resuelta a partir del producto vigente (por
  // id, con el nombre como respaldo) — la compra en sí no guarda categoría.
  const purchasesWithCategory = useMemo(() => {
    const byId = new Map<string, string>();
    const byName = new Map<string, string>();
    (products || []).forEach((p: Product) => {
      const category = p.category || "General";
      byId.set(p.id, category);
      byName.set((p.name || "").trim().toLowerCase(), category);
    });

    return (purchases || []).map((item: ProductPurchase) => ({
      ...item,
      category:
        (item.product_id && byId.get(item.product_id)) ||
        byName.get((item.product_name || "").trim().toLowerCase()) ||
        "General",
    }));
  }, [purchases, products]);

  const purchaseCategories = useMemo(() => {
    const set = new Set<string>();
    purchasesWithCategory.forEach((item: any) => set.add(item.category));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [purchasesWithCategory]);

  const filteredPurchases = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return purchasesWithCategory.filter((item: any) => {
      const matchCat = historyCat === "all" || item.category === historyCat;
      const matchSearch =
        !q ||
        (item.product_name || "").toLowerCase().includes(q) ||
        (item.note || "").toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [purchasesWithCategory, historySearch, historyCat]);

  const filtered = useMemo(() => {
    const base = productsWithHealth.filter((p: any) => {
      const matchCat = cat === "all" || p.category === cat;
      const matchSub = sub === "all" || p.subcategory === sub;
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());

      if (healthFilter === "expiring") {
        return matchCat && matchSub && matchSearch && p.is_perishable && !!p.nearest_expiry_date;
      }

      const matchHealth =
        healthFilter === "all" ||
        (healthFilter === "critical" && (p.healthStatus === "critical" || p.healthStatus === "out")) ||
        (healthFilter === "warning" && p.healthStatus === "warning") ||
        (healthFilter === "out" && p.healthStatus === "out");

      return matchCat && matchSub && matchSearch && matchHealth;
    });

    // "Próximos a vencerse": orden cronológico estricto ascendente, los
    // críticos/vencidos primero hasta los de vencimiento más lejano.
    if (healthFilter === "expiring") {
      return [...base].sort((a: any, b: any) => (a.nearest_expiry_date || "").localeCompare(b.nearest_expiry_date || ""));
    }

    return base;
  }, [productsWithHealth, cat, sub, search, healthFilter]);

  const handleDeletePurchase = (purchaseId: string, prodName: string) => {
    Alert.alert(
      "Eliminar registro de ingreso",
      `¿Deseas eliminar este ingreso de "${prodName}"? El stock agregado será descontado automáticamente de tu inventario.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar y descontar",
          style: "destructive",
          onPress: async () => {
            await deletePurchase(purchaseId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            if (loadProducts) await loadProducts();
            if (loadPurchases) await loadPurchases();
          },
        },
      ]
    );
  };

  const onConfirmDiscard = async () => {
    if (!discardTarget) return;
    const qty = parseFloat(discardQtyDraft) || 0;
    if (qty <= 0) return;

    setDiscarding(true);
    try {
      if (discardExpiredBatch) {
        await discardExpiredBatch({
          product_id: discardTarget.nearest_expiry_product_id || discardTarget.id,
          product_name: discardTarget.name,
          expiry_date: discardTarget.nearest_expiry_date,
          quantity: qty,
          unit_cost: Number(discardTarget.cost) || 0,
          note: "Descarte por vencimiento",
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setDiscardTarget(null);
      if (loadProducts) await loadProducts();
    } finally {
      setDiscarding(false);
    }
  };

  const formatDate = (dateStr?: string, detailed?: boolean) => {
    if (!dateStr) return "";
    const d = toLocalDate(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${formatLocalDate(d, { withYear: detailed })} · ${formatLocalTime(d, { seconds: detailed })}`;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <TopBar title="Inventario" mascotSource={PAN_ASSETS.warehouse} />

      {/* Pestañas Superiores */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => setActiveTab("stock")}
          style={[
            styles.tabItem,
            activeTab === "stock" && { borderBottomColor: colors.brand, borderBottomWidth: 3 },
          ]}
        >
          <Feather
            name="package"
            size={16}
            color={activeTab === "stock" ? colors.brand : colors.onSurfaceTertiary}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === "stock" ? colors.brand : colors.onSurfaceTertiary },
            ]}
          >
            En Stock ({consolidatedProducts.length})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("history")}
          style={[
            styles.tabItem,
            activeTab === "history" && { borderBottomColor: colors.brand, borderBottomWidth: 3 },
          ]}
        >
          <Feather
            name="clock"
            size={16}
            color={activeTab === "history" ? colors.brand : colors.onSurfaceTertiary}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === "history" ? colors.brand : colors.onSurfaceTertiary },
            ]}
          >
            Historial de Ingresos ({purchases?.length || 0})
          </Text>
        </Pressable>
      </View>

      {activeTab === "stock" ? (
        <>
          <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.xs, paddingTop: SPACING.xs }}>
            <Field
              icon="search"
              placeholder="Buscar producto..."
              value={search}
              onChangeText={(text) => {
                setSearch(text);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              testID="inventory-search"
            />

            <SearchAutoComplete
              query={search}
              suggestions={suggestions}
              onSelect={(item) => {
                setSearch(item.name);
                setShowSuggestions(false);
              }}
              currency={cur}
              visible={showSuggestions}
            />

            {criticalCount > 0 || warningCount > 0 ? (
              <Card
                style={[
                  styles.alertCard,
                  {
                    borderColor:
                      criticalCount > 0 ? colors.error || "#EF4444" : colors.warning || "#F59E0B",
                  },
                ]}
              >
                <View style={styles.alertHeaderRow}>
                  <View style={styles.alertInfoGroup}>
                    <Feather
                      name="alert-triangle"
                      size={20}
                      color={criticalCount > 0 ? colors.error || "#EF4444" : colors.warning || "#F59E0B"}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.alertTitle, { color: colors.onSurface }]}>
                        {criticalCount > 0
                          ? `${criticalCount} producto(s) necesitan reposición urgente`
                          : `${warningCount} producto(s) con stock por agotarse`}
                      </Text>
                      <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: colors.onSurfaceTertiary }}>
                        Basado en tus ventas de los últimos 14 días.
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => setReplenishModal(true)}
                    style={[styles.replenishBtn, { backgroundColor: colors.brandSecondary }]}
                  >
                    <Feather name="shopping-bag" size={14} color="#FFF" />
                    <Text style={styles.replenishBtnText}>Sugerir Compras</Text>
                  </Pressable>
                </View>
              </Card>
            ) : null}
          </View>

          {/* Filtros de Estado */}
          <View style={{ height: 40, justifyContent: "center", marginTop: SPACING.xs }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowPad}>
              <Chip
                label="Todos los estados"
                small
                active={healthFilter === "all"}
                onPress={() => setHealthFilter("all")}
                colors={colors}
              />
              <Chip
                label={`🚨 Urgentes (${criticalCount})`}
                small
                active={healthFilter === "critical"}
                onPress={() => setHealthFilter("critical")}
                colors={colors}
              />
              <Chip
                label={`⚠️ Por agotar (${warningCount})`}
                small
                active={healthFilter === "warning"}
                onPress={() => setHealthFilter("warning")}
                colors={colors}
              />
              <Chip
                label={`⏳ Próximos a vencerse (${expiringCount})`}
                small
                active={healthFilter === "expiring"}
                onPress={() => setHealthFilter("expiring")}
                colors={colors}
              />
            </ScrollView>
          </View>

          {/* Categorías Principales */}
          <View style={{ height: 48, justifyContent: "center" }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowPad}>
              <Chip
                label="Todos"
                active={cat === "all"}
                onPress={() => {
                  setCat("all");
                  setSub("all");
                }}
                colors={colors}
                testID="invcat-all"
              />
              {inventory.map((c) => (
                <Chip
                  key={c.name}
                  label={c.name}
                  active={cat === c.name}
                  onPress={() => {
                    setCat(c.name);
                    setSub("all");
                  }}
                  colors={colors}
                  testID={`invcat-${c.name}`}
                />
              ))}
              <AddChip onPress={() => setPrompt("cat")} colors={colors} testID="invcat-add" />
            </ScrollView>
          </View>

          {/* Subcategorías */}
          {activeCat ? (
            <View style={{ height: 40, justifyContent: "center" }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowPad}>
                <Chip
                  label="Todas"
                  small
                  active={sub === "all"}
                  onPress={() => setSub("all")}
                  colors={colors}
                  testID="invsub-all"
                />
                {activeCat.subcategories.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    small
                    active={sub === s}
                    onPress={() => setSub(s)}
                    colors={colors}
                    testID={`invsub-${s}`}
                  />
                ))}
                <AddChip small onPress={() => setPrompt("sub")} colors={colors} testID="invsub-add" />
              </ScrollView>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: SPACING["2xl"] }} />
          ) : filtered.length === 0 ? (
            <EmptyState
              variant="box"
              title={consolidatedProducts.length === 0 ? "Tu inventario está vacío" : "Sin resultados"}
              subtitle={
                consolidatedProducts.length === 0
                  ? "¡Agrega tus productos estrella!"
                  : "Prueba con otra búsqueda o categoría."
              }
            >
              {consolidatedProducts.length === 0 ? (
                <Pressable
                  onPress={() => router.push("/product-form")}
                  style={[styles.cta, { backgroundColor: colors.brand }]}
                  testID="empty-add-product"
                >
                  <Feather name="plus" size={18} color={colors.onBrand} />
                  <Text style={[styles.ctaText, { color: colors.onBrand }]}>Crear Producto</Text>
                </Pressable>
              ) : null}
            </EmptyState>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(i) => i.id || i.name}
              contentContainerStyle={{
                padding: SPACING.lg,
                paddingTop: SPACING.xs,
                paddingBottom: SPACING["3xl"],
                gap: SPACING.md,
              }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={colors.brand} />}
              renderItem={({ item }) => (
                <Pressable onPress={() => router.push({ pathname: "/product-form", params: { id: item.id } })}>
                  <Card>
                    <View style={styles.prodRow}>
                      <View
                        style={[
                          styles.prodIcon,
                          {
                            backgroundColor:
                              item.healthStatus === "out" || item.healthStatus === "critical"
                                ? (colors.error || "#EF4444") + "18"
                                : item.healthStatus === "warning"
                                ? (colors.warning || "#F59E0B") + "18"
                                : colors.brandTertiary,
                          },
                        ]}
                      >
                        <Feather
                          name="tag"
                          size={20}
                          color={
                            item.healthStatus === "out" || item.healthStatus === "critical"
                              ? colors.error || "#EF4444"
                              : item.healthStatus === "warning"
                              ? colors.warning || "#F59E0B"
                              : colors.brand
                          }
                        />
                      </View>

                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={[styles.prodName, { color: colors.onSurface }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={[styles.prodCat, { color: colors.onSurfaceTertiary }]}>
                          {item.category}
                          {item.subcategory ? ` › ${item.subcategory}` : ""}
                        </Text>

                        <View style={styles.badgeWrap}>
                          <StockBadge stock={item.stock} minStock={item.min_stock} />
                          {item.daysLeft !== null ? (
                            <View
                              style={[
                                styles.daysBadge,
                                {
                                  backgroundColor:
                                    item.daysLeft <= 3
                                      ? (colors.error || "#EF4444") + "18"
                                      : item.daysLeft <= 7
                                      ? (colors.warning || "#F59E0B") + "18"
                                      : colors.surfaceSecondary,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  fontFamily: FONTS.bold,
                                  fontSize: 10,
                                  color:
                                    item.daysLeft <= 3
                                      ? colors.error || "#EF4444"
                                      : item.daysLeft <= 7
                                      ? colors.warning || "#F59E0B"
                                      : colors.onSurfaceTertiary,
                                }}
                              >
                                ⏱️ ~{item.daysLeft} d. de stock
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        {item.is_perishable && item.nearest_expiry_date ? (
                          <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: item.expiryColor || colors.onSurfaceTertiary }}>
                            {item.expiryLevel === "green"
                              ? `Vence: ${formatExpiryDateShort(item.nearest_expiry_date)} · ${item.nearest_expiry_qty} unidades restantes`
                              : `${item.expiryLabel} · Vence: ${formatExpiryDateShort(item.nearest_expiry_date)} · ${item.nearest_expiry_qty} unidades restantes`}
                          </Text>
                        ) : null}
                      </View>

                      <View style={{ alignItems: "flex-end", gap: 6 }}>
                        {item.price_pending || !item.price ? (
                          <View style={[styles.pending, { backgroundColor: (colors.warning || "#F59E0B") + "22" }]}>
                            <Text style={[styles.pendingText, { color: colors.warning || "#F59E0B" }]}>
                              Precio pendiente
                            </Text>
                          </View>
                        ) : (
                          <Text style={[styles.prodPrice, { color: colors.brand }]}>
                            {formatMoney(item.price, cur)}
                          </Text>
                        )}
                        <Text style={[styles.prodStock, { color: colors.onSurfaceTertiary }]}>
                          Stock: <Text style={{ fontFamily: FONTS.bold, color: colors.onSurface }}>{item.stock}</Text>
                        </Text>

                        <View
                          style={[styles.editBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                        >
                          <Feather name="edit-2" size={13} color={colors.brand} />
                          <Text style={[styles.editBtnText, { color: colors.brand }]}>Modificar</Text>
                        </View>

                        {healthFilter === "expiring" && item.nearest_expiry_date ? (
                          <Pressable
                            onPress={(e: any) => {
                              e.stopPropagation?.();
                              setDiscardTarget(item);
                              setDiscardQtyDraft(String(item.nearest_expiry_qty || 0));
                            }}
                            style={[
                              styles.editBtn,
                              { backgroundColor: (colors.error || "#EF4444") + "18", borderColor: colors.error || "#EF4444" },
                            ]}
                            testID={`discard-${item.id}`}
                          >
                            <Feather name="trash-2" size={13} color={colors.error || "#EF4444"} />
                            <Text style={[styles.editBtnText, { color: colors.error || "#EF4444" }]}>Desechar</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </Card>
                </Pressable>
              )}
            />
          )}
        </>
      ) : (
        /* Pestaña: Historial de Compras / Ingresos */
        <>
          <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.xs, paddingTop: SPACING.xs }}>
            <Field
              icon="search"
              placeholder="Buscar por producto o proveedor/nota..."
              value={historySearch}
              onChangeText={setHistorySearch}
              testID="history-search"
            />
          </View>

          {purchaseCategories.length > 1 ? (
            <View style={{ height: 48, justifyContent: "center" }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowPad}>
                <Chip
                  label="Todas las categorías"
                  active={historyCat === "all"}
                  onPress={() => setHistoryCat("all")}
                  colors={colors}
                  testID="historycat-all"
                />
                {purchaseCategories.map((c: string) => (
                  <Chip
                    key={c}
                    label={c}
                    active={historyCat === c}
                    onPress={() => setHistoryCat(c)}
                    colors={colors}
                    testID={`historycat-${c}`}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          <FlatList
            data={filteredPurchases}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={{ padding: SPACING.lg, paddingTop: SPACING.xs, paddingBottom: 100, gap: SPACING.md }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={colors.brand} />}
            ListHeaderComponent={
              (purchases || []).length > 0 ? (
                <View style={styles.capitalRow}>
                  <Card style={[styles.capitalCardHalf, { backgroundColor: colors.brandTertiary, borderColor: colors.brand }]}>
                    <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: colors.onSurfaceTertiary }}>
                      Capital Invertido
                    </Text>
                    <Text
                      style={{ fontFamily: FONTS.black, fontSize: FONT_SIZE.xl, color: colors.brand }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formatMoney(totalPurchasedAmount, cur)}
                    </Text>
                  </Card>
                  <Card style={[styles.capitalCardHalf, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                    <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: colors.onSurfaceTertiary }}>
                      Unidades Ingresadas
                    </Text>
                    <Text
                      style={{ fontFamily: FONTS.black, fontSize: FONT_SIZE.xl, color: colors.onSurface }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {totalPurchasedUnits} unid.
                    </Text>
                  </Card>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <EmptyState
                variant="box"
                title={(purchases || []).length === 0 ? "Sin ingresos registrados" : "Sin resultados"}
                subtitle={
                  (purchases || []).length === 0
                    ? "Los ingresos de mercancía por voz o inventario aparecerán aquí."
                    : "Prueba con otra búsqueda o categoría."
                }
              />
            }
            renderItem={({ item }: { item: ProductPurchase & { category: string } }) => (
              <Pressable onPress={() => setSelectedPurchase(item)} testID="purchase-row">
                <Card>
                  <View style={styles.purchaseRow}>
                    <View style={[styles.purchaseIcon, { backgroundColor: (colors.brand || "#3B82F6") + "18" }]}>
                      <Feather name="download" size={18} color={colors.brand} />
                    </View>

                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.prodName, { color: colors.onSurface }]}>
                        {item.product_name || "Producto sin nombre"}
                      </Text>
                      <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: colors.onSurfaceSecondary }}>
                        +{Number(item.qty) || 0} unid. a {formatMoney(Number(item.unit_cost) || 0, cur)} c/u
                      </Text>
                      {item.note ? (
                        <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: colors.onSurfaceTertiary }} numberOfLines={1}>
                          📝 {item.note}
                        </Text>
                      ) : null}
                      <Text style={{ fontFamily: FONTS.regular, fontSize: 10, color: colors.onSurfaceTertiary }}>
                        📅 {formatDate(item.created_at)}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end", gap: 8 }}>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontFamily: FONTS.regular, fontSize: 10, color: colors.onSurfaceTertiary }}>
                          Total invertido
                        </Text>
                        <Text style={[styles.purchaseTotal, { color: colors.onSurface }]}>
                          {formatMoney(Number(item.total_cost) || 0, cur)}
                        </Text>
                      </View>

                      <Pressable
                        onPress={() => handleDeletePurchase(item.id, item.product_name || "este producto")}
                        hitSlop={8}
                        style={styles.deleteBtn}
                      >
                        <Feather name="trash-2" size={16} color={colors.error || "#EF4444"} />
                      </Pressable>
                    </View>
                  </View>
                </Card>
              </Pressable>
            )}
          />
        </>
      )}

      {/* Botón flotante para agregar producto */}
      <Pressable
        onPress={() => router.push("/product-form")}
        style={[styles.addFab, { backgroundColor: colors.brandSecondary }]}
        testID="add-product-fab"
      >
        <Feather name="plus" size={26} color="#FFF" />
      </Pressable>

      {/* MODAL: SUGERENCIA DE COMPRAS */}
      <Modal visible={replenishModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Sugerencia de Compras</Text>
              <Pressable onPress={() => setReplenishModal(false)} hitSlop={8}>
                <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.xs }}>
              <Pressable
                onPress={() => setReplenishDays(15)}
                style={[
                  styles.daySelector,
                  {
                    backgroundColor: replenishDays === 15 ? colors.brand : colors.surfaceSecondary,
                    borderColor: replenishDays === 15 ? colors.brand : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: replenishDays === 15 ? colors.onBrand : colors.onSurfaceTertiary,
                    fontFamily: FONTS.bold,
                    fontSize: FONT_SIZE.xs,
                  }}
                >
                  Para 15 días
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setReplenishDays(30)}
                style={[
                  styles.daySelector,
                  {
                    backgroundColor: replenishDays === 30 ? colors.brand : colors.surfaceSecondary,
                    borderColor: replenishDays === 30 ? colors.brand : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: replenishDays === 30 ? colors.onBrand : colors.onSurfaceTertiary,
                    fontFamily: FONTS.bold,
                    fontSize: FONT_SIZE.xs,
                  }}
                >
                  Para 30 días
                </Text>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 320, marginTop: SPACING.sm }} showsVerticalScrollIndicator={false}>
              {replenishmentList.length === 0 ? (
                <Text style={{ fontFamily: FONTS.medium, textAlign: "center", color: colors.onSurfaceTertiary, paddingVertical: SPACING.xl }}>
                  ¡Todo tu inventario está abastecido para los próximos {replenishDays} días! 🎉
                </Text>
              ) : (
                replenishmentList.map((item: any) => (
                  <View key={item.id} style={[styles.replenishRow, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.prodName, { color: colors.onSurface, fontSize: FONT_SIZE.base }]}>
                        {item.name}
                      </Text>
                      <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: colors.onSurfaceTertiary }}>
                        Stock actual: {item.stock} · Comprar:{" "}
                        <Text style={{ fontFamily: FONTS.bold, color: colors.brandSecondary }}>+{item.needed} unid.</Text>
                      </Text>
                    </View>
                    <Text style={{ fontFamily: FONTS.black, fontSize: FONT_SIZE.base, color: colors.onSurface }}>
                      {formatMoney(item.estimatedCost, cur)}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={[styles.replenishTotalBox, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, color: colors.onSurfaceTertiary }}>
                Presupuesto estimado de reposición:
              </Text>
              <Text style={{ fontFamily: FONTS.black, fontSize: FONT_SIZE.xl, color: colors.brand }}>
                {formatMoney(totalReplenishCost, cur)}
              </Text>
            </View>

            <Pressable
              onPress={() => setReplenishModal(false)}
              style={[styles.closeModalBtn, { backgroundColor: colors.brand }]}
            >
              <Text style={{ fontFamily: FONTS.bold, color: "#FFF", fontSize: FONT_SIZE.base }}>Entendido</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* MODAL: DETALLE COMPLETO DE UN INGRESO */}
      <Modal
        visible={!!selectedPurchase}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setEditingPurchaseNote(false);
          setSelectedPurchase(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Detalle del Ingreso</Text>
              <Pressable
                onPress={() => {
                  setEditingPurchaseNote(false);
                  setSelectedPurchase(null);
                }}
                hitSlop={8}
                testID="purchase-detail-close"
              >
                <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>

            {selectedPurchase ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.md, paddingBottom: SPACING.sm }}>
                <View style={styles.detailHeaderRow}>
                  <View style={[styles.purchaseIcon, { backgroundColor: (colors.brand || "#3B82F6") + "18" }]}>
                    <Feather name="download" size={20} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.prodName, { color: colors.onSurface, fontSize: FONT_SIZE.lg }]}>
                      {selectedPurchase.product_name || "Producto sin nombre"}
                    </Text>
                    <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: colors.onSurfaceTertiary }}>
                      {selectedPurchase.category || "General"}
                    </Text>
                  </View>
                </View>

                <View style={[styles.detailGrid, { borderColor: colors.border }]}>
                  <DetailRow label="Cantidad ingresada" value={`${Number(selectedPurchase.qty) || 0} unid.`} colors={colors} />
                  <DetailRow label="Costo unitario" value={formatMoney(Number(selectedPurchase.unit_cost) || 0, cur, 2)} colors={colors} />
                  <DetailRow
                    label="Inversión total del lote"
                    value={formatMoney(Number(selectedPurchase.total_cost) || 0, cur, 2)}
                    colors={colors}
                    emphasis
                  />
                  <DetailRow
                    label="Método de pago"
                    value={selectedPurchase.payment_method === "cash" ? "💵 Efectivo" : "📲 Transferencia"}
                    colors={colors}
                  />
                  <DetailRow label="Fecha y hora" value={formatDate(selectedPurchase.created_at, true)} colors={colors} last />
                </View>

                <View style={[styles.noteBox, { backgroundColor: colors.brandTertiary, borderColor: colors.brand }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Feather name="truck" size={16} color={colors.brand} />
                      <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm, color: colors.onSurface }}>
                        Nota / Proveedor
                      </Text>
                    </View>
                    {!editingPurchaseNote ? (
                      <Pressable
                        onPress={() => {
                          setPurchaseNoteDraft(selectedPurchase.note || "");
                          setEditingPurchaseNote(true);
                        }}
                        hitSlop={8}
                        testID="purchase-note-edit"
                      >
                        <Feather name="edit-2" size={16} color={colors.brand} />
                      </Pressable>
                    ) : null}
                  </View>

                  {editingPurchaseNote ? (
                    <View style={{ gap: 8 }}>
                      <TextInput
                        style={[styles.noteInput, { color: colors.onSurface, borderColor: colors.brand }]}
                        value={purchaseNoteDraft}
                        onChangeText={setPurchaseNoteDraft}
                        placeholder="Ej. Señor Pepe 987654"
                        placeholderTextColor={colors.onSurfaceTertiary}
                        multiline
                      />
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                          style={[styles.noteSaveBtn, { backgroundColor: colors.brand }]}
                          onPress={async () => {
                            await updatePurchase?.(selectedPurchase.id, { note: purchaseNoteDraft });
                            setSelectedPurchase((prev) => (prev ? { ...prev, note: purchaseNoteDraft.trim() || undefined } : prev));
                            setEditingPurchaseNote(false);
                          }}
                        >
                          <Feather name="check" size={14} color="#FFF" />
                          <Text style={{ fontFamily: FONTS.bold, color: "#FFF", fontSize: FONT_SIZE.sm }}>Guardar</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.noteCancelBtn, { borderColor: colors.border }]}
                          onPress={() => setEditingPurchaseNote(false)}
                        >
                          <Text style={{ fontFamily: FONTS.bold, color: colors.onSurfaceTertiary, fontSize: FONT_SIZE.sm }}>Cancelar</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, color: colors.onSurface, lineHeight: 20 }}>
                      {selectedPurchase.note || "Sin nota registrada para este ingreso."}
                    </Text>
                  )}
                </View>
              </ScrollView>
            ) : null}

            <Pressable
              onPress={() => {
                setEditingPurchaseNote(false);
                setSelectedPurchase(null);
              }}
              style={[styles.closeModalBtn, { backgroundColor: colors.brand }]}
            >
              <Text style={{ fontFamily: FONTS.bold, color: "#FFF", fontSize: FONT_SIZE.base }}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!discardTarget} transparent animationType="fade" onRequestClose={() => setDiscardTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>¿Desea desechar este producto?</Text>
              <Pressable onPress={() => setDiscardTarget(null)} hitSlop={8}>
                <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>

            {discardTarget ? (
              <View style={{ gap: SPACING.md }}>
                <View style={[styles.noteBox, { backgroundColor: (colors.error || "#EF4444") + "12", borderColor: colors.error || "#EF4444" }]}>
                  <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, color: colors.onSurface }}>
                    {discardTarget.name}
                  </Text>
                  <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, color: colors.onSurfaceTertiary }}>
                    Lote vence: {formatExpiryDateFull(discardTarget.nearest_expiry_date)}
                  </Text>
                </View>

                <View style={{ gap: SPACING.xs }}>
                  <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, color: colors.onSurfaceTertiary }}>
                    Cantidad a desechar (disponibles en el lote: {discardTarget.nearest_expiry_qty})
                  </Text>
                  <TextInput
                    style={[styles.noteInput, { color: colors.onSurface, borderColor: colors.brand, minHeight: 44 }]}
                    keyboardType="numeric"
                    value={discardQtyDraft}
                    onChangeText={setDiscardQtyDraft}
                  />
                </View>

                <View style={[styles.detailGrid, { borderColor: colors.border }]}>
                  <DetailRow
                    label="Valor estimado de la merma"
                    value={formatMoney((parseFloat(discardQtyDraft) || 0) * (Number(discardTarget.cost) || 0), cur, 2)}
                    colors={colors}
                    last
                    emphasis
                  />
                </View>

                <View style={{ flexDirection: "row", gap: SPACING.sm }}>
                  <Pressable
                    style={[styles.noteCancelBtn, { flex: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }]}
                    onPress={() => setDiscardTarget(null)}
                  >
                    <Text style={{ fontFamily: FONTS.bold, color: colors.onSurfaceTertiary, fontSize: FONT_SIZE.base }}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.noteSaveBtn,
                      { flex: 1, backgroundColor: colors.error || "#EF4444", opacity: discarding ? 0.6 : 1 },
                    ]}
                    disabled={discarding}
                    onPress={onConfirmDiscard}
                  >
                    {discarding ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <>
                        <Feather name="trash-2" size={16} color="#FFF" />
                        <Text style={{ fontFamily: FONTS.bold, color: "#FFF", fontSize: FONT_SIZE.base }}>Sí, desechar</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      <InputPrompt
        visible={prompt === "cat"}
        title="Nueva categoría principal"
        placeholder="Ej: Ropa, Cosméticos..."
        onSubmit={async (v) => {
          setPrompt(null);
          await addInventoryCategory(v);
          setCat(v);
          setSub("all");
        }}
        onClose={() => setPrompt(null)}
      />
      <InputPrompt
        visible={prompt === "sub"}
        title={`Nueva subcategoría en ${cat}`}
        placeholder="Ej: Buzos, Perfumes..."
        onSubmit={async (v) => {
          setPrompt(null);
          if (activeCat) await addInventorySubcategory(cat, v);
        }}
        onClose={() => setPrompt(null)}
      />
    </View>
  );
}

function Chip({ label, active, onPress, colors, small, testID }: any) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{
        flexShrink: 0,
        height: small ? 30 : 36,
        paddingHorizontal: small ? 12 : SPACING.lg,
        borderRadius: RADIUS.pill,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? colors.brand : colors.surfaceTertiary,
        borderColor: active ? colors.brand : colors.border,
      }}
    >
      <Text
        style={{
          color: active ? colors.onBrand : colors.onSurfaceTertiary,
          fontFamily: active ? FONTS.bold : FONTS.medium,
          fontSize: small ? FONT_SIZE.xs : FONT_SIZE.base,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function AddChip({ onPress, colors, small, testID }: any) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{
        flexShrink: 0,
        width: small ? 30 : 36,
        height: small ? 30 : 36,
        borderRadius: RADIUS.pill,
        borderWidth: 1.5,
        borderStyle: "dashed",
        alignItems: "center",
        justifyContent: "center",
        borderColor: colors.brand,
      }}
    >
      <Feather name="plus" size={small ? 14 : 18} color={colors.brand} />
    </Pressable>
  );
}

function DetailRow({
  label,
  value,
  colors,
  emphasis,
  last,
}: {
  label: string;
  value: string;
  colors: any;
  emphasis?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.detailRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, color: colors.onSurfaceTertiary }}>
        {label}
      </Text>
      <Text
        style={{
          fontFamily: emphasis ? FONTS.black : FONTS.bold,
          fontSize: emphasis ? FONT_SIZE.lg : FONT_SIZE.base,
          color: emphasis ? colors.brand : colors.onSurface,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  tabText: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.sm,
  },
  rowPad: { gap: SPACING.sm, paddingHorizontal: SPACING.lg, alignItems: "center" },
  alertCard: { padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1.5, marginTop: 4 },
  alertHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  alertInfoGroup: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, flex: 1 },
  alertTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm },
  replenishBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: RADIUS.pill },
  replenishBtnText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.xs, color: "#FFF" },
  capitalRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.xs },
  capitalCardHalf: { flex: 1, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, gap: 4 },
  prodRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  prodIcon: { width: 48, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  prodName: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  prodCat: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs },
  badgeWrap: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  prodPrice: { fontFamily: FONTS.black, fontSize: FONT_SIZE.base },
  prodStock: { fontFamily: FONTS.regular, fontSize: 12 },
  daysBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.sm },
  pending: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.pill },
  pendingText: { fontFamily: FONTS.bold, fontSize: 10 },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  editBtnText: { fontFamily: FONTS.bold, fontSize: 11 },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, height: 52, borderRadius: RADIUS.md, paddingHorizontal: SPACING["2xl"], marginTop: SPACING.md },
  ctaText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  addFab: { position: "absolute", right: SPACING.lg, bottom: SPACING.xl, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl, maxHeight: "85%", gap: SPACING.sm },
  modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontFamily: FONTS.black, fontSize: FONT_SIZE.lg },
  daySelector: { flex: 1, paddingVertical: 8, borderRadius: RADIUS.md, borderWidth: 1, alignItems: "center" },
  replenishRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  replenishTotalBox: { padding: SPACING.md, borderRadius: RADIUS.md, alignItems: "center", gap: 2, marginTop: SPACING.xs },
  closeModalBtn: { height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", marginTop: SPACING.xs },
  purchaseRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  purchaseIcon: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  purchaseTotal: { fontFamily: FONTS.black, fontSize: FONT_SIZE.base },
  deleteBtn: { padding: 6 },
  detailHeaderRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  detailGrid: { borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  noteBox: { borderRadius: RADIUS.md, borderWidth: 1, padding: SPACING.md, gap: SPACING.xs },
  noteInput: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    fontFamily: FONTS.medium,
    fontSize: FONT_SIZE.base,
    minHeight: 60,
    textAlignVertical: "top",
  },
  noteSaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: RADIUS.sm,
  },
  noteCancelBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
});
