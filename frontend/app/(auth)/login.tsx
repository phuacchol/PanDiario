import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, Alert } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Button, Field } from "@/src/components/ui";
import { PAN_ASSETS } from "@/src/constants/mascot";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { getDb } from "@/src/utils/localDb";
import { SPACING, RADIUS, FONTS, FONT_SIZE, WELCOME_GRADIENT } from "@/src/theme/theme";

export default function Login() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Modal de Recuperación de Contraseña
  const [recoverModal, setRecoverModal] = useState(false);
  const [recoverStep, setRecoverStep] = useState<1 | 2>(1);
  const [recoverEmail, setRecoverEmail] = useState("");
  const [recoverCode, setRecoverCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [recoverError, setRecoverError] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");

  const onSubmit = async () => {
    if (!email || !password) {
      setError("Ingresa tu correo y contraseña");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  // Paso 1: Enviar código al correo
  const handleRequestCode = async () => {
    const cleanMail = recoverEmail.trim().toLowerCase();
    if (!cleanMail || !cleanMail.includes("@")) {
      setRecoverError("Ingresa un correo electrónico válido");
      return;
    }
    setRecoverLoading(true);
    setRecoverError("");

    try {
      // Generar código numérico de 6 dígitos
      const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedCode(randomCode);

      // Intentar envío por backend
      await api.post("/auth/forgot-password", { email: cleanMail, code: randomCode }).catch(() => null);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        "Código de Verificación",
        `Hemos generado tu código de recuperación.\n\nCódigo: ${randomCode}\n(Si tienes conexión, también se envió a tu correo)`,
        [{ text: "Continuar", onPress: () => setRecoverStep(2) }]
      );
    } catch {
      setRecoverError("Ocurrió un error al enviar el código. Intenta de nuevo.");
    } finally {
      setRecoverLoading(false);
    }
  };

  // Paso 2: Validar código y cambiar contraseña
  const handleResetPassword = async () => {
    if (!recoverCode.trim()) {
      setRecoverError("Ingresa el código de 6 dígitos");
      return;
    }
    if (recoverCode.trim() !== generatedCode.trim()) {
      setRecoverError("El código ingresado no coincide");
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      setRecoverError("La nueva contraseña debe tener al menos 4 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setRecoverError("Las contraseñas no coinciden");
      return;
    }

    setRecoverLoading(true);
    setRecoverError("");

    try {
      const cleanMail = recoverEmail.trim().toLowerCase();

      // 1. Actualizar en backend si hay red
      await api.post("/auth/reset-password", {
        email: cleanMail,
        code: recoverCode.trim(),
        new_password: newPassword,
      }).catch(() => null);

      // 2. Actualizar en SQLite local
      const db = await getDb();
      if (db) {
        await db.runAsync(
          `UPDATE users SET password = ?, synced = 0 WHERE LOWER(TRIM(email)) = ?`,
          [newPassword, cleanMail]
        ).catch(() => {});
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert("¡Éxito!", "Tu contraseña ha sido actualizada. Ya puedes iniciar sesión.", [
        {
          text: "Iniciar Sesión",
          onPress: () => {
            setRecoverModal(false);
            setRecoverStep(1);
            setPassword(newPassword);
            setEmail(cleanMail);
          },
        },
      ]);
    } catch (e: any) {
      setRecoverError(e.message || "Error al restablecer la contraseña");
    } finally {
      setRecoverLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#8FA7D6" }}>
      <LinearGradient colors={WELCOME_GRADIENT} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingTop: insets.top + SPACING.sm, paddingBottom: insets.bottom + SPACING.xl, paddingHorizontal: SPACING.xl, flexGrow: 1 }}
        bottomOffset={20}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} style={styles.back} testID="login-back-button">
          <Feather name="arrow-left" size={24} color="#FFFFFF" />
        </Pressable>

        <View style={styles.header}>
          <Image source={PAN_ASSETS.login} style={styles.mascot} contentFit="contain" testID="mascot-login" />
          <Text style={styles.title}>¡Hola de nuevo!</Text>
          <Text style={styles.subtitle}>Inicia sesión en PanConMiel</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
          <Field
            label="Correo"
            icon="mail"
            placeholder="tu@correo.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            testID="login-email-input"
          />
          <Field
            label="Contraseña"
            icon="lock"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            testID="login-password-input"
          />

          {/* Enlace para recuperar contraseña */}
          <Pressable
            onPress={() => {
              setRecoverEmail(email);
              setRecoverError("");
              setRecoverStep(1);
              setRecoverModal(true);
            }}
            style={{ alignSelf: "flex-end", marginTop: -SPACING.xs }}
          >
            <Text style={{ fontFamily: FONTS.bold, fontSize: FONT_SIZE.xs, color: colors.brand }}>
              ¿Olvidaste tu contraseña?
            </Text>
          </Pressable>

          {error ? <Text style={[styles.error, { color: colors.error }]} testID="login-error">{error}</Text> : null}

          <Button title="Iniciar Sesión" onPress={onSubmit} loading={loading} testID="login-submit-button" style={{ marginTop: SPACING.sm }} />

          <Pressable onPress={() => router.replace("/(auth)/register")} testID="go-register">
            <Text style={[styles.link, { color: colors.onSurfaceTertiary }]}>
              ¿No tienes cuenta? <Text style={{ color: colors.brand, fontFamily: FONTS.bold }}>Regístrate</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>

      {/* Modal: Recuperar Contraseña */}
      <Modal visible={recoverModal} transparent animationType="fade" onRequestClose={() => setRecoverModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>
                {recoverStep === 1 ? "Recuperar Contraseña" : "Ingresa el Código"}
              </Text>
              <Pressable onPress={() => setRecoverModal(false)} hitSlop={8}>
                <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>

            {recoverStep === 1 ? (
              <>
                <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, color: colors.onSurfaceTertiary }}>
                  Escribe tu correo electrónico para recibir un código de verificación de 6 dígitos.
                </Text>
                <Field
                  label="Correo registrado"
                  placeholder="tu@correo.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={recoverEmail}
                  onChangeText={setRecoverEmail}
                />
                {recoverError ? <Text style={[styles.error, { color: colors.error }]}>{recoverError}</Text> : null}
                <Button title="Enviar Código" onPress={handleRequestCode} loading={recoverLoading} />
              </>
            ) : (
              <>
                <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.sm, color: colors.onSurfaceTertiary }}>
                  Ingresa el código enviado y define tu nueva clave de acceso.
                </Text>
                <Field
                  label="Código (6 dígitos)"
                  placeholder="Ej: 123456"
                  keyboardType="numeric"
                  value={recoverCode}
                  onChangeText={setRecoverCode}
                />
                <Field
                  label="Nueva Contraseña"
                  placeholder="••••••••"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <Field
                  label="Confirmar Nueva Contraseña"
                  placeholder="••••••••"
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
                {recoverError ? <Text style={[styles.error, { color: colors.error }]}>{recoverError}</Text> : null}
                <View style={{ flexDirection: "row", gap: SPACING.md }}>
                  <Button title="Atrás" variant="secondary" onPress={() => setRecoverStep(1)} style={{ flex: 1 }} />
                  <Button title="Restablecer" onPress={handleResetPassword} loading={recoverLoading} style={{ flex: 1 }} />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, justifyContent: "center" },
  header: { alignItems: "center", gap: SPACING.xs, marginVertical: SPACING.lg },
  mascot: { width: 150, height: 150 },
  title: { fontFamily: FONTS.bold, fontSize: FONT_SIZE["2xl"], fontWeight: "700", color: "#FFFFFF" },
  subtitle: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, color: "rgba(255,255,255,0.85)" },
  card: { borderRadius: RADIUS.lg, padding: SPACING.xl, gap: SPACING.md, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 6 },
  error: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, textAlign: "center" },
  link: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base, textAlign: "center", marginTop: SPACING.md },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: SPACING.xl },
  modalBox: { borderRadius: RADIUS.lg, padding: SPACING.xl, gap: SPACING.md },
  modalTitle: { fontFamily: FONTS.black, fontSize: FONT_SIZE.lg },
});
