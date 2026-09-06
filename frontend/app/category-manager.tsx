import { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Card, InputPrompt } from "@/src/components/ui";
import { useTaxonomy } from "@/src/context/TaxonomyContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";

const TAXONOMY_STORAGE_KEY = "@pan_custom_taxonomy";

function generateDefaultSubcategories(categoryName: string, isExpense: boolean): string[] {
  const norm = (categoryName || "").toLowerCase().trim();

  if (isExpense) {
    if (/transporte|viaje|movilidad/i.test(norm)) return ["Pasajes", "Taxi", "Combustible", "Delivery", "Peajes"];
    if (/comida|alimento|restaurante/i.test(norm)) return ["Almuerzo", "Refrigerio", "Café", "Cena", "Desayuno"];
    if (/servicio|luz|agua/i.test(norm)) return ["Luz", "Agua", "Internet", "Teléfono", "Mantenimiento"];
    if (/alquiler|arriendo/i.test(norm)) return ["Local", "Almacén", "Stand", "Depósito", "Cochera"];
    if (/mercader[ií]a|stock|compra/i.test(norm)) return ["Compra de Stock", "Flete de Carga", "Empaque mayorista", "Muestras", "Reposición"];
    if (/personal|empleado|sueldo/i.test(norm)) return ["Sueldos", "Adelantos", "Comisiones", "Bonos", "Refrigerios"];
    if (/marketing|publicidad/i.test(norm)) return ["Redes Sociales", "Diseño", "Impresiones", "Volantes", "Pauta Digital"];
    return ["General", "Imprevistos", "Mantenimiento", "Papelería", "Otros"];
  }

  // Inventario / Productos
  if (/ropa|textil|prenda/i.test(norm)) return ["Polos", "Pantalones", "Buzos", "Casacas", "Shorts"];
  if (/calzado|zapato/i.test(norm)) return ["Zapatillas", "Sandalias", "Botas", "Formal", "Deportivo"];
  if (/accesorio|bazar/i.test(norm)) return ["Relojes", "Bolsos", "Mochilas", "Billeteras", "Joyas"];
  if (/hogar|casa/i.test(norm)) return ["Decoración", "Cocina", "Limpieza", "Organización", "Menaje"];
  if (/patito|juguete|kawaii/i.test(norm)) return ["Clásicos", "Con Sombrero", "Llaveros", "Peluches", "Accesorios"];
  if (/mascota|veterinaria/i.test(norm)) return ["Comida", "Juguetes", "Correas", "Higiene", "Premios"];
  if (/electronica|tecnologia/i.test(norm)) return ["Cables", "Cargadores", "Fundas", "Audífonos", "Soportes"];

  return ["Modelos Nuevos", "Básicos", "Premium", "Ofertas", "Varios"];
}

export default function CategoryManager() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tax = useTaxonomy() as any;

  const [inventory, setInventory] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [prompt, setPrompt] = useState<{ kind: string; parent?: string; title: string } | null>(null);

  useEffect(() => {
    if (tax.inventory && tax.inventory.length > 0) {
      setInventory(tax.inventory);
    }
    if (tax.expenses && tax.expenses.length > 0) {
      setExpenses(tax.expenses);
    }
  }, [tax.inventory, tax.expenses]);

  useEffect(() => {
    if (tax.load) tax.load();
    // "tax" (el objeto completo del contexto) es un literal nuevo en cada
    // render de TaxonomyContext.Provider (value={{...}} sin useMemo);
    // listarlo aquí dispararía este efecto en bucle apenas tax.load()
    // actualice su estado. tax.load en sí es estable (useCallback con deps
    // []), así que sigue siendo la dependencia correcta para "cargar una
    // sola vez".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tax.load]);

  const persistTaxonomy = async (newInv: any[], newExp: any[]) => {
    try {
      // Normalizar estructura de gastos para mantener compatibilidad dual (subcategories y categories)
      const normalizedExp = newExp.map((e) => {
        const name = e.name || e.label || e.key || "General";
        const subs = e.subcategories || e.categories || [];
        return {
          key: e.key || name,
          name,
          label: e.label || name,
          subcategories: subs,
          categories: subs,
        };
      });

      const payload = { inventory: newInv, expenses: normalizedExp };
      await AsyncStorage.setItem(TAXONOMY_STORAGE_KEY, JSON.stringify(payload));

      if (tax.saveTaxonomy) {
        await tax.saveTaxonomy(payload);
      }
      if (tax.load) {
        await tax.load();
      }
    } catch (err) {
      console.error("Error al persistir categorias:", err);
    }
  };

  const onSubmit = async (value: string) => {
    if (!prompt) return;
    const { kind, parent } = prompt;
    const trimmed = value.trim();
    if (!trimmed) {
      setPrompt(null);
      return;
    }
    setPrompt(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    if (kind === "inv-cat") {
      const exists = inventory.some((c) => c.name?.toLowerCase() === trimmed.toLowerCase());
      if (exists) return;
      const defaultSubs = generateDefaultSubcategories(trimmed, false);
      const updated = [...inventory, { name: trimmed, subcategories: defaultSubs }];
      setInventory(updated);
      await persistTaxonomy(updated, expenses);
    } else if (kind === "inv-sub" && parent) {
      const updated = inventory.map((c) => {
        if (c.name.toLowerCase() === parent.toLowerCase()) {
          const list = c.subcategories || [];
          const exists = list.some((s: string) => s.toLowerCase() === trimmed.toLowerCase());
          return { ...c, subcategories: exists ? list : [...list, trimmed] };
        }
        return c;
      });
      setInventory(updated);
      await persistTaxonomy(updated, expenses);
    } else if (kind === "exp-cat") {
      const exists = expenses.some(
        (e) => (e.name || e.label || e.key)?.toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) return;
      const defaultSubs = generateDefaultSubcategories(trimmed, true);
      const newEntry = {
        key: trimmed,
        name: trimmed,
        label: trimmed,
        subcategories: defaultSubs,
        categories: defaultSubs,
      };
      const updated = [...expenses, newEntry];
      setExpenses(updated);
      await persistTaxonomy(inventory, updated);
    } else if (kind === "exp-sub" && parent) {
      const updated = expenses.map((e) => {
        const pKey = e.name || e.key || e.label;
        if (pKey?.toLowerCase() === parent.toLowerCase()) {
          const list = e.subcategories || e.categories || [];
          const exists = list.some((s: string) => s.toLowerCase() === trimmed.toLowerCase());
          const nextList = exists ? list : [...list, trimmed];
          return { ...e, subcategories: nextList, categories: nextList };
        }
        return e;
      });
      setExpenses(updated);
      await persistTaxonomy(inventory, updated);
    }
  };

  const handleDelInvCat = async (name: string) => {
    Alert.alert("Eliminar categoría", `¿Eliminar "${name}" y sus subcategorías?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          const updated = inventory.filter((c) => c.name !== name);
          setInventory(updated);
          await persistTaxonomy(updated, expenses);
        },
      },
    ]);
  };

  const handleDelInvSub = async (cat: string, sub: string) => {
    const updated = inventory.map((c) => {
      if (c.name === cat) {
        return { ...c, subcategories: (c.subcategories || []).filter((s: string) => s !== sub) };
      }
      return c;
    });
    setInventory(updated);
    await persistTaxonomy(updated, expenses);
  };

  const handleDelExpCat = async (name: string) => {
    Alert.alert("Eliminar categoría", `¿Eliminar categoría de gasto "${name}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          const updated = expenses.filter((e) => (e.name || e.key || e.label) !== name);
          setExpenses(updated);
          await persistTaxonomy(inventory, updated);
        },
      },
    ]);
  };

  const handleDelExpSub = async (cat: string, sub: string) => {
    const updated = expenses.map((e) => {
      const pKey = e.name || e.key || e.label;
      if (pKey === cat) {
        const list = e.subcategories || e.categories || [];
        const nextList = list.filter((s: string) => s !== sub);
        return { ...e, subcategories: nextList, categories: nextList };
      }
      return e;
    });
    setExpenses(updated);
    await persistTaxonomy(inventory, updated);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} testID="cm-close">
          <Feather name="x" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Categorías</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + SPACING.xl, gap: SPACING.lg }}>
        {/* Inventario */}
        <View style={styles.sectionHead}>
          <Text style={[styles.section, { color: colors.onSurface }]}>📦 Inventario</Text>
          <Pressable
            onPress={() => setPrompt({ kind: "inv-cat", title: "Nueva categoría de inventario" })}
            testID="cm-add-inv-cat"
            style={[styles.addSmall, { backgroundColor: colors.brand }]}
          >
            <Feather name="plus" size={16} color={colors.onBrand} />
          </Pressable>
        </View>

        {inventory.map((c: any) => (
          <Card key={c.name} style={{ gap: SPACING.sm }}>
            <View style={styles.catHead}>
              <Text style={[styles.catName, { color: colors.onSurface }]}>{c.name}</Text>
              <View style={styles.catActions}>
                <Pressable
                  onPress={() => setPrompt({ kind: "inv-sub", parent: c.name, title: `Nueva subcategoría en ${c.name}` })}
                  testID={`cm-add-sub-${c.name}`}
                  style={[styles.iconChip, { backgroundColor: colors.brandSecondary + "22" }]}
                >
                  <Feather name="plus" size={16} color={colors.brandSecondary} />
                </Pressable>
                <Pressable
                  onPress={() => handleDelInvCat(c.name)}
                  testID={`cm-del-cat-${c.name}`}
                  style={[styles.iconChip, { backgroundColor: colors.error + "18" }]}
                >
                  <Feather name="trash-2" size={15} color={colors.error} />
                </Pressable>
              </View>
            </View>
            <View style={styles.subWrap}>
              {(c.subcategories || []).map((s: string) => (
                <View key={s} style={[styles.subChip, { backgroundColor: colors.surfaceTertiary }]}>
                  <Text style={[styles.subText, { color: colors.onSurface }]}>{s}</Text>
                  <Pressable onPress={() => handleDelInvSub(c.name, s)} testID={`cm-del-sub-${c.name}-${s}`} hitSlop={6}>
                    <Feather name="x" size={13} color={colors.onSurfaceTertiary} />
                  </Pressable>
                </View>
              ))}
            </View>
          </Card>
        ))}

        {/* Gastos */}
        <View style={styles.sectionHead}>
          <Text style={[styles.section, { color: colors.onSurface }]}>💸 Gastos</Text>
          <Pressable
            onPress={() => setPrompt({ kind: "exp-cat", title: "Nueva categoría de gasto" })}
            testID="cm-add-exp-cat"
            style={[styles.addSmall, { backgroundColor: colors.brand }]}
          >
            <Feather name="plus" size={16} color={colors.onBrand} />
          </Pressable>
        </View>

        {expenses.map((t: any) => {
          const catName = t.name || t.label || t.key;
          const subList = t.subcategories || t.categories || [];
          return (
            <Card key={catName} style={{ gap: SPACING.sm }}>
              <View style={styles.catHead}>
                <Text style={[styles.catName, { color: colors.onSurface }]}>{catName}</Text>
                <View style={styles.catActions}>
                  <Pressable
                    onPress={() => setPrompt({ kind: "exp-sub", parent: catName, title: `Nueva subcategoría en ${catName}` })}
                    testID={`cm-add-ecat-${catName}`}
                    style={[styles.iconChip, { backgroundColor: colors.brandSecondary + "22" }]}
                  >
                    <Feather name="plus" size={16} color={colors.brandSecondary} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelExpCat(catName)}
                    testID={`cm-del-etype-${catName}`}
                    style={[styles.iconChip, { backgroundColor: colors.error + "18" }]}
                  >
                    <Feather name="trash-2" size={15} color={colors.error} />
                  </Pressable>
                </View>
              </View>
              <View style={styles.subWrap}>
                {subList.map((s: string) => (
                  <View key={s} style={[styles.subChip, { backgroundColor: colors.surfaceTertiary }]}>
                    <Text style={[styles.subText, { color: colors.onSurface }]}>{s}</Text>
                    <Pressable onPress={() => handleDelExpSub(catName, s)} testID={`cm-del-ecat-${catName}-${s}`} hitSlop={6}>
                      <Feather name="x" size={13} color={colors.onSurfaceTertiary} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </Card>
          );
        })}
      </ScrollView>

      <InputPrompt
        visible={!!prompt}
        title={prompt?.title || ""}
        placeholder="Nombre..."
        onSubmit={onSubmit}
        onClose={() => setPrompt(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.sm },
  section: { fontFamily: FONTS.black, fontSize: FONT_SIZE.lg },
  addSmall: { width: 34, height: 34, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  catHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  catName: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  catActions: { flexDirection: "row", gap: SPACING.sm },
  iconChip: { width: 32, height: 32, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  subWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  subChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: RADIUS.pill },
  subText: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm },
});
