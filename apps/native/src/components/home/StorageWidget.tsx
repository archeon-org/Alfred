import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StorageProgress } from "../common/StorageProgress";
import { formatBytes } from "../../utils/format";
import { cn } from "../../utils/cn";
import { shadows } from "../../constants/shadows";

interface StorageWidgetProps {
  used: number;
  limit: number;
  credits?: number;
  dailySearchUsed?: number;
  dailySearchLimit?: number;
  bonusSearches?: number;
  className?: string;
}

export const StorageWidget = ({
  used,
  limit,
  credits,
  dailySearchUsed = 0,
  dailySearchLimit = 0,
  bonusSearches = 0,
  className,
}: StorageWidgetProps) => {
  // Calculate daily remaining AI searches
  const dailyRemaining = Math.max(0, dailySearchLimit - dailySearchUsed);

  return (
    <View
      className={cn(
        "bg-primary dark:bg-primary-900 rounded-3xl p-5",
        className
      )}
      style={shadows.primary}
    >
      {/* Header Row */}
      <View className="flex-row justify-between items-center mb-4">
        <View className="flex-row items-center">
          <View className="bg-white/20 p-2.5 rounded-xl mr-3">
            <Ionicons name="cloud-outline" size={22} color="white" />
          </View>
          <View>
            <Text className="text-primary-100 text-xs font-medium uppercase tracking-wide">
              Cloud Storage
            </Text>
            <Text className="text-white text-2xl font-bold">
              {formatBytes(used)}
              <Text className="text-white/60 text-sm font-normal">
                {" "}
                / {formatBytes(limit)}
              </Text>
            </Text>
          </View>
        </View>
      </View>

      {/* Storage Progress */}
      <View className="mb-4">
        <StorageProgress used={used} limit={limit} variant="card" />
      </View>

      {/* Stats Row */}
      <View className="flex-row gap-3">
        {/* Credits */}
        {credits !== undefined && (
          <View className="flex-1 bg-white/15 rounded-2xl p-3.5">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="bg-amber-400/20 p-2 rounded-xl mr-2.5">
                  <Ionicons name="flash" size={18} color="#FBBF24" />
                </View>
                <View>
                  <Text className="text-white/60 text-xs font-medium">
                    AI Credits
                  </Text>
                  <Text className="text-white text-xl font-bold">
                    {credits}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* AI Searches Available */}
        <View className="flex-1 bg-white/15 rounded-2xl p-3.5">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View className="bg-emerald-400/20 p-2 rounded-xl mr-2.5">
                <Ionicons name="search" size={18} color="#34D399" />
              </View>
              <View>
                <Text className="text-white/60 text-xs font-medium">
                  AI Searches
                </Text>
                <Text className="text-white text-xl font-bold">
                  {dailyRemaining}
                  {bonusSearches > 0 && (
                    <Text className="text-white/50 text-sm font-normal">
                      {" "}
                      +{bonusSearches}
                    </Text>
                  )}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};
