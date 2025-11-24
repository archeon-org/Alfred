import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useDocuments, useDocumentViewer } from "../../hooks/useDocuments";
import { Document } from "@archeon-org/types";
import { format } from "date-fns";

export default function DocumentsScreen() {
  const { documents, isLoading, refetch } = useDocuments();
  const { openDocument, isOpening } = useDocumentViewer();

  const renderItem = ({ item }: { item: Document }) => (
    <TouchableOpacity
      onPress={() => openDocument(item.id)}
      className="flex-row items-center p-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800"
    >
      <View className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg mr-4">
        <Ionicons name="document-text" size={24} color="#2563EB" />
      </View>
      <View className="flex-1">
        <Text className="font-semibold text-gray-900 dark:text-white text-base">
          {item.title || item.originalName}
        </Text>
        <Text className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          {format(new Date(item.createdAt), "MMM d, yyyy")} •{" "}
          {(item.size / 1024 / 1024).toFixed(2)} MB
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-black">
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black" edges={["top"]}>
      <View className="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
        <Text className="text-2xl font-bold text-black dark:text-white">
          My Documents
        </Text>
      </View>

      <FlatList
        data={documents}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-20">
            <View className="bg-gray-100 dark:bg-gray-800 p-6 rounded-full mb-4">
              <Ionicons name="documents-outline" size={48} color="#9CA3AF" />
            </View>
            <Text className="text-gray-500 dark:text-gray-400 text-lg font-medium">
              No documents found
            </Text>
            <Text className="text-gray-400 dark:text-gray-500 text-sm mt-2 text-center px-10">
              Scan a document to get started
            </Text>
          </View>
        }
      />
      {isOpening && (
        <View className="absolute inset-0 bg-black/30 items-center justify-center">
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      )}
    </SafeAreaView>
  );
}
