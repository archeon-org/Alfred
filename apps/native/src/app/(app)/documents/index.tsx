import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Document } from "@archeon-org/types";
import { DocumentItem } from "../../../components/document/DocumentItem";
import { useDocumentsList } from "../../../hooks/useDocumentsList";
import { useDocumentMutations } from "../../../hooks/useDocuments";
import { DocumentsEmptyState } from "../../../components/document/DocumentsEmptyState";
import { Skeleton } from "../../../components/common/Skeleton";
import { DocumentFilterModal } from "../../../components/document/DocumentFilterModal";

export default function DocumentsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<{
    processingStatus?: string;
    classificationSource?: string;
    tagId?: string;
  }>({});
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const {
    documents,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useDocumentsList(search, filters);
  const { deleteDocument } = useDocumentMutations();

  const activeFiltersCount = Object.values(filters).filter(Boolean).length;

  const handleDeleteDocument = (document: Document) => {
    Alert.alert(
      "Delete Document",
      `Are you sure you want to delete "${document.title || document.originalName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDocument(document.id);
            } catch (error) {
              Alert.alert("Error", "Failed to delete document");
            }
          },
        },
      ]
    );
  };

  const renderDocument = ({ item }: { item: Document }) => (
    <DocumentItem
      document={item}
      onPress={(doc) => router.push(`/(app)/documents/${doc.id}` as any)}
      onLongPress={handleDeleteDocument}
    />
  );

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
        <View className="flex-row justify-between items-center px-4 py-3 mb-2">
          <Text className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            Documents
          </Text>
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
          onPress={() => setFilterModalVisible(true)}
          className={`w-10 h-10 rounded-full items-center justify-center border ${
            activeFiltersCount > 0
              ? "bg-primary border-primary"
              : "bg-surface dark:bg-surface-dark border-gray-100 dark:border-gray-800"
          }`}
        >
          <Ionicons
            name="filter"
            size={20}
            color={activeFiltersCount > 0 ? "white" : "#6B7280"}
          />
          {activeFiltersCount > 0 && (
            <View className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full items-center justify-center border border-white dark:border-black">
              <Text className="text-[10px] font-bold text-white">
                {activeFiltersCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View className="px-4 mb-4">
        <View className="flex-row items-center bg-surface dark:bg-surface-dark px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-800">
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            className="flex-1 ml-3 text-base text-gray-900 dark:text-white"
            placeholder="Search documents..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
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

      <DocumentFilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filters}
        onApplyFilters={setFilters}
        onResetFilters={() => setFilters({})}
      />
    </SafeAreaView>
  );
}
