import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { DarkHeader, darkHeaderSearchStyles } from "@/src/components/DarkHeader";
import { EmptyState } from "@/src/components/Mascot";
import { DatePickerModal } from "@/src/components/DatePickerModal";
import { TimePickerModal } from "@/src/components/TimePickerModal";
import { CompraOverlayModal } from "@/src/components/home/CompraOverlayModal";
import { ModalFormHeader, ModalFormField, ModalFormButton } from "@/src/components/ModalForm";
import { useTheme } from "@/src/theme/ThemeContext";
import { useData, type ListRecord, type ListEntry } from "@/src/context/DataContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE, NETO_GRADIENT, paletteColor, MODAL_FORM_BG_GRADIENT } from "@/src/theme/theme";
import { formatLocalDate, formatLocalTime } from "@/src/utils/format";

type Panel = "listas" | "programadas";
type DraftItem = { id: string; text: string; done: boolean };

// Paleta rotativa para la franja de color de cada tarjeta de lista: el color
// se deriva de forma estable a partir del id de la lista (ver paletteColor
// en theme.ts), para que cada una mantenga siempre el mismo color entre
// refrescos y reordenamientos.
const LISTA_ACCENT_PALETTE = ["#4A90E2", "#2ECC71", "#9B59B6", "#E67E22", "#1FB6B6", "#E84393"];

function ListaCard({
  item,
  entries,
  onOpen,
  onPlay,
  onEdit,
  onDelete,
}: {
  item: ListRecord;
  entries: ListEntry[];
  onOpen: () => void;
  onPlay: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const accent = paletteColor(item.id, LISTA_ACCENT_PALETTE);
  const total = entries.length;
  const done = entries.filter((e) => e.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const inProgress = item.status === "in_progress";

  return (
    <View>
      <View style={[cardStyles.header, { backgroundColor: accent }]}>
        <Text style={cardStyles.headerCode} numberOfLines={1}>
          {item.list_code ? `#${item.list_code}` : "LISTA"}
        </Text>
      </View>
      <Pressable style={[cardStyles.body, { backgroundColor: colors.surfaceSecondary }]} onPress={onOpen} testID={`lista-open-${item.id}`}>
        <Text style={[cardStyles.title, { color: colors.onSurface }]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.is_programmed && item.scheduled_at ? (
          <Text style={[cardStyles.meta, { color: colors.onSurfaceTertiary }]}>
            {formatLocalDate(item.scheduled_at)} {formatLocalTime(item.scheduled_at)}
          </Text>
        ) : null}
        <View style={cardStyles.row}>
          <Pressable style={[cardStyles.playBtn, { backgroundColor: inProgress ? colors.success : accent }]} onPress={onPlay} hitSlop={8} testID={`lista-play-${item.id}`}>
            <Feather name={inProgress ? "pause" : "play"} size={16} color="#FFFFFF" />
          </Pressable>
          <View style={[cardStyles.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[cardStyles.progressFill, { width: `${pct}%`, backgroundColor: accent }]} />
          </View>
          <Pressable style={[cardStyles.actionBtn, { backgroundColor: colors.brand }]} onPress={onEdit} hitSlop={8} testID={`lista-edit-${item.id}`}>
            <Feather name="edit-2" size={14} color="#FFFFFF" />
          </Pressable>
          <Pressable style={[cardStyles.actionBtn, { backgroundColor: colors.error }]} onPress={onDelete} hitSlop={8} testID={`lista-delete-${item.id}`}>
            <Feather name="trash-2" size={14} color="#FFFFFF" />
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

export default function ListaScreen() {
  const { colors } = useTheme();
  const { lists, listEntries, addList, deleteList, toggleListPlay, addListEntry, toggleListEntry, deleteListEntry, completeList } = useData();

  const [panel, setPanel] = useState<Panel>("listas");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [startEditing, setStartEditing] = useState(false);
  const [detailListId, setDetailListId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

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

  // Detalle de solo lectura de una lista ya archivada: sin checkbox/editar/
  // borrar, solo consulta -incluye los ítems tachados- con la fecha/hora
  // de finalización.
  const detailList = lists.find((l) => l.id === detailListId) || null;
  const detailEntries = listEntries.filter((e) => e.list_id === detailListId);

  // Play es un alternador: toca para pasar a "en ejecución" (ícono verde,
  // bloqueada contra edición estructural) y toca de nuevo para volver a
  // "activa" (color neutro, desbloqueada). El ícono en sí alterna el
  // estado; el panel de la lista se abre en cualquiera de los dos casos.
  const onPlay = (list: ListRecord) => {
    toggleListPlay(list.id);
    setStartEditing(false);
    setActiveListId(list.id);
  };

  // Tocar el cuerpo de la tarjeta abre su vista de detalle/checklist tal
  // cual está (sin tocar el estado de Play). El lápiz hace lo mismo pero
  // entra directo en modo edición -para borrar ítems de una lista todavía
  // inactiva, ver el bloqueo estructural condicionado a in_progress en
  // CompraOverlayModal-.
  const openList = (list: ListRecord, editing: boolean) => {
    setStartEditing(editing);
    setActiveListId(list.id);
  };

  // Se antepone (arriba del input) para confirmar visualmente la adición
  // inmediata, igual que addListEntry sobre una lista ya creada.
  const addDraftItem = () => {
    const clean = draftItemText.trim();
    if (!clean) return;
    setDraftItems((prev) => [{ id: `draft_${Date.now()}_${Math.floor(Math.random() * 10000)}`, text: clean, done: false }, ...prev]);
    setDraftItemText("");
  };

  const onCreate = async () => {
    if (isCreating) return;
    const title = newTitle.trim();
    if (!title) return;
    setIsCreating(true);
    try {
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
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <DarkHeader title="Listas" testIDPrefix="lista">
        <View style={headerStyles.filterRow}>
          <View style={headerStyles.segmentTrack}>
            <Pressable
              style={[headerStyles.segmentItem, panel === "listas" && headerStyles.segmentItemActive]}
              onPress={() => setPanel("listas")}
              testID="segment-listas"
            >
              <Text style={[headerStyles.segmentText, panel === "listas" && { color: colors.heroBg }]}>Listas</Text>
            </Pressable>
            <Pressable
              style={[headerStyles.segmentItem, panel === "programadas" && headerStyles.segmentItemActive]}
              onPress={() => setPanel("programadas")}
              testID="segment-programadas"
            >
              <Text style={[headerStyles.segmentText, panel === "programadas" && { color: colors.heroBg }]}>Recordatorios</Text>
            </Pressable>
          </View>
          <Pressable style={headerStyles.historyBtn} onPress={() => setShowHistory(true)} testID="lista-history-button">
            <Feather name="clock" size={18} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={darkHeaderSearchStyles.wrap}>
          <Feather name="search" size={18} color={colors.onSurfaceTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar listas..."
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[darkHeaderSearchStyles.input, { color: colors.onSurface }]}
            testID="lista-search-input"
          />
        </View>
      </DarkHeader>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm }}
        ListEmptyComponent={<EmptyState variant="box" title="Sin listas" subtitle="Crea una desde el botón + o dilo por voz." />}
        renderItem={({ item }: { item: ListRecord }) => (
          <ListaCard
            item={item}
            entries={listEntries.filter((e) => e.list_id === item.id)}
            onOpen={() => openList(item, false)}
            onPlay={() => onPlay(item)}
            onEdit={() => openList(item, true)}
            onDelete={() => deleteList(item.id)}
          />
        )}
      />

      <Pressable style={styles.fab} onPress={() => setShowNew(true)} testID="lista-fab">
        <LinearGradient colors={NETO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabGradient}>
          <Feather name="plus" size={26} color="#FFFFFF" />
        </LinearGradient>
      </Pressable>

      <Modal visible={showNew} transparent animationType="fade" onRequestClose={() => setShowNew(false)}>
        <View style={styles.backdrop}>
          <LinearGradient colors={MODAL_FORM_BG_GRADIENT} style={styles.newCard}>
            <KeyboardAwareScrollView contentContainerStyle={{ gap: SPACING.md }} bottomOffset={20}>
              <ModalFormHeader icon="check-square" title="Nueva Lista" />
              <ModalFormField label="Nombre de la lista" icon="edit-3" placeholder="Ej. Compras del súper" value={newTitle} onChangeText={setNewTitle} testID="lista-new-title" />

              <View style={{ gap: SPACING.xs }}>
                <Text style={formStyles.label}>Ítems</Text>
                <View style={formStyles.addItemRow}>
                  <TextInput
                    value={draftItemText}
                    onChangeText={setDraftItemText}
                    placeholder="Ej. 5 panes"
                    placeholderTextColor="#94A3B8"
                    style={formStyles.addItemInput}
                    onSubmitEditing={addDraftItem}
                    testID="lista-new-item-input"
                  />
                  <Pressable onPress={addDraftItem} style={formStyles.addItemBtn} testID="lista-new-item-add">
                    <Feather name="plus" size={18} color="#FFFFFF" />
                  </Pressable>
                </View>

                {draftItems.map((item) => (
                  <View key={item.id} style={formStyles.draftItemRow}>
                    <Pressable
                      onPress={() => setDraftItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))}
                      hitSlop={8}
                      testID={`lista-new-item-toggle-${item.id}`}
                    >
                      <Feather name={item.done ? "check-circle" : "circle"} size={20} color={item.done ? "#2ECC71" : "#94A3B8"} />
                    </Pressable>
                    <Text style={[formStyles.draftItemText, item.done && { textDecorationLine: "line-through" }]} numberOfLines={1}>
                      {item.text}
                    </Text>
                    <Pressable onPress={() => setDraftItems((prev) => prev.filter((i) => i.id !== item.id))} hitSlop={8} testID={`lista-new-item-remove-${item.id}`}>
                      <Feather name="trash-2" size={18} color="#E55050" />
                    </Pressable>
                  </View>
                ))}
              </View>

              <Pressable style={styles.reminderToggle} onPress={() => setIsProgrammed((v) => !v)} testID="lista-programmed-toggle">
                <Feather name={isProgrammed ? "check-square" : "square"} size={20} color="#4A72FF" />
                <Text style={formStyles.toggleText}>Lista programada</Text>
              </Pressable>

              {isProgrammed ? (
                <View style={{ gap: SPACING.sm }}>
                  <Pressable style={formStyles.dateBtn} onPress={() => setShowDatePicker(true)} testID="lista-date-button">
                    <Feather name="calendar" size={16} color="#4A72FF" />
                    <Text style={formStyles.dateBtnText}>{date ? formatLocalDate(date, { withYear: true }) : "Elegir fecha"}</Text>
                  </Pressable>
                  <Pressable style={formStyles.dateBtn} onPress={() => setShowTimePicker(true)} testID="lista-time-button">
                    <Feather name="clock" size={16} color="#4A72FF" />
                    <Text style={formStyles.dateBtnText}>{`${hour}:${minute}`}</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={{ flexDirection: "row", gap: SPACING.md }}>
                <Pressable style={styles.cancelBtn} onPress={() => setShowNew(false)} testID="lista-new-cancel">
                  <Text style={formStyles.cancelText}>Cancelar</Text>
                </Pressable>
                <ModalFormButton title="Crear Lista" onPress={onCreate} loading={isCreating} disabled={isCreating} style={{ flex: 1 }} testID="lista-new-submit" />
              </View>
            </KeyboardAwareScrollView>
          </LinearGradient>
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
        initialEditing={startEditing}
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
                <Pressable
                  style={[styles.card, { backgroundColor: colors.surfaceTertiary }]}
                  onPress={() => setDetailListId(item.id)}
                  testID={`lista-history-open-${item.id}`}
                >
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
                  <Feather name="chevron-right" size={18} color={colors.onSurfaceTertiary} />
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={!!detailListId} transparent animationType="slide" onRequestClose={() => setDetailListId(null)}>
        <View style={styles.backdrop}>
          <View style={[styles.newCard, { backgroundColor: colors.surfaceSecondary, maxHeight: "80%" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.onSurface }]} numberOfLines={1}>
                  {detailList?.list_code ? `#${detailList.list_code} · ` : ""}
                  {detailList?.title}
                </Text>
                {detailList?.completed_at ? (
                  <Text style={[styles.cardMeta, { color: colors.onSurfaceTertiary }]}>
                    Finalizada el {formatLocalDate(detailList.completed_at)} · {formatLocalTime(detailList.completed_at)}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={() => setDetailListId(null)} hitSlop={8} testID="lista-detail-close">
                <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>
            <FlatList
              data={detailEntries}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: SPACING.sm, paddingTop: SPACING.md }}
              ListEmptyComponent={
                <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.medium, textAlign: "center", paddingVertical: SPACING.lg }}>
                  Esta lista no tiene ítems.
                </Text>
              }
              renderItem={({ item }) => (
                <View style={[styles.draftItemRow, { backgroundColor: colors.surfaceTertiary }]} testID={`lista-detail-entry-${item.id}`}>
                  <Feather name={item.done ? "check-circle" : "circle"} size={18} color={item.done ? colors.success : colors.onSurfaceTertiary} />
                  <Text
                    style={{
                      flex: 1,
                      color: item.extra ? colors.accent : colors.onSurface,
                      fontFamily: FONTS.medium,
                      textDecorationLine: item.done ? "line-through" : "none",
                    }}
                  >
                    {item.text}
                  </Text>
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
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md },
  cardTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  cardMeta: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, marginTop: 2 },
  fab: {
    position: "absolute",
    right: SPACING.lg,
    bottom: SPACING.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.5)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  newCard: { width: "100%", maxWidth: 380, maxHeight: "85%", borderRadius: RADIUS.lg, padding: SPACING.xl },
  reminderToggle: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  cancelBtn: { flex: 1, height: 56, borderRadius: RADIUS.lg, alignItems: "center", justifyContent: "center" },
  draftItemRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.sm, borderRadius: RADIUS.md },
});

const formStyles = StyleSheet.create({
  label: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, marginLeft: 2, color: "#1E1B38" },
  toggleText: { color: "#1E1B38", fontFamily: FONTS.medium },
  cancelText: { color: "#94A3B8", fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  addItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingLeft: SPACING.md,
    paddingRight: 6,
    height: 52,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  addItemInput: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, height: "100%", color: "#1E1B38" },
  addItemBtn: { width: 38, height: 38, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", backgroundColor: "#4A72FF" },
  draftItemRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0" },
  draftItemText: { flex: 1, color: "#1E1B38", fontFamily: FONTS.medium },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    height: 52,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: SPACING.md,
  },
  dateBtnText: { color: "#1E1B38", fontFamily: FONTS.medium },
});

const headerStyles = StyleSheet.create({
  filterRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  segmentTrack: { flex: 1, flexDirection: "row", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: RADIUS.pill, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, alignItems: "center" },
  segmentItemActive: { backgroundColor: "#FFFFFF" },
  segmentText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm, color: "rgba(255,255,255,0.75)" },
  historyBtn: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)" },
});

const cardStyles = StyleSheet.create({
  header: {
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
  },
  headerCode: { fontFamily: FONTS.black, fontSize: FONT_SIZE.sm, color: "#FFFFFF" },
  body: {
    borderRadius: RADIUS.lg,
    marginTop: -SPACING.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  title: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  meta: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, marginTop: -4 },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  playBtn: { width: 36, height: 36, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  progressTrack: { flex: 1, height: 8, borderRadius: RADIUS.pill, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: RADIUS.pill },
  actionBtn: { width: 32, height: 32, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
});
