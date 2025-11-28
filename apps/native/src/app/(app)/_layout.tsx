import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePushNotifications } from "../../hooks/usePushNotifications";
import { useNotifications } from "../../hooks/useNotifications";
import { useUser } from "../../hooks/useUser";
import { UserType } from "@archeon-org/types";

export default function AppLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Initialize push notifications once user is authenticated
  usePushNotifications();

  // Get unread notification count for badge
  const { unreadCount } = useNotifications();

  // Get user to check if admin
  const { data: user } = useUser();
  const isAdmin = user?.role === UserType.ADMIN;

  // Only add extra padding for Android navigation bar (iOS handles safe area automatically)
  const isAndroid = Platform.OS === "android";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#6366F1",
        tabBarInactiveTintColor: isDark ? "#9CA3AF" : "#9CA3AF",
        tabBarStyle: {
          backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
          borderTopColor: isDark ? "#374151" : "#F3F4F6",
          paddingTop: 8,
          ...(isAndroid && {
            paddingBottom: insets.bottom + 8,
            height: 60 + insets.bottom,
          }),
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
          marginBottom: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: "Categories",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder-open-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="scan-circle-outline"
              size={size + 4}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: "Documents",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          headerShown: false,
          href: isAdmin ? undefined : null, // Hide tab if not admin
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="shield-checkmark-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
