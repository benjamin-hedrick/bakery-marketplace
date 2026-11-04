// WI-MOB-001: the debug build carries its JavaScript bundle inside the APK, so the app starts without Metro (the Maestro flows run against it
// with no dev server) while the build type stays "debug" (and so keeps the debug-only cleartext http manifest, ADR-0023).
// React Native's Gradle plugin skips bundling for the variants listed in debuggableVariants; an empty list bundles every variant.
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withEmbeddedBundle(config) {
  return withAppBuildGradle(config, (mod) => {
    const marker = '// debuggableVariants = ["liteDebug", "prodDebug"]';
    if (!mod.modResults.contents.includes('debuggableVariants = []')) {
      if (!mod.modResults.contents.includes(marker))
        throw new Error('withEmbeddedBundle: the app build.gradle template changed');
      mod.modResults.contents = mod.modResults.contents.replace(marker, 'debuggableVariants = []');
    }
    return mod;
  });
};
