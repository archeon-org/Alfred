import { Platform } from "react-native";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "https://gate-dev.mooo.com/api";

const GOOGLE_CLIENT_IDS = {
  ios: "317862465448-5fhhcvu8gkb5nmannveetfn16tag143t.apps.googleusercontent.com",
  android:
    "317862465448-0kq5cf8jda50m22d558lh6k7p0qafjj4.apps.googleusercontent.com",
  web: "317862465448-nvaig0d87ogeem6ju3qttfvcgd6fp5f6.apps.googleusercontent.com",
};

export default {
  API_URL,
  GOOGLE_CLIENT_IDS,
};
