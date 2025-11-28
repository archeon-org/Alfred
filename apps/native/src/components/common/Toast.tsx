import React, { useEffect, useRef } from "react";
import { View, Text, Animated, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { shadows } from "../../constants/shadows";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastProps {
  visible: boolean;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  onHide: () => void;
}

const toastConfig = {
  success: {
    icon: "checkmark-circle" as const,
    color: "#10B981",
    bgColor: "bg-emerald-50 dark:bg-emerald-950",
    borderColor: "border-emerald-200 dark:border-emerald-800",
  },
  error: {
    icon: "alert-circle" as const,
    color: "#EF4444",
    bgColor: "bg-red-50 dark:bg-red-950",
    borderColor: "border-red-200 dark:border-red-800",
  },
  info: {
    icon: "information-circle" as const,
    color: "#6366F1",
    bgColor: "bg-indigo-50 dark:bg-indigo-950",
    borderColor: "border-indigo-200 dark:border-indigo-800",
  },
  warning: {
    icon: "warning" as const,
    color: "#F59E0B",
    bgColor: "bg-amber-50 dark:bg-amber-950",
    borderColor: "border-amber-200 dark:border-amber-800",
  },
};

export const Toast: React.FC<ToastProps> = ({
  visible,
  type,
  title,
  message,
  duration = 3000,
  onHide,
}) => {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        hideToast();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onHide();
    });
  };

  if (!visible) return null;

  const config = toastConfig[type];

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: insets.top + 8,
        left: 16,
        right: 16,
        zIndex: 9999,
        transform: [{ translateY }],
        opacity,
      }}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={hideToast}
        className={`flex-row items-center p-4 rounded-2xl border ${config.bgColor} ${config.borderColor}`}
        style={shadows.lg}
      >
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: `${config.color}20` }}
        >
          <Ionicons name={config.icon} size={22} color={config.color} />
        </View>
        <View className="flex-1">
          <Text
            className="font-bold text-gray-900 dark:text-white text-base"
            numberOfLines={1}
          >
            {title}
          </Text>
          {message && (
            <Text
              className="text-gray-600 dark:text-gray-400 text-sm mt-0.5"
              numberOfLines={2}
            >
              {message}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={hideToast}
          className="w-8 h-8 rounded-full items-center justify-center ml-2"
        >
          <Ionicons name="close" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};
