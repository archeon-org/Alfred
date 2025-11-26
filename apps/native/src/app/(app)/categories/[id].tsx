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

export default function CategoryDetails() {
  const {
    router,
    category,
    categoryDocuments,
    isLoadingDocs,
    refetchDocs,
    isRefetching,
    isAddModalVisible,
    setIsAddModalVisible,
    selectedDocIds,
    handleToggleSelection,
    handleAddDocuments,
    availableDocuments,
    isLoadingAllDocs,
    isBulkUpdating,
  } = useCategoryDetailsLogic();

  if (!category) {
    return (
      <View className="flex-1 justify-center items-center bg-white dark:bg-black">
        <Text className="text-gray-500 dark:text-gray-400">
          Category not found
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 bg-indigo-600 px-4 py-2 rounded-lg"
        >
          <Text className="text-white font-medium">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black" edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1 flex-row items-center">
          <View
            className="w-8 h-8 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: `${category.color}20` }}
          >
            <Ionicons
              name={category.icon as any}
              size={18}
              color={category.color}
            />
          </View>
          <Text
            className="text-lg font-semibold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {category.name}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setIsAddModalVisible(true)}
          className="bg-indigo-600 p-2 rounded-full"
        >
          <Ionicons name="add" size={20} color="white" />
        </TouchableOpacity>
      </View>

      {/* Documents List */}
      {isLoadingDocs ? (
        <View className="p-4">
          {[1, 2, 3, 4, 5].map((i) => (
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
      ) : (
        <FlatList
          data={categoryDocuments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DocumentItem
              document={item}
              onPress={(doc: Document) => router.push(`/documents/${doc.id}`)}
            />
          )}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetchDocs} />
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-20">
              <Text className="text-gray-500 dark:text-gray-400 text-lg font-medium">
                No documents in this category
              </Text>
              <TouchableOpacity
                onPress={() => setIsAddModalVisible(true)}
                className="mt-4"
              >
                <Text className="text-indigo-600 dark:text-indigo-400 font-medium">
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
