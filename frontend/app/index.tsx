import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";

// Puente instantáneo entre el splash nativo (app.json) y la primera
// pantalla real: sin logo/frase/spinner propios -eso agregaba una
// pantalla intermedia visible antes de poder usar la app-. En cuanto
// AuthContext resuelve la sesión (loading en false, ya sin esperar red,
// ver AuthContext.loadMe) redirige de inmediato; el fondo sólido evita
// cualquier destello de color mientras tanto.
const SPLASH_BG = "#6381e9";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/(tabs)");
    else router.replace("/(auth)/welcome");
  }, [user, loading, router]);

  return <View style={styles.screen} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SPLASH_BG },
});
