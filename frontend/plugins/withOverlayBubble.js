const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withMainApplication, withDangerousMod, AndroidConfig } = require("@expo/config-plugins");

const SERVICE_NAME = ".overlay.OverlayBubbleService";

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
      const files = fs.readdirSync(srcDir);
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

module.exports = function withOverlayBubble(config) {
  config = withOverlayBubbleManifest(config);
  config = withOverlayBubbleMainApplication(config);
  config = withOverlayBubbleNativeSources(config);
  return config;
};
