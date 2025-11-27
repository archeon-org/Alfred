import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme, TouchableOpacity } from "react-native";
import colors from "tailwindcss/colors";
import { usePushNotifications } from "../../hooks/usePushNotifications";
import { useNotifications } from "../../hooks/useNotifications";

export default function AppLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();

  // Initialize push notifications once user is authenticated
  usePushNotifications();

  // Get unread notification count for badge
  const { unreadCount } = useNotifications();

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
    </Tabs>
  );
}
