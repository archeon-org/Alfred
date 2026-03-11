import React, { useRef } from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import {
  Swipeable,
  RectButton,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNow } from "date-fns";
import { Notification } from "@/services/notification";

interface SwipeableNotificationItemProps {
  notification: Notification;
  onPress: () => void;
  onDelete: () => void;
  isDark: boolean;
}

// Get notification icon based on title/type
const getNotificationIcon = (
  title: string,
): { name: string; color: string; bgColor: string } => {
  const lowerTitle = title.toLowerCase();

  if (lowerTitle.includes("classified") || lowerTitle.includes("category")) {
    return {
      name: "folder",
      color: "#10B981",
      bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    };
  }
  if (lowerTitle.includes("error") || lowerTitle.includes("failed")) {
    return {
      name: "alert-circle",
      color: "#EF4444",
      bgColor: "bg-red-100 dark:bg-red-900/30",
    };
  }
  if (lowerTitle.includes("search") || lowerTitle.includes("indexed")) {
    return {
      name: "search",
      color: "#8B5CF6",
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
    };
  }
  if (lowerTitle.includes("title") || lowerTitle.includes("generated")) {
    return {
      name: "sparkles",
      color: "#F59E0B",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
    };
  }
  if (lowerTitle.includes("upload") || lowerTitle.includes("document")) {
    return {
      name: "document-text",
      color: "#3B82F6",
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
    };
  }
  return {
    name: "notifications",
    color: "#6366F1",
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
  };
};

export const SwipeableNotificationItem = ({
  notification,
  onPress,
  onDelete,
  isDark,
}: SwipeableNotificationItemProps) => {
  const swipeableRef = useRef<Swipeable>(null);
  const iconInfo = getNotificationIcon(notification.title);

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [80, 0],
    });

    const scale = progress.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.8, 1, 1],
    });

    return (
      <Animated.View
        style={{
          width: 80,
          transform: [{ translateX }],
        }}
      >
        <RectButton
          style={{
            flex: 1,
            backgroundColor: "#EF4444",
            borderRadius: 16,
            marginLeft: 8,
            justifyContent: "center",
            alignItems: "center",
          }}
          onPress={() => {
            swipeableRef.current?.close();
            onDelete();
          }}
        >
          <Animated.View
            style={{ transform: [{ scale }], alignItems: "center" }}
          >
            <Ionicons name="trash-outline" size={22} color="white" />
            <Text
              style={{
                color: "white",
                fontSize: 11,
                fontWeight: "600",
                marginTop: 2,
              }}
            >
              Delete
            </Text>
          </Animated.View>
        </RectButton>
      </Animated.View>
    );
  };

  const handleSwipeableOpen = (direction: "left" | "right") => {
    // Auto-delete when fully swiped
    if (direction === "right") {
      onDelete();
    }
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={60}
      overshootRight={false}
      friction={2}
      onSwipeableOpen={handleSwipeableOpen}
      containerStyle={{ marginBottom: 12 }}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        className={`flex-row p-4 rounded-2xl border ${
          !notification.isRead
            ? "bg-primary/5 border-primary/20"
            : isDark
              ? "bg-gray-800/80 border-gray-700/50"
              : "bg-white border-gray-100"
        }`}
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0 : 0.05,
          shadowRadius: 3,
          elevation: 1,
        }}
      >
        {/* Icon */}
        <View
          className={`w-11 h-11 rounded-xl items-center justify-center mr-3 ${iconInfo.bgColor}`}
        >
          <Ionicons
            name={iconInfo.name as any}
            size={20}
            color={iconInfo.color}
          />
        </View>

        {/* Content */}
        <View className="flex-1">
          <View className="flex-row items-start justify-between mb-1">
            <Text
              className={`text-base flex-1 mr-2 ${
                !notification.isRead ? "font-bold" : "font-semibold"
              } text-gray-900 dark:text-white`}
              numberOfLines={1}
            >
              {notification.title}
            </Text>
            <View className="flex-row items-center">
              {!notification.isRead && (
                <View className="w-2 h-2 rounded-full bg-primary mr-2" />
              )}
              <Text className="text-xs text-gray-400 dark:text-gray-500">
                {formatDistanceToNow(new Date(notification.createdAt), {
                  addSuffix: false,
                })}
              </Text>
            </View>
          </View>
          <Text
            className="text-sm text-gray-600 dark:text-gray-400 leading-5"
            numberOfLines={2}
          >
            {notification.message}
          </Text>
        </View>

        {/* Chevron for redirectable notifications */}
        {notification.redirect && (
          <View className="justify-center ml-2">
            <Ionicons
              name="chevron-forward"
              size={18}
              color={isDark ? "#6B7280" : "#9CA3AF"}
            />
          </View>
        )}
      </TouchableOpacity>
    </Swipeable>
  );
};
