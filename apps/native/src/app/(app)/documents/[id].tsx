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
import { Stack, useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useDocumentDetailsLogic } from "../../../hooks/useDocumentDetailsLogic";
import { CategorySelectionModal } from "../../../components/document/CategorySelectionModal";
import { TagSelectionModal } from "../../../components/document/TagSelectionModal";
import { TitleEditModal } from "../../../components/document/TitleEditModal";
import { Skeleton } from "../../../components/common/Skeleton";

const getStatusConfig = (status: string) => {
  switch (status) {
    case "COMPLETED":
      return {
        label: "Ready",
        description: "Document is fully processed",
        color: "#10B981",
        bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
        borderColor: "border-emerald-100 dark:border-emerald-800",
        icon: "checkmark-circle" as const,
      };
    case "PROCESSING":
      return {
        label: "Processing",
        description: "AI is analyzing your document",
        color: "#F59E0B",
        bgColor: "bg-amber-50 dark:bg-amber-900/20",
        borderColor: "border-amber-100 dark:border-amber-800",
        icon: "sync" as const,
      };
    case "PENDING":
      return {
        label: "Pending",
        description: "Waiting to be processed",
        color: "#6366F1",
        bgColor: "bg-indigo-50 dark:bg-indigo-900/20",
        borderColor: "border-indigo-100 dark:border-indigo-800",
        icon: "time" as const,
      };
    case "FAILED":
      return {
        label: "Failed",
        description: "Processing encountered an error",
        color: "#EF4444",
        bgColor: "bg-red-50 dark:bg-red-900/20",
        borderColor: "border-red-100 dark:border-red-800",
        icon: "alert-circle" as const,
      };
    default:
      return {
        label: status,
        description: "Unknown status",
        color: "#6B7280",
        bgColor: "bg-gray-50 dark:bg-gray-800",
        borderColor: "border-gray-200 dark:border-gray-700",
        icon: "help-circle" as const,
      };
  }
};

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
    handleTriggerEmbedding,
    isTriggeringEmbedding,
    isUpdating,
    isGeneratingTitle,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useDocumentDetailsLogic();

  const navigation = useNavigation();

  // Smart back navigation - if we can't go back, go to documents list
  const handleBack = () => {
    if (navigation.canGoBack()) {
      router.back();
    } else {
      // No history, navigate to documents list
      router.replace("/(app)/documents" as any);
    }
  };

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

  const statusConfig = document
    ? getStatusConfig(document.processingStatus)
    : null;

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-background dark:bg-background-dark"
        edges={["top"]}
      >
        <View className="flex-row items-center px-4 py-3">
          <View className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center mr-3">
            <Ionicons name="arrow-back" size={20} color="#9CA3AF" />
          </View>
          <Skeleton className="h-5 w-32" />
        </View>
        <View className="px-5 pt-4">
          <View className="items-center mb-8">
            <Skeleton className="w-20 h-24 rounded-xl mb-5" />
            <Skeleton className="h-7 w-4/5 mb-3" />
            <Skeleton className="h-4 w-1/3" />
          </View>
          <View className="flex-row gap-3 mb-8">
            <Skeleton className="flex-1 h-14 rounded-2xl" />
            <Skeleton className="w-14 h-14 rounded-2xl" />
          </View>
          <Skeleton className="h-32 w-full rounded-2xl mb-4" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !document) {
    return (
      <SafeAreaView
        className="flex-1 bg-background dark:bg-background-dark justify-center items-center"
        edges={["top"]}
      >
        <View className="w-24 h-24 rounded-full bg-red-50 dark:bg-red-900/20 items-center justify-center mb-6">
          <Ionicons name="alert-circle" size={48} color="#EF4444" />
        </View>
        <Text className="text-gray-900 dark:text-white font-bold text-xl mb-2">
          Document not found
        </Text>
        <Text className="text-gray-500 dark:text-gray-400 text-center mb-6 px-8">
          We couldn't load this document. It may have been deleted or moved.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace("/(app)/documents")}
          className="bg-indigo-600 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-bold">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top"]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="flex-row items-center px-4 py-2">
        <TouchableOpacity
          onPress={handleBack}
          className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center mr-3"
        >
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
        </TouchableOpacity>
        <View className="flex-1" />
        <TouchableOpacity
          onPress={handleShare}
          className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center mr-2"
        >
          <Ionicons name="share-outline" size={20} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center">
          <Ionicons name="ellipsis-horizontal" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View className="items-center pt-4 pb-6 px-5">
          {/* Document Icon */}
          <View className="w-20 h-24 bg-gradient-to-b from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-900/50 rounded-xl items-center justify-center mb-5 border border-indigo-100 dark:border-indigo-800 relative">
            <View className="absolute top-0 right-0 w-6 h-6 bg-indigo-100 dark:bg-indigo-800 rounded-bl-lg" />
            <Ionicons name="document-text" size={32} color="#6366F1" />
          </View>

          <TouchableOpacity onPress={handleOpenTitleModal} activeOpacity={0.7}>
            <Text className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-1 px-4 leading-tight">
              {document.title}
            </Text>
          </TouchableOpacity>

          <View className="flex-row items-center gap-2 mt-2">
            <TouchableOpacity
              onPress={handleOpenTitleModal}
              className="flex-row items-center gap-1.5 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full"
            >
              <Ionicons name="pencil" size={12} color="#6B7280" />
              <Text className="text-gray-500 dark:text-gray-400 text-xs font-medium">
                Edit
              </Text>
            </TouchableOpacity>
            <Text className="text-gray-300 dark:text-gray-600">•</Text>
            <Text className="text-gray-400 dark:text-gray-500 text-sm">
              {format(new Date(document.createdAt), "MMM d, yyyy")}
            </Text>
          </View>
        </View>

        {/* Primary Action */}
        <View className="px-5 mb-6">
          <TouchableOpacity
            onPress={() => openDocument(document.id)}
            disabled={isOpening}
            className="bg-indigo-600 h-14 rounded-2xl flex-row items-center justify-center gap-2"
            style={{
              shadowColor: "#6366F1",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 12,
            }}
          >
            {isOpening ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="eye" size={22} color="white" />
                <Text className="text-white font-bold text-base">
                  Open Document
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Classification Alert */}
        {((document.processingStatus === "PENDING" &&
          document.classificationSource === "MANUAL") ||
          document.processingStatus === "FAILED") && (
          <View className="mx-5 mb-6 bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl border border-amber-100 dark:border-amber-800">
            <View className="flex-row items-start gap-3 mb-4">
              <View className="w-10 h-10 bg-amber-100 dark:bg-amber-900/40 rounded-xl items-center justify-center">
                <Ionicons name="sparkles" size={20} color="#F59E0B" />
              </View>
              <View className="flex-1">
                <Text className="text-amber-900 dark:text-amber-100 font-bold text-base mb-0.5">
                  Needs Classification
                </Text>
                <Text className="text-amber-700 dark:text-amber-300 text-sm">
                  Classify manually or let AI do it
                </Text>
              </View>
            </View>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setCategoryModalVisible(true)}
                className="flex-1 bg-white dark:bg-black py-3 rounded-xl items-center border border-amber-200 dark:border-amber-800"
              >
                <Text className="text-amber-700 dark:text-amber-300 font-bold text-sm">
                  Manual
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleTriggerAi}
                disabled={isTriggeringAi}
                className="flex-1 bg-amber-500 py-3 rounded-xl items-center flex-row justify-center gap-2"
              >
                {isTriggeringAi ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <Ionicons name="flash" size={16} color="white" />
                    <Text className="text-white font-bold text-sm">
                      Auto-Classify
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Enable Search Alert - Show for manually classified documents without embedding */}
        {document.classificationSource === "MANUAL" &&
          document.processingStatus === "COMPLETED" &&
          !document.hasEmbedding && (
            <View className="mx-5 mb-6 bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800">
              <View className="flex-row items-start gap-3 mb-4">
                <View className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl items-center justify-center">
                  <Ionicons name="search" size={20} color="#6366F1" />
                </View>
                <View className="flex-1">
                  <Text className="text-indigo-900 dark:text-indigo-100 font-bold text-base mb-0.5">
                    Enable Search
                  </Text>
                  <Text className="text-indigo-700 dark:text-indigo-300 text-sm">
                    Make this document findable through search
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleTriggerEmbedding}
                disabled={isTriggeringEmbedding}
                className="bg-indigo-600 py-3 rounded-xl items-center flex-row justify-center gap-2"
              >
                {isTriggeringEmbedding ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <Ionicons name="flash" size={16} color="white" />
                    <Text className="text-white font-bold text-sm">
                      Enable Search
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

        {/* Quick Info Grid */}
        <View className="px-5 mb-6">
          <View className="flex-row gap-3">
            {/* Category Card */}
            <TouchableOpacity
              onPress={() => setCategoryModalVisible(true)}
              activeOpacity={0.7}
              className="flex-1 bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800"
            >
              <View
                className="w-12 h-12 rounded-xl items-center justify-center mb-3"
                style={{
                  backgroundColor: `${document.category?.color || "#6366F1"}15`,
                }}
              >
                <Ionicons
                  name={(document.category?.icon as any) || "folder"}
                  size={24}
                  color={document.category?.color || "#6366F1"}
                />
              </View>
              <Text className="text-[11px] text-gray-400 dark:text-gray-500 uppercase font-bold tracking-wider mb-1">
                Category
              </Text>
              <Text
                className="text-gray-900 dark:text-white font-bold text-base"
                numberOfLines={1}
              >
                {document.category?.name || "Uncategorized"}
              </Text>
            </TouchableOpacity>

            {/* Status Card */}
            <View
              className={`flex-1 rounded-2xl p-4 border ${statusConfig?.bgColor} ${statusConfig?.borderColor}`}
            >
              <View
                className="w-12 h-12 rounded-xl items-center justify-center mb-3"
                style={{ backgroundColor: `${statusConfig?.color}15` }}
              >
                <Ionicons
                  name={statusConfig?.icon || "help-circle"}
                  size={24}
                  color={statusConfig?.color}
                />
              </View>
              <Text className="text-[11px] text-gray-400 dark:text-gray-500 uppercase font-bold tracking-wider mb-1">
                Status
              </Text>
              <Text
                className="font-bold text-base"
                style={{ color: statusConfig?.color }}
              >
                {statusConfig?.label}
              </Text>
            </View>
          </View>
        </View>

        {/* Tags Section */}
        <View className="px-5 mb-6">
          <View className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-2">
                <View className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-lg items-center justify-center">
                  <Ionicons name="pricetags" size={16} color="#6B7280" />
                </View>
                <Text className="text-gray-900 dark:text-white font-bold text-base">
                  Tags
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setTagModalVisible(true)}
                className="bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-lg"
              >
                <Text className="text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                  Manage
                </Text>
              </TouchableOpacity>
            </View>

            {document.tags && document.tags.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {document.tags.map((tag) => (
                  <View
                    key={tag.id}
                    className="bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-xl"
                  >
                    <Text className="text-gray-700 dark:text-gray-300 text-sm font-medium">
                      {tag.name}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setTagModalVisible(true)}
                className="flex-row items-center justify-center py-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700"
              >
                <Ionicons name="add" size={18} color="#9CA3AF" />
                <Text className="text-gray-400 dark:text-gray-500 text-sm ml-1">
                  Add tags
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* File Details */}
        <View className="px-5">
          <View className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
            <View className="flex-row items-center gap-2 mb-4">
              <View className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-lg items-center justify-center">
                <Ionicons name="information-circle" size={16} color="#6B7280" />
              </View>
              <Text className="text-gray-900 dark:text-white font-bold text-base">
                File Details
              </Text>
            </View>

            <View className="space-y-3">
              {/* Filename */}
              <View className="flex-row items-center py-3 border-b border-gray-100 dark:border-gray-800">
                <Text className="text-gray-500 dark:text-gray-400 text-sm w-24">
                  Filename
                </Text>
                <Text
                  className="text-gray-900 dark:text-white text-sm font-medium flex-1"
                  numberOfLines={1}
                >
                  {document.filename || "document.pdf"}
                </Text>
              </View>

              {/* Format */}
              <View className="flex-row items-center py-3 border-b border-gray-100 dark:border-gray-800">
                <Text className="text-gray-500 dark:text-gray-400 text-sm w-24">
                  Format
                </Text>
                <View className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                  <Text className="text-gray-700 dark:text-gray-300 text-xs font-bold uppercase">
                    PDF
                  </Text>
                </View>
              </View>

              {/* Added */}
              <View className="flex-row items-center py-3">
                <Text className="text-gray-500 dark:text-gray-400 text-sm w-24">
                  Added
                </Text>
                <Text className="text-gray-900 dark:text-white text-sm font-medium">
                  {format(
                    new Date(document.createdAt),
                    "MMMM d, yyyy 'at' h:mm a"
                  )}
                </Text>
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
