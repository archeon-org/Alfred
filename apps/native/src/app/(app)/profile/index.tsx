import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  useColorScheme,
  Image,
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

  const menuItems = [
    {
      icon: "person-outline",
      label: "Edit Profile",
      color: "#6366F1",
      bgColor: "bg-indigo-50 dark:bg-indigo-900/20",
      onPress: () => router.push("/(app)/profile/edit"),
    },
    {
      icon: "lock-closed-outline",
      label: "Security",
      color: "#10B981",
      bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
      onPress: () => router.push("/(app)/profile/security"),
    },
    {
      icon: "settings-outline",
      label: "Preferences",
      color: "#8B5CF6",
      bgColor: "bg-purple-50 dark:bg-purple-900/20",
      onPress: () => router.push("/(app)/profile/preferences"),
    },
    {
      icon: "notifications-outline",
      label: "Notifications",
      color: "#F59E0B",
      bgColor: "bg-amber-50 dark:bg-amber-900/20",
    },
    {
      icon: "document-text-outline",
      label: "Terms",
      color: "#3B82F6",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
      onPress: () => router.push("/terms"),
    },
    {
      icon: "shield-checkmark-outline",
      label: "Privacy",
      color: "#EC4899",
      bgColor: "bg-pink-50 dark:bg-pink-900/20",
      onPress: () => router.push("/privacy"),
    },
  ];

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-background dark:bg-background-dark"
        edges={["top"]}
      >
        <View className="flex-1 px-5 pt-2">
          {/* Header skeleton */}
          <View className="flex-row justify-between items-center mb-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="w-10 h-10 rounded-full" />
          </View>
          <View className="items-center mb-4">
            <Skeleton className="w-20 h-20 rounded-full mb-3" />
            <Skeleton className="h-6 w-36 mb-1" />
            <Skeleton className="h-4 w-44" />
          </View>
          {/* Storage skeleton */}
          <Skeleton className="h-20 w-full rounded-2xl mb-4" />
          {/* Menu skeleton */}
          <Skeleton className="h-16 w-full rounded-2xl" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top"]}
    >
      <View className="flex-1 px-5">
        {/* Header */}
        <View className="flex-row justify-between items-center pt-2 pb-2">
          <Text className="text-2xl font-bold text-gray-900 dark:text-white">
            Profile
          </Text>
          <TouchableOpacity
            onPress={signOut}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full items-center justify-center bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30"
          >
            <Ionicons
              name="log-out-outline"
              size={20}
              color={isDark ? "#FCA5A5" : "#DC2626"}
            />
          </TouchableOpacity>
        </View>

        {/* Profile Header - Compact */}
        <View className="items-center py-4">
          <View className="relative mb-3">
            <View className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full items-center justify-center overflow-hidden border-3 border-white dark:border-gray-800 shadow-lg">
              {user?.profilePicture ? (
                <Image
                  source={{ uri: user.profilePicture }}
                  className="w-full h-full"
                />
              ) : (
                <Text className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {user?.firstName?.[0]}
                  {user?.lastName?.[0]}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => router.push("/(app)/profile/edit")}
              className="absolute bottom-0 right-0 w-7 h-7 bg-indigo-600 rounded-full items-center justify-center border-2 border-white dark:border-gray-900"
            >
              <Ionicons name="pencil" size={12} color="white" />
            </TouchableOpacity>
          </View>

          <Text className="text-xl font-bold text-gray-900 dark:text-white mb-0.5">
            {user?.firstName} {user?.lastName}
          </Text>
          <Text className="text-gray-500 dark:text-gray-400 text-sm">
            {user?.email}
          </Text>
        </View>

        {/* Storage Card - Compact */}
        <View className="mb-4">
          <View
            className="rounded-2xl p-4"
            style={{ backgroundColor: "#6366F1" }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-2">
                <View
                  className="w-8 h-8 rounded-lg items-center justify-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                >
                  <Ionicons name="cloud" size={16} color="white" />
                </View>
                <Text className="text-white font-bold text-base">Storage</Text>
              </View>
              <View
                className="px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
              >
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

        {/* Menu Items - Grid Layout */}
        <View className="flex-row flex-wrap gap-3 mb-4">
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              onPress={item.onPress}
              activeOpacity={0.7}
              className="flex-1 min-w-[45%] items-center p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800"
            >
              <View
                className={`w-12 h-12 rounded-xl items-center justify-center mb-2 ${item.bgColor}`}
              >
                <Ionicons
                  name={item.icon as any}
                  size={22}
                  color={item.color}
                />
              </View>
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* App Version - At bottom */}
        <View className="flex-1 justify-end pb-4">
          <Text className="text-gray-400 dark:text-gray-600 text-xs text-center">
            Archeon v1.0.0
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
