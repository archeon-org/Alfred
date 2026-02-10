import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Document } from "@archeon-org/types";
import { DocumentItem } from "@/components/document/DocumentItem";
import { useCategoryDetailsLogic } from "../../../hooks/useCategoryDetailsLogic";
import { AddDocumentsModal } from "../../../components/category/AddDocumentsModal";
import { Skeleton } from "../../../components/common/Skeleton";
import { shadows } from "../../../constants/shadows";

export default function CategoryDetails() {
  const {
    router,
    category,
    isLoadingCategory,
    categoryDocuments,
    isLoadingDocs,
    refetchDocs,
    isRefetching,
    isAddModalVisible,
    setIsAddModalVisible,
    selectedDocIds,
    handleToggleSelection,
    handleAddDocuments,
    handleRemoveFromCategory,
    availableDocuments,
    isLoadingAllDocs,
    isBulkUpdating,
  } = useCategoryDetailsLogic();

  // Show loading state while fetching category
  if (isLoadingCategory) {
    return (
      <View className="flex-1 justify-center items-center bg-background dark:bg-background-dark">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  if (!category) {
    return (
      <View className="flex-1 justify-center items-center bg-background dark:bg-background-dark">
        <Text className="text-gray-500 dark:text-gray-400">
          Category not found
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 bg-primary px-4 py-2 rounded-lg"
        >
          <Text className="text-white font-medium">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top"]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="flex-row items-center px-4 py-2 mb-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-4 p-2 -ml-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800"
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={category.color || "#374151"}
          />
        </TouchableOpacity>
        <View className="flex-1">
          <Text
            className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight"
            numberOfLines={1}
          >
            {category.name}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setIsAddModalVisible(true)}
          className="bg-primary p-3 rounded-full"
          style={shadows.primary}
        >
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Documents List */}
      {isLoadingDocs ? (
        <View className="px-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} className="flex-row items-center p-4 mb-3">
              <Skeleton className="w-14 h-14 rounded-2xl mr-4" />
              <View className="flex-1 gap-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={categoryDocuments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View className="flex-row items-center">
              <View className="flex-1">
                <DocumentItem
                  document={item}
                  onPress={(doc: Document) =>
                    router.push(`/documents/${doc.id}`)
                  }
                />
              </View>
              <TouchableOpacity
                onPress={() =>
                  handleRemoveFromCategory(
                    item.id,
                    item.title || item.originalName
                  )
                }
                className="mr-4 p-2 rounded-full bg-red-50 dark:bg-red-900/20"
              >
                <Ionicons name="close-circle" size={24} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetchDocs} />
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-20">
              <View className="bg-surface dark:bg-surface-dark p-8 rounded-full mb-6">
                <Ionicons
                  name="document-text-outline"
                  size={64}
                  color="#9CA3AF"
                />
              </View>
              <Text className="text-gray-500 dark:text-gray-400 text-xl font-bold">
                No documents found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-base mt-2 text-center px-10 mb-6">
                Add documents to this category to organize them
              </Text>
              <TouchableOpacity
                onPress={() => setIsAddModalVisible(true)}
                className="bg-primary px-6 py-3 rounded-full"
                style={shadows.primary}
              >
                <Text className="text-white font-bold text-base">
                  Add Documents
                </Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <AddDocumentsModal
        visible={isAddModalVisible}
        onClose={() => setIsAddModalVisible(false)}
        onAdd={handleAddDocuments}
        documents={availableDocuments}
        selectedIds={selectedDocIds}
        onToggleSelection={handleToggleSelection}
        isLoading={isLoadingAllDocs}
        isAdding={isBulkUpdating}
      />
    </SafeAreaView>
  );
}
