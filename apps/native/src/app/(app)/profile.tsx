import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import colors from "tailwindcss/colors";

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const menuItems = [
    { icon: "person-outline", label: "Account Settings" },
    { icon: "notifications-outline", label: "Notifications" },
    { icon: "shield-checkmark-outline", label: "Privacy & Security" },
    { icon: "help-circle-outline", label: "Help & Support" },
  ];

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <ScrollView className="p-4">
        <Text className="text-2xl font-bold text-black dark:text-white mb-6">
          Profile
        </Text>

        <View className="items-center mb-8">
          <View className="w-24 h-24 bg-gray-200 dark:bg-gray-800 rounded-full items-center justify-center mb-4">
            <Ionicons
              name="person"
              size={40}
              color={isDark ? colors.gray[400] : colors.gray[500]}
            />
          </View>
          <Text className="text-xl font-semibold text-black dark:text-white">
            User Name
          </Text>
          <Text className="text-gray-500 dark:text-gray-400">
            user@example.com
          </Text>
        </View>

        <View className="bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden mb-6">
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              className={`flex-row items-center p-4 ${index !== menuItems.length - 1 ? "border-b border-gray-200 dark:border-gray-800" : ""}`}
            >
              <Ionicons
                name={item.icon as any}
                size={24}
                color={isDark ? colors.gray[300] : colors.gray[700]}
                style={{ marginRight: 16 }}
              />
              <Text className="flex-1 text-base text-black dark:text-white">
                {item.label}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.gray[400]}
              />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={signOut}
          className="flex-row items-center justify-center p-4 bg-red-50 dark:bg-red-900/20 rounded-xl"
        >
          <Ionicons
            name="log-out-outline"
            size={24}
            color={isDark ? colors.red[400] : colors.red[600]}
            style={{ marginRight: 8 }}
          />
          <Text className="text-red-600 dark:text-red-400 font-semibold text-base">
            Sign Out
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
