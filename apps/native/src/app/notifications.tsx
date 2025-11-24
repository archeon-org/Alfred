import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import colors from "tailwindcss/colors";
import { useColorScheme } from "react-native";

export default function NotificationsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const notifications = [
    {
      id: 1,
      title: "Document Processed",
      message: "Your insurance policy has been successfully processed.",
      time: "2h ago",
      read: false,
    },
    {
      id: 2,
      title: "Storage Alert",
      message: "You have used 80% of your storage limit.",
      time: "1d ago",
      read: true,
    },
    {
      id: 3,
      title: "Welcome to Archeon",
      message: "Get started by scanning your first document.",
      time: "2d ago",
      read: true,
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <View className="flex-row items-center p-4 border-b border-gray-100 dark:border-gray-900">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons
            name="arrow-back"
            size={24}
            color={isDark ? colors.white : colors.black}
          />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-black dark:text-white">
          Notifications
        </Text>
      </View>

      <ScrollView className="flex-1">
        {notifications.map((notification) => (
          <TouchableOpacity
            key={notification.id}
            className={`p-4 border-b border-gray-100 dark:border-gray-900 ${
              !notification.read ? "bg-blue-50 dark:bg-blue-900/10" : ""
            }`}
          >
            <View className="flex-row justify-between mb-1">
              <Text
                className={`text-base ${
                  !notification.read ? "font-bold" : "font-semibold"
                } text-black dark:text-white`}
              >
                {notification.title}
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {notification.time}
              </Text>
            </View>
            <Text className="text-gray-600 dark:text-gray-300">
              {notification.message}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
