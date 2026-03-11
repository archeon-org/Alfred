import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  useColorScheme,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  useUserDetails,
  useSetUserTier,
  useAddCreditPack,
  useAddCustomCredits,
  useAddCustomBonusSearches,
  useSetStoragePack,
  useSetCustomStorage,
  useResetDailySearch,
} from "@/hooks/useAdmin";
import { formatBytes } from "@/services/subscription";
import { Skeleton } from "@/components/common/Skeleton";
import { InputModal } from "@/components/common/InputModal";
import {
  SubscriptionTier,
  CreditPack,
  StoragePack,
  CREDIT_PACKS,
  STORAGE_PACKS,
  UserType,
} from "@archeon-org/types";

const getTierColor = (tier: SubscriptionTier) => {
  switch (tier) {
    case SubscriptionTier.PRO:
      return {
        bg: "bg-indigo-100 dark:bg-indigo-900/30",
        text: "text-indigo-600 dark:text-indigo-400",
      };
    case SubscriptionTier.FREE:
    default:
      return {
        bg: "bg-gray-100 dark:bg-gray-800",
        text: "text-gray-600 dark:text-gray-400",
      };
  }
};

const getRoleColor = (role: UserType) => {
  switch (role) {
    case UserType.ADMIN:
      return {
        bg: "bg-red-100 dark:bg-red-900/30",
        text: "text-red-600 dark:text-red-400",
      };
    case UserType.USER:
      return {
        bg: "bg-blue-100 dark:bg-blue-900/30",
        text: "text-blue-600 dark:text-blue-400",
      };
    case UserType.GUEST:
    default:
      return {
        bg: "bg-gray-100 dark:bg-gray-800",
        text: "text-gray-600 dark:text-gray-400",
      };
  }
};

interface ActionButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  color: string;
  bgColor: string;
  loading?: boolean;
}

function ActionButton({
  icon,
  label,
  onPress,
  color,
  bgColor,
  loading,
}: ActionButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.7}
      className={`flex-1 min-w-[45%] items-center p-4 ${bgColor} rounded-xl`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name={icon as any} size={24} color={color} />
      )}
      <Text className="text-sm font-medium text-gray-900 dark:text-white mt-2">
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function UserDetailScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Modal states
  const [showBonusSearchesModal, setShowBonusSearchesModal] = useState(false);
  const [showCustomCreditsModal, setShowCustomCreditsModal] = useState(false);
  const [showCustomStorageModal, setShowCustomStorageModal] = useState(false);

  const { data: user, isLoading, refetch } = useUserDetails(id);
  const setTierMutation = useSetUserTier();
  const addCreditPackMutation = useAddCreditPack();
  const addCustomCreditsMutation = useAddCustomCredits();
  const addCustomBonusSearchesMutation = useAddCustomBonusSearches();
  const setStoragePackMutation = useSetStoragePack();
  const setCustomStorageMutation = useSetCustomStorage();
  const resetDailySearchMutation = useResetDailySearch();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleUpgradeTier = () => {
    if (!user) return;

    const tiers = Object.values(SubscriptionTier);
    const currentIndex = tiers.indexOf(user.subscription.tier);
    const options = tiers.filter((_, i) => i !== currentIndex);

    Alert.alert(
      "Set Subscription Tier",
      `Current tier: ${user.subscription.tier.toUpperCase()}`,
      [
        ...options.map((tier) => ({
          text: tier.toUpperCase(),
          onPress: () => {
            setTierMutation.mutate({ userId: id, tier });
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  };

  const handleAddCredits = () => {
    Alert.alert("Add Credit Pack", "Select a credit pack to add:", [
      ...Object.entries(CREDIT_PACKS).map(([key, pack]) => ({
        text: `${pack.credits} credits + ${pack.bonusSearches} searches (€${pack.priceEur})`,
        onPress: () => {
          addCreditPackMutation.mutate({ userId: id, pack: key as CreditPack });
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const handleAddCustomBonusSearches = () => {
    setShowBonusSearchesModal(true);
  };

  const handleSubmitBonusSearches = (value: string) => {
    setShowBonusSearchesModal(false);
    const bonusSearches = parseInt(value || "0", 10);
    if (!isNaN(bonusSearches) && bonusSearches >= 0) {
      addCustomBonusSearchesMutation.mutate({
        userId: id,
        bonusSearches,
        reason: "Admin manual adjustment",
      });
    }
  };

  const handleAddCustomCredits = () => {
    setShowCustomCreditsModal(true);
  };

  const handleSubmitCustomCredits = (value: string) => {
    setShowCustomCreditsModal(false);
    const credits = parseInt(value || "0", 10);
    if (!isNaN(credits) && credits >= 0) {
      addCustomCreditsMutation.mutate({
        userId: id,
        credits,
        reason: "Admin manual adjustment",
      });
    }
  };

  const handleSetStoragePack = () => {
    Alert.alert("Set Storage", "Select a storage pack to set:", [
      ...Object.entries(STORAGE_PACKS).map(([key, pack]) => ({
        text: `${pack.displaySize} (€${pack.priceEur})`,
        onPress: () => {
          setStoragePackMutation.mutate({
            userId: id,
            pack: key as StoragePack,
          });
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const handleSetCustomStorage = () => {
    setShowCustomStorageModal(true);
  };

  const handleSubmitCustomStorage = (value: string) => {
    setShowCustomStorageModal(false);
    const storageGb = parseFloat(value || "0");
    if (storageGb > 0) {
      setCustomStorageMutation.mutate({
        userId: id,
        storageGb,
        reason: "Admin manual adjustment",
      });
    }
  };

  const handleResetDailySearch = () => {
    Alert.alert(
      "Reset Daily Search",
      `Reset daily search usage to 0 for this user? Current usage: ${user?.subscription.dailySearchUsed}/${user?.subscription.dailySearchLimit}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            resetDailySearchMutation.mutate({ userId: id });
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-background dark:bg-background-dark"
        edges={["top"]}
      >
        <View className="flex-1 px-5 pt-2">
          <View className="flex-row items-center gap-4 mb-6">
            <Skeleton className="w-10 h-10 rounded-full" />
            <Skeleton className="h-8 w-48" />
          </View>
          <Skeleton className="h-32 w-full rounded-2xl mb-4" />
          <Skeleton className="h-48 w-full rounded-2xl mb-4" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView
        className="flex-1 bg-background dark:bg-background-dark"
        edges={["top"]}
      >
        <View className="flex-1 items-center justify-center">
          <Ionicons
            name="person-outline"
            size={48}
            color={isDark ? "#4B5563" : "#9CA3AF"}
          />
          <Text className="text-gray-500 dark:text-gray-400 mt-3">
            User not found
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            className="mt-4 px-4 py-2 bg-indigo-600 rounded-lg"
          >
            <Text className="text-white font-medium">Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const tierColors = getTierColor(user.subscription.tier);
  const roleColors = getRoleColor(user.role);
  const storagePercent = Math.round(
    (user.subscription.storageUsed / user.subscription.storageLimit) * 100,
  );

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top"]}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-8"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View className="flex-row items-center gap-4 pt-2 pb-4">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 items-center justify-center bg-white dark:bg-gray-900 rounded-full border border-gray-100 dark:border-gray-800"
          >
            <Ionicons
              name="arrow-back"
              size={20}
              color={isDark ? "#FFFFFF" : "#1F2937"}
            />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-900 dark:text-white flex-1">
            User Details
          </Text>
        </View>

        {/* User Info Card */}
        <View className="bg-white dark:bg-gray-900 rounded-2xl p-4 mb-4 border border-gray-100 dark:border-gray-800">
          <View className="flex-row justify-between items-start mb-3">
            <View className="flex-1">
              <Text className="text-xl font-bold text-gray-900 dark:text-white">
                {user.firstName} {user.lastName}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                {user.email}
              </Text>
            </View>
            <View className="flex-row gap-2">
              <View className={`px-2 py-1 rounded-full ${roleColors.bg}`}>
                <Text className={`text-xs font-medium ${roleColors.text}`}>
                  {user.role.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          <View className="flex-row gap-4 pt-3 border-t border-gray-100 dark:border-gray-800">
            <View>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Created
              </Text>
              <Text className="text-sm font-medium text-gray-900 dark:text-white">
                {new Date(user.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <View>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Last Login
              </Text>
              <Text className="text-sm font-medium text-gray-900 dark:text-white">
                {user.lastLoginAt
                  ? new Date(user.lastLoginAt).toLocaleDateString()
                  : "Never"}
              </Text>
            </View>
          </View>
        </View>

        {/* Subscription Info Card */}
        <View className="bg-white dark:bg-gray-900 rounded-2xl p-4 mb-4 border border-gray-100 dark:border-gray-800">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-base font-semibold text-gray-900 dark:text-white">
              Subscription
            </Text>
            <View className={`px-3 py-1 rounded-full ${tierColors.bg}`}>
              <Text className={`text-sm font-medium ${tierColors.text}`}>
                {user.subscription.tier.toUpperCase()}
              </Text>
            </View>
          </View>

          <View className="gap-3">
            {/* Credits */}
            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center">
                <Ionicons
                  name="flash-outline"
                  size={18}
                  color={isDark ? "#9CA3AF" : "#6B7280"}
                />
                <Text className="text-sm text-gray-600 dark:text-gray-400 ml-2">
                  Credits
                </Text>
              </View>
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                {user.subscription.credits}
              </Text>
            </View>

            {/* Bonus Searches */}
            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center">
                <Ionicons
                  name="search-outline"
                  size={18}
                  color={isDark ? "#9CA3AF" : "#6B7280"}
                />
                <Text className="text-sm text-gray-600 dark:text-gray-400 ml-2">
                  Bonus AI Searches
                </Text>
              </View>
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                {user.subscription.bonusSearches}
              </Text>
            </View>

            {/* Daily Searches */}
            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center">
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={isDark ? "#9CA3AF" : "#6B7280"}
                />
                <Text className="text-sm text-gray-600 dark:text-gray-400 ml-2">
                  Daily Searches
                </Text>
              </View>
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                {user.subscription.dailySearchUsed} /{" "}
                {user.subscription.dailySearchLimit}
              </Text>
            </View>

            {/* Storage */}
            <View>
              <View className="flex-row justify-between items-center mb-2">
                <View className="flex-row items-center">
                  <Ionicons
                    name="cloud-outline"
                    size={18}
                    color={isDark ? "#9CA3AF" : "#6B7280"}
                  />
                  <Text className="text-sm text-gray-600 dark:text-gray-400 ml-2">
                    Storage
                  </Text>
                </View>
                <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formatBytes(user.subscription.storageUsed)} /{" "}
                  {formatBytes(user.subscription.storageLimit)}
                </Text>
              </View>
              <View className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <View
                  className={`h-full ${storagePercent > 90 ? "bg-red-500" : storagePercent > 70 ? "bg-amber-500" : "bg-indigo-500"} rounded-full`}
                  style={{ width: `${Math.min(storagePercent, 100)}%` }}
                />
              </View>
              {user.subscription.extraStorage > 0 && (
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Includes {formatBytes(user.subscription.extraStorage)} extra
                  storage
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Admin Actions */}
        <View className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
          <Text className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            Admin Actions
          </Text>
          <View className="flex-row flex-wrap gap-3">
            <ActionButton
              icon="arrow-up-circle-outline"
              label="Set Tier"
              onPress={handleUpgradeTier}
              color="#6366F1"
              bgColor="bg-indigo-50 dark:bg-indigo-900/20"
              loading={setTierMutation.isPending}
            />
            <ActionButton
              icon="flash-outline"
              label="Add Credits"
              onPress={handleAddCredits}
              color="#F59E0B"
              bgColor="bg-amber-50 dark:bg-amber-900/20"
              loading={addCreditPackMutation.isPending}
            />
            <ActionButton
              icon="search-outline"
              label="Bonus Searches"
              onPress={handleAddCustomBonusSearches}
              color="#10B981"
              bgColor="bg-emerald-50 dark:bg-emerald-900/20"
              loading={addCustomBonusSearchesMutation.isPending}
            />
            <ActionButton
              icon="create-outline"
              label="Custom Credits"
              onPress={handleAddCustomCredits}
              color="#8B5CF6"
              bgColor="bg-purple-50 dark:bg-purple-900/20"
              loading={addCustomCreditsMutation.isPending}
            />
            <ActionButton
              icon="cloud-outline"
              label="Set Storage"
              onPress={handleSetStoragePack}
              color="#3B82F6"
              bgColor="bg-blue-50 dark:bg-blue-900/20"
              loading={setStoragePackMutation.isPending}
            />
            <ActionButton
              icon="resize-outline"
              label="Custom Storage"
              onPress={handleSetCustomStorage}
              color="#EC4899"
              bgColor="bg-pink-50 dark:bg-pink-900/20"
              loading={setCustomStorageMutation.isPending}
            />
            <ActionButton
              icon="refresh-outline"
              label="Reset Daily"
              onPress={handleResetDailySearch}
              color="#EF4444"
              bgColor="bg-red-50 dark:bg-red-900/20"
              loading={resetDailySearchMutation.isPending}
            />
          </View>
        </View>
      </ScrollView>

      {/* Input Modals */}
      <InputModal
        visible={showBonusSearchesModal}
        title="Set Bonus AI Searches"
        message="Enter the number of bonus AI searches to set:"
        placeholder="e.g. 50"
        keyboardType="numeric"
        onCancel={() => setShowBonusSearchesModal(false)}
        onSubmit={handleSubmitBonusSearches}
        submitLabel="Set"
      />

      <InputModal
        visible={showCustomCreditsModal}
        title="Set Custom Credits"
        message="Enter the number of credits to set:"
        placeholder="e.g. 100"
        keyboardType="numeric"
        onCancel={() => setShowCustomCreditsModal(false)}
        onSubmit={handleSubmitCustomCredits}
        submitLabel="Set"
      />

      <InputModal
        visible={showCustomStorageModal}
        title="Set Custom Storage"
        message="Enter storage limit in GB:"
        placeholder="e.g. 10"
        keyboardType="decimal-pad"
        onCancel={() => setShowCustomStorageModal(false)}
        onSubmit={handleSubmitCustomStorage}
        submitLabel="Set"
      />
    </SafeAreaView>
  );
}
