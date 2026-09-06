import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Modal, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Card, Button, Field } from "@/src/components/ui";
import { Mascot } from "@/src/components/Mascot";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { getDb } from "@/src/utils/localDb";
import { overlayBubble } from "@/src/native/overlayBubble";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { CURRENCIES, WORLD_CURRENCIES } from "@/src/utils/format";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CUSTOM_CURRENCIES_KEY = "@pandiario_custom_currency_list";

export default function Settings() {
  const { colors, isDark, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, updateUser, signOut } = useAuth();

  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const [visibleCurrencies, setVisibleCurrencies] = useState(CURRENCIES);

  const [bubbleEnabled, setBubbleEnabled] = useState(false);
  const [bubbleAvailable] = useState(overlayBubble.isAvailable());

  const [changePasswordModal, setChangePasswordModal] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passSaving, setPassSaving] = useState(false);
  const [passError, setPassError] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const storedCur = await AsyncStorage.getItem(CUSTOM_CURRENCIES_KEY);
      if (storedCur) setVisibleCurrencies(JSON.parse(storedCur));
    } catch {}

    if (overlayBubble.isAvailable()) {
      const running = await overlayBubble.isRunning();
      setBubbleEnabled(running);
    }
  };

  const saveCurrenciesList = async (list: typeof CURRENCIES) => {
    setVisibleCurrencies(list);
    try {
      await AsyncStorage.setItem(CUSTOM_CURRENCIES_KEY, JSON.stringify(list));
    } catch {}
  };

  const changeCurrency = (code: string) => {
    updateUser({ currency: code });
  };

  const handleSelectFromWorld = (item: { code: string; label: string; symbol: string }) => {
    changeCurrency(item.code);
    setShowPicker(false);
    if (!visibleCurrencies.some((c) => c.code === item.code)) {
      const updated = [...visibleCurrencies, item];
      saveCurrenciesList(updated);
    }
  };

  const handleDeleteCurrency = (code: string, label: string) => {
    if (user?.currency === code) {
      Alert.alert("Moneda en uso", "No puedes eliminar la moneda activa actualmente.");
      return;
    }
    if (visibleCurrencies.length <= 1) {
      Alert.alert("Aviso", "Debes mantener al menos una moneda en la lista.");
      return;
    }

    Alert.alert("Eliminar moneda", `¿Deseas quitar "${label}" de la lista rápida?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          const updated = visibleCurrencies.filter((c) => c.code !== code);
          saveCurrenciesList(updated);
        },
      },
    ]);
  };

  const toggleTheme = (val: boolean) => {
    const theme = val ? "dark" : "light";
    setMode(theme);
    updateUser({ theme });
  };

  const toggleBubble = async (val: boolean) => {
    if (!bubbleAvailable) return;
    if (val) {
      const hasPermission = await overlayBubble.hasPermission();
      if (!hasPermission) {
        Alert.alert(
          "Permiso necesario",
          "PanDiario necesita permiso para mostrar la burbuja sobre otras apps. Actívalo en la siguiente pantalla y vuelve a intentarlo.",
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Abrir ajustes", onPress: () => overlayBubble.requestPermission() },
          ]
        );
        return;
      }
      overlayBubble.start();
      setBubbleEnabled(true);
    } else {
      overlayBubble.stop();
      setBubbleEnabled(false);
    }
  };

  const handleSaveNewPassword = async () => {
    if (!newPass || newPass.length < 4) {
      setPassError("La contraseña debe tener al menos 4 caracteres");
      return;
    }
    if (newPass !== confirmPass) {
      setPassError("Las contraseñas no coinciden");
      return;
    }

    setPassSaving(true);
    setPassError("");

    try {
      const db = await getDb();
      if (db && user?.email) {
        await db.runAsync(`UPDATE users SET password = ? WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))`, [newPass, user.email]).catch(() => {});
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setChangePasswordModal(false);
      setNewPass("");
      setConfirmPass("");
      Alert.alert("¡Listo!", "Tu contraseña ha sido cambiada exitosamente.");
    } catch (e: any) {
      setPassError(e?.message || "No se pudo actualizar la contraseña");
    } finally {
      setPassSaving(false);
    }
  };

  const onLogout = async () => {
    setSaving(true);
    await signOut();
    router.replace("/(auth)/welcome");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} testID="settings-close">
          <Feather name="x" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Ajustes</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + SPACING.xl, gap: SPACING.lg }}>
        <View style={{ alignItems: "center", gap: SPACING.xs }}>
          <Mascot variant="happy" size={110} />
          <Text style={[styles.name, { color: colors.onSurface }]}>{user?.name}</Text>
          <Text style={[styles.email, { color: colors.onSurfaceTertiary }]}>{user?.email}</Text>
        </View>

        {/* Monedas */}
        <View>
          <Text style={[styles.section, { color: colors.onSurface }]}>Moneda</Text>
          <Card style={{ gap: SPACING.xs, padding: SPACING.sm }}>
            {visibleCurrencies.map((c) => {
              const active = user?.currency === c.code;
              return (
                <View key={c.code} style={[styles.currencyRow, { backgroundColor: active ? colors.brandTertiary : "transparent" }]}>
                  <Pressable onPress={() => changeCurrency(c.code)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: SPACING.md }} testID={`currency-${c.code}`}>
                    <View style={[styles.currencySymbol, { backgroundColor: active ? colors.brand : colors.surfaceTertiary }]}>
                      <Text style={{ color: active ? colors.onBrand : colors.onSurface, fontFamily: FONTS.black, fontSize: FONT_SIZE.base }}>{c.symbol}</Text>
                    </View>
                    <Text style={[styles.currencyLabel, { color: colors.onSurface }]}>{c.label}</Text>
                    {active ? <Feather name="check-circle" size={20} color={colors.brand} /> : null}
                  </Pressable>

                  <Pressable onPress={() => handleDeleteCurrency(c.code, c.label)} hitSlop={8} style={styles.deleteBtn}>
                    <Feather name="trash-2" size={17} color={colors.onSurfaceTertiary} />
                  </Pressable>
                </View>
              );
            })}

            <Pressable
              onPress={() => {
                setPickerSearch("");
                setShowPicker(true);
              }}
              testID="currency-add"
              style={[styles.currencyRow, { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.brand }]}
            >
              <View style={[styles.currencySymbol, { backgroundColor: colors.surfaceTertiary }]}>
                <Feather name="plus" size={18} color={colors.brand} />
              </View>
              <Text style={[styles.currencyLabel, { color: colors.brand, fontFamily: FONTS.bold }]}>Más monedas del mundo</Text>
            </Pressable>
          </Card>
        </View>

        {/* Burbuja flotante */}
        <View>
          <Text style={[styles.section, { color: colors.onSurface }]}>Burbuja flotante</Text>
          <Card>
            <View style={styles.switchRow}>
              <View style={styles.switchLeft}>
                <Feather name="disc" size={20} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.switchLabel, { color: colors.onSurface }]}>Acceso rápido fuera de la app</Text>
                  {!bubbleAvailable ? (
                    <Text style={{ color: colors.onSurfaceTertiary, fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, marginTop: 2 }}>
                      Disponible solo en Android (APK compilado)
                    </Text>
                  ) : null}
                </View>
              </View>
              <Switch
                value={bubbleEnabled}
                onValueChange={toggleBubble}
                disabled={!bubbleAvailable}
                trackColor={{ true: colors.brand, false: colors.borderStrong }}
                thumbColor="#FFF"
                testID="bubble-switch"
              />
            </View>
          </Card>
        </View>

        {/* Modo Oscuro */}
        <View>
          <Text style={[styles.section, { color: colors.onSurface }]}>Apariencia</Text>
          <Card>
            <View style={styles.switchRow}>
              <View style={styles.switchLeft}>
                <Feather name={isDark ? "moon" : "sun"} size={20} color={colors.brand} />
                <Text style={[styles.switchLabel, { color: colors.onSurface }]}>Modo oscuro</Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ true: colors.brand, false: colors.borderStrong }}
                thumbColor="#FFF"
                testID="theme-switch"
              />
            </View>
          </Card>
        </View>

        <Button
          title="Cambiar contraseña"
          variant="secondary"
          icon="lock"
          onPress={() => {
            setPassError("");
            setNewPass("");
            setConfirmPass("");
            setChangePasswordModal(true);
          }}
        />

        <Button title="Cerrar sesión" variant="outline" icon="log-out" onPress={onLogout} loading={saving} testID="logout-button" />
        <Text style={[styles.version, { color: colors.onSurfaceTertiary }]}>PanDiario · v1.0</Text>
      </ScrollView>

      <Modal visible={changePasswordModal} transparent animationType="fade" onRequestClose={() => setChangePasswordModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Cambiar Contraseña</Text>
              <Pressable onPress={() => setChangePasswordModal(false)} hitSlop={8}>
                <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>

            <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: colors.onSurfaceTertiary }}>Ingresa tu nueva clave de acceso directamente.</Text>

            <Field label="Nueva Contraseña" placeholder="••••••••" secureTextEntry value={newPass} onChangeText={setNewPass} />
            <Field label="Confirmar Nueva Contraseña" placeholder="••••••••" secureTextEntry value={confirmPass} onChangeText={setConfirmPass} />

            {passError ? (
              <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: colors.error, textAlign: "center" }}>{passError}</Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: SPACING.md, marginTop: SPACING.xs }}>
              <Button title="Cancelar" variant="secondary" onPress={() => setChangePasswordModal(false)} style={{ flex: 1 }} />
              <Button title="Actualizar" onPress={handleSaveNewPassword} loading={passSaving} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPicker} animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
          <View style={styles.pickerHeader}>
            <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Elige tu moneda</Text>
            <Pressable onPress={() => setShowPicker(false)} style={styles.headerBtn} testID="picker-close">
              <Feather name="x" size={24} color={colors.onSurface} />
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm }}>
            <View style={[styles.searchWrap, { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}>
              <Feather name="search" size={18} color={colors.onSurfaceTertiary} />
              <TextInput
                value={pickerSearch}
                onChangeText={setPickerSearch}
                placeholder="Buscar moneda o país..."
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.searchInput, { color: colors.onSurface }]}
                testID="picker-search"
              />
            </View>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: insets.bottom + SPACING.xl, gap: SPACING.xs }}>
            {WORLD_CURRENCIES.filter((c) => (c.label + c.code).toLowerCase().includes(pickerSearch.toLowerCase())).map((c) => (
              <Pressable
                key={c.code}
                onPress={() => handleSelectFromWorld(c)}
                testID={`world-currency-${c.code}`}
                style={[styles.currencyRow, { backgroundColor: user?.currency === c.code ? colors.brandTertiary : "transparent" }]}
              >
                <View style={[styles.currencySymbol, { backgroundColor: colors.surfaceTertiary }]}>
                  <Text style={{ color: colors.onSurface, fontFamily: FONTS.black, fontSize: FONT_SIZE.base }}>{c.symbol}</Text>
                </View>
                <Text style={[styles.currencyLabel, { color: colors.onSurface }]}>
                  {c.label} · {c.code}
                </Text>
                {user?.currency === c.code ? <Feather name="check-circle" size={20} color={colors.brand} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg },
  name: { fontFamily: FONTS.black, fontSize: FONT_SIZE.xl },
  email: { fontFamily: FONTS.medium, fontSize: FONT_SIZE.base },
  section: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.lg, marginBottom: SPACING.sm },
  currencyRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md },
  currencySymbol: { width: 40, height: 40, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  currencyLabel: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.base },
  deleteBtn: { padding: SPACING.xs, marginLeft: SPACING.xs, borderRadius: RADIUS.sm },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLeft: { flexDirection: "row", alignItems: "center", gap: SPACING.md, flex: 1 },
  switchLabel: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  version: { fontFamily: FONTS.regular, fontSize: FONT_SIZE.sm, textAlign: "center", marginTop: SPACING.md },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md, height: 50 },
  searchInput: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.lg, height: "100%" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: SPACING.xl },
  modalBox: { borderRadius: RADIUS.lg, padding: SPACING.xl, gap: SPACING.md },
});
