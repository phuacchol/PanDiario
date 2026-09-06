import { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { EmptyState } from "@/src/components/Mascot";
import { Button, Field, ChipRow, Segmented } from "@/src/components/ui";
import { DatePickerModal } from "@/src/components/DatePickerModal";
import { CompraOverlayModal } from "@/src/components/home/CompraOverlayModal";
import { useTheme } from "@/src/theme/ThemeContext";
import { useData, type ListRecord } from "@/src/context/DataContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatLocalDate, formatLocalTime } from "@/src/utils/format";

type Panel = "listas" | "programadas";

export default function ListaScreen() {
  const { colors } = useTheme();
  const { lists, listEntries, budgetCategories, addList, deleteList, addListEntry, toggleListEntry, deleteListEntry, completeList } = useData();

  const [panel, setPanel] = useState<Panel>("listas");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [showNew, setShowNew] = useState(false);
  const [activeListId, setActiveListId] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Otros");
  const [isProgrammed, setIsProgrammed] = useState(false);
  const [date, setDate] = useState("");
  const [hour, setHour] = useState("08");
  const [minute, setMinute] = useState("00");
  const [showDatePicker, setShowDatePicker] = useState(false);

  const categories = useMemo(() => {
    const names = new Set(budgetCategories.map((c) => c.name));
    lists.forEach((l) => l.category && names.add(l.category));
    return ["Todas", ...Array.from(names)];
  }, [budgetCategories, lists]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return lists
      .filter((l) => l.status === "active")
      .filter((l) => (panel === "programadas" ? l.is_programmed : !l.is_programmed))
      .filter((l) => !query || l.title.toLowerCase().includes(query))
      .filter((l) => categoryFilter === "Todas" || l.category === categoryFilter)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [lists, panel, query, categoryFilter]);

  const activeList = lists.find((l) => l.id === activeListId) || null;
  const activeEntries = listEntries.filter((e) => e.list_id === activeListId);

  const onCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    let scheduledAt: string | null = null;
    if (isProgrammed && date) {
      const [y, m, d] = date.split("-").map(Number);
      scheduledAt = new Date(y, (m || 1) - 1, d || 1, parseInt(hour, 10) || 0, parseInt(minute, 10) || 0).toISOString();
    }
    await addList({ title, category: newCategory, isProgrammed: isProgrammed && !!scheduledAt, scheduledAt, leadMinutes: 15 });
    setNewTitle("");
    setIsProgrammed(false);
    setDate("");
    setShowNew(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <TopBar title="Lista" />

      <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.md }}>
        <View style={[styles.searchWrap, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.onSurfaceTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar lista..."
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[styles.searchInput, { color: colors.onSurface }]}
            testID="lista-search-input"
          />
        </View>

        <ChipRow options={categories.map((c) => ({ key: c, label: c }))} value={categoryFilter} onChange={setCategoryFilter} testID="lista-category-chips" />

        <Segmented
          testID="lista-panel-tabs"
          options={[
            { key: "listas", label: "Listas" },
            { key: "programadas", label: "Programadas" },
          ]}
          value={panel}
          onChange={(k) => setPanel(k as Panel)}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm }}
        ListEmptyComponent={<EmptyState variant="box" title="Sin listas" subtitle="Crea una desde el botón + o dilo por voz." />}
        renderItem={({ item }: { item: ListRecord }) => (
          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.onSurface }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[styles.cardMeta, { color: colors.onSurfaceTertiary }]}>
                {item.category || "Otros"}
                {item.is_programmed && item.scheduled_at ? ` · ${formatLocalDate(item.scheduled_at)} ${formatLocalTime(item.scheduled_at)}` : ""}
              </Text>
            </View>
            <Pressable onPress={() => setActiveListId(item.id)} hitSlop={8} testID={`lista-play-${item.id}`}>
              <Feather name="play-circle" size={22} color={colors.brand} />
            </Pressable>
            <Pressable onPress={() => setActiveListId(item.id)} hitSlop={8} testID={`lista-edit-${item.id}`}>
              <Feather name="edit-2" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
            <Pressable onPress={() => deleteList(item.id)} hitSlop={8} testID={`lista-delete-${item.id}`}>
              <Feather name="trash-2" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>
        )}
      />

      <Pressable style={[styles.fab, { backgroundColor: colors.brand }]} onPress={() => setShowNew(true)} testID="lista-fab">
        <Feather name="plus" size={26} color={colors.onBrand} />
      </Pressable>

      <Modal visible={showNew} transparent animationType="fade" onRequestClose={() => setShowNew(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.newCard, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Nueva lista</Text>
            <Field label="Nombre" placeholder="Ej. Compras del súper" value={newTitle} onChangeText={setNewTitle} testID="lista-new-title" />
            <View style={{ gap: SPACING.xs }}>
              <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Categoría</Text>
              <ChipRow options={categories.filter((c) => c !== "Todas").concat("Otros").map((c) => ({ key: c, label: c }))} value={newCategory} onChange={setNewCategory} />
            </View>

            <Pressable style={styles.reminderToggle} onPress={() => setIsProgrammed((v) => !v)} testID="lista-programmed-toggle">
              <Feather name={isProgrammed ? "check-square" : "square"} size={20} color={colors.brand} />
              <Text style={{ color: colors.onSurface, fontFamily: FONTS.medium }}>Lista programada</Text>
            </Pressable>

            {isProgrammed ? (
              <View style={{ gap: SPACING.sm }}>
                <Pressable style={[styles.dateBtn, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]} onPress={() => setShowDatePicker(true)}>
                  <Feather name="calendar" size={16} color={colors.onSurfaceTertiary} />
                  <Text style={{ color: colors.onSurface, fontFamily: FONTS.medium }}>{date ? formatLocalDate(date, { withYear: true }) : "Elegir fecha"}</Text>
                </Pressable>
                <View style={{ flexDirection: "row", gap: SPACING.sm }}>
                  <Field label="Hora" keyboardType="number-pad" value={hour} onChangeText={setHour} containerStyle={{ flex: 1 }} />
                  <Field label="Minuto" keyboardType="number-pad" value={minute} onChangeText={setMinute} containerStyle={{ flex: 1 }} />
                </View>
              </View>
            ) : null}

            <View style={{ flexDirection: "row", gap: SPACING.md }}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowNew(false)}>
                <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.bold }}>Cancelar</Text>
              </Pressable>
              <Button title="Crear" onPress={onCreate} style={{ flex: 1 }} testID="lista-new-submit" />
            </View>
          </View>
        </View>
      </Modal>

      <DatePickerModal
        visible={showDatePicker}
        initialDate={date || undefined}
        colors={colors}
        title="Fecha programada"
        onSelect={(d) => {
          setDate(d);
          setShowDatePicker(false);
        }}
        onRequestClose={() => setShowDatePicker(false)}
      />

      <CompraOverlayModal
        visible={!!activeListId}
        list={activeList}
        entries={activeEntries}
        onToggleEntry={toggleListEntry}
        onAddEntry={(text, extra) => activeListId && addListEntry(activeListId, text, extra)}
        onDeleteEntry={deleteListEntry}
        onComplete={(p) => activeListId && completeList(activeListId, p)}
        onClose={() => setActiveListId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md, height: 48 },
  searchInput: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, height: "100%" },
  label: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, marginLeft: 2 },
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md },
  cardTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  cardMeta: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, marginTop: 2 },
  fab: { position: "absolute", right: SPACING.lg, bottom: SPACING.xl, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.5)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  newCard: { width: "100%", maxWidth: 380, borderRadius: RADIUS.lg, padding: SPACING.xl, gap: SPACING.md },
  reminderToggle: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, height: 48, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md },
  cancelBtn: { flex: 1, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
});
