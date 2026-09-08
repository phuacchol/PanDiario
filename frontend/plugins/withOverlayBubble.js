const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withMainApplication, withMainActivity, withDangerousMod, AndroidConfig } = require("@expo/config-plugins");

const SERVICE_NAME = ".overlay.OverlayBubbleService";
const FLOATING_ALIAS_NAME = ".overlay.FloatingDialogAlias";

// Config plugin: registra la burbuja flotante nativa (SYSTEM_ALERT_WINDOW)
// de PanDiario en el proyecto Android generado por `expo prebuild`. Los
// permisos (SYSTEM_ALERT_WINDOW, FOREGROUND_SERVICE*) ya se declaran en
// app.json -> android.permissions, así que aquí solo hace falta: registrar
// el <service> en el manifest, copiar el código nativo Kotlin, y enlazar el
// paquete del módulo nativo en MainApplication.

function withOverlayBubbleManifest(config) {
  return withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    if (!Array.isArray(app.service)) app.service = [];

    const alreadyRegistered = app.service.some((s) => s.$ && s.$["android:name"] === SERVICE_NAME);
    if (!alreadyRegistered) {
      app.service.push({
        $: {
          "android:name": SERVICE_NAME,
          "android:exported": "false",
          "android:foregroundServiceType": "specialUse",
        },
        property: [
          {
            $: {
              "android:name": "android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE",
              "android:value": "overlay_bubble_quick_actions",
            },
          },
        ],
      });
    }

    // Alias de MainActivity con tema de diálogo flotante: las ventanas de
    // Ingresos/Gastos/Notas/Lista nueva/Hablar que la burbuja abre desde
    // fuera de la app reutilizan las mismas pantallas React Native, pero
    // lanzadas a través de este alias (mismo código, mismo proceso) para
    // que la ventana se vea como una tarjeta flotante sobre lo que sea que
    // esté en pantalla en vez de tomar toda la pantalla. Al apuntar
    // explícitamente al alias por nombre de componente (no por
    // intent-filter) el lanzamiento normal de la app -ícono, deep links
    // pandiario://quick/*- no se ve afectado en absoluto.
    if (!Array.isArray(app["activity-alias"])) app["activity-alias"] = [];
    const aliasRegistered = app["activity-alias"].some((a) => a.$ && a.$["android:name"] === FLOATING_ALIAS_NAME);
    if (!aliasRegistered) {
      app["activity-alias"].push({
        $: {
          "android:name": FLOATING_ALIAS_NAME,
          "android:targetActivity": ".MainActivity",
          "android:theme": "@style/Theme.PanDiario.FloatingDialog",
          "android:exported": "false",
          "android:excludeFromRecents": "true",
        },
      });
    }

    return config;
  });
}

function withOverlayBubbleMainApplication(config) {
  return withMainApplication(config, (config) => {
    const pkg = config.android && config.android.package;
    if (!pkg || config.modResults.language !== "kt") return config;

    let contents = config.modResults.contents;
    const importLine = `import ${pkg}.overlay.OverlayBubblePackage`;

    if (!contents.includes(importLine)) {
      contents = contents.replace(
        /import expo\.modules\.ReactNativeHostWrapper/,
        `import expo.modules.ReactNativeHostWrapper\n${importLine}`
      );
    }

    if (!contents.includes("OverlayBubblePackage()")) {
      contents = contents.replace(
        /(PackageList\(this\)\.packages\.apply\s*\{)/,
        `$1\n              add(OverlayBubblePackage())`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

// El Asistente por voz ("Hablar") se abre a través del alias de diálogo
// flotante -ver arriba- para no traer la app a pantalla completa; para
// que quede a la mano del pulgar (ergonomía, ver la directiva) se ancla
// abajo en vez de centrado. Un Window de diálogo no tiene un atributo de
// tema declarativo para su gravity, así que se fija en runtime con
// window.setGravity() -API estándar de Android, sin dependencias-, pero
// SOLO cuando el intent trae el extra "panFloating" (lo pone
// OverlayBubbleService.openApp() únicamente al abrir /voice; un
// lanzamiento normal de la app -ícono, deep link normal- nunca lo trae,
// así que esto no puede afectar en nada al arranque habitual). Si el
// texto generado de MainActivity.kt no calza con el patrón esperado, el
// reemplazo simplemente no se aplica -no lanza, no rompe el build- y la
// única consecuencia es que el diálogo de voz queda centrado en vez de
// abajo.
function withOverlayBubbleMainActivity(config) {
  return withMainActivity(config, (config) => {
    if (config.modResults.language !== "kt") return config;
    let contents = config.modResults.contents;
    if (!contents.includes("panFloating")) {
      const snippet =
        `    if (intent?.getBooleanExtra("panFloating", false) == true) {\n` +
        `      window.setGravity(android.view.Gravity.BOTTOM)\n` +
        `    }\n`;
      const replaced = contents.replace(/(super\.onCreate\([^)]*\)\s*\n)/, `$1${snippet}`);
      if (replaced !== contents) contents = replaced;
    }
    config.modResults.contents = contents;
    return config;
  });
}

function withOverlayBubbleNativeSources(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const pkg = config.android && config.android.package;
      if (!pkg) return config;

      const pkgPath = pkg.replace(/\./g, "/");
      const targetDir = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "java", pkgPath, "overlay");
      fs.mkdirSync(targetDir, { recursive: true });

      const srcDir = path.join(__dirname, "android-native");
      const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".kt.template"));
      for (const file of files) {
        const raw = fs.readFileSync(path.join(srcDir, file), "utf8");
        const replaced = raw.split("__PACKAGE__").join(pkg);
        const targetName = file.replace(/\.template$/, "");
        fs.writeFileSync(path.join(targetDir, targetName), replaced, "utf8");
      }

      return config;
    },
  ]);
}

// Ícono oficial de la burbuja: frontend/assets/images/pandiario/pan-burbuja.png
// (recorte circular, transparencia limpia). Se copia tal cual a
// res/drawable/pan_burbuja.png para que el Kotlin de la burbuja lo cargue
// como recurso nativo (R.drawable no es estable entre builds de Expo, así
// que un nombre de archivo fijo en res/drawable/ es la forma confiable de
// referenciarlo desde fuera de React Native). Si el asset todavía no existe
// en el repo, se usa pan-avatar.png como respaldo -mismo estilo circular de
// la mascota- para que el build nunca falle por un archivo faltante.
function withOverlayBubbleIcon(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const officialSrc = path.join(projectRoot, "assets", "images", "pandiario", "pan-burbuja.png");
      const fallbackSrc = path.join(projectRoot, "assets", "images", "pandiario", "pan-avatar.png");
      const src = fs.existsSync(officialSrc) ? officialSrc : fallbackSrc;

      if (!fs.existsSync(src)) return config;

      const drawableDir = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "res", "drawable");
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.copyFileSync(src, path.join(drawableDir, "pan_burbuja.png"));

      if (src === fallbackSrc) {
        console.warn(
          "[withOverlayBubble] pan-burbuja.png no existe todavía en assets/images/pandiario/; " +
            "se usó pan-avatar.png como ícono provisional de la burbuja."
        );
      }

      return config;
    },
  ]);
}

// Copia el tema de diálogo flotante (Theme.PanDiario.FloatingDialog) a
// res/values/. Es un recurso XML plano -sin __PACKAGE__ que sustituir-, así
// que se copia tal cual, por fuera del filtro de archivos .kt.template de
// withOverlayBubbleNativeSources.
function withOverlayBubbleFloatingTheme(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const valuesDir = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "res", "values");
      fs.mkdirSync(valuesDir, { recursive: true });
      const src = path.join(__dirname, "android-native", "pandiario_overlay_styles.xml");
      fs.copyFileSync(src, path.join(valuesDir, "pandiario_overlay_styles.xml"));
      return config;
    },
  ]);
}

module.exports = function withOverlayBubble(config) {
  config = withOverlayBubbleManifest(config);
  config = withOverlayBubbleMainApplication(config);
  config = withOverlayBubbleMainActivity(config);
  config = withOverlayBubbleNativeSources(config);
  config = withOverlayBubbleIcon(config);
  config = withOverlayBubbleFloatingTheme(config);
  return config;
};
