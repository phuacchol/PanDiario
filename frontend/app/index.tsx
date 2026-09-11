import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { PAN_ASSETS } from "@/src/constants/mascot";
import { randomFinancialQuote } from "@/src/constants/quotes";
import { SPACING, FONTS } from "@/src/theme/theme";

const SPLASH_BG = "#6381e9";

export default function Index() {
  const { user, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Una sola vez por montaje -lazy initializer-, no en cada re-render
  // mientras loading pasa de true a false.
  const [quote] = useState(randomFinancialQuote);

  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/(tabs)");
    else router.replace("/(auth)/welcome");
  }, [user, loading, router]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.logoWrap}>
        <Image source={PAN_ASSETS.logoText} style={styles.logo} contentFit="contain" testID="splash-logo" />
      </View>

      <View style={styles.bottomContent}>
        <ActivityIndicator color="#FFFFFF" size="small" testID="splash-spinner" style={{ marginBottom: SPACING.lg }} />
        <Text style={styles.quote} testID="splash-quote">
          {quote}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SPLASH_BG },
  // Entre la cabecera y el centro: ~30% de la altura disponible en vez de
  // 50% (centrado real) o pegado arriba del todo.
  logoWrap: { flex: 0.32, alignItems: "center", justifyContent: "flex-end" },
  logo: { width: 240, height: 100 },
  bottomContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingBottom: SPACING["2xl"],
    paddingHorizontal: SPACING.xl,
  },
  quote: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: "center",
    color: "#FFFFFF",
    paddingHorizontal: SPACING.md,
  },
});
