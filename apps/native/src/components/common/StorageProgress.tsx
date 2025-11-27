import React from "react";
import { View, Text } from "react-native";

interface StorageProgressProps {
  used: number;
  limit: number;
  variant?: "card" | "default" | "light";
}

const formatBytes = (bytes: number, decimals = 1) => {
  if (!+bytes) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

export const StorageProgress = ({
  used,
  limit,
  variant = "default",
}: StorageProgressProps) => {
  const percentage = Math.min((used / limit) * 100, 100);
  const isNearLimit = percentage > 90;

  // Variant Styles - use "light" for gradient/colored backgrounds
  const isLightVariant = variant === "card" || variant === "light";

  if (isLightVariant) {
    // Light variant - for use on colored backgrounds
    return (
      <View className="w-full">
        <View className="flex-row justify-between mb-2">
          <Text
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            Storage Used
          </Text>
          <Text
            className="text-xs font-medium"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            {formatBytes(used)} / {formatBytes(limit)}
          </Text>
        </View>

        <View
          className="h-3 rounded-full overflow-hidden mb-1"
          style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
        >
          <View
            className="h-full rounded-full"
            style={{
              width: `${percentage}%`,
              backgroundColor: isNearLimit ? "#F87171" : "#FFFFFF",
            }}
          />
        </View>

        <Text
          className="text-xs font-medium text-right mt-1"
          style={{ color: "rgba(255,255,255,0.7)" }}
        >
          {percentage.toFixed(1)}% used
        </Text>
      </View>
    );
  }

  // Default variant - for use on light/dark backgrounds
  return (
    <View className="w-full">
      <View className="flex-row justify-between mb-2">
        <Text className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
          Storage Used
        </Text>
        <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {formatBytes(used)} / {formatBytes(limit)}
        </Text>
      </View>

      <View className="h-3 rounded-full overflow-hidden mb-1 bg-gray-100 dark:bg-gray-800">
        <View
          className="h-full rounded-full"
          style={{
            width: `${percentage}%`,
            backgroundColor: isNearLimit ? "#EF4444" : "#6366F1",
          }}
        />
      </View>

      <Text className="text-xs font-medium text-right mt-1 text-gray-500 dark:text-gray-400">
        {percentage.toFixed(1)}% used
      </Text>
    </View>
  );
};
