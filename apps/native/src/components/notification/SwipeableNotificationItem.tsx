import React from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNow } from "date-fns";
import { Notification } from "@/services/notification";

interface SwipeableNotificationItemProps {
  notification: Notification;
  onPress: () => void;
  onDelete: () => void;
  isDark: boolean;
}

export const SwipeableNotificationItem = ({
  notification,
  onPress,
  onDelete,
  isDark,
}: SwipeableNotificationItemProps) => {
  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0.5],
      extrapolate: "clamp",
    });

    const opacity = dragX.interpolate({
      inputRange: [-100, -50, 0],
      outputRange: [1, 0.8, 0],
      extrapolate: "clamp",
    });

    return (
      <Animated.View
        style={{
          opacity,
          transform: [{ scale }],
        }}
        className="justify-center items-center bg-red-500 rounded-2xl px-6 ml-3"
      >
        <TouchableOpacity
          onPress={onDelete}
          className="items-center justify-center"
        >
          <Ionicons name="trash-outline" size={24} color="white" />
          <Text className="text-white text-xs font-medium mt-1">Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
      containerStyle={{ marginBottom: 12 }}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        className={`p-4 rounded-2xl border ${
          !notification.isRead
            ? "bg-primary/5 border-primary/20"
            : isDark
              ? "bg-gray-800 border-transparent"
              : "bg-white border-transparent"
        }`}
      >
        <View className="flex-row justify-between mb-1">
          <View className="flex-row items-center flex-1">
            <Text
              className={`text-base flex-1 ${
                !notification.isRead ? "font-bold" : "font-semibold"
              } text-gray-900 dark:text-white`}
              numberOfLines={1}
            >
              {notification.title}
            </Text>
            {notification.redirect && (
              <Ionicons
                name="chevron-forward"
                size={16}
                color={isDark ? "#9CA3AF" : "#6B7280"}
                style={{ marginLeft: 4 }}
              />
            )}
          </View>
          <Text className="text-xs text-gray-500 dark:text-gray-400 ml-2">
            {formatDistanceToNow(new Date(notification.createdAt), {
              addSuffix: true,
            })}
          </Text>
        </View>
        <Text className="text-gray-600 dark:text-gray-300 leading-5">
          {notification.message}
        </Text>
        {!notification.isRead && (
          <View className="absolute top-4 right-4 w-2 h-2 rounded-full bg-primary" />
        )}
      </TouchableOpacity>
    </Swipeable>
  );
};
