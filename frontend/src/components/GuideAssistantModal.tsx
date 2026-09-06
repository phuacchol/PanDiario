import React, { useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Mascot } from "@/src/components/Mascot";
import { Button } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";

const GUIDE_STEPS = [
  {
    title: "1. Inventario y Productos",
    icon: "package",
    desc: "Crea tus productos con categorías automáticas y márgenes de ganancia. Al buscar, el autocompletado estilo Google te sugerirá coincidencias inmediatas. En la pestaña 'Historial de Ingresos' puedes consultar compras pasadas o eliminarlas revirtiendo el stock si hubo error.",
  },
  {
    title: "2. Punto de Venta (Ventas)",
    icon: "shopping-cart",
    desc: "Selecciona productos o cobra montos directos. Al confirmar la venta (en efectivo o transferencia digital), el stock de los productos vendidos se descuenta automáticamente de tu inventario.",
  },
  {
    title: "3. Gastos Simplificados",
    icon: "trending-down",
    desc: "Elige el tipo de gasto (Mercancía, Insumos u Operativos) y sus 5 categorías estándar se cargarán al instante sin subcategorías complicadas. También puedes crear nuevos tipos con el botón (+).",
  },
  {
    title: "4. Asistente por Voz Inteligente",
    icon: "mic",
    desc: "Toca el micrófono y habla de forma natural: 'Vendí 2 polos a 20' o '¿Cuánto vendí hoy?'. Sigue dictando para sumar más productos a la misma venta ('3 pantalones más') o ingreso de stock, sin repetir 'Pan'. Elige el pago diciendo 'pagar en efectivo', 'pagar por transferencia' o 'pagar mixto, 120 en efectivo'. Para gastos: 'Gasté 15 soles en pasaje' o 'Pagué 50 soles de luz'. Al ingresar stock puedes dictar la nota de proveedor ('con nota señor Pepe 987654') y elegir si se suma a un producto existente o se crea uno nuevo.",
  },
  {
    title: "5. Caja del Día y Arqueo (Reportes)",
    icon: "inbox",
    desc: "Define tu fondo inicial al iniciar el día. Al cerrar, haz clic en 'Hacer Arqueo' para ingresar el dinero físico contado: el sistema calculará inmediatamente si tu caja está cuadrada, si hay sobrante o faltante.",
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function GuideAssistantModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);

  const step = GUIDE_STEPS[currentStep];

  const onNext = () => {
    if (currentStep < GUIDE_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      setCurrentStep(0);
      onClose();
    }
  };

  const onPrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
              <Mascot variant="happy" size={44} />
              <View>
                <Text style={[styles.title, { color: colors.onSurface }]}>Guía Asistente</Text>
                <Text style={{ fontFamily: FONTS.medium, fontSize: FONT_SIZE.xs, color: colors.onSurfaceTertiary }}>
                  Paso {currentStep + 1} de {GUIDE_STEPS.length}
                </Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={22} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>

          <View style={[styles.stepContent, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: colors.brand + "18" }]}>
              <Feather name={step.icon as any} size={26} color={colors.brand} />
            </View>
            <Text style={[styles.stepTitle, { color: colors.onSurface }]}>{step.title}</Text>
            <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.stepDesc, { color: colors.onSurfaceSecondary }]}>{step.desc}</Text>
            </ScrollView>
          </View>

          {/* Indicadores de progreso */}
          <View style={styles.dotsRow}>
            {GUIDE_STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === currentStep ? colors.brand : colors.surfaceTertiary,
                    width: i === currentStep ? 20 : 8,
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            {currentStep > 0 ? (
              <Button title="Anterior" variant="secondary" onPress={onPrev} style={{ flex: 1 }} />
            ) : null}
            <Button
              title={currentStep === GUIDE_STEPS.length - 1 ? "¡Entendido!" : "Siguiente"}
              onPress={onNext}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontFamily: FONTS.black,
    fontSize: FONT_SIZE.lg,
  },
  stepContent: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.lg,
    alignItems: "center",
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  stepTitle: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.base,
    textAlign: "center",
  },
  stepDesc: {
    fontFamily: FONTS.medium,
    fontSize: FONT_SIZE.sm,
    textAlign: "center",
    lineHeight: 20,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginVertical: 4,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.md,
  },
});
