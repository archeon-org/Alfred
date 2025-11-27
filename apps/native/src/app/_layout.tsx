import { Slot, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import { BiometricProvider } from "../context/BiometricContext";
import { BiometricLockScreen } from "../components/BiometricLockScreen";
import {
  ThemeProvider,
  DefaultTheme,
  DarkTheme,
} from "@react-navigation/native";
import { useColorScheme } from "nativewind";
import "../styles/global.css";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BiometricProvider>
          <ToastProvider>
            <ThemeProvider
              value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
            >
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(app)" />
                <Stack.Screen
                  name="notifications"
                  options={{
                    headerShown: false,
                    presentation: "card",
                    animation: "slide_from_right",
                    gestureEnabled: true,
                    gestureDirection: "horizontal",
                  }}
                />
                <Stack.Screen
                  name="terms"
                  options={{
                    headerShown: false,
                    presentation: "card",
                    animation: "slide_from_right",
                    gestureEnabled: true,
                    gestureDirection: "horizontal",
                  }}
                />
                <Stack.Screen
                  name="privacy"
                  options={{
                    headerShown: false,
                    presentation: "card",
                    animation: "slide_from_right",
                    gestureEnabled: true,
                    gestureDirection: "horizontal",
                  }}
                />
              </Stack>
              <BiometricLockScreen />
            </ThemeProvider>
          </ToastProvider>
        </BiometricProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
