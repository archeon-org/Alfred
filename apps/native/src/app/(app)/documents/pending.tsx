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
import { usePendingManualDocumentsList } from "../../../hooks/useDocumentsList";
import { DocumentsEmptyState } from "../../../components/document/DocumentsEmptyState";

export default function PendingDocumentsScreen() {
  const router = useRouter();
  const {
    documents,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = usePendingManualDocumentsList();

  const renderDocument = ({ item }: { item: Document }) => (
    <DocumentItem
      document={item}
      onPress={(doc) => router.push(`/(app)/documents/${doc.id}` as any)}
    />
  );

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#4F46E5" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-900 dark:text-white">
          Pending Manual Review
        </Text>
      </View>

      <FlatList
        data={documents}
        renderItem={renderDocument}
        keyExtractor={(item) => item.id}
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
              <ActivityIndicator size="small" color="#4F46E5" />
            </View>
          ) : null
        }
        ListEmptyComponent={<DocumentsEmptyState />}
      />
    </SafeAreaView>
  );
}
