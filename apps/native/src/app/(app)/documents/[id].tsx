import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Share,
} from "react-native";
import { Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { DocumentStatusBadge } from "../../../components/document/DocumentStatusBadge";
import { useDocumentDetailsLogic } from "../../../hooks/useDocumentDetailsLogic";
import { CategorySelectionModal } from "../../../components/document/CategorySelectionModal";
import { TagSelectionModal } from "../../../components/document/TagSelectionModal";
import { TitleEditModal } from "../../../components/document/TitleEditModal";

import { Skeleton } from "../../../components/common/Skeleton";

export default function DocumentDetails() {
  const {
    document,
    isLoading,
    error,
    refetch,
    isRefetching,
    openDocument,
    isOpening,
    router,
    categoryModalVisible,
    setCategoryModalVisible,
    tagModalVisible,
    setTagModalVisible,
    titleModalVisible,
    setTitleModalVisible,
    tagSearch,
    setTagSearch,
    categorySearch,
    setCategorySearch,
    editingTitle,
    setEditingTitle,
    filteredTags,
    filteredCategories,
    handleUpdateCategory,
    handleAddTag,
    handleCreateTag,
    handleQuickCreateCategory,
    handleTriggerAi,
    isTriggeringAi,
    handleOpenTitleModal,
    handleSaveTitle,
    handleGenerateAiTitle,
    isUpdating,
    isGeneratingTitle,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useDocumentDetailsLogic();

  const handleShare = async () => {
    if (!document) return;
    try {
      await Share.share({
        message: `Check out this document: ${document.title}`,
      });
    } catch (error) {
      console.error(error);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-black" edges={["top"]}>
        <View className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <View className="mr-4 w-6 h-6">
            <Ionicons name="arrow-back" size={24} color="#374151" />
          </View>
          <Skeleton className="h-6 w-40" />
        </View>
        <View className="p-4">
          <View className="items-center mb-8 mt-4">
            <Skeleton className="w-24 h-24 rounded-2xl mb-4" />
            <Skeleton className="h-8 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </View>
          <View className="flex-row gap-4 mb-8">
            <Skeleton className="flex-1 h-12 rounded-xl" />
            <Skeleton className="w-12 h-12 rounded-xl" />
          </View>
          <View className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-4">
            <View>
              <View className="flex-row justify-between mb-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-8" />
              </View>
              <Skeleton className="h-5 w-32" />
            </View>
            <View className="h-[1px] bg-gray-200 dark:bg-gray-700" />
            <View>
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </View>
            <View className="h-[1px] bg-gray-200 dark:bg-gray-700" />
            <View>
              <View className="flex-row justify-between mb-2">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-8" />
              </View>
              <View className="flex-row gap-2">
                <Skeleton className="h-8 w-20 rounded-full" />
                <Skeleton className="h-8 w-24 rounded-full" />
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !document) {
    return (
      <View className="flex-1 justify-center items-center bg-white dark:bg-black p-4">
        <Text className="text-gray-500 dark:text-gray-400 text-lg mb-4">
          Failed to load document
        </Text>
        <TouchableOpacity
          onPress={() => router.replace("/(app)/documents")}
          className="bg-indigo-600 px-4 py-2 rounded-lg"
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
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-4 p-2 -ml-2"
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text
          className="text-lg font-bold text-gray-900 dark:text-white flex-1"
          numberOfLines={1}
        >
          Document Details
        </Text>
        <TouchableOpacity className="p-2">
          <Ionicons name="ellipsis-horizontal" size={24} color="#374151" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        {/* Preview Section */}
        <View className="bg-surface dark:bg-surface-dark pb-8 pt-6 px-4 border-b border-gray-100 dark:border-gray-800 mb-6">
          <View className="items-center">
            <View className="w-28 h-36 bg-gray-100 dark:bg-gray-800 rounded-xl items-center justify-center mb-6 shadow-sm border border-gray-200 dark:border-gray-700 relative overflow-hidden">
              <View className="absolute top-0 right-0 w-12 h-12 bg-gray-200 dark:bg-gray-700 -mr-6 -mt-6 rotate-45" />
              <Ionicons name="document-text" size={48} color="#4F46E5" />
              <View className="absolute bottom-2 left-0 right-0 items-center">
                <Text className="text-[10px] font-bold text-gray-400 uppercase">
                  PDF
                </Text>
              </View>
            </View>

            <Text className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-2 px-4 leading-tight">
              {document.title}
            </Text>
            <TouchableOpacity
              onPress={handleOpenTitleModal}
              className="flex-row items-center gap-1 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full"
            >
              <Ionicons name="pencil" size={12} color="#6B7280" />
              <Text className="text-gray-500 dark:text-gray-400 text-xs font-medium">
                Edit title
              </Text>
            </TouchableOpacity>
            <Text className="text-gray-500 dark:text-gray-400 text-sm font-medium mt-2">
              Added on {format(new Date(document.createdAt), "MMMM d, yyyy")}
            </Text>
          </View>

          {/* Primary Actions */}
          <View className="flex-row gap-3 mt-8">
            <TouchableOpacity
              onPress={() => openDocument(document.id)}
              disabled={isOpening}
              className="flex-1 bg-indigo-600 h-12 rounded-xl flex-row items-center justify-center gap-2 shadow-lg shadow-indigo-200 dark:shadow-none"
            >
              {isOpening ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Ionicons name="eye" size={20} color="white" />
                  <Text className="text-white font-bold text-base">
                    View Document
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleShare}
              className="w-12 h-12 bg-white dark:bg-gray-800 rounded-xl items-center justify-center border border-gray-200 dark:border-gray-700 shadow-sm"
            >
              <Ionicons name="share-outline" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
        </View>

        <View className="px-4 space-y-8">
          {/* Classification Needed Section */}
          {((document.processingStatus === "PENDING" &&
            document.classificationSource === "MANUAL") ||
            document.processingStatus === "FAILED") && (
            <View className="bg-orange-50 dark:bg-orange-900/20 p-5 rounded-2xl border border-orange-200 dark:border-orange-800">
              <View className="flex-row items-start gap-3 mb-3">
                <View className="bg-orange-100 dark:bg-orange-900/40 p-2 rounded-full">
                  <Ionicons name="alert" size={20} color="#F97316" />
                </View>
                <View className="flex-1">
                  <Text className="text-orange-900 dark:text-orange-100 font-bold text-lg mb-1">
                    Action Required
                  </Text>
                  <Text className="text-orange-700 dark:text-orange-300 text-sm leading-5">
                    This document needs classification. You can do it manually
                    or let our AI handle it for you.
                  </Text>
                </View>
              </View>

              <View className="flex-row gap-3 mt-2">
                <TouchableOpacity
                  onPress={() => setCategoryModalVisible(true)}
                  className="flex-1 bg-white dark:bg-black border border-orange-200 dark:border-orange-800 py-3 rounded-xl items-center shadow-sm"
                >
                  <Text className="text-orange-700 dark:text-orange-300 font-bold">
                    Classify Manually
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleTriggerAi}
                  disabled={isTriggeringAi}
                  className="flex-1 bg-orange-500 py-3 rounded-xl items-center flex-row justify-center gap-2 shadow-sm"
                >
                  {isTriggeringAi ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={16} color="white" />
                      <Text className="text-white font-bold">
                        Auto-Classify
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Details Card */}
          <View className="bg-surface dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <View className="p-4 border-b border-gray-100 dark:border-gray-800">
              <Text className="text-base font-bold text-gray-900 dark:text-white">
                Document Information
              </Text>
            </View>

            <View className="p-4 space-y-8">
              {/* Category */}
              <View>
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-gray-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider">
                    Category
                  </Text>
                  <TouchableOpacity
                    onPress={() => setCategoryModalVisible(true)}
                  >
                    <Text className="text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                      Change
                    </Text>
                  </TouchableOpacity>
                </View>
                <View className="flex-row items-center gap-3 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl">
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: `${document.category?.color || "#4F46E5"}20`,
                    }}
                  >
                    <Ionicons
                      name="folder"
                      size={20}
                      color={document.category?.color || "#4F46E5"}
                    />
                  </View>
                  <View>
                    <Text className="text-gray-900 dark:text-white font-bold text-base">
                      {document.category?.name || "Uncategorized"}
                    </Text>
                    <Text className="text-gray-500 dark:text-gray-400 text-xs">
                      {document.category
                        ? "Custom Category"
                        : "No category assigned"}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Status */}
              <View>
                <Text className="text-gray-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider mb-2">
                  Processing Status
                </Text>
                <View className="flex-row">
                  <DocumentStatusBadge status={document.processingStatus} />
                </View>
              </View>

              {/* Tags */}
              <View>
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-gray-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider">
                    Tags
                  </Text>
                  <TouchableOpacity onPress={() => setTagModalVisible(true)}>
                    <Text className="text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                      Manage
                    </Text>
                  </TouchableOpacity>
                </View>
                <View className="flex-row flex-wrap gap-2">
                  {document.tags && document.tags.length > 0 ? (
                    document.tags.map((tag) => (
                      <View
                        key={tag.id}
                        className="bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 flex-row items-center gap-1"
                      >
                        <Ionicons name="pricetag" size={12} color="#6B7280" />
                        <Text className="text-gray-700 dark:text-gray-300 text-sm font-medium">
                          {tag.name}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text className="text-gray-400 dark:text-gray-500 italic text-sm">
                      No tags added yet
                    </Text>
                  )}
                </View>
              </View>

              {/* File Info */}
              <View>
                <Text className="text-gray-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider mb-2">
                  File Details
                </Text>
                <View className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl flex-row items-center gap-3">
                  <View className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg items-center justify-center">
                    <Text className="text-[10px] font-bold text-gray-500">
                      PDF
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-gray-900 dark:text-white font-medium text-sm"
                      numberOfLines={1}
                    >
                      {document.filename || "document.pdf"}
                    </Text>
                    <Text className="text-gray-500 dark:text-gray-400 text-xs">
                      Original File
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <CategorySelectionModal
        visible={categoryModalVisible}
        onClose={() => setCategoryModalVisible(false)}
        search={categorySearch}
        onSearchChange={setCategorySearch}
        categories={filteredCategories}
        onSelect={handleUpdateCategory}
        onCreate={handleQuickCreateCategory}
        currentCategoryId={document.categoryId}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        isFetchingNextPage={isFetchingNextPage}
      />

      <TagSelectionModal
        visible={tagModalVisible}
        onClose={() => setTagModalVisible(false)}
        search={tagSearch}
        onSearchChange={setTagSearch}
        tags={filteredTags}
        onSelect={handleAddTag}
        onCreate={handleCreateTag}
        currentTagIds={document.tags?.map((t) => t.id)}
      />

      <TitleEditModal
        visible={titleModalVisible}
        onClose={() => setTitleModalVisible(false)}
        title={editingTitle}
        onTitleChange={setEditingTitle}
        onSave={handleSaveTitle}
        onGenerateAi={handleGenerateAiTitle}
        isSaving={isUpdating}
        isGenerating={isGeneratingTitle}
      />
    </SafeAreaView>
  );
}
