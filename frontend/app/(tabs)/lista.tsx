import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Feather } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { EmptyState } from "@/src/components/Mascot";
import { Button, Field, Segmented } from "@/src/components/ui";
import { DatePickerModal } from "@/src/components/DatePickerModal";
import { TimePickerModal } from "@/src/components/TimePickerModal";
import { CompraOverlayModal } from "@/src/components/home/CompraOverlayModal";
import { useTheme } from "@/src/theme/ThemeContext";
import { useData, type ListRecord } from "@/src/context/DataContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatLocalDate, formatLocalTime } from "@/src/utils/format";

type Panel = "listas" | "programadas";
type DraftItem = { id: string; text: string; done: boolean };

export default function ListaScreen() {
  const { colors } = useTheme();
  const { lists, listEntries, addList, deleteList, toggleListPlay, addListEntry, toggleListEntry, deleteListEntry, completeList } = useData();

  const [panel, setPanel] = useState<Panel>("listas");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeListId, setActiveListId] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [isProgrammed, setIsProgrammed] = useState(false);
  const [date, setDate] = useState("");
  const [hour, setHour] = useState("08");
  const [minute, setMinute] = useState("00");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [draftItemText, setDraftItemText] = useState("");

  // Reinicia el formulario cada vez que se abre "Nueva lista": evita que un
  // borrador cancelado (título, ítems ya tecleados) quede pegado al volver
  // a abrir el modal más adelante.
  useEffect(() => {
    if (showNew) {
      setNewTitle("");
      setIsProgrammed(false);
      setDate("");
      setHour("08");
      setMinute("00");
      setDraftItems([]);
      setDraftItemText("");
    }
  }, [showNew]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return lists
      .filter((l) => l.status === "active" || l.status === "in_progress")
      .filter((l) => (panel === "programadas" ? l.is_programmed : !l.is_programmed))
      .filter((l) => !query || l.title.toLowerCase().includes(query))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [lists, panel, query]);

  const history = useMemo(
    () => lists.filter((l) => l.status === "done").sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || "")),
    [lists]
  );

  const activeList = lists.find((l) => l.id === activeListId) || null;
  const activeEntries = listEntries.filter((e) => e.list_id === activeListId);

  // Play es un alternador: toca para pasar a "en ejecución" (ícono verde,
  // bloqueada contra edición estructural) y toca de nuevo para volver a
  // "activa" (color neutro, desbloqueada). El ícono en sí alterna el
  // estado; el panel de la lista se abre en cualquiera de los dos casos.
  const onPlay = (list: ListRecord) => {
    toggleListPlay(list.id);
    setActiveListId(list.id);
  };

  const addDraftItem = () => {
    const clean = draftItemText.trim();
    if (!clean) return;
    setDraftItems((prev) => [...prev, { id: `draft_${Date.now()}_${Math.floor(Math.random() * 10000)}`, text: clean, done: false }]);
    setDraftItemText("");
  };

  const onCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    let scheduledAt: string | null = null;
    if (isProgrammed && date) {
      const [y, m, d] = date.split("-").map(Number);
      scheduledAt = new Date(y, (m || 1) - 1, d || 1, parseInt(hour, 10) || 0, parseInt(minute, 10) || 0).toISOString();
    }
    const newListId = await addList({ title, isProgrammed: isProgrammed && !!scheduledAt, scheduledAt, leadMinutes: 15 });
    if (newListId) {
      for (const item of draftItems) {
        await addListEntry(newListId, item.text);
      }
    }
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

        <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
          <View style={{ flex: 1 }}>
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
          <Pressable style={[styles.historyBtn, { backgroundColor: colors.surfaceTertiary }]} onPress={() => setShowHistory(true)} testID="lista-history-button">
            <Feather name="clock" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>
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
                {item.list_code ? `#${item.list_code} · ` : ""}
                {item.title}
              </Text>
              {item.is_programmed && item.scheduled_at ? (
                <Text style={[styles.cardMeta, { color: colors.onSurfaceTertiary }]}>
                  {formatLocalDate(item.scheduled_at)} {formatLocalTime(item.scheduled_at)}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={() => onPlay(item)} hitSlop={8} testID={`lista-play-${item.id}`}>
              <Feather name="play-circle" size={22} color={item.status === "in_progress" ? colors.success : colors.brand} />
            </Pressable>
            <Pressable onPress={() => onPlay(item)} hitSlop={8} testID={`lista-edit-${item.id}`}>
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
            <KeyboardAwareScrollView contentContainerStyle={{ gap: SPACING.md }} bottomOffset={20}>
              <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Nueva lista</Text>
              <Field label="Nombre" placeholder="Ej. Compras del súper" value={newTitle} onChangeText={setNewTitle} testID="lista-new-title" />

              <View style={{ gap: SPACING.xs }}>
                <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Ítems</Text>
                <View style={[styles.addItemRow, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
                  <TextInput
                    value={draftItemText}
                    onChangeText={setDraftItemText}
                    placeholder="Ej. 5 panes"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    style={[styles.addItemInput, { color: colors.onSurface }]}
                    onSubmitEditing={addDraftItem}
                    testID="lista-new-item-input"
                  />
                  <Pressable onPress={addDraftItem} style={[styles.addItemBtn, { backgroundColor: colors.brand }]} testID="lista-new-item-add">
                    <Feather name="plus" size={18} color={colors.onBrand} />
                  </Pressable>
                </View>

                {draftItems.map((item) => (
                  <View key={item.id} style={[styles.draftItemRow, { backgroundColor: colors.surfaceTertiary }]}>
                    <Pressable
                      onPress={() => setDraftItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))}
                      hitSlop={8}
                      testID={`lista-new-item-toggle-${item.id}`}
                    >
                      <Feather name={item.done ? "check-circle" : "circle"} size={20} color={item.done ? colors.success : colors.onSurfaceTertiary} />
                    </Pressable>
                    <Text style={{ flex: 1, color: colors.onSurface, fontFamily: FONTS.medium, textDecorationLine: item.done ? "line-through" : "none" }} numberOfLines={1}>
                      {item.text}
                    </Text>
                    <Pressable onPress={() => setDraftItems((prev) => prev.filter((i) => i.id !== item.id))} hitSlop={8} testID={`lista-new-item-remove-${item.id}`}>
                      <Feather name="trash-2" size={18} color={colors.error} />
                    </Pressable>
                  </View>
                ))}
              </View>

              <Pressable style={styles.reminderToggle} onPress={() => setIsProgrammed((v) => !v)} testID="lista-programmed-toggle">
                <Feather name={isProgrammed ? "check-square" : "square"} size={20} color={colors.brand} />
                <Text style={{ color: colors.onSurface, fontFamily: FONTS.medium }}>Lista programada</Text>
              </Pressable>

              {isProgrammed ? (
                <View style={{ gap: SPACING.sm }}>
                  <Pressable style={[styles.dateBtn, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]} onPress={() => setShowDatePicker(true)} testID="lista-date-button">
                    <Feather name="calendar" size={16} color={colors.onSurfaceTertiary} />
                    <Text style={{ color: colors.onSurface, fontFamily: FONTS.medium }}>{date ? formatLocalDate(date, { withYear: true }) : "Elegir fecha"}</Text>
                  </Pressable>
                  <Pressable style={[styles.dateBtn, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]} onPress={() => setShowTimePicker(true)} testID="lista-time-button">
                    <Feather name="clock" size={16} color={colors.onSurfaceTertiary} />
                    <Text style={{ color: colors.onSurface, fontFamily: FONTS.medium }}>{`${hour}:${minute}`}</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={{ flexDirection: "row", gap: SPACING.md }}>
                <Pressable style={styles.cancelBtn} onPress={() => setShowNew(false)} testID="lista-new-cancel">
                  <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.bold }}>Cancelar</Text>
                </Pressable>
                <Button title="Crear" onPress={onCreate} style={{ flex: 1 }} testID="lista-new-submit" />
              </View>
            </KeyboardAwareScrollView>
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

      <TimePickerModal
        visible={showTimePicker}
        initialHour={parseInt(hour, 10) || 0}
        initialMinute={parseInt(minute, 10) || 0}
        colors={colors}
        title="Hora programada"
        onSelect={(h, m) => {
          setHour(String(h).padStart(2, "0"));
          setMinute(String(m).padStart(2, "0"));
          setShowTimePicker(false);
        }}
        onRequestClose={() => setShowTimePicker(false)}
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

      <Modal visible={showHistory} transparent animationType="slide" onRequestClose={() => setShowHistory(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.newCard, { backgroundColor: colors.surfaceSecondary, maxHeight: "75%" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Historial de Listas</Text>
              <Pressable onPress={() => setShowHistory(false)} hitSlop={8} testID="lista-history-close">
                <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>
            <FlatList
              data={history}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: SPACING.sm, paddingTop: SPACING.md }}
              ListEmptyComponent={
                <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.medium, textAlign: "center", paddingVertical: SPACING.lg }}>
                  Sin listas completadas todavía.
                </Text>
              }
              renderItem={({ item }) => (
                <View style={[styles.card, { backgroundColor: colors.surfaceTertiary }]}>
                  <Feather name="check-circle" size={18} color={colors.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.onSurface }]} numberOfLines={1}>
                      {item.list_code ? `#${item.list_code} · ` : ""}
                      {item.title}
                    </Text>
                    {item.completed_at ? (
                      <Text style={[styles.cardMeta, { color: colors.onSurfaceTertiary }]}>
                        {formatLocalDate(item.completed_at)} · {formatLocalTime(item.completed_at)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md, height: 48 },
  historyBtn: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  searchInput: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, height: "100%" },
  label: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, marginLeft: 2 },
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md },
  cardTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  cardMeta: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, marginTop: 2 },
  fab: { position: "absolute", right: SPACING.lg, bottom: SPACING.xl, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.5)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  newCard: { width: "100%", maxWidth: 380, maxHeight: "85%", borderRadius: RADIUS.lg, padding: SPACING.xl },
  reminderToggle: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, height: 48, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md },
  cancelBtn: { flex: 1, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  addItemRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, paddingLeft: SPACING.md, paddingRight: 6, height: 48 },
  addItemInput: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, height: "100%" },
  addItemBtn: { width: 36, height: 36, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  draftItemRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.sm, borderRadius: RADIUS.md },
});
