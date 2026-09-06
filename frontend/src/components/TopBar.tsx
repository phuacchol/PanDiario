import React from "react";
import { View, Text, StyleSheet, Pressable, ImageSourcePropType } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";

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
      <Pressable onPress={() => router.push("/settings")} style={[styles.btn, { backgroundColor: colors.surfaceTertiary }]} testID="topbar-settings">
        <Feather name="settings" size={20} color={colors.onSurface} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  btn: { width: 42, height: 42, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  titleMascot: { width: 32, height: 32 },
  title: { fontFamily: FONTS.black, fontSize: FONT_SIZE.xl, textAlign: "center" },
});
