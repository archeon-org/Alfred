import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Document } from "@archeon-org/types";
import { useRouter } from "expo-router";
import { DocumentItem } from "../document/DocumentItem";
import { Skeleton } from "../common/Skeleton";

interface RecentDocumentsProps {
  documents: Document[];
  isLoading: boolean;
}

export const RecentDocuments = ({
  documents,
  isLoading,
}: RecentDocumentsProps) => {
  const router = useRouter();

  if (isLoading) {
    return (
      <View className="mb-6">
        <Text className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          Recent Documents
        </Text>
        <View className="gap-3">
          <Skeleton className="h-20 w-full rounded-3xl" />
          <Skeleton className="h-20 w-full rounded-3xl" />
          <Skeleton className="h-20 w-full rounded-3xl" />
        </View>
      </View>
    );
  }

  if (documents.length === 0) {
    return (
      <View className="mb-6">
        <Text className="text-xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight">
          Recent Documents
        </Text>
        <View className="bg-surface dark:bg-surface-dark p-8 rounded-3xl items-center justify-center border border-dashed border-gray-200 dark:border-gray-700">
          <View className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full items-center justify-center mb-3">
            <Ionicons name="document-text-outline" size={32} color="#9CA3AF" />
          </View>
          <Text className="text-gray-900 dark:text-white font-bold mb-1 text-lg">
            No documents yet
          </Text>
          <Text className="text-gray-500 dark:text-gray-400 text-sm text-center">
            Upload or scan one to get started!
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="mb-6">
      <View className="flex-row justify-between items-center mb-4 px-1">
        <Text className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
          Recent Documents
        </Text>
        <TouchableOpacity onPress={() => router.push("/(app)/documents")}>
          <Text className="text-primary dark:text-primary-400 font-bold text-sm">
            See All
          </Text>
        </TouchableOpacity>
      </View>

      <View>
        {documents.map((doc) => (
          <DocumentItem
            key={doc.id}
            document={doc}
            onPress={(d) => router.push(`/(app)/documents/${d.id}` as any)}
          />
        ))}
      </View>
    </View>
  );
};
