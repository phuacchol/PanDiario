import React from "react";
import { Image } from "expo-image";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, FONTS, FONT_SIZE } from "@/src/theme/theme";

const SOURCES = {
  welcome: require("@/assets/images/mascot_welcome.png"),
  pajama: require("@/assets/images/mascot_pajama.png"),
  box: require("@/assets/images/mascot_box.png"),
  happy: require("@/assets/images/mascot_happy.png"),
  sad: require("@/assets/images/mascot_sad.png"),
  // Estado vacío unificado de Lista/Ingreso/Gasto/Nota: la mascota con gorro
  // de dormir y pijama de estrellas, misma imagen que ya usa Bienvenida.
  bienvenido: require("@/assets/images/pandiario/pan-bienvenido.png"),
};

export function BrandLogo({ width = 220 }: { width?: number }) {
  return (
    <Image
      source={require("@/assets/images/pancon_logo.png")}
      style={{ width, height: width * 0.6 }}
      contentFit="contain"
      testID="brand-logo"
    />
  );
}

export function Mascot({
  variant = "welcome",
  size = 160,
}: {
  variant?: keyof typeof SOURCES;
  size?: number;
}) {
  return (
    <Image
      source={SOURCES[variant]}
      style={{ width: size, height: size }}
      contentFit="contain"
      testID={`mascot-${variant}`}
    />
  );
}

export function EmptyState({
  variant = "box",
  title,
  subtitle,
  children,
}: {
  variant?: keyof typeof SOURCES;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} testID="empty-state">
      <Mascot variant={variant} size={150} />
      <Text style={[styles.title, { color: colors.onSurface }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>{subtitle}</Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingVertical: SPACING["2xl"], paddingHorizontal: SPACING.xl, gap: SPACING.sm },
  title: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.xl, textAlign: "center", marginTop: SPACING.md },
  subtitle: { fontFamily: FONTS.regular, fontSize: FONT_SIZE.base, textAlign: "center", lineHeight: 20 },
});
