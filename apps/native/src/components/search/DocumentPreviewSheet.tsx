import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { useDocument, useDocumentViewer } from "../../hooks/useDocuments";
import { Skeleton } from "../common/Skeleton";

interface DocumentPreviewSheetProps {
  visible: boolean;
  documentId: string | null;
  onClose: () => void;
  onOpenFullDetails?: () => void;
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case "COMPLETED":
      return {
        label: "Ready",
        color: "#10B981",
        bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
        icon: "checkmark-circle" as const,
      };
    case "PROCESSING":
      return {
        label: "Processing",
        color: "#F59E0B",
        bgColor: "bg-amber-50 dark:bg-amber-900/20",
        icon: "sync" as const,
      };
    case "PENDING":
      return {
        label: "Pending",
        color: "#6366F1",
        bgColor: "bg-indigo-50 dark:bg-indigo-900/20",
        icon: "time" as const,
      };
    case "FAILED":
      return {
        label: "Failed",
        color: "#EF4444",
        bgColor: "bg-red-50 dark:bg-red-900/20",
        icon: "alert-circle" as const,
      };
    default:
      return {
        label: status,
        color: "#6B7280",
        bgColor: "bg-gray-50 dark:bg-gray-800",
        icon: "help-circle" as const,
      };
  }
};

export const DocumentPreviewSheet: React.FC<DocumentPreviewSheetProps> = ({
  visible,
  documentId,
  onClose,
  onOpenFullDetails,
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error } = useDocument(documentId || "");
  const { openDocument, isOpening } = useDocumentViewer();

  const document = data?.document;

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

  const handleViewDocument = () => {
    if (documentId) {
      openDocument(documentId);
    }
  };

  const statusConfig = document
    ? getStatusConfig(document.processingStatus)
    : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background dark:bg-background-dark">
        {/* Drag handle */}
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </View>

        {/* Content */}
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View className="px-5 pt-4">
              {/* Hero skeleton */}
              <View className="items-center mb-6">
                <Skeleton className="w-16 h-20 rounded-lg mb-4" />
                <Skeleton className="h-7 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/3" />
              </View>
              {/* Actions skeleton */}
              <View className="flex-row gap-3 mb-6">
                <Skeleton className="flex-1 h-14 rounded-2xl" />
                <Skeleton className="flex-1 h-14 rounded-2xl" />
              </View>
              {/* Info skeleton */}
              <Skeleton className="h-24 w-full rounded-2xl mb-4" />
              <Skeleton className="h-16 w-full rounded-2xl" />
            </View>
          ) : error || !document ? (
            <View className="flex-1 justify-center items-center p-8 pt-16">
              <View className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-900/20 items-center justify-center mb-4">
                <Ionicons name="alert-circle" size={40} color="#EF4444" />
              </View>
              <Text className="text-gray-900 dark:text-white font-bold text-lg mb-1">
                Document not found
              </Text>
              <Text className="text-gray-500 dark:text-gray-400 text-center text-sm">
                Unable to load document details
              </Text>
            </View>
          ) : (
            <View className="px-5 pt-2">
              {/* Hero Section */}
              <View className="items-center mb-6">
                {/* Document Icon */}
                <View className="w-16 h-20 bg-gradient-to-b from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-900/50 rounded-xl items-center justify-center mb-4 border border-indigo-100 dark:border-indigo-800 relative">
                  <View className="absolute top-0 right-0 w-5 h-5 bg-indigo-100 dark:bg-indigo-800 -mr-0 -mt-0 rounded-bl-lg" />
                  <Ionicons name="document-text" size={28} color="#6366F1" />
                </View>

                <Text
                  className="text-xl font-bold text-gray-900 dark:text-white text-center mb-1 px-2 leading-tight"
                  numberOfLines={2}
                >
                  {document.title || document.originalName}
                </Text>
                <Text className="text-gray-400 dark:text-gray-500 text-sm">
                  {format(new Date(document.createdAt), "MMM d, yyyy")}
                </Text>
              </View>

              {/* Quick Actions */}
              <View className="flex-row gap-3 mb-6">
                <TouchableOpacity
                  onPress={handleViewDocument}
                  disabled={isOpening}
                  className="flex-1 bg-indigo-600 h-14 rounded-2xl flex-row items-center justify-center gap-2"
                  style={{
                    shadowColor: "#6366F1",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                  }}
                >
                  {isOpening ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <>
                      <Ionicons name="eye" size={20} color="white" />
                      <Text className="text-white font-bold text-base">
                        Open PDF
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleShare}
                  className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl items-center justify-center"
                >
                  <Ionicons name="share-outline" size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Info Card */}
              <View className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-4 mb-4">
                {/* Category & Status Row */}
                <View className="flex-row gap-3 mb-4">
                  {/* Category */}
                  <View className="flex-1 bg-white dark:bg-gray-800 rounded-xl p-3 flex-row items-center gap-3">
                    <View
                      className="w-10 h-10 rounded-xl items-center justify-center"
                      style={{
                        backgroundColor: `${document.category?.color || "#6366F1"}15`,
                      }}
                    >
                      <Ionicons
                        name={(document.category?.icon as any) || "folder"}
                        size={20}
                        color={document.category?.color || "#6366F1"}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-semibold tracking-wide">
                        Category
                      </Text>
                      <Text
                        className="text-gray-900 dark:text-white font-bold text-sm"
                        numberOfLines={1}
                      >
                        {document.category?.name || "Uncategorized"}
                      </Text>
                    </View>
                  </View>

                  {/* Status */}
                  <View className="flex-1 bg-white dark:bg-gray-800 rounded-xl p-3 flex-row items-center gap-3">
                    <View
                      className={`w-10 h-10 rounded-xl items-center justify-center ${statusConfig?.bgColor}`}
                    >
                      <Ionicons
                        name={statusConfig?.icon || "help-circle"}
                        size={20}
                        color={statusConfig?.color}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-semibold tracking-wide">
                        Status
                      </Text>
                      <Text
                        className="font-bold text-sm"
                        style={{ color: statusConfig?.color }}
                      >
                        {statusConfig?.label}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Tags */}
                {document.tags && document.tags.length > 0 && (
                  <View className="bg-white dark:bg-gray-800 rounded-xl p-3">
                    <Text className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-semibold tracking-wide mb-2">
                      Tags
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {document.tags.slice(0, 5).map((tag) => (
                        <View
                          key={tag.id}
                          className="bg-gray-100 dark:bg-gray-700 px-2.5 py-1.5 rounded-lg"
                        >
                          <Text className="text-gray-600 dark:text-gray-300 text-xs font-medium">
                            {tag.name}
                          </Text>
                        </View>
                      ))}
                      {document.tags.length > 5 && (
                        <View className="bg-gray-100 dark:bg-gray-700 px-2.5 py-1.5 rounded-lg">
                          <Text className="text-gray-500 dark:text-gray-400 text-xs font-medium">
                            +{document.tags.length - 5}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};
