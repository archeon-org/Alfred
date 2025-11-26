import React from "react";
import { View, Text } from "react-native";

interface StorageProgressProps {
  used: number;
  limit: number;
  variant?: "card" | "default";
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

  // Variant Styles
  const isCard = variant === "card";

  const labelColor = isCard
    ? "text-primary-100"
    : "text-gray-700 dark:text-gray-300";
  const valueColor = isCard
    ? "text-primary-200"
    : "text-gray-500 dark:text-gray-400";
  const trackColor = isCard ? "bg-black/20" : "bg-gray-100 dark:bg-gray-800";

  // For card: secondary color (teal) or red if full. For default: primary.
  const progressColor = isCard
    ? isNearLimit
      ? "bg-red-400"
      : "bg-secondary" // Use secondary (Teal) on the dark primary card for pop
    : isNearLimit
      ? "bg-red-500"
      : "bg-primary";

  return (
    <View className="w-full">
      <View className="flex-row justify-between mb-2">
        <Text
          className={`text-xs font-semibold uppercase tracking-wider ${labelColor}`}
        >
          Storage Used
        </Text>
        <Text className={`text-xs font-medium ${valueColor}`}>
          {formatBytes(used)} / {formatBytes(limit)}
        </Text>
      </View>

      <View className={`h-3 ${trackColor} rounded-full overflow-hidden mb-1`}>
        <View
          className={`h-full rounded-full ${progressColor}`}
          style={{ width: `${percentage}%` }}
        />
      </View>

      <Text className={`text-xs font-medium ${valueColor} text-right mt-1`}>
        {percentage.toFixed(1)}% used
      </Text>
    </View>
  );
};
