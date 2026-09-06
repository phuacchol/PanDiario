import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { BicolorCurveBackground, CURVE_HEIGHT, MASCOT_SIZE, SCREEN_W } from "@/src/components/BicolorCurveBackground";
import { PAN_ASSETS } from "@/src/constants/mascot";
import { SPACING, FONTS, FONT_SIZE } from "@/src/theme/theme";

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handlePress = (onPress: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  return (
    <BicolorCurveBackground>
      <View style={[styles.topContent, { paddingTop: insets.top + 60 }]}>
        <Image
          source={PAN_ASSETS.logoText}
          style={styles.logo}
          contentFit="contain"
          testID="brand-logo"
        />
      </View>

      <Image
        source={PAN_ASSETS.welcome}
        style={[styles.mascot, { bottom: CURVE_HEIGHT - 60 }]}
        contentFit="contain"
        testID="mascot-welcome"
      />

      <View
        style={[
          styles.bottomContent,
          { height: CURVE_HEIGHT, paddingBottom: insets.bottom + SPACING.xl },
        ]}
      >
        <Text style={styles.tagline}>Bienvenido a tu rincón financiero dulce</Text>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => handlePress(() => router.push("/(auth)/register"))}
            testID="welcome-start-button"
          >
            <Text style={styles.primaryBtnText}>Empezar</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => handlePress(() => router.push("/(auth)/login"))}
            testID="welcome-login-button"
          >
            <Text style={styles.secondaryBtnText}>Iniciar sesión</Text>
          </Pressable>
        </View>
      </View>
    </BicolorCurveBackground>
  );
}

const styles = StyleSheet.create({
  topContent: { alignItems: "center" },
  logo: { width: 220, height: 90 },
  mascot: { position: "absolute", left: SCREEN_W / 2 - MASCOT_SIZE / 2, width: MASCOT_SIZE, height: MASCOT_SIZE },
  bottomContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.xl,
    paddingTop: 110,
    justifyContent: "space-between",
  },
  tagline: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.xl,
    fontWeight: "700",
    textAlign: "center",
    color: "#1E293B",
    lineHeight: 28,
  },
  actions: { gap: SPACING.md },
  primaryBtn: {
    height: 52,
    borderRadius: 25,
    backgroundColor: "#5B7BE8",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg, color: "#FFFFFF" },
  secondaryBtn: {
    height: 52,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: "#5B7BE8",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg, color: "#5B7BE8" },
});
