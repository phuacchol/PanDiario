import { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Feather } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { EmptyState } from "@/src/components/Mascot";
import { Button, Field, ChipRow, Segmented } from "@/src/components/ui";
import { DatePickerModal } from "@/src/components/DatePickerModal";
import { TimePickerModal } from "@/src/components/TimePickerModal";
import { useTheme } from "@/src/theme/ThemeContext";
import { useData, type Note } from "@/src/context/DataContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatLocalDate, formatLocalTime } from "@/src/utils/format";
import { LEAD_TIME_OPTIONS } from "@/src/constants";

type Panel = "notas" | "recordatorios";

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
      <TopBar title="Nota" />

      <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.md }}>
        <View style={[styles.searchWrap, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.onSurfaceTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por asunto..."
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[styles.searchInput, { color: colors.onSurface }]}
            testID="nota-search-input"
          />
        </View>

        <Segmented
          testID="nota-panel-tabs"
          options={[
            { key: "notas", label: "Notas" },
            { key: "recordatorios", label: "Recordatorios" },
          ]}
          value={panel}
          onChange={(k) => setPanel(k as Panel)}
        />
      </View>

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
            <View style={[styles.noteCard, { backgroundColor: colors.surfaceSecondary, opacity: overdue ? 0.6 : 1 }]}>
              <Pressable onPress={() => toggleNoteDone(item.id)} hitSlop={8} testID={`nota-toggle-${item.id}`}>
                <Feather name="circle" size={20} color={colors.onSurfaceTertiary} />
              </Pressable>
              <Pressable style={{ flex: 1 }} onPress={() => openEditEditor(item)} testID={`nota-open-${item.id}`}>
                {item.subject ? <Text style={[styles.noteSubject, { color: colors.onSurface }]}>{item.subject}</Text> : null}
                <Text style={[styles.noteText, { color: item.subject ? colors.onSurfaceTertiary : colors.onSurface }]} numberOfLines={2}>
                  {item.text}
                </Text>
                {item.is_reminder && item.remind_at ? (
                  <Text style={[styles.noteMeta, { color: overdue ? colors.error : colors.brand }]}>
                    <Feather name="bell" size={11} /> {formatLocalDate(item.remind_at)} · {formatLocalTime(item.remind_at)}
                  </Text>
                ) : null}
              </Pressable>
              {panel === "notas" ? (
                <Pressable onPress={() => toggleNotePin(item.id)} hitSlop={8} testID={`nota-pin-${item.id}`}>
                  <Feather name="bookmark" size={18} color={item.pinned ? colors.warning : colors.onSurfaceTertiary} />
                </Pressable>
              ) : null}
              <Pressable onPress={() => openEditEditor(item)} hitSlop={8} testID={`nota-edit-${item.id}`}>
                <Feather name="edit-2" size={17} color={colors.onSurfaceTertiary} />
              </Pressable>
              <Pressable onPress={() => deleteNote(item.id)} hitSlop={8} testID={`nota-delete-${item.id}`}>
                <Feather name="trash-2" size={18} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>
          );
        }}
      />

      <Pressable style={[styles.fab, { backgroundColor: colors.brand }]} onPress={() => openNewEditor(panel === "recordatorios" ? "recordatorio" : "nota")} testID="nota-fab">
        <Feather name="plus" size={26} color={colors.onBrand} />
      </Pressable>

      <Modal visible={showEditor} transparent animationType="slide" onRequestClose={() => setShowEditor(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <KeyboardAwareScrollView contentContainerStyle={{ gap: SPACING.md }} bottomOffset={20}>
              <View style={styles.sheetHeader}>
                <Text style={[styles.sheetTitle, { color: colors.onSurface }]}>{editingId ? "Editar" : "Nuevo"}</Text>
                <Pressable onPress={() => setShowEditor(false)} hitSlop={8} testID="nota-editor-close">
                  <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
                </Pressable>
              </View>

              {!editingId ? (
                <Segmented
                  testID="nota-kind-tabs"
                  options={[
                    { key: "nota", label: "Nota" },
                    { key: "recordatorio", label: "Recordatorio" },
                  ]}
                  value={kind}
                  onChange={(k) => setKind(k as any)}
                />
              ) : null}

              <Field label="Asunto" placeholder="Título breve" value={subject} onChangeText={setSubject} testID="nota-subject-input" />
              <Field label="Texto" placeholder="Detalle..." multiline numberOfLines={4} value={text} onChangeText={setText} testID="nota-text-input" />

              {kind === "recordatorio" ? (
                <View style={{ gap: SPACING.sm }}>
                  <Pressable
                    style={[styles.dateBtn, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}
                    onPress={() => setShowDatePicker(true)}
                    testID="nota-date-button"
                  >
                    <Feather name="calendar" size={16} color={colors.onSurfaceTertiary} />
                    <Text style={{ color: colors.onSurface, fontFamily: FONTS.medium }}>{date ? formatLocalDate(date, { withYear: true }) : "Elegir fecha"}</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.dateBtn, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}
                    onPress={() => setShowTimePicker(true)}
                    testID="nota-time-button"
                  >
                    <Feather name="clock" size={16} color={colors.onSurfaceTertiary} />
                    <Text style={{ color: colors.onSurface, fontFamily: FONTS.medium }}>{`${hour}:${minute}`}</Text>
                  </Pressable>

                  <View style={{ gap: SPACING.xs }}>
                    <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Avisar con anticipación</Text>
                    <ChipRow options={LEAD_TIME_OPTIONS.map((o) => ({ key: o.key, label: o.label }))} value={leadMinutes} onChange={setLeadMinutes} testID="nota-lead-chips" />
                  </View>
                </View>
              ) : null}

              <Button title={editingId ? "Guardar cambios" : "Guardar"} icon="check" onPress={onSubmit} testID="nota-submit-button" />
            </KeyboardAwareScrollView>
          </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md, height: 48 },
  searchInput: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, height: "100%" },
  label: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, marginLeft: 2 },
  noteCard: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md },
  noteSubject: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  noteText: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, marginTop: 2 },
  noteMeta: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, marginTop: 4 },
  fab: { position: "absolute", right: SPACING.lg, bottom: SPACING.xl, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  backdrop: { flex: 1, backgroundColor: "rgba(10,12,16,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl, maxHeight: "85%" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.sm },
  sheetTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, height: 48, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md },
});
