import React from "react";
import { View, Text, useColorScheme } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cn } from "../../utils/cn";
import { shadows } from "../../constants/shadows";

export const ScanEmptyState = () => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <View className="items-center justify-center mb-8 flex-1">
      <View
        className="bg-surface dark:bg-surface-dark p-10 rounded-full mb-6"
        style={shadows.sm}
      >
        <Ionicons
          name="scan-outline"
          size={80}
          color={isDark ? "#D1D5DB" : "#6366F1"}
        />
      </View>
      <Text className="text-gray-900 dark:text-white text-3xl font-bold mb-3 tracking-tight">
        Scan Document
      </Text>
      <Text className="text-gray-500 dark:text-gray-400 text-center px-8 text-lg leading-6">
        Take a photo of your document to convert it to PDF and upload it
        securely.
      </Text>
    </View>
  );
};
