import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StorageProgress } from "../common/StorageProgress";
import { formatBytes } from "../../utils/format";
import { cn } from "../../utils/cn";

interface StorageWidgetProps {
  used: number;
  limit: number;
  className?: string;
}

export const StorageWidget = ({
  used,
  limit,
  className,
}: StorageWidgetProps) => {
  return (
    <View
      className={cn(
        "bg-primary dark:bg-primary-900 rounded-3xl p-6 mb-6 shadow-lg shadow-primary/40 dark:shadow-none",
        className
      )}
    >
      <View className="flex-row justify-between items-start mb-5">
        <View>
          <Text className="text-primary-100 text-sm font-semibold mb-1 tracking-wide uppercase">
            Cloud Storage
          </Text>
          <Text className="text-white text-3xl font-bold tracking-tight">
            {formatBytes(used)}
          </Text>
        </View>
        <View className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
          <Ionicons name="cloud-outline" size={28} color="white" />
        </View>
      </View>

      <StorageProgress used={used} limit={limit} variant="card" />
    </View>
  );
};
