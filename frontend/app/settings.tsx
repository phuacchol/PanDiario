import { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Modal, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Card, Button, Field } from "@/src/components/ui";
import { Mascot } from "@/src/components/Mascot";
import { GuideAssistantModal } from "@/src/components/GuideAssistantModal";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { getDb } from "@/src/utils/localDb";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { CURRENCIES, WORLD_CURRENCIES } from "@/src/utils/format";

const CUSTOM_CURRENCIES_KEY = "@pan_custom_currency_list";
const DEFAULT_CHART_RANGE_KEY = "@pan_default_chart_range";

const CHART_RANGES = [
  { key: "today", label: "Diario (Hoy)" },
  { key: "week", label: "Semanal" },
  { key: "month", label: "Mensual" },
  { key: "year", label: "Anual" },
  { key: "all_years", label: "Años (Histórico)" },
];

export default function Settings() {
  const { colors, isDark, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, updateUser, signOut } = useAuth();

  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  // Lista personalizable de monedas visibles
  const [visibleCurrencies, setVisibleCurrencies] = useState(CURRENCIES);

  // Período predeterminado de gráficos (Diario por defecto)
  const [defaultChartRange, setDefaultChartRange] = useState("today");

  // Modal Guía Asistente
  const [showGuide, setShowGuide] = useState(false);

  // Modal Cambio de Contraseña
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

      const storedRange = await AsyncStorage.getItem(DEFAULT_CHART_RANGE_KEY);
      if (storedRange) setDefaultChartRange(storedRange);
    } catch {}
  };

  const saveChartRange = async (rangeKey: string) => {
    setDefaultChartRange(rangeKey);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await AsyncStorage.setItem(DEFAULT_CHART_RANGE_KEY, rangeKey);
    } catch {}
  };

  const saveCurrenciesList = async (list: typeof CURRENCIES) => {
    setVisibleCurrencies(list);
    try {
      await AsyncStorage.setItem(CUSTOM_CURRENCIES_KEY, JSON.stringify(list));
    } catch {}
  };

  const changeCurrency = async (code: string) => {
    updateUser({ currency: code });
    try {
      await api.patch("/settings", { currency: code });
    } catch {}
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

    Alert.alert(
      "Eliminar moneda",
      `¿Deseas quitar "${label}" de la lista rápida?`,
      [
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
      ]
    );
  };

  const toggleTheme = async (val: boolean) => {
    const theme = val ? "dark" : "light";
    setMode(theme);
    updateUser({ theme });
    try {
      await api.patch("/settings", { theme });
    } catch {}
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
      await api.patch("/settings/password", { password: newPass }).catch(() => null);

      const db = await getDb();
      if (db && user?.email) {
        await db.runAsync(
          `UPDATE users SET password = ?, synced = 0 WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))`,
          [newPass, user.email]
        ).catch(() => {});
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

        {/* Guía Asistente */}
        <View>
          <Text style={[styles.section, { color: colors.onSurface }]}>Ayuda y Soporte</Text>
          <Pressable onPress={() => setShowGuide(true)}>
            <Card style={{ borderColor: colors.brand + "44", borderWidth: 1 }}>
              <View style={styles.switchRow}>
                <View style={styles.switchLeft}>
                  <Feather name="help-circle" size={20} color={colors.brand} />
                  <Text style={[styles.switchLabel, { color: colors.onSurface }]}>Aprende a usar la App (Guía Asistente)</Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.onSurfaceTertiary} />
              </View>
            </Card>
          </Pressable>
        </View>

        {/* Período Predeterminado para Gráficos */}
        <View>
          <Text style={[styles.section, { color: colors.onSurface }]}>Período Predeterminado de Gráficos</Text>
          <Card style={{ gap: SPACING.xs, padding: SPACING.sm }}>
            {CHART_RANGES.map((cr) => {
              const active = defaultChartRange === cr.key;
              return (
                <Pressable
                  key={cr.key}
                  onPress={() => saveChartRange(cr.key)}
                  style={[styles.currencyRow, { backgroundColor: active ? colors.brandTertiary : "transparent" }]}
                >
                  <View style={[styles.currencySymbol, { backgroundColor: active ? colors.brand : colors.surfaceTertiary }]}>
                    <Feather name="bar-chart-2" size={18} color={active ? colors.onBrand : colors.onSurface} />
                  </View>
                  <Text style={[styles.currencyLabel, { color: colors.onSurface, fontFamily: active ? FONTS.bold : FONTS.medium }]}>
                    {cr.label}
                  </Text>
                  {active ? <Feather name="check-circle" size={20} color={colors.brand} /> : null}
                </Pressable>
              );
            })}
          </Card>
        </View>

        {/* Monedas */}
        <View>
          <Text style={[styles.section, { color: colors.onSurface }]}>Moneda</Text>
          <Card style={{ gap: SPACING.xs, padding: SPACING.sm }}>
            {visibleCurrencies.map((c) => {
              const active = user?.currency === c.code;
              return (
                <View
                  key={c.code}
                  style={[styles.currencyRow, { backgroundColor: active ? colors.brandTertiary : "transparent" }]}
                >
                  <Pressable
                    onPress={() => changeCurrency(c.code)}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: SPACING.md }}
                    testID={`currency-${c.code}`}
                  >
                    <View style={[styles.currencySymbol, { backgroundColor: active ? colors.brand : colors.surfaceTertiary }]}>
                      <Text style={{ color: active ? colors.onBrand : colors.onSurface, fontFamily: FONTS.black, fontSize: FONT_SIZE.base }}>{c.symbol}</Text>
                    </View>
                    <Text style={[styles.currencyLabel, { color: colors.onSurface }]}>{c.label}</Text>
                    {active ? <Feather name="check-circle" size={20} color={colors.brand} /> : null}
                  </Pressable>

                  <Pressable
                    onPress={() => handleDeleteCurrency(c.code, c.label)}
                    hitSlop={8}
                    style={styles.deleteBtn}
                  >
                    <Feather name="trash-2" size={17} color={colors.onSurfaceTertiary} />
                  </Pressable>
                </View>
              );
            })}

            <Pressable
              onPress={() => { setPickerSearch(""); setShowPicker(true); }}
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

        {/* Categorías */}
        <View>
          <Text style={[styles.section, { color: colors.onSurface }]}>Organización</Text>
          <Pressable onPress={() => router.push("/category-manager")} testID="open-category-manager">
            <Card>
              <View style={styles.switchRow}>
                <View style={styles.switchLeft}>
                  <Feather name="grid" size={20} color={colors.brand} />
                  <Text style={[styles.switchLabel, { color: colors.onSurface }]}>Categorías y subcategorías</Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.onSurfaceTertiary} />
              </View>
            </Card>
          </Pressable>
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

        {/* Botón Cambiar Contraseña */}
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

        {/* Cerrar Sesión */}
        <Button title="Cerrar sesión" variant="outline" icon="log-out" onPress={onLogout} loading={saving} testID="logout-button" />
        <Text style={[styles.version, { color: colors.onSurfaceTertiary }]}>PanDiario · v1.0</Text>
      </ScrollView>

      {/* Modal Cambiar Contraseña */}
      <Modal visible={changePasswordModal} transparent animationType="fade" onRequestClose={() => setChangePasswordModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Cambiar Contraseña</Text>
              <Pressable onPress={() => setChangePasswordModal(false)} hitSlop={8}>
                <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>

            <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: colors.onSurfaceTertiary }}>
              Ingresa tu nueva clave de acceso directamente.
            </Text>

            <Field
              label="Nueva Contraseña"
              placeholder="••••••••"
              secureTextEntry
              value={newPass}
              onChangeText={setNewPass}
            />

            <Field
              label="Confirmar Nueva Contraseña"
              placeholder="••••••••"
              secureTextEntry
              value={confirmPass}
              onChangeText={setConfirmPass}
            />

            {passError ? (
              <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: colors.error, textAlign: "center" }}>
                {passError}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: SPACING.md, marginTop: SPACING.xs }}>
              <Button
                title="Cancelar"
                variant="secondary"
                onPress={() => setChangePasswordModal(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Actualizar"
                onPress={handleSaveNewPassword}
                loading={passSaving}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      <GuideAssistantModal visible={showGuide} onClose={() => setShowGuide(false)} />

      {/* Modal Monedas */}
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
                <Text style={[styles.currencyLabel, { color: colors.onSurface }]}>{c.label} · {c.code}</Text>
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
  switchLeft: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  switchLabel: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.base },
  version: { fontFamily: FONTS.regular, fontSize: FONT_SIZE.sm, textAlign: "center", marginTop: SPACING.md },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md, height: 50 },
  searchInput: { flex: 1, fontFamily: FONTS.medium, fontSize: FONT_SIZE.lg, height: "100%" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: SPACING.xl },
  modalBox: { borderRadius: RADIUS.lg, padding: SPACING.xl, gap: SPACING.md },
});
