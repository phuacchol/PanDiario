import { useState, useMemo } from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Feather } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { EmptyState } from "@/src/components/Mascot";
import { Card, Button, Field, ChipRow } from "@/src/components/ui";
import { DatePickerModal } from "@/src/components/DatePickerModal";
import { useTheme } from "@/src/theme/ThemeContext";
import { useData } from "@/src/context/DataContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatLocalDate, formatLocalTime } from "@/src/utils/format";

const LEAD_OPTIONS = [
  { key: "15", label: "15 min antes" },
  { key: "30", label: "30 min antes" },
  { key: "60", label: "1 hora antes" },
];

export default function NotaScreen() {
  const { colors } = useTheme();
  const { notes, addNote, toggleNoteDone, deleteNote } = useData();

  const [text, setText] = useState("");
  const [isReminder, setIsReminder] = useState(false);
  const [date, setDate] = useState<string>("");
  const [hour, setHour] = useState("08");
  const [minute, setMinute] = useState("00");
  const [leadMinutes, setLeadMinutes] = useState("15");
  const [showDatePicker, setShowDatePicker] = useState(false);

  const pending = useMemo(() => notes.filter((n) => !n.done), [notes]);
  const done = useMemo(() => notes.filter((n) => n.done), [notes]);

  const onSubmit = async () => {
    const clean = text.trim();
    if (!clean) return;

    let remindAt: string | null = null;
    if (isReminder && date) {
      const [y, m, d] = date.split("-").map(Number);
      const h = Math.min(23, Math.max(0, parseInt(hour, 10) || 0));
      const min = Math.min(59, Math.max(0, parseInt(minute, 10) || 0));
      remindAt = new Date(y, (m || 1) - 1, d || 1, h, min).toISOString();
    }

    await addNote({ text: clean, isReminder: isReminder && !!remindAt, remindAt, leadMinutes: parseInt(leadMinutes, 10) });
    setText("");
    setIsReminder(false);
    setDate("");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <TopBar title="Nota" />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.lg }} bottomOffset={20}>
        <Card style={{ gap: SPACING.md }}>
          <Field label="Nota" icon="edit-3" placeholder="¿Qué quieres recordar?" value={text} onChangeText={setText} multiline testID="nota-text-input" />

          <Pressable style={styles.reminderToggle} onPress={() => setIsReminder((v) => !v)} testID="nota-reminder-toggle">
            <Feather name={isReminder ? "check-square" : "square"} size={20} color={colors.brand} />
            <Text style={[styles.reminderLabel, { color: colors.onSurface }]}>Marcar como recordatorio</Text>
          </Pressable>

          {isReminder ? (
            <View style={{ gap: SPACING.sm }}>
              <Pressable
                style={[styles.dateBtn, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}
                onPress={() => setShowDatePicker(true)}
                testID="nota-date-button"
              >
                <Feather name="calendar" size={16} color={colors.onSurfaceTertiary} />
                <Text style={{ color: colors.onSurface, fontFamily: FONTS.medium }}>
                  {date ? formatLocalDate(date, { withYear: true }) : "Elegir fecha"}
                </Text>
              </Pressable>

              <View style={{ flexDirection: "row", gap: SPACING.sm }}>
                <Field label="Hora" keyboardType="number-pad" value={hour} onChangeText={setHour} containerStyle={{ flex: 1 }} testID="nota-hour-input" />
                <Field label="Minuto" keyboardType="number-pad" value={minute} onChangeText={setMinute} containerStyle={{ flex: 1 }} testID="nota-minute-input" />
              </View>

              <View style={{ gap: SPACING.xs }}>
                <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Avisar con anticipación</Text>
                <ChipRow options={LEAD_OPTIONS} value={leadMinutes} onChange={setLeadMinutes} testID="nota-lead-chips" />
              </View>
            </View>
          ) : null}

          <Button title="Guardar Nota" icon="plus" onPress={onSubmit} testID="nota-submit-button" />
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Pendientes</Text>
        {pending.length === 0 ? (
          <EmptyState variant="happy" title="No hay notas pendientes" subtitle="Anota algo arriba o dilo por voz." />
        ) : (
          <FlatList
            data={pending}
            scrollEnabled={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: SPACING.sm }}
            renderItem={({ item }) => (
              <View style={[styles.noteRow, { backgroundColor: colors.surfaceSecondary }]}>
                <Pressable onPress={() => toggleNoteDone(item.id)} hitSlop={8} testID={`nota-toggle-${item.id}`}>
                  <Feather name="circle" size={20} color={colors.onSurfaceTertiary} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.noteText, { color: colors.onSurface }]}>{item.text}</Text>
                  {item.is_reminder && item.remind_at ? (
                    <Text style={[styles.noteMeta, { color: colors.brand }]}>
                      <Feather name="bell" size={11} /> {formatLocalDate(item.remind_at)} · {formatLocalTime(item.remind_at)}
                    </Text>
                  ) : null}
                </View>
                <Pressable onPress={() => deleteNote(item.id)} hitSlop={8} testID={`nota-delete-${item.id}`}>
                  <Feather name="trash-2" size={18} color={colors.onSurfaceTertiary} />
                </Pressable>
              </View>
            )}
          />
        )}

        {done.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Completadas</Text>
            <FlatList
              data={done}
              scrollEnabled={false}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: SPACING.sm }}
              renderItem={({ item }) => (
                <View style={[styles.noteRow, { backgroundColor: colors.surfaceSecondary, opacity: 0.6 }]}>
                  <Pressable onPress={() => toggleNoteDone(item.id)} hitSlop={8} testID={`nota-toggle-${item.id}`}>
                    <Feather name="check-circle" size={20} color={colors.success} />
                  </Pressable>
                  <Text style={[styles.noteText, { color: colors.onSurfaceTertiary, textDecorationLine: "line-through", flex: 1 }]}>{item.text}</Text>
                  <Pressable onPress={() => deleteNote(item.id)} hitSlop={8} testID={`nota-delete-${item.id}`}>
                    <Feather name="trash-2" size={18} color={colors.onSurfaceTertiary} />
                  </Pressable>
                </View>
              )}
            />
          </>
        ) : null}
      </KeyboardAwareScrollView>

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
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, marginLeft: 2 },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  reminderToggle: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  reminderLabel: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, height: 48, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md },
  noteRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md },
  noteText: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base },
  noteMeta: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, marginTop: 4 },
});
