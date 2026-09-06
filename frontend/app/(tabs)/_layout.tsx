import { View, Pressable, StyleSheet, Platform } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/ThemeContext";
import { FONTS } from "@/src/theme/theme";

function TabIcon({ name, color, size }: { name: keyof typeof Feather.glyphMap; color: string; size: number }) {
  return <Feather name={name} size={size} color={color} />;
}

export default function TabsLayout() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: "#94A3B8",
          tabBarStyle: {
            backgroundColor: colors.surfaceSecondary,
            borderTopColor: colors.border,
            borderTopWidth: StyleSheet.hairlineWidth,
            justifyContent: "space-around",
            ...(Platform.OS === "web" ? { height: 64 } : {}),
          },
          tabBarItemStyle: { alignSelf: "center" },
          tabBarLabelStyle: { fontFamily: FONTS.medium, fontSize: 11 },
        }}
      >
        {/* Inicio se alcanza desde la cabecera (botón "home" de TopBar),
            nunca desde la barra inferior: así ninguna de las 4 pestañas
            queda iluminada mientras se está en la Pantalla de Inicio. */}
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="lista" options={{ title: "Lista", tabBarIcon: (p) => <TabIcon name="check-square" {...p} /> }} />
        <Tabs.Screen name="ingreso" options={{ title: "Ingreso", tabBarIcon: (p) => <TabIcon name="arrow-down-circle" {...p} /> }} />
        <Tabs.Screen name="gasto" options={{ title: "Gasto", tabBarIcon: (p) => <TabIcon name="arrow-up-circle" {...p} /> }} />
        <Tabs.Screen name="nota" options={{ title: "Nota", tabBarIcon: (p) => <TabIcon name="edit-3" {...p} /> }} />
      </Tabs>

      {/* Botón central flotante de acción rápida / micrófono. */}
      <View pointerEvents="box-none" style={[styles.fabWrap, { bottom: insets.bottom + 24 }]}>
        <Pressable
          testID="voice-fab"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            router.push("/voice");
          }}
          style={({ pressed }) => [styles.fab, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
        >
          <LinearGradient colors={isDark ? ["#3B82F6", "#1D4ED8"] : ["#5B8DEF", "#2563EB"]} style={styles.fabInner}>
            <Feather name="mic" size={26} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fabWrap: { position: "absolute", left: "50%", marginLeft: -32, width: 64, height: 64, alignItems: "center" },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  fabInner: { flex: 1, borderRadius: 32, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.6)" },
});
