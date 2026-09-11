import { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { DarkHeader, darkHeaderSearchStyles } from "@/src/components/DarkHeader";
import { EmptyState } from "@/src/components/Mascot";
import { ChipRow } from "@/src/components/ui";
import { DatePickerModal } from "@/src/components/DatePickerModal";
import { TimePickerModal } from "@/src/components/TimePickerModal";
import { ModalFormHeader, ModalFormField, ModalFormSegmented, ModalFormButton } from "@/src/components/ModalForm";
import { useTheme } from "@/src/theme/ThemeContext";
import { useData, type Note } from "@/src/context/DataContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE, paletteColor, MODAL_FORM_BG_GRADIENT } from "@/src/theme/theme";
import { formatLocalDate, formatLocalTime } from "@/src/utils/format";
import { LEAD_TIME_OPTIONS } from "@/src/constants";

type Panel = "notas" | "recordatorios";

// Paleta rotativa para la franja de color de cada tarjeta de nota: el color
// se deriva de forma estable a partir del id de la nota (ver paletteColor en
// theme.ts), para que cada una mantenga siempre el mismo color.
const NOTA_ACCENT_PALETTE = ["#4A90E2", "#2ECC71", "#A855F7", "#E67E22", "#1FB6B6", "#E84393"];

function NotaCard({
  item,
  showPin,
  overdue,
  onToggleDone,
  onOpen,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  item: Note;
  showPin: boolean;
  overdue: boolean;
  onToggleDone: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const { colors } = useTheme();
  const accent = paletteColor(item.id, NOTA_ACCENT_PALETTE);

  return (
    <View style={{ opacity: overdue ? 0.6 : 1 }}>
      <View style={[cardStyles.header, { backgroundColor: accent }]}>
        <Text style={cardStyles.headerSubject} numberOfLines={1}>
          {item.subject?.trim() || "Nota"}
        </Text>
        <Pressable onPress={onToggleDone} hitSlop={8} style={cardStyles.checkBadge} testID={`nota-toggle-${item.id}`}>
          <Feather name="check" size={13} color="#FFFFFF" />
        </Pressable>
      </View>
      <Pressable style={[cardStyles.body, { backgroundColor: colors.surfaceSecondary }]} onPress={onOpen} testID={`nota-open-${item.id}`}>
        <Text style={[cardStyles.text, { color: colors.onSurface }]}>{item.text}</Text>
        {item.is_reminder && item.remind_at ? (
          <Text style={[cardStyles.meta, { color: overdue ? colors.error : colors.brand }]}>
            <Feather name="bell" size={11} /> {formatLocalDate(item.remind_at)} · {formatLocalTime(item.remind_at)}
          </Text>
        ) : null}
        <View style={cardStyles.actions}>
          {showPin ? (
            <Pressable
              style={[cardStyles.actionBtn, { backgroundColor: item.pinned ? colors.warning : colors.onSurfaceTertiary }]}
              onPress={onTogglePin}
              hitSlop={8}
              testID={`nota-pin-${item.id}`}
            >
              <Feather name="bookmark" size={14} color="#FFFFFF" />
            </Pressable>
          ) : null}
          <Pressable style={[cardStyles.actionBtn, { backgroundColor: colors.brand }]} onPress={onEdit} hitSlop={8} testID={`nota-edit-${item.id}`}>
            <Feather name="edit-2" size={14} color="#FFFFFF" />
          </Pressable>
          <Pressable style={[cardStyles.actionBtn, { backgroundColor: colors.error }]} onPress={onDelete} hitSlop={8} testID={`nota-delete-${item.id}`}>
            <Feather name="trash-2" size={14} color="#FFFFFF" />
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

export default function NotaScreen() {
  const { colors } = useTheme();
  const { notes, addNote, updateNote, toggleNoteDone, toggleNotePin, deleteNote } = useData();

  const [panel, setPanel] = useState<Panel>("notas");
  const [search, setSearch] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [kind, setKind] = useState<"nota" | "recordatorio">("nota");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [hour, setHour] = useState("08");
  const [minute, setMinute] = useState("00");
  const [leadMinutes, setLeadMinutes] = useState("15");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const query = search.trim().toLowerCase();

  const plainNotes = useMemo(() => {
    const matchesSearch = (n: Note) => !query || n.subject.toLowerCase().includes(query) || n.text.toLowerCase().includes(query);
    return notes
      .filter((n) => !n.is_reminder && !n.done && matchesSearch(n))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.created_at.localeCompare(a.created_at));
  }, [notes, query]);

  const reminders = useMemo(() => {
    const matchesSearch = (n: Note) => !query || n.subject.toLowerCase().includes(query) || n.text.toLowerCase().includes(query);
    const now = Date.now();
    const active = notes.filter((n) => n.is_reminder && !n.done && matchesSearch(n) && new Date(n.remind_at || 0).getTime() >= now);
    const overdue = notes.filter((n) => n.is_reminder && !n.done && matchesSearch(n) && new Date(n.remind_at || 0).getTime() < now);
    active.sort((a, b) => new Date(a.remind_at || 0).getTime() - new Date(b.remind_at || 0).getTime());
    overdue.sort((a, b) => new Date(b.remind_at || 0).getTime() - new Date(a.remind_at || 0).getTime());
    return [...active, ...overdue];
  }, [notes, query]);

  // Historial permanente: notas/recordatorios ya marcados como cumplidos,
  // ordenados cronológicamente por fecha/hora de cumplimiento -separado
  // por pestaña, igual que la vista activa-.
  const historyItems = useMemo(() => {
    return notes
      .filter((n) => n.done && (panel === "notas" ? !n.is_reminder : n.is_reminder))
      .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
  }, [notes, panel]);

  const openNewEditor = (initialKind: "nota" | "recordatorio") => {
    setEditingId(null);
    setKind(initialKind);
    setSubject("");
    setText("");
    setDate("");
    setHour("08");
    setMinute("00");
    setLeadMinutes("15");
    setShowEditor(true);
  };

  const openEditEditor = (note: Note) => {
    setEditingId(note.id);
    setKind(note.is_reminder ? "recordatorio" : "nota");
    setSubject(note.subject);
    setText(note.text);
    if (note.remind_at) {
      const d = new Date(note.remind_at);
      setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      setHour(String(d.getHours()).padStart(2, "0"));
      setMinute(String(d.getMinutes()).padStart(2, "0"));
    } else {
      setDate("");
    }
    setLeadMinutes(String(note.lead_minutes));
    setShowEditor(true);
  };

  const onSubmit = async () => {
    const cleanText = text.trim();
    if (!cleanText) return;

    let remindAt: string | null = null;
    if (kind === "recordatorio" && date) {
      const [y, m, d] = date.split("-").map(Number);
      const h = Math.min(23, Math.max(0, parseInt(hour, 10) || 0));
      const min = Math.min(59, Math.max(0, parseInt(minute, 10) || 0));
      remindAt = new Date(y, (m || 1) - 1, d || 1, h, min).toISOString();
    }

    if (editingId) {
      await updateNote(editingId, { subject: subject.trim(), text: cleanText, remindAt, leadMinutes: parseInt(leadMinutes, 10) });
    } else {
      await addNote({ subject: subject.trim(), text: cleanText, isReminder: kind === "recordatorio" && !!remindAt, remindAt, leadMinutes: parseInt(leadMinutes, 10) });
    }
    setShowEditor(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <DarkHeader title="Nota" testIDPrefix="nota">
        <View style={headerStyles.filterRow}>
          <View style={headerStyles.segmentTrack}>
            <Pressable
              style={[headerStyles.segmentItem, panel === "notas" && headerStyles.segmentItemActive]}
              onPress={() => setPanel("notas")}
              testID="segment-notas"
            >
              <Text style={[headerStyles.segmentText, panel === "notas" && { color: colors.heroBg }]}>Notas</Text>
            </Pressable>
            <Pressable
              style={[headerStyles.segmentItem, panel === "recordatorios" && headerStyles.segmentItemActive]}
              onPress={() => setPanel("recordatorios")}
              testID="segment-recordatorios"
            >
              <Text style={[headerStyles.segmentText, panel === "recordatorios" && { color: colors.heroBg }]}>Recordatorios</Text>
            </Pressable>
          </View>
          <Pressable style={headerStyles.historyBtn} onPress={() => setShowHistory(true)} testID="nota-history-button">
            <Feather name="clock" size={18} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={darkHeaderSearchStyles.wrap}>
          <Feather name="search" size={18} color={colors.onSurfaceTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por asunto..."
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[darkHeaderSearchStyles.input, { color: colors.onSurface }]}
            testID="nota-search-input"
          />
        </View>
      </DarkHeader>

      <FlatList
        data={panel === "notas" ? plainNotes : reminders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm }}
        ListEmptyComponent={
          <EmptyState
            variant="happy"
            title={panel === "notas" ? "No hay notas" : "No hay recordatorios"}
            subtitle="Agrega una desde el botón + o dilo por voz."
          />
        }
        renderItem={({ item }) => {
          const overdue = item.is_reminder && !!item.remind_at && new Date(item.remind_at).getTime() < Date.now();
          return (
            <NotaCard
              item={item}
              showPin={panel === "notas"}
              overdue={overdue}
              onToggleDone={() => toggleNoteDone(item.id)}
              onOpen={() => openEditEditor(item)}
              onEdit={() => openEditEditor(item)}
              onDelete={() => deleteNote(item.id)}
              onTogglePin={() => toggleNotePin(item.id)}
            />
          );
        }}
      />

      <Pressable style={[styles.fab, { backgroundColor: colors.brand }]} onPress={() => openNewEditor(panel === "recordatorios" ? "recordatorio" : "nota")} testID="nota-fab">
        <Feather name="plus" size={26} color={colors.onBrand} />
      </Pressable>

      <Modal visible={showEditor} transparent animationType="slide" onRequestClose={() => setShowEditor(false)}>
        <View style={styles.backdrop}>
          <LinearGradient colors={MODAL_FORM_BG_GRADIENT} style={styles.sheet}>
            <KeyboardAwareScrollView contentContainerStyle={{ gap: SPACING.md }} bottomOffset={20}>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderSpacer} />
                <ModalFormHeader icon="edit-3" title={editingId ? "Editar Nota" : kind === "recordatorio" ? "Nuevo Recordatorio" : "Nueva Nota"} />
                <Pressable onPress={() => setShowEditor(false)} hitSlop={8} testID="nota-editor-close" style={styles.sheetHeaderSpacer}>
                  <Feather name="x" size={22} color="#94A3B8" />
                </Pressable>
              </View>

              {!editingId ? (
                <ModalFormSegmented
                  testID="nota-kind-tabs"
                  options={[
                    { key: "nota", label: "Nota", icon: "edit-3" },
                    { key: "recordatorio", label: "Recordatorio", icon: "bell" },
                  ]}
                  value={kind}
                  onChange={(k) => setKind(k as any)}
                />
              ) : null}

              <ModalFormField label="Asunto" icon="tag" placeholder="Título breve" value={subject} onChangeText={setSubject} testID="nota-subject-input" />
              <ModalFormField label="Texto" icon="align-left" placeholder="Detalle..." multiline numberOfLines={4} value={text} onChangeText={setText} testID="nota-text-input" />

              {kind === "recordatorio" ? (
                <View style={{ gap: SPACING.sm }}>
                  <Pressable style={formStyles.dateBtn} onPress={() => setShowDatePicker(true)} testID="nota-date-button">
                    <Feather name="calendar" size={16} color="#4A72FF" />
                    <Text style={formStyles.dateBtnText}>{date ? formatLocalDate(date, { withYear: true }) : "Elegir fecha"}</Text>
                  </Pressable>

                  <Pressable style={formStyles.dateBtn} onPress={() => setShowTimePicker(true)} testID="nota-time-button">
                    <Feather name="clock" size={16} color="#4A72FF" />
                    <Text style={formStyles.dateBtnText}>{`${hour}:${minute}`}</Text>
                  </Pressable>

                  <View style={{ gap: SPACING.xs }}>
                    <Text style={formStyles.label}>Avisar con anticipación</Text>
                    <ChipRow options={LEAD_TIME_OPTIONS.map((o) => ({ key: o.key, label: o.label }))} value={leadMinutes} onChange={setLeadMinutes} testID="nota-lead-chips" />
                  </View>
                </View>
              ) : null}

              <ModalFormButton title={editingId ? "Guardar Cambios" : "Guardar Nota"} onPress={onSubmit} testID="nota-submit-button" />
            </KeyboardAwareScrollView>
          </LinearGradient>
        </View>
      </Modal>

      <DatePickerModal
        visible={showDatePicker}
        initialDate={date || undefined}
        colors={colors}
        title="Fecha del recordatorio"
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
        title="Hora del recordatorio"
        onSelect={(h, m) => {
          setHour(String(h).padStart(2, "0"));
          setMinute(String(m).padStart(2, "0"));
          setShowTimePicker(false);
        }}
        onRequestClose={() => setShowTimePicker(false)}
      />

      <Modal visible={showHistory} transparent animationType="slide" onRequestClose={() => setShowHistory(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.surface, maxHeight: "75%" }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.onSurface }]}>
                {panel === "notas" ? "Historial de Notas" : "Historial de Recordatorios"}
              </Text>
              <Pressable onPress={() => setShowHistory(false)} hitSlop={8} testID="nota-history-close">
                <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>
            <FlatList
              data={historyItems}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: SPACING.sm }}
              ListEmptyComponent={
                <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.medium, textAlign: "center", paddingVertical: SPACING.lg }}>
                  {panel === "notas" ? "Sin notas completadas todavía." : "Sin recordatorios cumplidos todavía."}
                </Text>
              }
              renderItem={({ item }) => (
                <View style={[styles.noteCard, { backgroundColor: colors.surfaceTertiary }]}>
                  <Feather name="check-circle" size={18} color={colors.success} />
                  <View style={{ flex: 1 }}>
                    {item.subject ? <Text style={[styles.noteSubject, { color: colors.onSurface }]}>{item.subject}</Text> : null}
                    <Text style={[styles.noteText, { color: item.subject ? colors.onSurfaceTertiary : colors.onSurface }]} numberOfLines={2}>
                      {item.text}
                    </Text>
                    {item.completed_at ? (
                      <Text style={[styles.noteMeta, { color: colors.onSurfaceTertiary }]}>
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
  noteCard: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md },
  noteSubject: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  noteText: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, marginTop: 2 },
  noteMeta: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, marginTop: 4 },
  fab: { position: "absolute", right: SPACING.lg, bottom: SPACING.xl, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl, maxHeight: "85%" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.sm },
  sheetHeaderSpacer: { width: 22 },
  sheetTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
});

const formStyles = StyleSheet.create({
  label: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base, marginLeft: 2, color: "#1E1B38" },
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
  header: { borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.xl, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSubject: { flex: 1, fontFamily: FONTS.black, fontSize: FONT_SIZE.base, color: "#FFFFFF" },
  checkBadge: { width: 22, height: 22, borderRadius: RADIUS.pill, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.8)", alignItems: "center", justifyContent: "center" },
  body: { borderRadius: RADIUS.lg, marginTop: -SPACING.lg, padding: SPACING.md, gap: SPACING.sm },
  text: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base },
  meta: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: SPACING.sm },
  actionBtn: { width: 32, height: 32, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
});
