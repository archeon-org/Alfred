import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useUser } from "../../../hooks/useUser";
import { useCanUpgrade } from "../../../hooks/useSubscription";
import {
  CREDIT_PACKS,
  STORAGE_PACKS,
  CREDIT_COSTS,
  CreditPack,
  StoragePack,
  SubscriptionTier,
  TIER_LIMITS,
} from "@archeon-org/types";
import { formatBytes } from "../../../utils/format";
import { Skeleton } from "@/components/common/Skeleton";

export default function SubscriptionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reason?: string }>();
  const { data: user, isLoading } = useUser();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const subscription = user?.subscription;
  const { canUpgrade } = useCanUpgrade(SubscriptionTier.PRO);

  // Check if user was redirected here due to insufficient credits
  const showCreditsWarning = params.reason === "insufficient_credits";
  const showStorageWarning = params.reason === "insufficient_storage";

  const proTierLimits = TIER_LIMITS[SubscriptionTier.PRO];

  const handleContactSupport = () => {
    Linking.openURL(
      "mailto:support@archeon.app?subject=Subscription%20Inquiry"
    );
  };

  const handleUpgradeToPro = () => {
    // In production, this should trigger a payment flow
    // For now, show a contact support message
    Alert.alert(
      "Upgrade to Pro",
      `Pro plan costs €${proTierLimits.priceEurMonth}/month and includes:\n\n` +
        `• ${proTierLimits.monthlyCredits} credits/month\n` +
        `• ${proTierLimits.dailySearchLimit} AI searches/day\n` +
        `• ${formatBytes(proTierLimits.storageLimitBytes)} storage\n` +
        `• Priority support\n\n` +
        `Contact support to upgrade your subscription.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Contact Support", onPress: handleContactSupport },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-background dark:bg-background-dark"
        edges={["top"]}
      >
        <View className="flex-1 px-5 pt-2">
          <View className="flex-row items-center mb-6">
            <Skeleton className="w-10 h-10 rounded-full" />
            <Skeleton className="h-7 w-40 ml-3" />
          </View>
          <Skeleton className="h-40 w-full rounded-2xl mb-4" />
          <Skeleton className="h-60 w-full rounded-2xl mb-4" />
          <Skeleton className="h-60 w-full rounded-2xl" />
        </View>
      </SafeAreaView>
    );
  }

  const dailySearchesRemaining = subscription
    ? subscription.dailySearchLimit - subscription.dailySearchUsed
    : 0;

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top"]}
    >
      {/* Header */}
      <View className="flex-row items-center px-5 pt-2 pb-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center"
        >
          <Ionicons
            name="arrow-back"
            size={20}
            color={isDark ? "#fff" : "#111"}
          />
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-gray-900 dark:text-white ml-3">
          Subscription
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-8"
        showsVerticalScrollIndicator={false}
      >
        {/* Warning Banner - shown when redirected due to insufficient resources */}
        {(showCreditsWarning || showStorageWarning) && (
          <View className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 mb-4">
            <View className="flex-row items-center">
              <View className="w-10 h-10 bg-amber-100 dark:bg-amber-800/30 rounded-full items-center justify-center">
                <Ionicons name="warning" size={20} color="#F59E0B" />
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-amber-800 dark:text-amber-200 font-bold text-base">
                  {showCreditsWarning ? "Insufficient Credits" : "Storage Full"}
                </Text>
                <Text className="text-amber-700 dark:text-amber-300 text-sm mt-0.5">
                  {showCreditsWarning
                    ? "You need more credits to use this AI feature."
                    : "You need more storage space to upload documents."}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Current Plan Card */}
        <View className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden mb-6">
          <View className="bg-indigo-600 p-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="w-10 h-10 bg-white/20 rounded-xl items-center justify-center">
                  <Ionicons name="sparkles" size={20} color="white" />
                </View>
                <View className="ml-3">
                  <Text className="text-white/70 text-xs font-medium uppercase tracking-wide">
                    Current Plan
                  </Text>
                  <Text className="text-white font-bold text-xl capitalize">
                    {subscription?.tier || "Free"} Plan
                  </Text>
                </View>
              </View>
              <View className="bg-white/20 px-3 py-1.5 rounded-full">
                <Text className="text-white text-xs font-semibold">Active</Text>
              </View>
            </View>
          </View>

          <View className="p-4">
            {/* Stats Row */}
            <View className="flex-row gap-3 mb-4">
              {/* Credits */}
              <View
                className={`flex-1 rounded-xl p-3 ${
                  (subscription?.credits ?? 0) <= 3
                    ? "bg-red-50 dark:bg-red-900/20"
                    : "bg-indigo-50 dark:bg-indigo-900/20"
                }`}
              >
                <View className="flex-row items-center gap-1.5 mb-1">
                  <Ionicons
                    name="flash"
                    size={14}
                    color={
                      (subscription?.credits ?? 0) <= 3 ? "#EF4444" : "#6366F1"
                    }
                  />
                  <Text
                    className={`text-xs font-medium ${
                      (subscription?.credits ?? 0) <= 3
                        ? "text-red-600 dark:text-red-400"
                        : "text-indigo-600 dark:text-indigo-400"
                    }`}
                  >
                    Credits
                  </Text>
                </View>
                <Text className="text-2xl font-bold text-gray-900 dark:text-white">
                  {subscription?.credits ?? 0}
                </Text>
              </View>

              {/* AI Searches */}
              <View className="flex-1 bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3">
                <View className="flex-row items-center gap-1.5 mb-1">
                  <Ionicons name="search" size={14} color="#8B5CF6" />
                  <Text className="text-purple-600 dark:text-purple-400 text-xs font-medium">
                    AI Searches
                  </Text>
                </View>
                <Text className="text-2xl font-bold text-gray-900 dark:text-white">
                  {dailySearchesRemaining}
                  <Text className="text-sm text-gray-400 font-normal">
                    /{subscription?.dailySearchLimit ?? 15}
                  </Text>
                </Text>
              </View>
            </View>

            {/* Storage */}
            <View
              className={`rounded-xl p-3 ${
                (subscription?.storagePercentUsed ?? 0) >= 90
                  ? "bg-red-50 dark:bg-red-900/20"
                  : "bg-gray-50 dark:bg-gray-800/50"
              }`}
            >
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons
                    name="cloud"
                    size={14}
                    color={
                      (subscription?.storagePercentUsed ?? 0) >= 90
                        ? "#EF4444"
                        : "#10B981"
                    }
                  />
                  <Text className="text-gray-700 dark:text-gray-300 text-xs font-medium">
                    Storage
                  </Text>
                </View>
                <Text className="text-gray-500 dark:text-gray-400 text-xs">
                  {formatBytes(subscription?.storageUsed ?? 0)} /{" "}
                  {formatBytes(subscription?.storageLimit ?? 1073741824)}
                </Text>
              </View>
              <View className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(subscription?.storagePercentUsed ?? 0, 100)}%`,
                    backgroundColor:
                      (subscription?.storagePercentUsed ?? 0) > 90
                        ? "#EF4444"
                        : (subscription?.storagePercentUsed ?? 0) > 70
                          ? "#F59E0B"
                          : "#10B981",
                  }}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Upgrade Plan Section - Only show if user can upgrade */}
        {canUpgrade && (
          <View className="mb-6">
            <View className="flex-row items-center mb-3">
              <Ionicons name="rocket" size={20} color="#8B5CF6" />
              <Text className="text-lg font-bold text-gray-900 dark:text-white ml-2">
                Upgrade Plan
              </Text>
            </View>
            <Text className="text-gray-500 dark:text-gray-400 text-sm mb-4">
              Get more credits, storage, and AI searches with a premium plan.
            </Text>

            {/* Pro Plan Card */}
            <TouchableOpacity
              onPress={handleUpgradeToPro}
              activeOpacity={0.7}
              className="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl overflow-hidden mb-3"
            >
              <View className="p-4">
                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-row items-center">
                    <View className="w-12 h-12 bg-white/20 rounded-xl items-center justify-center">
                      <Ionicons name="diamond" size={24} color="white" />
                    </View>
                    <View className="ml-3">
                      <Text className="text-white font-bold text-xl">
                        Pro Plan
                      </Text>
                      <Text className="text-white/70 text-sm">
                        For power users
                      </Text>
                    </View>
                  </View>
                  <View className="items-end">
                    <Text className="text-white font-bold text-xl">
                      €{proTierLimits.priceEurMonth}
                    </Text>
                    <Text className="text-white/70 text-xs">/month</Text>
                  </View>
                </View>

                <View className="bg-white/10 rounded-xl p-3 gap-2">
                  <View className="flex-row items-center">
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#10B981"
                    />
                    <Text className="text-white text-sm ml-2">
                      {proTierLimits.monthlyCredits} credits/month
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#10B981"
                    />
                    <Text className="text-white text-sm ml-2">
                      {proTierLimits.dailySearchLimit} AI searches/day
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#10B981"
                    />
                    <Text className="text-white text-sm ml-2">
                      {formatBytes(proTierLimits.storageLimitBytes)} storage
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#10B981"
                    />
                    <Text className="text-white text-sm ml-2">
                      Priority support
                    </Text>
                  </View>
                </View>

                <View className="mt-4 bg-white rounded-xl py-3 items-center">
                  <Text className="text-indigo-600 font-bold text-sm">
                    Upgrade Now
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Credit Packs Section */}
        <View className="mb-6">
          <View className="flex-row items-center mb-3">
            <Ionicons name="flash" size={20} color="#6366F1" />
            <Text className="text-lg font-bold text-gray-900 dark:text-white ml-2">
              Buy Credits
            </Text>
          </View>
          <Text className="text-gray-500 dark:text-gray-400 text-sm mb-4">
            Credits are used for AI document processing. Each pack also includes
            bonus AI searches that never expire!
          </Text>

          <View className="gap-3">
            {Object.entries(CREDIT_PACKS).map(([key, pack]) => {
              const isPopular = key === CreditPack.MEDIUM;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={handleContactSupport}
                  activeOpacity={0.7}
                  className={`bg-white dark:bg-gray-900 rounded-2xl border overflow-hidden ${
                    isPopular
                      ? "border-indigo-300 dark:border-indigo-700"
                      : "border-gray-100 dark:border-gray-800"
                  }`}
                >
                  {isPopular && (
                    <View className="bg-indigo-600 py-1">
                      <Text className="text-white text-xs font-bold text-center uppercase tracking-wide">
                        Most Popular
                      </Text>
                    </View>
                  )}
                  <View className="flex-row items-center justify-between p-4">
                    <View className="flex-row items-center">
                      <View
                        className={`w-12 h-12 rounded-xl items-center justify-center ${
                          isPopular
                            ? "bg-indigo-100 dark:bg-indigo-900/30"
                            : "bg-gray-100 dark:bg-gray-800"
                        }`}
                      >
                        <Ionicons
                          name="flash"
                          size={24}
                          color={isPopular ? "#6366F1" : "#9CA3AF"}
                        />
                      </View>
                      <View className="ml-3">
                        <Text className="text-gray-900 dark:text-white font-bold text-lg">
                          {pack.credits} Credits
                        </Text>
                        <Text className="text-gray-500 dark:text-gray-400 text-sm">
                          + {pack.bonusSearches} bonus AI searches
                        </Text>
                      </View>
                    </View>
                    <View className="items-end">
                      <Text className="text-indigo-600 dark:text-indigo-400 font-bold text-lg">
                        €{pack.priceEur.toFixed(2)}
                      </Text>
                      <Text className="text-gray-400 text-xs">
                        €{((pack.priceEur / pack.credits) * 100).toFixed(1)}
                        ¢/credit
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Storage Packs Section */}
        <View className="mb-6">
          <View className="flex-row items-center mb-3">
            <Ionicons name="cloud" size={20} color="#10B981" />
            <Text className="text-lg font-bold text-gray-900 dark:text-white ml-2">
              Add Storage
            </Text>
          </View>
          <Text className="text-gray-500 dark:text-gray-400 text-sm mb-4">
            Extra storage never expires and stacks with your base storage.
            Perfect for storing more documents.
          </Text>

          <View className="gap-3">
            {Object.entries(STORAGE_PACKS).map(([key, pack]) => {
              const isBestValue = key === StoragePack.LARGE;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={handleContactSupport}
                  activeOpacity={0.7}
                  className={`bg-white dark:bg-gray-900 rounded-2xl border overflow-hidden ${
                    isBestValue
                      ? "border-emerald-300 dark:border-emerald-700"
                      : "border-gray-100 dark:border-gray-800"
                  }`}
                >
                  {isBestValue && (
                    <View className="bg-emerald-600 py-1">
                      <Text className="text-white text-xs font-bold text-center uppercase tracking-wide">
                        Best Value
                      </Text>
                    </View>
                  )}
                  <View className="flex-row items-center justify-between p-4">
                    <View className="flex-row items-center">
                      <View
                        className={`w-12 h-12 rounded-xl items-center justify-center ${
                          isBestValue
                            ? "bg-emerald-100 dark:bg-emerald-900/30"
                            : "bg-gray-100 dark:bg-gray-800"
                        }`}
                      >
                        <Ionicons
                          name="cloud"
                          size={24}
                          color={isBestValue ? "#10B981" : "#9CA3AF"}
                        />
                      </View>
                      <View className="ml-3">
                        <Text className="text-gray-900 dark:text-white font-bold text-lg">
                          +{pack.displaySize}
                        </Text>
                        <Text className="text-gray-500 dark:text-gray-400 text-sm">
                          Extra storage
                        </Text>
                      </View>
                    </View>
                    <View className="items-end">
                      <Text className="text-emerald-600 dark:text-emerald-400 font-bold text-lg">
                        €{pack.priceEur.toFixed(2)}
                      </Text>
                      <Text className="text-gray-400 text-xs">One-time</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Credit Costs Reference */}
        <View className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 mb-6">
          <Text className="text-gray-700 dark:text-gray-300 font-bold text-sm mb-3">
            Credit Usage Guide
          </Text>
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Ionicons name="document-text" size={16} color="#6366F1" />
                <Text className="text-gray-600 dark:text-gray-400 text-sm ml-2">
                  AI Document Processing
                </Text>
              </View>
              <Text className="text-gray-900 dark:text-white font-semibold text-sm">
                {CREDIT_COSTS.ai_classification} credits
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Ionicons name="text" size={16} color="#8B5CF6" />
                <Text className="text-gray-600 dark:text-gray-400 text-sm ml-2">
                  AI Title Generation
                </Text>
              </View>
              <Text className="text-gray-900 dark:text-white font-semibold text-sm">
                {CREDIT_COSTS.ai_title_generation} credit
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Ionicons name="search" size={16} color="#10B981" />
                <Text className="text-gray-600 dark:text-gray-400 text-sm ml-2">
                  Enable AI Search
                </Text>
              </View>
              <Text className="text-gray-900 dark:text-white font-semibold text-sm">
                {CREDIT_COSTS.ai_embedding} credit
              </Text>
            </View>
          </View>
        </View>

        {/* Contact Support */}
        <View className="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-4 mb-4">
          <View className="flex-row items-start">
            <Ionicons name="mail" size={20} color="#6366F1" />
            <View className="flex-1 ml-3">
              <Text className="text-indigo-900 dark:text-indigo-100 font-bold text-sm">
                Need to purchase?
              </Text>
              <Text className="text-indigo-700 dark:text-indigo-300 text-sm mt-1">
                Tap any pack to contact us. We'll help you add credits or
                storage to your account manually.
              </Text>
              <TouchableOpacity
                onPress={handleContactSupport}
                className="mt-3 bg-indigo-600 rounded-xl py-2.5 items-center"
              >
                <Text className="text-white font-semibold text-sm">
                  Contact Support
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Free tier info */}
        <View className="items-center py-4">
          <Text className="text-gray-400 dark:text-gray-600 text-xs text-center">
            Free plan includes 15 initial credits, 15 AI searches/day, and 1 GB
            storage
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
