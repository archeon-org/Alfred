import React from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { User } from "@archeon-org/types";
import { useRouter } from "expo-router";
import { shadows } from "../../constants/shadows";
import { NotificationBell } from "../NotificationBell";

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

      <NotificationBell />
    </View>
  );
};
