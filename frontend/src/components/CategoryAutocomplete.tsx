import { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Campo de texto único con autocompletado en tiempo real contra las
// categorías ya existentes: sin chips redondeados. Si el usuario escribe
// un nombre que no coincide con ninguna sugerencia, se guarda tal cual al
// confirmar la transacción -y el llamador es responsable de crearla como
// categoría real (ver `addBudgetCategory` en los onSubmit de cada pantalla)-.
export function CategoryAutocomplete({
  label = "Categoría",
  value,
  onChange,
  categories,
  placeholder = "Escribe o elige una categoría",
  testID,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  categories: { name: string }[];
  placeholder?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    const names = Array.from(new Set(categories.map((c) => c.name))).filter(Boolean);
    const q = stripAccents(value.trim().toLowerCase());
    const pool = !q ? names : names.filter((n) => stripAccents(n.toLowerCase()).includes(q));
    // No mostrar una única "sugerencia" idéntica a lo ya escrito -no aporta nada-.
    return pool.filter((n) => n.toLowerCase() !== value.trim().toLowerCase()).slice(0, 6);
  }, [value, categories]);

  const showDropdown = focused && suggestions.length > 0;

  return (
    <View style={{ gap: SPACING.xs }}>
      {label ? <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>{label}</Text> : null}
      <View style={[styles.inputWrap, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          placeholderTextColor={colors.onSurfaceTertiary}
          style={[styles.input, { color: colors.onSurface }]}
          testID={testID}
        />
      </View>
      {showDropdown ? (
        <View style={[styles.dropdown, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} testID={testID ? `${testID}-suggestions` : undefined}>
          {suggestions.map((name) => (
            <Pressable
              key={name}
              style={styles.suggestionRow}
              onPress={() => {
                onChange(name);
                setFocused(false);
              }}
              testID={testID ? `${testID}-suggestion-${name}` : undefined}
            >
              <Text style={{ color: colors.onSurface, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base }}>{name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, marginLeft: 2 },
  inputWrap: { borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md, height: 52, justifyContent: "center" },
  input: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.lg },
  dropdown: { borderRadius: RADIUS.md, borderWidth: 1, overflow: "hidden" },
  suggestionRow: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
});
