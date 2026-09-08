import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ImageSourcePropType } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { useData } from "@/src/context/DataContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";

// Botón manual de "Actualizar": red de seguridad explícita para cuando lo
// registrado desde la burbuja flotante tarda en reflejarse en una pantalla
// ya abierta -evento nativo->JS que no llega a tiempo, o el polling
// periódico que todavía no le tocó su turno-. Vuelve a leer la base al
// toque, sin esperar ningún puente ni temporizador.
function RefreshButton() {
  const { colors } = useTheme();
  const { refresh } = useData();
  const [refreshing, setRefreshing] = useState(false);

  const onPress = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Pressable onPress={onPress} disabled={refreshing} style={[styles.btn, { backgroundColor: colors.surfaceTertiary }]} testID="topbar-refresh">
      {refreshing ? <ActivityIndicator size="small" color={colors.brand} /> : <Feather name="refresh-cw" size={20} color={colors.onSurface} />}
    </Pressable>
  );
}

export function TopBar({
  title,
  showHome = true,
  mascotSource,
}: {
  title: string;
  showHome?: boolean;
  mascotSource?: ImageSourcePropType;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + SPACING.sm, backgroundColor: colors.surface }]}>
      {showHome ? (
        <Pressable onPress={() => router.navigate("/(tabs)")} style={[styles.btn, { backgroundColor: colors.surfaceTertiary }]} testID="topbar-home">
          <Feather name="home" size={20} color={colors.brand} />
        </Pressable>
      ) : (
        <View style={styles.btn} />
      )}
      <View style={styles.titleRow}>
        {mascotSource ? (
          <Image source={mascotSource} style={styles.titleMascot} contentFit="contain" testID="topbar-mascot" />
        ) : null}
        <Text style={[styles.title, { color: colors.onSurface }]} numberOfLines={1}>{title}</Text>
      </View>
      <View style={styles.rightGroup}>
        <RefreshButton />
        <Pressable onPress={() => router.push("/settings")} style={[styles.btn, { backgroundColor: colors.surfaceTertiary }]} testID="topbar-settings">
          <Feather name="settings" size={20} color={colors.onSurface} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  btn: { width: 42, height: 42, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  rightGroup: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  titleMascot: { width: 32, height: 32 },
  title: { fontFamily: FONTS.black, fontSize: FONT_SIZE.xl, textAlign: "center" },
});
