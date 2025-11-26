import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import colors from "tailwindcss/colors";

export default function SearchPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <View className="p-4">
        <View className="flex-row items-center mb-6">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Ionicons name="arrow-back" size={24} color={colors.gray[500]} />
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-black dark:text-white flex-1">
            Search
          </Text>
        </View>

        <View className="flex-row items-center bg-gray-100 dark:bg-gray-900 rounded-xl px-4 py-3 mb-6">
          <Ionicons name="search" size={20} color={colors.gray[500]} />
          <TextInput
            placeholder="Search for documents..."
            placeholderTextColor={colors.gray[500]}
            className="flex-1 ml-3 text-base text-black dark:text-white"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </View>

        <ScrollView>
          <Text className="text-lg font-semibold text-black dark:text-white mb-4">
            Recent Searches
          </Text>
          {/* Placeholder for recent searches */}
          <Text className="text-gray-500 dark:text-gray-400">
            No recent searches.
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
