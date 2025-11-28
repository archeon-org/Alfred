import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  useColorScheme,
  FlatList,
  TextInput,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useUsers, useStats } from "@/hooks/useAdmin";
import { formatBytes } from "@/services/subscription";
import { Skeleton } from "@/components/common/Skeleton";
import { SubscriptionTier, UserType } from "@archeon-org/types";
import type { AdminUser } from "@/services/admin";

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

function UserCard({ user, onPress }: { user: AdminUser; onPress: () => void }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const tierColors = getTierColor(user.subscriptionTier);
  const roleColors = getRoleColor(user.role);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="bg-white dark:bg-gray-900 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-gray-800"
    >
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1 mr-3">
          <Text className="text-base font-semibold text-gray-900 dark:text-white">
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
          <View className={`px-2 py-1 rounded-full ${tierColors.bg}`}>
            <Text className={`text-xs font-medium ${tierColors.text}`}>
              {user.subscriptionTier.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <View className="flex-row flex-wrap gap-4">
        <View className="flex-row items-center">
          <Ionicons
            name="flash-outline"
            size={14}
            color={isDark ? "#9CA3AF" : "#6B7280"}
          />
          <Text className="text-xs text-gray-500 dark:text-gray-400 ml-1">
            {user.credits} credits
          </Text>
        </View>
        <View className="flex-row items-center">
          <Ionicons
            name="search-outline"
            size={14}
            color={isDark ? "#9CA3AF" : "#6B7280"}
          />
          <Text className="text-xs text-gray-500 dark:text-gray-400 ml-1">
            {user.bonusSearches} bonus searches
          </Text>
        </View>
        <View className="flex-row items-center">
          <Ionicons
            name="cloud-outline"
            size={14}
            color={isDark ? "#9CA3AF" : "#6B7280"}
          />
          <Text className="text-xs text-gray-500 dark:text-gray-400 ml-1">
            {formatBytes(user.storageUsed)} / {formatBytes(user.storageLimit)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function StatsCard() {
  const { data: stats, isLoading } = useStats();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  if (isLoading) {
    return <Skeleton className="h-32 w-full rounded-2xl mb-4" />;
  }

  if (!stats) return null;

  const statItems = [
    {
      label: "Total Users",
      value: stats.totalUsers,
      icon: "people-outline",
      color: "#6366F1",
    },
    {
      label: "Pro Users",
      value: stats.byTier[SubscriptionTier.PRO] || 0,
      icon: "star-outline",
      color: "#F59E0B",
    },
    {
      label: "Active Today",
      value: stats.activeToday,
      icon: "trending-up-outline",
      color: "#10B981",
    },
    {
      label: "Total Credits",
      value: stats.totalCredits,
      icon: "flash-outline",
      color: "#8B5CF6",
    },
  ];

  return (
    <View className="bg-white dark:bg-gray-900 rounded-2xl p-4 mb-4 border border-gray-100 dark:border-gray-800">
      <Text className="text-base font-semibold text-gray-900 dark:text-white mb-3">
        Statistics
      </Text>
      <View className="flex-row flex-wrap gap-3">
        {statItems.map((item, index) => (
          <View
            key={index}
            className="flex-1 min-w-[45%] bg-gray-50 dark:bg-gray-800 rounded-xl p-3"
          >
            <View className="flex-row items-center mb-1">
              <Ionicons name={item.icon as any} size={16} color={item.color} />
              <Text className="text-xs text-gray-500 dark:text-gray-400 ml-1.5">
                {item.label}
              </Text>
            </View>
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              {item.value.toLocaleString()}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function AdminScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, refetch, isFetching } = useUsers(
    page,
    20,
    searchQuery
  );

  const handleSearch = useCallback(() => {
    setSearchQuery(search);
    setPage(1);
  }, [search]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleLoadMore = useCallback(() => {
    if (data && page < data.pagination.totalPages && !isFetching) {
      setPage(page + 1);
    }
  }, [data, page, isFetching]);

  const renderUser = useCallback(
    ({ item }: { item: AdminUser }) => (
      <UserCard
        user={item}
        onPress={() => router.push(`/(app)/admin/user/${item.id}`)}
      />
    ),
    [router]
  );

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top"]}
    >
      <View className="flex-1 px-5">
        {/* Header */}
        <View className="flex-row justify-between items-center pt-2 pb-4">
          <Text className="text-2xl font-bold text-gray-900 dark:text-white">
            Admin Panel
          </Text>
          <View className="flex-row items-center gap-2">
            <View className="px-2 py-1 bg-red-100 dark:bg-red-900/30 rounded-full">
              <Text className="text-xs font-medium text-red-600 dark:text-red-400">
                ADMIN
              </Text>
            </View>
          </View>
        </View>

        {/* Search */}
        <View className="flex-row items-center bg-white dark:bg-gray-900 rounded-xl px-4 py-3 mb-4 border border-gray-100 dark:border-gray-800">
          <Ionicons
            name="search-outline"
            size={20}
            color={isDark ? "#9CA3AF" : "#6B7280"}
          />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearch}
            placeholder="Search users by name or email..."
            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
            className="flex-1 ml-3 text-base text-gray-900 dark:text-white"
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearch("");
                setSearchQuery("");
                setPage(1);
              }}
              className="p-1"
            >
              <Ionicons
                name="close-circle"
                size={20}
                color={isDark ? "#6B7280" : "#9CA3AF"}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Stats */}
        <StatsCard />

        {/* Users List */}
        <View className="flex-1">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-base font-semibold text-gray-900 dark:text-white">
              Users
            </Text>
            {data && (
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                {data.pagination.total} total
              </Text>
            )}
          </View>

          {isLoading ? (
            <View className="gap-3">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </View>
          ) : (
            <FlatList
              data={data?.users || []}
              renderItem={renderUser}
              keyExtractor={(item) => item.id}
              refreshControl={
                <RefreshControl
                  refreshing={isFetching && !isLoading}
                  onRefresh={handleRefresh}
                  tintColor={isDark ? "#6366F1" : "#4F46E5"}
                />
              }
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              showsVerticalScrollIndicator={false}
              contentContainerClassName="pb-4"
              ListEmptyComponent={
                <View className="items-center justify-center py-12">
                  <Ionicons
                    name="people-outline"
                    size={48}
                    color={isDark ? "#4B5563" : "#9CA3AF"}
                  />
                  <Text className="text-gray-500 dark:text-gray-400 mt-3 text-center">
                    No users found
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
