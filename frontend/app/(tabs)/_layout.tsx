import { View, Pressable, StyleSheet, Platform } from "react-native";
import { Tabs, useRouter, useSegments } from "expo-router";
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
  const segments = useSegments();
  const current = segments[segments.length - 1];
  // Map current tab -> voice context for intent detection.
  const ctxMap: Record<string, string> = { inventory: "inventory", sales: "sales", expenses: "expenses" };
  const voiceContext = ctxMap[current] || "home";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#F59E0B",
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
        {/* Dashboard (Inicio) se alcanza desde la cabecera (logo/avatar o el
            botón superior izquierdo), nunca desde la barra inferior: con 5
            pestañas el micrófono flotante quedaba montado sobre "Ventas". */}
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="sales" options={{ title: "Ventas", tabBarIcon: (p) => <TabIcon name="shopping-cart" {...p} /> }} />
        <Tabs.Screen name="inventory" options={{ title: "Inventario", tabBarIcon: (p) => <TabIcon name="box" {...p} /> }} />
        <Tabs.Screen name="expenses" options={{ title: "Gastos", tabBarIcon: (p) => <TabIcon name="trending-down" {...p} /> }} />
        <Tabs.Screen name="reports" options={{ title: "Reportes", tabBarIcon: (p) => <TabIcon name="pie-chart" {...p} /> }} />
      </Tabs>

      {/* Floating central mic FAB (dual: smart data entry + universal search) */}
      <View pointerEvents="box-none" style={[styles.fabWrap, { bottom: insets.bottom + 24 }]}>
        <Pressable
          testID="voice-fab"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            router.push({ pathname: "/voice", params: { context: voiceContext } });
          }}
          style={({ pressed }) => [styles.fab, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
        >
          <LinearGradient
            colors={isDark ? ["#F5A623", "#E07B00"] : ["#F0AB57", "#E89A3E"]}
            style={styles.fabInner}
          >
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
    shadowColor: "#E89A3E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  fabInner: { flex: 1, borderRadius: 32, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.6)" },
});
