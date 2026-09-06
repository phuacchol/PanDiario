import { useEffect } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { BicolorCurveBackground, CURVE_HEIGHT, MASCOT_SIZE, SCREEN_W } from "@/src/components/BicolorCurveBackground";
import { PAN_ASSETS } from "@/src/constants/mascot";

export default function Index() {
  const { user, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/(tabs)");
    else router.replace("/(auth)/welcome");
  }, [user, loading, router]);

  return (
    <BicolorCurveBackground>
      <View style={[styles.topContent, { paddingTop: insets.top + 60 }]}>
        <Image
          source={PAN_ASSETS.logoText}
          style={styles.logo}
          contentFit="contain"
          testID="splash-logo"
        />
      </View>

      <Image
        source={PAN_ASSETS.welcome}
        style={[styles.mascot, { bottom: CURVE_HEIGHT - 60 }]}
        contentFit="contain"
        testID="splash-mascot"
      />

      <View style={[styles.bottomContent, { height: CURVE_HEIGHT, paddingBottom: insets.bottom + 40 }]}>
        <ActivityIndicator color="#5B7BE8" size="small" testID="splash-spinner" />
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
    alignItems: "center",
    justifyContent: "flex-end",
  },
});
