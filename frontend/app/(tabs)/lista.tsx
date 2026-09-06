import { useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, KeyboardAvoidingView, Platform, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { EmptyState } from "@/src/components/Mascot";
import { useTheme } from "@/src/theme/ThemeContext";
import { useData } from "@/src/context/DataContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";

export default function ListaScreen() {
  const { colors } = useTheme();
  const { listItems, addListItem, toggleListItem, deleteListItem } = useData();
  const [text, setText] = useState("");

  const onSubmit = async () => {
    const clean = text.trim();
    if (!clean) return;
    await addListItem(clean);
    setText("");
  };

  const pending = listItems.filter((i) => !i.done);
  const done = listItems.filter((i) => i.done);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <TopBar title="Lista" />

      <View style={[styles.inputRow, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Agregar a la lista..."
          placeholderTextColor={colors.onSurfaceTertiary}
          style={[styles.input, { color: colors.onSurface }]}
          onSubmitEditing={onSubmit}
          returnKeyType="done"
          testID="lista-text-input"
        />
        <Pressable onPress={onSubmit} style={[styles.addBtn, { backgroundColor: colors.brand }]} testID="lista-add-button">
          <Feather name="plus" size={20} color={colors.onBrand} />
        </Pressable>
      </View>

      {listItems.length === 0 ? (
        <EmptyState variant="box" title="Tu lista está vacía" subtitle="Agrega algo arriba o dilo por voz." />
      ) : (
        <FlatList
          data={[...pending, ...done]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm }}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: colors.surfaceSecondary }]}>
              <Pressable onPress={() => toggleListItem(item.id)} hitSlop={8} testID={`lista-toggle-${item.id}`}>
                <Feather name={item.done ? "check-circle" : "circle"} size={20} color={item.done ? colors.success : colors.onSurfaceTertiary} />
              </Pressable>
              <Text
                style={[
                  styles.itemText,
                  { color: item.done ? colors.onSurfaceTertiary : colors.onSurface, textDecorationLine: item.done ? "line-through" : "none" },
                ]}
              >
                {item.text}
              </Text>
              <Pressable onPress={() => deleteListItem(item.id)} hitSlop={8} testID={`lista-delete-${item.id}`}>
                <Feather name="trash-2" size={18} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginHorizontal: SPACING.lg, borderRadius: RADIUS.md, borderWidth: 1, paddingLeft: SPACING.md, paddingRight: 6, height: 52 },
  input: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.lg, height: "100%" },
  addBtn: { width: 40, height: 40, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md },
  itemText: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base },
});
