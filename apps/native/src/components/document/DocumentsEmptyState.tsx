import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export const DocumentsEmptyState = () => {
  return (
    <View className="items-center justify-center py-20">
      <View className="bg-surface dark:bg-surface-dark p-8 rounded-full mb-6 shadow-sm">
        <Ionicons name="document-text-outline" size={64} color="#9CA3AF" />
      </View>
      <Text className="text-gray-500 dark:text-gray-400 text-xl font-bold">
        No documents found
      </Text>
      <Text className="text-gray-400 dark:text-gray-500 text-base mt-2 text-center px-10">
        Upload or scan a document to get started
      </Text>
    </View>
  );
};
