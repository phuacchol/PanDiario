import { useState, useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import Slider from "@react-native-community/slider";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Button, Field, InputPrompt } from "@/src/components/ui";
import { SearchAutoComplete } from "@/src/components/SearchAutoComplete";
import { DatePickerModal } from "@/src/components/DatePickerModal";
import { PAN_ASSETS } from "@/src/constants/mascot";
import { useData } from "@/src/context/DataContext";
import { useTaxonomy, DEFAULT_INVENTORY_CATEGORIES } from "@/src/context/TaxonomyContext";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatMoney } from "@/src/utils/format";
import { formatExpiryDateFull } from "@/src/utils/expiry";

export default function ProductForm() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, prefill } = useLocalSearchParams<{ id?: string; prefill?: string }>();
  const { products, saveProduct, deleteProduct, createPurchase, loadProducts, loadPurchases } = useData() as any;
  const { inventory: taxInv, load: loadTax, addInventoryCategory, addInventorySubcategory } = useTaxonomy() as any;
  const { user } = useAuth();
  const cur = user?.currency || "PEN";
  const editing = (products || []).find((p: any) => p.id === id);

  const inventoryList = useMemo(() => {
    return taxInv && taxInv.length > 0 ? taxInv : DEFAULT_INVENTORY_CATEGORIES;
  }, [taxInv]);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("General");
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [stock, setStock] = useState("0");
  const [minStock, setMinStock] = useState("0");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [margin, setMargin] = useState(30);
  const [manualPrice, setManualPrice] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [isPerishable, setIsPerishable] = useState(false);
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [savingAction, setSavingAction] = useState<"add" | "save" | null>(null);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState<null | "cat" | "sub">(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [selectedExistingProduct, setSelectedExistingProduct] = useState<any>(null);

  // La configuración de margen/precio queda reservada exclusivamente a
  // Modificar/Editar Producto: ningún formulario de creación o de ingreso
  // de stock (nuevo producto, reingreso de uno existente) debe mostrarla.
  const showPricingSection = Boolean(editing);

  useEffect(() => {
    if (loadTax) loadTax();
  }, [loadTax]);

  // Sembrado único por identidad de producto: `editing` es un nuevo objeto
  // en cada render en que `products` se recarga (aunque el contenido no haya
  // cambiado), así que depender de esa referencia reiniciaría campos que el
  // usuario ya modificó (p. ej. una fecha de vencimiento recién elegida) por
  // culpa de una recarga en segundo plano ajena a este formulario. El guard
  // por `id` asegura que solo se reseeded al abrir/cambiar de producto.
  const seededRef = useRef<string>("");
  useEffect(() => {
    const seedKey = editing ? `edit:${id}` : prefill ? `prefill:${prefill}` : "";
    if (!seedKey || seededRef.current === seedKey) return;
    seededRef.current = seedKey;

    if (editing) {
      setName(editing.name || "");
      setCategory(editing.category || "General");
      setSubcategory(editing.subcategory ?? null);
      setStock(String(editing.stock ?? 0));
      setMinStock(String(editing.min_stock ?? 0));
      setCost(editing.cost != null ? String(editing.cost) : "");
      setNote(editing.note || "");
      setMargin(editing.margin ?? 30);
      setPending(!!editing.price_pending);
      setManualPrice(editing.price_pending ? "" : String(editing.price ?? ""));
      setIsPerishable(!!editing.is_perishable);
      setExpiryDate(editing.nearest_expiry_date || "");
    } else if (prefill) {
      try {
        const p = JSON.parse(String(prefill));
        if (p.name) setName(String(p.name));
        if (p.stock != null) setStock(String(p.stock));
        if (p.cost != null) setCost(String(p.cost));
        if (p.category) setCategory(String(p.category));
        if (p.subcategory) setSubcategory(String(p.subcategory));
        if (p.note) setNote(String(p.note));
        if (p.price == null) {
          setPending(true);
        } else {
          setManualPrice(String(p.price));
        }
      } catch {}
    }
  }, [editing, prefill, id]);

  const deduplicatedProducts = useMemo(() => {
    const map = new Map<string, any>();
    (products || []).forEach((p: any) => {
      const key = (p.name || "").trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, { ...p, stock: Number(p.stock) || 0 });
      } else {
        const item = map.get(key);
        item.stock += Number(p.stock) || 0;
        if (Number(p.price) > 0) item.price = Number(p.price);
        if (Number(p.min_stock) > 0) item.min_stock = Number(p.min_stock);
        if (Number(p.cost) > 0) item.cost = Number(p.cost);
      }
    });
    return Array.from(map.values());
  }, [products]);

  const suggestions = useMemo(() => {
    if (!name.trim() || editing) return [];
    const q = name.toLowerCase().trim();
    return deduplicatedProducts.filter((p: any) => p.name.toLowerCase().includes(q));
  }, [name, deduplicatedProducts, editing]);

  const handleSelectSuggestion = (item: any) => {
    setName(item.name);
    setCategory(item.category || "General");
    setSubcategory(item.subcategory || null);
    setMinStock(String(item.min_stock ?? 0));
    setSelectedExistingProduct(item);

    if (item.price != null && Number(item.price) > 0) {
      setManualPrice(String(item.price));
      setPending(false);
    }
    if (item.cost != null && Number(item.cost) > 0) {
      setCost(String(item.cost));
    }
    setIsPerishable(!!item.is_perishable);
    setExpiryDate("");
    setStock("1");
    setShowSuggestions(false);
  };

  const costNum = parseFloat(cost) || 0;
  const suggestedPrice = useMemo(() => {
    const val = costNum * (1 + margin / 100);
    return Math.round(val * 100) / 100;
  }, [costNum, margin]);

  const currentCalculatedPrice = useMemo(() => {
    if (manualPrice !== "" && !isNaN(Number(manualPrice))) {
      return parseFloat(manualPrice);
    }
    return suggestedPrice;
  }, [manualPrice, suggestedPrice]);

  const activeCat = inventoryList.find((c: any) => c.name === category);

  const onAddStockExisting = async () => {
    if (!selectedExistingProduct) return;
    const addQty = parseFloat(stock) || 0;
    if (addQty <= 0) {
      setError("Ingresa una cantidad mayor a 0 para añadir al stock");
      return;
    }

    setSavingAction("add");
    setError("");
    try {
      const minStockNum = parseFloat(minStock) || 0;
      // Reingresar stock no toca el margen ni el precio de venta: esos
      // controles quedan reservados a Modificar/Editar Producto, así que
      // aquí se conserva el precio/margen vigente del producto tal cual.
      const targetPrice = Number(selectedExistingProduct.price) || 0;
      const targetMargin = Number(selectedExistingProduct.margin) || 0;
      const targetPending = Boolean(selectedExistingProduct.price_pending);
      const unitCost = costNum > 0 ? costNum : (Number(selectedExistingProduct.cost) || 0);
      const newTotalStock = (Number(selectedExistingProduct.stock) || 0) + addQty;

      const noteTrimmed = note.trim();

      if (saveProduct) {
        await saveProduct(
          {
            name: selectedExistingProduct.name,
            category,
            subcategory,
            stock: newTotalStock,
            min_stock: minStockNum,
            cost: unitCost,
            margin: targetMargin,
            price: targetPrice,
            price_pending: targetPending,
            note: noteTrimmed,
            is_perishable: isPerishable,
          },
          selectedExistingProduct.id
        );
      }

      if (createPurchase) {
        await createPurchase({
          product_id: selectedExistingProduct.id,
          product_name: selectedExistingProduct.name,
          qty: addQty,
          unit_cost: unitCost,
          new_min_stock: minStockNum,
          note: noteTrimmed || "Reingreso de stock",
          createExpenseRecord: unitCost > 0,
          is_perishable: isPerishable,
          expiry_date: isPerishable ? expiryDate || undefined : undefined,
        }).catch(() => {});
      }

      if (loadProducts) await loadProducts();
      if (loadPurchases) await loadPurchases();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e: any) {
      setError(e.message || "No se pudo actualizar el stock");
    } finally {
      setSavingAction(null);
    }
  };

  const onSave = async () => {
    if (!name.trim()) {
      setError("Ingresa el nombre del producto");
      return;
    }
    setSavingAction("save");
    setError("");
    try {
      const initialStock = parseFloat(stock) || 0;
      const minStockNum = parseFloat(minStock) || 0;
      // Sin la sección de precio (creación nueva desde cero), el producto
      // siempre queda con precio pendiente: su margen/precio se define
      // después al editarlo.
      const targetPrice = showPricingSection ? (pending ? 0 : currentCalculatedPrice) : 0;
      const pricePending = showPricingSection ? pending : true;
      const targetId = editing ? id : selectedExistingProduct ? selectedExistingProduct.id : undefined;
      const noteTrimmed = note.trim();

      const saved = await saveProduct(
        {
          name: name.trim(),
          category,
          subcategory,
          stock: initialStock,
          min_stock: minStockNum,
          cost: costNum,
          margin,
          price: targetPrice,
          price_pending: pricePending,
          note: noteTrimmed,
          is_perishable: isPerishable,
          expiry_date: isPerishable ? expiryDate || undefined : undefined,
        },
        targetId
      );

      if (!editing && !selectedExistingProduct && initialStock > 0 && createPurchase) {
        await createPurchase({
          product_id: saved?.id,
          product_name: name.trim(),
          qty: initialStock,
          unit_cost: costNum,
          new_price: targetPrice,
          new_min_stock: minStockNum,
          note: noteTrimmed || "Stock inicial",
          createExpenseRecord: costNum > 0,
          is_perishable: isPerishable,
          expiry_date: isPerishable ? expiryDate || undefined : undefined,
        }).catch(() => {});
      }

      if (loadProducts) await loadProducts();
      if (loadPurchases) await loadPurchases();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e: any) {
      setError(e.message || "No se pudo guardar");
    } finally {
      setSavingAction(null);
    }
  };

  const onDelete = async () => {
    if (!id) return;
    await deleteProduct(id);
    if (loadProducts) await loadProducts();
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} testID="product-close">
          <Feather name="x" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>
          {editing ? "Editar Producto" : selectedExistingProduct ? "Reingreso de Producto" : "Nuevo Producto"}
        </Text>
        {editing ? (
          <Pressable onPress={onDelete} style={styles.headerBtn} testID="product-delete">
            <Feather name="trash-2" size={22} color={colors.error} />
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 150, gap: SPACING.lg }}
        bottomOffset={100}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Field
            label="Nombre del artículo"
            placeholder="Ej: Buzo oversize"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (selectedExistingProduct && text !== selectedExistingProduct.name) {
                setSelectedExistingProduct(null);
              }
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            testID="product-name"
          />
          <SearchAutoComplete
            query={name}
            suggestions={suggestions}
            onSelect={handleSelectSuggestion}
            currency={cur}
            visible={showSuggestions}
          />
        </View>

        {selectedExistingProduct ? (
          <View style={[styles.existingBanner, { backgroundColor: colors.brandTertiary, borderColor: colors.brand }]}>
            <Feather name="info" size={18} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm, color: colors.onSurface }}>
                Producto en inventario: {selectedExistingProduct.name}
              </Text>
              <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: colors.onSurfaceTertiary }}>
                Stock actual: {selectedExistingProduct.stock} | Precio vigente: {formatMoney(selectedExistingProduct.price || 0, cur, 2)}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={{ gap: SPACING.xs }}>
          <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Categoría</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: SPACING.sm, alignItems: "center" }}
          >
            {inventoryList.map((c: any) => {
              const active = c.name === category;
              return (
                <Pressable
                  key={c.name}
                  onPress={() => {
                    setCategory(c.name);
                    setSubcategory(null);
                  }}
                  testID={`cat-${c.name}`}
                  style={[
                    styles.catChip,
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
                      fontSize: FONT_SIZE.base,
                    }}
                  >
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setPrompt("cat")}
              testID="cat-add"
              style={[styles.addChip, { borderColor: colors.brand }]}
            >
              <Feather name="plus" size={18} color={colors.brand} />
            </Pressable>
          </ScrollView>
        </View>

        {activeCat && activeCat.subcategories && activeCat.subcategories.length > 0 ? (
          <View style={{ gap: SPACING.xs }}>
            <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Subcategoría</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: SPACING.sm, alignItems: "center" }}
            >
              {activeCat.subcategories.map((s: string) => {
                const active = s === subcategory;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setSubcategory(active ? null : s)}
                    testID={`sub-${s}`}
                    style={[
                      styles.catChip,
                      {
                        backgroundColor: active ? colors.brandSecondary : colors.surfaceTertiary,
                        borderColor: active ? colors.brandSecondary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? colors.onBrandSecondary : colors.onSurfaceTertiary,
                        fontFamily: FONTS.medium,
                        fontSize: FONT_SIZE.base,
                      }}
                    >
                      {s}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setPrompt("sub")}
                testID="sub-add"
                style={[styles.addChip, { borderColor: colors.brandSecondary }]}
              >
                <Feather name="plus" size={18} color={colors.brandSecondary} />
              </Pressable>
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.dualRow}>
          <Field
            label={selectedExistingProduct ? "Cantidad a sumar (+)" : "Stock actual"}
            keyboardType="numeric"
            value={stock}
            onChangeText={setStock}
            containerStyle={{ flex: 1 }}
            testID="product-stock"
          />
          <Field
            label="Stock mínimo"
            keyboardType="numeric"
            value={minStock}
            onChangeText={setMinStock}
            containerStyle={{ flex: 1 }}
            testID="product-min-stock"
          />
        </View>

        <Field
          label={`Precio de compra (costo) ${cur ?? ""}`}
          keyboardType="numeric"
          placeholder="0.00"
          icon="shopping-bag"
          value={cost}
          onChangeText={setCost}
          testID="product-cost"
        />

        <Pressable
          style={styles.pendingRow}
          onPress={() => setIsPerishable((v) => !v)}
          testID="product-perishable-toggle"
        >
          <Feather name={isPerishable ? "check-square" : "square"} size={22} color={colors.brand} />
          <Text style={[styles.pendingLabel, { color: colors.onSurface }]}>Producto perecible</Text>
        </Pressable>

        {isPerishable ? (
          <Pressable
            onPress={() => setShowDatePicker(true)}
            style={[styles.dateBox, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}
            testID="product-expiry-date"
          >
            <Feather name="calendar" size={18} color={colors.brand} />
            <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, color: colors.onSurface }}>
              {expiryDate ? `Vence: ${formatExpiryDateFull(expiryDate)}` : "Elegir fecha de vencimiento"}
            </Text>
          </Pressable>
        ) : null}

        {showPricingSection ? (
          <>
            <View style={[styles.pricingBox, { backgroundColor: colors.brandTertiary }]}>
              <View style={styles.pricingHeaderRow}>
                <Image
                  source={PAN_ASSETS.calculator}
                  style={styles.pricingMascot}
                  contentFit="contain"
                  testID="mascot-calculator"
                />
                <Text style={[styles.pricingHeaderText, { color: colors.onBrandTertiary }]}>
                  Calculadora de margen y precio
                </Text>
              </View>
              <View style={styles.marginRow}>
                <Text style={[styles.label, { color: colors.onBrandTertiary }]}>Margen de ganancia</Text>
                <Text style={[styles.marginValue, { color: colors.onBrandTertiary }]}>{Math.round(margin)}%</Text>
              </View>
              <Slider
                style={{ width: "100%", height: 40 }}
                minimumValue={0}
                maximumValue={300}
                step={1}
                value={margin}
                onValueChange={(v) => setMargin(v)}
                minimumTrackTintColor={colors.brand}
                maximumTrackTintColor={colors.borderStrong}
                thumbTintColor={colors.brand}
                testID="product-margin-slider"
              />
              <Text style={[styles.rangeHint, { color: colors.onBrandTertiary }]}>0% – 300%</Text>
              <View style={styles.suggestRow}>
                <Text style={[styles.suggestLabel, { color: colors.onBrandTertiary }]}>Precio sugerido por costo + margen</Text>
                <Text style={[styles.suggestValue, { color: colors.brand }]}>{formatMoney(suggestedPrice, cur, 2)}</Text>
              </View>
            </View>

            <Pressable
              style={styles.pendingRow}
              onPress={() => setPending((p) => !p)}
              testID="product-pending-toggle"
            >
              <Feather name={pending ? "check-square" : "square"} size={22} color={colors.warning} />
              <Text style={[styles.pendingLabel, { color: colors.onSurface }]}>Marcar precio de venta como pendiente</Text>
            </Pressable>

            {!pending ? (
              <>
                <Field
                  label="Precio de venta final (este valor se guardará)"
                  keyboardType="numeric"
                  icon="tag"
                  placeholder={String(suggestedPrice)}
                  value={manualPrice}
                  onChangeText={(val) => setManualPrice(val)}
                  testID="product-final-price"
                />
                {manualPrice !== "" && manualPrice !== String(suggestedPrice) ? (
                  <Pressable onPress={() => setManualPrice(String(suggestedPrice))} testID="reset-price">
                    <Text style={[styles.resetText, { color: colors.brandSecondary }]}>
                      ↺ Usar precio sugerido ({suggestedPrice})
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: colors.onSurfaceTertiary }}>
            El margen y precio de venta se definen después, al editar este producto desde el inventario.
          </Text>
        )}

        <View style={{ gap: SPACING.xs }}>
          <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Nota / Proveedor (Opcional)</Text>
          <View style={[styles.noteWrap, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
            <TextInput
              placeholder="Ej. Proveedor Gamarra Galería A, Tel: 999..., Lote 3"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={[styles.noteInput, { color: colors.onSurface }]}
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              testID="product-note"
            />
          </View>
        </View>

        {error ? (
          <Text style={[styles.error, { color: colors.error }]} testID="product-error">
            {error}
          </Text>
        ) : null}
      </KeyboardAwareScrollView>

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
          {selectedExistingProduct ? (
            <View style={{ gap: SPACING.sm, width: "100%" }}>
              <Button
                title={`+ Añadir al Stock y Actualizar Precio`}
                onPress={onAddStockExisting}
                loading={savingAction === "add"}
                icon="plus-circle"
              />
              <Button
                title="Sobrescribir datos completos"
                variant="outline"
                onPress={onSave}
                loading={savingAction === "save"}
                icon="check"
              />
            </View>
          ) : (
            <Button
              title={editing ? "Guardar cambios" : "Crear Producto"}
              onPress={onSave}
              loading={savingAction === "save"}
              icon="check"
              testID="product-save"
            />
          )}
        </View>
      </KeyboardStickyView>

      <InputPrompt
        visible={prompt === "cat"}
        title="Nueva categoría"
        placeholder="Ej: Calzado, Hogar..."
        onSubmit={async (v) => {
          setPrompt(null);
          if (addInventoryCategory) await addInventoryCategory(v);
          setCategory(v);
          setSubcategory(null);
        }}
        onClose={() => setPrompt(null)}
      />
      <InputPrompt
        visible={prompt === "sub"}
        title={`Nueva subcategoría en ${category}`}
        placeholder="Ej: Zapatillas..."
        onSubmit={async (v) => {
          setPrompt(null);
          if (addInventorySubcategory) await addInventorySubcategory(category, v);
          setSubcategory(v);
        }}
        onClose={() => setPrompt(null)}
      />

      <DatePickerModal
        visible={showDatePicker}
        colors={colors}
        title="Fecha de vencimiento"
        initialDate={expiryDate || undefined}
        onSelect={(date) => {
          setExpiryDate(date);
          setShowDatePicker(false);
        }}
        onRequestClose={() => setShowDatePicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  label: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, marginLeft: 2 },
  dualRow: { flexDirection: "row", gap: SPACING.md },
  noteWrap: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: 80,
  },
  noteInput: {
    fontFamily: FONTS.medium,
    fontSize: FONT_SIZE.base,
    minHeight: 64,
  },
  catChip: {
    flexShrink: 0,
    height: 40,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  addChip: {
    flexShrink: 0,
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  existingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  pricingBox: { borderRadius: RADIUS.md, padding: SPACING.lg, gap: SPACING.xs },
  pricingHeaderRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.xs },
  pricingMascot: { width: 44, height: 44 },
  pricingHeaderText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, flex: 1 },
  marginRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  marginValue: { fontFamily: FONTS.black, fontSize: FONT_SIZE.xl },
  rangeHint: { fontFamily: FONTS.regular, fontSize: 11, textAlign: "center", marginTop: -4 },
  suggestRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: SPACING.xs },
  suggestLabel: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base },
  suggestValue: { fontFamily: FONTS.black, fontSize: FONT_SIZE.xl },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  dateBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  pendingLabel: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, flex: 1 },
  resetText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, marginTop: -SPACING.sm },
  error: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, textAlign: "center" },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
