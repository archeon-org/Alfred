import React from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { User } from "@archeon-org/types";
import { useRouter } from "expo-router";

interface HomeHeaderProps {
  user?: User;
}

export const HomeHeader = ({ user }: HomeHeaderProps) => {
  const router = useRouter();

  return (
    <View className="flex-row justify-between items-center mb-6">
      <View className="flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.push("/(app)/profile")}>
          {user?.profilePicture ? (
            <Image
              source={{ uri: user.profilePicture }}
              className="w-12 h-12 rounded-full bg-gray-200"
            />
          ) : (
            <View className="w-12 h-12 rounded-full bg-primary-50 dark:bg-primary-900/30 items-center justify-center border border-primary-100 dark:border-primary-800">
              <Text className="text-primary dark:text-primary-300 text-xl font-bold">
                {user?.firstName?.[0] || "U"}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <View>
          <Text className="text-gray-500 dark:text-gray-400 text-sm font-medium">
            Welcome back,
          </Text>
          <Text className="text-gray-900 dark:text-white text-2xl font-bold tracking-tight">
            {user?.firstName || "User"}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        className="w-12 h-12 rounded-full bg-surface dark:bg-surface-dark items-center justify-center border border-gray-100 dark:border-gray-800 shadow-sm"
        onPress={() => router.push("/notifications")}
      >
        <Ionicons name="notifications-outline" size={22} color="#4B5563" />
        {/* Notification Badge (Mock) */}
        <View className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-gray-900" />
      </TouchableOpacity>
    </View>
  );
};
