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
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top"]}
    >
      <View className="flex-row items-center px-4 py-2 mb-2">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-4 p-2 -ml-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800"
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={isDark ? colors.white : colors.black}
          />
        </TouchableOpacity>
        <Text className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
          Notifications
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-10"
        showsVerticalScrollIndicator={false}
      >
        {notifications.map((notification) => (
          <TouchableOpacity
            key={notification.id}
            className={`p-4 mb-3 rounded-2xl border ${
              !notification.read
                ? "bg-primary/5 border-primary/20"
                : "bg-surface dark:bg-surface-dark border-transparent"
            }`}
          >
            <View className="flex-row justify-between mb-1">
              <Text
                className={`text-base ${
                  !notification.read ? "font-bold" : "font-semibold"
                } text-gray-900 dark:text-white`}
              >
                {notification.title}
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {notification.time}
              </Text>
            </View>
            <Text className="text-gray-600 dark:text-gray-300 leading-5">
              {notification.message}
            </Text>
            {!notification.read && (
              <View className="absolute top-4 right-4 w-2 h-2 rounded-full bg-primary" />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
