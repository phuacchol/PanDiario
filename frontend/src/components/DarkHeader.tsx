import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { useData } from "@/src/context/DataContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";

// Cabecera oscura compartida (Gasto/Ingreso/Lista): home + título centrado +
// actualizar/config, con un slot para lo que cada pantalla ponga debajo
// (buscador, chips, segmented) dentro del mismo bloque redondeado.
export function DarkHeader({
  title,
  testIDPrefix = "topbar",
  children,
}: {
  title: string;
  testIDPrefix?: string;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refresh } = useData();
  const [refreshing, setRefreshing] = useState(false);

  const onRefreshPress = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.heroBg, paddingTop: insets.top + SPACING.sm }]}>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.navigate("/(tabs)")} style={styles.iconBtn} testID={`${testIDPrefix}-home`}>
          <Feather name="home" size={20} color={colors.heroBg} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.rightGroup}>
          <Pressable onPress={onRefreshPress} disabled={refreshing} style={styles.iconBtn} testID={`${testIDPrefix}-refresh`}>
            {refreshing ? <ActivityIndicator size="small" color={colors.heroBg} /> : <Feather name="refresh-cw" size={20} color={colors.heroBg} />}
          </Pressable>
          <Pressable onPress={() => router.push("/settings")} style={styles.iconBtn} testID={`${testIDPrefix}-settings`}>
            <Feather name="settings" size={20} color={colors.heroBg} />
          </Pressable>
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, gap: SPACING.md, borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: RADIUS.xl },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { flex: 1, textAlign: "center", fontFamily: FONTS.black, fontSize: FONT_SIZE.xl, color: "#FFFFFF" },
  rightGroup: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  iconBtn: { width: 42, height: 42, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
});

// Estilo del buscador blanco embebido en el bloque oscuro: exportado para que
// cada pantalla lo combine con su propio placeholder/handlers.
export const darkHeaderSearchStyles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, height: 48, backgroundColor: "#FFFFFF" },
  input: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, height: "100%" },
});
