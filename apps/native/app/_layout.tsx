import { Slot } from "expo-router";
import { AuthProvider } from "../context/AuthContext";
import "../styles/global.css";

export default function RootLayout() {
  return (
    <AuthProvider>
      <Slot />
    </AuthProvider>
  );
}
