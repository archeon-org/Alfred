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
import colors from "tailwindcss/colors";
import { useRouter } from "expo-router";
import { StorageProgress } from "../../../components/common/StorageProgress";

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
      onPress: () => router.push("/(app)/profile/edit"),
    },
    { icon: "settings-outline", label: "Settings" },
    { icon: "shield-checkmark-outline", label: "Privacy & Security" },
    { icon: "help-circle-outline", label: "Help & Support" },
  ];

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-background-dark justify-center items-center">
        <ActivityIndicator size="large" color="#6366F1" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
      <ScrollView
        className="p-4"
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} />
        }
      >
        <View className="items-center mb-8 mt-4">
          <View className="w-28 h-28 bg-primary-50 dark:bg-primary-900/20 rounded-full items-center justify-center mb-4 overflow-hidden border-4 border-white dark:border-gray-800 shadow-sm">
            {user?.profilePicture ? (
              <Image
                source={{ uri: user.profilePicture }}
                className="w-full h-full"
              />
            ) : (
              <Ionicons
                name="person"
                size={48}
                color={isDark ? "#9CA3AF" : "#6366F1"}
              />
            )}
          </View>
          <Text className="text-2xl font-bold text-gray-900 dark:text-white">
            {user?.firstName} {user?.lastName}
          </Text>
          <Text className="text-gray-500 dark:text-gray-400 text-base">
            {user?.email}
          </Text>
        </View>

        {/* Storage Usage Section */}
        <View className="bg-surface dark:bg-surface-dark rounded-3xl p-5 mb-6 shadow-sm border border-gray-100 dark:border-gray-800">
          <StorageProgress
            used={user?.storageUsed || 0}
            limit={user?.storageLimit || 0}
            variant="default"
          />
          <Text className="text-xs text-gray-400 mt-3 font-medium">
            {user?.searchCount || 0} searches performed
          </Text>
        </View>

        <View className="bg-surface dark:bg-surface-dark rounded-3xl overflow-hidden mb-6 shadow-sm border border-gray-100 dark:border-gray-800">
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              onPress={item.onPress}
              className={`flex-row items-center p-5 ${index !== menuItems.length - 1 ? "border-b border-gray-100 dark:border-gray-800" : ""}`}
            >
              <View className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-800 items-center justify-center mr-4">
                <Ionicons
                  name={item.icon as any}
                  size={20}
                  color={isDark ? "#D1D5DB" : "#4B5563"}
                />
              </View>
              <Text className="flex-1 text-base font-medium text-gray-900 dark:text-white">
                {item.label}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.gray[400]}
              />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={signOut}
          className="flex-row items-center justify-center p-4 bg-red-50 dark:bg-red-900/20 rounded-3xl mb-8"
        >
          <Ionicons
            name="log-out-outline"
            size={24}
            color={isDark ? colors.red[400] : colors.red[600]}
            style={{ marginRight: 8 }}
          />
          <Text className="text-red-600 dark:text-red-400 font-bold text-base">
            Sign Out
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
