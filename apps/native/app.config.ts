import { ExpoConfig, ConfigContext } from "expo/config";
import versionConfig from "./version.json";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Archeon",
  slug: "archeon",
  version: versionConfig.version,
  orientation: "portrait",
  icon: "./src/assets/images/icon.png",
  scheme: "archeon",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./src/assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.soymusta.archeon",
    buildNumber: versionConfig.iosBuildNumber,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleURLTypes: [
        {
          CFBundleURLSchemes: [
            "com.googleusercontent.apps.317862465448-5fhhcvu8gkb5nmannveetfn16tag143t",
          ],
        },
      ],
    },
    config: {
      usesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./src/assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: "com.soymusta.archeon",
    versionCode: versionConfig.androidVersionCode,
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./src/assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "react-native-document-scanner-plugin",
      {
        cameraPermission: "Grant camera access to scan documents.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  updates: {
    url: "https://u.expo.dev/38f7fbb6-c5ed-4813-a677-d8786d8f9840",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  extra: {
    router: {},
    eas: {
      projectId: "38f7fbb6-c5ed-4813-a677-d8786d8f9840",
    },
  },
  owner: "archeon-org",
});
