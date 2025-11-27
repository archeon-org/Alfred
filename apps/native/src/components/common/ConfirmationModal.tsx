import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ConfirmationType = "danger" | "warning" | "info";

interface ConfirmationModalProps {
  visible: boolean;
  type?: ConfirmationType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const typeConfig = {
  danger: {
    icon: "trash" as const,
    iconColor: "#EF4444",
    iconBg: "bg-red-100 dark:bg-red-900/30",
    buttonBg: "bg-red-600",
    buttonPressed: "bg-red-700",
  },
  warning: {
    icon: "warning" as const,
    iconColor: "#F59E0B",
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    buttonBg: "bg-amber-600",
    buttonPressed: "bg-amber-700",
  },
  info: {
    icon: "information-circle" as const,
    iconColor: "#6366F1",
    iconBg: "bg-indigo-100 dark:bg-indigo-900/30",
    buttonBg: "bg-indigo-600",
    buttonPressed: "bg-indigo-700",
  },
};

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  visible,
  type = "danger",
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  const insets = useSafeAreaInsets();
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const config = typeConfig[type];

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
    >
      <Animated.View
        className="flex-1 justify-center items-center px-6"
        style={{
          backgroundColor: "rgba(0,0,0,0.5)",
          opacity: opacityAnim,
        }}
      >
        <Pressable className="absolute inset-0" onPress={onCancel} />
        <Animated.View
          className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-3xl overflow-hidden"
          style={{
            transform: [{ scale: scaleAnim }],
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          {/* Content */}
          <View className="p-6 items-center">
            <View
              className={`w-16 h-16 rounded-full items-center justify-center mb-4 ${config.iconBg}`}
            >
              <Ionicons name={config.icon} size={32} color={config.iconColor} />
            </View>
            <Text className="text-xl font-bold text-gray-900 dark:text-white text-center mb-2">
              {title}
            </Text>
            <Text className="text-gray-500 dark:text-gray-400 text-center text-base leading-6">
              {message}
            </Text>
          </View>

          {/* Actions */}
          <View className="flex-row border-t border-gray-100 dark:border-gray-800">
            <TouchableOpacity
              onPress={onCancel}
              disabled={isLoading}
              className="flex-1 py-4 items-center justify-center border-r border-gray-100 dark:border-gray-800"
            >
              <Text className="text-gray-600 dark:text-gray-400 font-semibold text-base">
                {cancelText}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              disabled={isLoading}
              className={`flex-1 py-4 items-center justify-center ${config.buttonBg}`}
            >
              {isLoading ? (
                <View className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Text className="text-white font-bold text-base">
                  {confirmText}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};
