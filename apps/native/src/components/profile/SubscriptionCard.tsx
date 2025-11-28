import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SubscriptionStatus, CREDIT_COSTS } from "@archeon-org/types";
import { formatBytes } from "../../utils/format";

interface SubscriptionCardProps {
  subscription?: SubscriptionStatus;
  onPress?: () => void;
}

export const SubscriptionCard = ({
  subscription,
  onPress,
}: SubscriptionCardProps) => {
  if (!subscription) {
    return null;
  }

  const dailySearchesRemaining =
    subscription.dailySearchLimit - subscription.dailySearchUsed;

  // Calculate time until daily search reset
  const getResetTimeLabel = () => {
    if (!subscription.dailySearchResetsAt) return "";
    const resetAt = new Date(subscription.dailySearchResetsAt);
    const now = new Date();
    const diff = resetAt.getTime() - now.getTime();
    if (diff <= 0) return "Resets soon";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `Resets in ${hours}h ${minutes}m`;
    return `Resets in ${minutes}m`;
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="mb-4"
      disabled={!onPress}
    >
      <View className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        {/* Header */}
        <View className="bg-gradient-to-r from-indigo-500 to-purple-500 p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="w-8 h-8 bg-white/20 rounded-lg items-center justify-center">
                <Ionicons name="sparkles" size={16} color="white" />
              </View>
              <View>
                <Text className="text-white font-bold text-base capitalize">
                  {subscription.tier} Plan
                </Text>
                <Text className="text-white/70 text-xs">AI Features</Text>
              </View>
            </View>
            {onPress && (
              <View className="bg-white/20 px-3 py-1.5 rounded-full">
                <Text className="text-white text-xs font-semibold">Manage</Text>
              </View>
            )}
          </View>
        </View>

        {/* Stats Grid */}
        <View className="p-4">
          <View className="flex-row gap-3 mb-4">
            {/* Credits */}
            <View className="flex-1 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3">
              <View className="flex-row items-center gap-1.5 mb-1">
                <Ionicons name="flash" size={14} color="#6366F1" />
                <Text className="text-indigo-600 dark:text-indigo-400 text-xs font-medium">
                  Credits
                </Text>
              </View>
              <Text className="text-2xl font-bold text-gray-900 dark:text-white">
                {subscription.credits}
              </Text>
              <Text className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                Available
              </Text>
            </View>

            {/* Daily AI Searches */}
            <View className="flex-1 bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3">
              <View className="flex-row items-center gap-1.5 mb-1">
                <Ionicons name="search" size={14} color="#8B5CF6" />
                <Text className="text-purple-600 dark:text-purple-400 text-xs font-medium">
                  Daily Searches
                </Text>
              </View>
              <Text className="text-2xl font-bold text-gray-900 dark:text-white">
                {dailySearchesRemaining}
                <Text className="text-sm text-gray-400 font-normal">
                  /{subscription.dailySearchLimit}
                </Text>
              </Text>
              <Text className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                {getResetTimeLabel()}
              </Text>
            </View>
          </View>

          {/* Bonus Searches */}
          {subscription.bonusSearches > 0 && (
            <View className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 mb-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="gift" size={14} color="#10B981" />
                  <Text className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                    Bonus AI Searches
                  </Text>
                </View>
                <Text className="text-xl font-bold text-gray-900 dark:text-white">
                  {subscription.bonusSearches}
                </Text>
              </View>
              <Text className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                Used when daily limit is reached • Never expires
              </Text>
            </View>
          )}

          {/* Storage Bar */}
          <View className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="cloud" size={14} color="#10B981" />
                <Text className="text-gray-700 dark:text-gray-300 text-xs font-medium">
                  Storage
                </Text>
              </View>
              <Text className="text-gray-500 dark:text-gray-400 text-xs">
                {formatBytes(subscription.storageUsed)} /{" "}
                {formatBytes(subscription.storageLimit)}
              </Text>
            </View>
            <View className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(subscription.storagePercentUsed, 100)}%`,
                  backgroundColor:
                    subscription.storagePercentUsed > 90
                      ? "#EF4444"
                      : subscription.storagePercentUsed > 70
                        ? "#F59E0B"
                        : "#10B981",
                }}
              />
            </View>
            {subscription.extraStoragePurchased > 0 && (
              <Text className="text-emerald-600 dark:text-emerald-400 text-xs mt-1.5">
                +{formatBytes(subscription.extraStoragePurchased)} bonus storage
              </Text>
            )}
          </View>

          {/* Credit Costs Info */}
          <View className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <Text className="text-gray-400 dark:text-gray-500 text-xs text-center">
              AI Processing: {CREDIT_COSTS.ai_classification} credits • Title:{" "}
              {CREDIT_COSTS.ai_title_generation} credit • Embed:{" "}
              {CREDIT_COSTS.ai_embedding} credit
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};
