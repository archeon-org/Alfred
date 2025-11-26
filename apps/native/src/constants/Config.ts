import { Platform } from "react-native";

const ENV = {
  local: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  },
  development: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL || "https://gate-dev.mooo.com/api",
  },
  production: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL || "https://gate-dev.mooo.com/api",
  },
};

const getEnvVars = (env = process.env.EXPO_PUBLIC_ENV || "local") => {
  if (env === "production") {
    return ENV.production;
  }
  if (env === "development") {
    return ENV.development;
  }
  return ENV.local;
};

const API_URL = getEnvVars().apiUrl;

const GOOGLE_CLIENT_IDS = {
  ios: "317862465448-5fhhcvu8gkb5nmannveetfn16tag143t.apps.googleusercontent.com",
  android:
    "317862465448-p8o2csa8492ljut4dracmvdgiahv3shl.apps.googleusercontent.com",
  web: "317862465448-nvaig0d87ogeem6ju3qttfvcgd6fp5f6.apps.googleusercontent.com",
};

export default {
  API_URL,
  GOOGLE_CLIENT_IDS,
};
