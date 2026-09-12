import { Stack } from "expo-router";

// Fondo estático explícito para evitar que el Stack pinte el
// colors.surface del tema (dependiente de modo claro/oscuro) como flash
// antes de que Login/Register pinten su propio fondo #F5F6FA.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F5F6FA" } }} />;
}
