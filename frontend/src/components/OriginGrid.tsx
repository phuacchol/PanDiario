import { View, Text, Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { ORIGIN_OPTIONS } from "@/src/constants";
import type { Origin } from "@/src/context/DataContext";

// Cuadrícula estática de origen del dinero (reemplaza el carrusel
// deslizable): mismo lenguaje visual de los botones de método de pago,
// resaltado activo al seleccionar. 5 opciones -> 3 arriba, 2 abajo.
export function OriginGrid({ value, onChange, testID }: { value: Origin; onChange: (o: Origin) => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.grid} testID={testID}>
      {ORIGIN_OPTIONS.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={`origin-cell-${o.key}`}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.key);
            }}
            style={[
              styles.cell,
              {
                backgroundColor: active ? colors.brand : colors.surfaceTertiary,
                borderColor: active ? colors.brand : colors.border,
              },
            ]}
          >
            <Text style={[styles.cellText, { color: active ? colors.onBrand : colors.onSurfaceTertiary }]} numberOfLines={2}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  cell: { width: "31%", minHeight: 56, borderRadius: RADIUS.md, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, paddingVertical: 6 },
  cellText: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, textAlign: "center" },
});
