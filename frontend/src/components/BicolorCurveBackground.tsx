import { StyleSheet, View, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { WELCOME_GRADIENT } from "@/src/theme/theme";

// Fondo bicolor con curva compartido por la pantalla de Bienvenida y la
// pantalla de carga/inicialización: degradado azul lavanda arriba, base
// blanca con un arco cóncavo ascendente hacia el centro (react-native-svg)
// abajo. Una sola fuente de verdad para que ambas pantallas mantengan
// exactamente la misma identidad visual.

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
export const CURVE_HEIGHT = Math.round(SCREEN_H * 0.42);
export const CURVE_EDGE_Y = 90;
export const MASCOT_SIZE = 210;
export { SCREEN_W };

const CURVE_PATH = `M0,${CURVE_HEIGHT} L0,${CURVE_EDGE_Y} Q${SCREEN_W / 2},0 ${SCREEN_W},${CURVE_EDGE_Y} L${SCREEN_W},${CURVE_HEIGHT} Z`;

export function BicolorCurveBackground({ children }: { children?: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={WELCOME_GRADIENT}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <View style={styles.curveWrap} pointerEvents="none">
        <Svg width={SCREEN_W} height={CURVE_HEIGHT}>
          <Path d={CURVE_PATH} fill="#FFFFFF" />
        </Svg>
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // El mismo tono superior del degradado (y del backgroundColor configurado
  // en expo-splash-screen): el degradado y la curva blanca cubren toda la
  // pantalla igual, pero si algo llega a pintar un frame antes de que lo
  // hagan, el fondo del contenedor ya coincide con el splash nativo en vez
  // de mostrar un blanco/gris que se vería como un recuadro de otro color.
  root: { flex: 1, backgroundColor: "#8FA7D6" },
  curveWrap: { position: "absolute", left: 0, right: 0, bottom: 0, height: CURVE_HEIGHT },
});
