import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { ThemeProvider, useTheme } from "@/src/theme/ThemeContext";
import { AuthProvider, useAuth } from "@/src/context/AuthContext";
import { DataProvider } from "@/src/context/DataContext";
import { TaxonomyProvider } from "@/src/context/TaxonomyContext";

// Disable logbox errors etc so that users can see the app
LogBox.ignoreAllLogs(true);

// Keep the native splash visible from cold start until icon fonts register.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { isDark, colors, setMode } = useTheme();
  const { user } = useAuth();

  useEffect(() => {
    if (user?.theme === "dark" || user?.theme === "light") setMode(user.theme);
  }, [user?.theme, setMode]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
        {/* Mismo backgroundColor exacto que expo-splash-screen (app.json)
            para esta pantalla: si el contenedor del Stack llega a pintar un
            frame antes de que BicolorCurveBackground lo cubra, no debe
            asomar el gris neutro de colors.surface como un "recuadro" de
            otro color justo al salir del splash nativo. */}
        <Stack.Screen name="index" options={{ contentStyle: { backgroundColor: "#8FA7D6" } }} />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="product-form" options={{ presentation: "modal" }} />
        <Stack.Screen name="category-manager" options={{ presentation: "modal" }} />
        <Stack.Screen
          name="voice"
          options={{
            presentation: "transparentModal",
            animation: "fade",
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="settings" options={{ presentation: "modal" }} />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    Nunito: require("@/assets/fonts/Nunito-Regular.ttf"),
    "Nunito-SemiBold": require("@/assets/fonts/Nunito-SemiBold.ttf"),
    "Nunito-Bold": require("@/assets/fonts/Nunito-Bold.ttf"),
    "Nunito-ExtraBold": require("@/assets/fonts/Nunito-ExtraBold.ttf"),
  });

  const ready = (iconsLoaded || iconsError) && (fontsLoaded || fontsError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              <DataProvider>
                <TaxonomyProvider>
                  <RootNavigator />
                </TaxonomyProvider>
              </DataProvider>
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
