import {
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import colors from "tailwindcss/colors";
import { useColorScheme } from "react-native";
import { useNotifications } from "@/hooks/useNotifications";
import { useState } from "react";
import {
  GestureHandlerRootView,
  ScrollView,
} from "react-native-gesture-handler";
import { SwipeableNotificationItem } from "@/components/notification/SwipeableNotificationItem";
import { Notification } from "@/services/notification";

export default function NotificationsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    notifications,
    isLoading,
    refetch,
    handleMarkAsRead,
    handleMarkAllAsRead,
    handleDelete,
    unreadCount,
    isMarkingAllAsRead,
  } = useNotifications();

  const onRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const handleNotificationPress = (notification: Notification) => {
    // Mark as read if unread
    if (!notification.isRead) {
      handleMarkAsRead(notification.id);
    }

    // Navigate if there's a redirect path
    if (notification.redirect) {
      router.push(notification.redirect as any);
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView
        className="flex-1 bg-background dark:bg-background-dark"
        edges={["top"]}
      >
        <View className="flex-row items-center justify-between px-4 py-2 mb-2">
          <View className="flex-row items-center">
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
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={handleMarkAllAsRead}
              disabled={isMarkingAllAsRead}
              className="px-3 py-1.5 bg-primary rounded-full"
            >
              <Text className="text-white text-xs font-semibold">
                Mark all read
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.indigo[500]} />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
            }
          >
            {notifications.length === 0 ? (
              <View className="flex-1 items-center justify-center py-20">
                <Ionicons
                  name="notifications-off-outline"
                  size={64}
                  color={isDark ? colors.gray[600] : colors.gray[400]}
                />
                <Text className="text-gray-500 dark:text-gray-400 mt-4 text-center">
                  No notifications yet
                </Text>
              </View>
            ) : (
              notifications.map((notification) => (
                <SwipeableNotificationItem
                  key={notification.id}
                  notification={notification}
                  onPress={() => handleNotificationPress(notification)}
                  onDelete={() => handleDelete(notification.id)}
                  isDark={isDark}
                />
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}
