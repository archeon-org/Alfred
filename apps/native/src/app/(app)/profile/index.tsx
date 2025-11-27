import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  Image,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../context/AuthContext";
import { useUser } from "../../../hooks/useUser";
import { useRouter } from "expo-router";
import { StorageProgress } from "@/components/common/StorageProgress";
import { Skeleton } from "@/components/common/Skeleton";

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { data: user, isLoading, refetch } = useUser();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const menuItems = [
    {
      icon: "person-outline",
      label: "Edit Profile",
      description: "Update your personal information",
      color: "#6366F1",
      bgColor: "bg-indigo-50 dark:bg-indigo-900/20",
      onPress: () => router.push("/(app)/profile/edit"),
    },
    {
      icon: "notifications-outline",
      label: "Notifications",
      description: "Manage your alerts",
      color: "#F59E0B",
      bgColor: "bg-amber-50 dark:bg-amber-900/20",
    },
    {
      icon: "shield-checkmark-outline",
      label: "Privacy & Security",
      description: "Protect your account",
      color: "#10B981",
      bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      icon: "help-circle-outline",
      label: "Help & Support",
      description: "Get assistance",
      color: "#8B5CF6",
      bgColor: "bg-purple-50 dark:bg-purple-900/20",
    },
  ];

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-background dark:bg-background-dark"
        edges={["top"]}
      >
        <View className="px-5 pt-4">
          {/* Header skeleton */}
          <View className="items-center mb-6">
            <Skeleton className="w-24 h-24 rounded-full mb-4" />
            <Skeleton className="h-7 w-40 mb-2" />
            <Skeleton className="h-4 w-48" />
          </View>
          {/* Storage skeleton */}
          <Skeleton className="h-24 w-full rounded-2xl mb-6" />
          {/* Menu skeleton */}
          <View className="gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top"]}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} />
        }
      >
        {/* Profile Header */}
        <View className="items-center pt-6 pb-6 px-5">
          <View className="relative mb-4">
            <View className="w-24 h-24 bg-indigo-100 dark:bg-indigo-900/30 rounded-full items-center justify-center overflow-hidden border-4 border-white dark:border-gray-800 shadow-lg">
              {user?.profilePicture ? (
                <Image
                  source={{ uri: user.profilePicture }}
                  className="w-full h-full"
                />
              ) : (
                <Text className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                  {user?.firstName?.[0]}
                  {user?.lastName?.[0]}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => router.push("/(app)/profile/edit")}
              className="absolute bottom-0 right-0 w-8 h-8 bg-indigo-600 rounded-full items-center justify-center border-2 border-white dark:border-gray-900"
            >
              <Ionicons name="pencil" size={14} color="white" />
            </TouchableOpacity>
          </View>

          <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            {user?.firstName} {user?.lastName}
          </Text>
          <Text className="text-gray-500 dark:text-gray-400 text-sm">
            {user?.email}
          </Text>
        </View>

        {/* Storage Card */}
        <View className="px-5 mb-6">
          <View className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 shadow-lg">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center gap-2">
                <View className="w-10 h-10 bg-white/20 rounded-xl items-center justify-center">
                  <Ionicons name="cloud" size={20} color="white" />
                </View>
                <Text className="text-white font-bold text-lg">Storage</Text>
              </View>
              <View className="bg-white/20 px-3 py-1 rounded-full">
                <Text className="text-white text-xs font-semibold">
                  {user?.searchCount || 0} searches
                </Text>
              </View>
            </View>
            <StorageProgress
              used={user?.storageUsed || 0}
              limit={user?.storageLimit || 0}
              variant="light"
            />
          </View>
        </View>

        {/* Menu Items */}
        <View className="px-5 gap-3">
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              onPress={item.onPress}
              activeOpacity={0.7}
              className="flex-row items-center p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800"
            >
              <View
                className={`w-12 h-12 rounded-xl items-center justify-center mr-4 ${item.bgColor}`}
              >
                <Ionicons
                  name={item.icon as any}
                  size={22}
                  color={item.color}
                />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-gray-900 dark:text-white">
                  {item.label}
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {item.description}
                </Text>
              </View>
              <View className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full items-center justify-center">
                <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign Out Button */}
        <View className="px-5 mt-6">
          <TouchableOpacity
            onPress={signOut}
            className="flex-row items-center justify-center p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-900/30"
          >
            <Ionicons
              name="log-out-outline"
              size={20}
              color={isDark ? "#F87171" : "#DC2626"}
            />
            <Text className="text-red-600 dark:text-red-400 font-bold text-sm ml-2">
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>

        {/* App Version */}
        <View className="items-center mt-6">
          <Text className="text-gray-400 dark:text-gray-600 text-xs">
            Archeon v1.0.0
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
