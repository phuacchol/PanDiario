import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Button, Field } from "@/src/components/ui";
import { PAN_ASSETS } from "@/src/constants/mascot";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";

export default function Register() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUp } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async () => {
    if (!email || !password) {
      setError("Completa correo y contraseña");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await signUp(email.trim(), password, name.trim() || email.split("@")[0]);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "No se pudo crear la cuenta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingTop: insets.top + SPACING.sm, paddingBottom: insets.bottom + SPACING.xl, paddingHorizontal: SPACING.xl, flexGrow: 1 }}
        bottomOffset={20}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} style={styles.back} testID="register-back-button">
          <Feather name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>

        <View style={styles.header}>
          <Image source={PAN_ASSETS.welcome} style={styles.mascot} contentFit="contain" testID="mascot-pajama" />
          <Text style={[styles.title, { color: colors.onSurface }]}>Crea tu cuenta</Text>
          <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>Bienvenido a tu rincón financiero dulce</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
          <Field label="Nombre del negocio" icon="briefcase" placeholder="Mi tienda" value={name} onChangeText={setName} testID="register-name-input" />
          <Field
            label="Correo"
            icon="mail"
            placeholder="tu@correo.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            testID="register-email-input"
          />
          <Field label="Contraseña" icon="lock" placeholder="Mínimo 6 caracteres" secureTextEntry value={password} onChangeText={setPassword} testID="register-password-input" />
          {error ? <Text style={[styles.error, { color: colors.error }]} testID="register-error">{error}</Text> : null}
          <Button title="Crear Cuenta" onPress={onSubmit} loading={loading} testID="register-submit-button" style={{ marginTop: SPACING.sm }} />
          <Pressable onPress={() => router.replace("/(auth)/login")} testID="go-login">
            <Text style={[styles.link, { color: colors.onSurfaceTertiary }]}>
              ¿Ya tienes cuenta? <Text style={{ color: colors.brand, fontFamily: FONTS.bold }}>Inicia sesión</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, justifyContent: "center" },
  header: { alignItems: "center", gap: SPACING.xs, marginVertical: SPACING.lg },
  mascot: { width: 150, height: 150 },
  title: { fontFamily: FONTS.bold, fontSize: FONT_SIZE["2xl"], fontWeight: "700" },
  subtitle: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, textAlign: "center" },
  card: { borderRadius: RADIUS.lg, padding: SPACING.xl, gap: SPACING.md, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  error: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, textAlign: "center" },
  link: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, textAlign: "center", marginTop: SPACING.md },
});
