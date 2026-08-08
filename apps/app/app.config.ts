import type { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Giraffle",
  slug: "giraffle",
  scheme: "giraffle",
  version: "0.11.0",
  orientation: "default",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#f5efe5"
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.giraffegraph.giraffle",
    infoPlist: {
      NSFaceIDUsageDescription: "Unlock your encrypted Giraffle vault."
    }
  },
  android: {
    package: "com.giraffegraph.giraffle",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#f5efe5"
    },
    allowBackup: false
  },
  // Every route is served from one shell so the service worker can answer any
  // deep link offline. The installable manifest, the worker and the HTML head
  // live in `public/`, which Expo copies into the export verbatim.
  web: { bundler: "metro", output: "single", favicon: "./assets/favicon.png" },
  plugins: [
    "expo-router",
    ["expo-splash-screen", { image: "./assets/splash.png", imageWidth: 160, backgroundColor: "#f5efe5", dark: { backgroundColor: "#191919" } }],
    ["expo-secure-store", { configureAndroidBackup: true, faceIDPermission: "Unlock your encrypted Giraffle vault." }],
    ["expo-sqlite", { useSQLCipher: true, enableFTS: true }],
    ["react-native-libsodium", {}],
    "./plugins/withoutAssetSourcemaps"
  ],
  experiments: { typedRoutes: true },
  extra: {
    syncBaseUrl: process.env.EXPO_PUBLIC_SYNC_BASE_URL ?? "",
    eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "00000000-0000-0000-0000-000000000000" }
  }
});
