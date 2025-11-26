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
import { useRouter } from "expo-router";
import { Document } from "@archeon-org/types";
import { DocumentItem } from "../../../components/document/DocumentItem";
import { useDocumentsList } from "../../../hooks/useDocumentsList";
import { DocumentsEmptyState } from "../../../components/document/DocumentsEmptyState";
import { Skeleton } from "../../../components/common/Skeleton";

export default function DocumentsScreen() {
  const router = useRouter();
  const {
    documents,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useDocumentsList();

  const renderDocument = ({ item }: { item: Document }) => (
    <DocumentItem
      document={item}
      onPress={(doc) => router.push(`/(app)/documents/${doc.id}` as any)}
    />
  );

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
        <View className="flex-row justify-between items-center px-4 py-3 mb-2">
          <Text className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            Documents
          </Text>
          <View className="w-12 h-12 rounded-full bg-surface dark:bg-surface-dark items-center justify-center shadow-sm border border-gray-100 dark:border-gray-800">
            <Ionicons name="search-outline" size={24} color="#6B7280" />
          </View>
        </View>
        <View className="px-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <View
              key={i}
              className="flex-row items-center p-4 mb-3 bg-surface dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800"
            >
              <Skeleton className="w-12 h-12 rounded-xl mr-4" />
              <View className="flex-1 gap-2">
                <Skeleton className="h-5 w-3/4" />
                <View className="flex-row gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </View>
              </View>
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
      <View className="flex-row justify-between items-center px-4 py-3 mb-2">
        <Text className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
          Documents
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/(app)/documents/search")}
          className="w-12 h-12 rounded-full bg-surface dark:bg-surface-dark items-center justify-center shadow-sm border border-gray-100 dark:border-gray-800"
        >
          <Ionicons name="search-outline" size={24} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={documents}
        renderItem={renderDocument}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-4">
              <ActivityIndicator size="small" color="#6366F1" />
            </View>
          ) : null
        }
        ListEmptyComponent={<DocumentsEmptyState />}
      />
    </SafeAreaView>
  );
}
