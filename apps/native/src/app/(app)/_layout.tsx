import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme, TouchableOpacity } from "react-native";
import colors from "tailwindcss/colors";

export default function AppLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerRight: () => (
          <TouchableOpacity
            onPress={() => router.push("/notifications")}
            style={{ marginRight: 16 }}
          >
            <Ionicons
              name="notifications-outline"
              size={24}
              color={isDark ? colors.white : colors.black}
            />
          </TouchableOpacity>
        ),
        headerStyle: {
          backgroundColor: isDark ? colors.black : colors.white,
          shadowOpacity: 0,
          elevation: 0,
          borderBottomWidth: 1,
          borderBottomColor: isDark ? colors.gray[800] : colors.gray[100],
        },
        headerTitleStyle: {
          color: isDark ? colors.white : colors.black,
          fontWeight: "bold",
          fontSize: 20,
        },
        tabBarActiveTintColor: isDark ? colors.white : colors.black,
        tabBarInactiveTintColor: isDark ? colors.gray[500] : colors.gray[400],
        tabBarStyle: {
          backgroundColor: isDark ? colors.black : colors.white,
          borderTopColor: isDark ? colors.gray[800] : colors.gray[200],
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: "Documents",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder-open-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
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
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
