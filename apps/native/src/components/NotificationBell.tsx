import React from "react";
import { View, Text, TouchableOpacity, useColorScheme } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useNotifications } from "@/hooks/useNotifications";
import { shadows } from "@/constants/shadows";

export const NotificationBell = () => {
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <TouchableOpacity
      className="w-12 h-12 rounded-full bg-surface dark:bg-surface-dark items-center justify-center border border-gray-100 dark:border-gray-800"
      onPress={() => router.push("/notifications")}
      style={shadows.sm}
    >
      <Ionicons
        name="notifications-outline"
        size={24}
        color={isDark ? "#E5E7EB" : "#4B5563"}
      />
      {unreadCount > 0 && (
        <View className="absolute -top-1 -right-1 min-w-[24px] h-[24px] bg-red-500 rounded-full items-center justify-center border-2 border-white dark:border-gray-900">
          <Text className="text-white text-[11px] font-bold leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};
