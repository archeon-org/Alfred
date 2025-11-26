import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Document } from "@archeon-org/types";
import { useRouter } from "expo-router";
import { DocumentItem } from "../document/DocumentItem";
import { Skeleton } from "../common/Skeleton";

interface PendingManualDocumentsProps {
  documents: Document[];
  isLoading: boolean;
}

export const PendingManualDocuments = ({
  documents,
  isLoading,
}: PendingManualDocumentsProps) => {
  const router = useRouter();

  if (isLoading) {
    return (
      <View className="mb-6 w-full">
        <Text className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          Action Required
        </Text>
        <View className="gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </View>
      </View>
    );
  }

  if (documents.length === 0) {
    return null;
  }

  const limit = 3;
  const hasMore = documents.length > limit;
  const displayDocs = documents.slice(0, limit);

  return (
    // Added flex-col to ensure vertical stacking at root
    <View className="mb-8 w-full flex-col">
      <View className="flex-row justify-between items-center mb-4 px-1">
        <Text className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
          Action Required
        </Text>
        {hasMore && (
          <TouchableOpacity
            activeOpacity={0.7} // Better touch feedback
            onPress={() => router.push("/(app)/documents/pending")}
            // Added hitSlop to make the link easier to press without overlapping UI
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text className="text-primary dark:text-primary-400 font-bold text-sm">
              See All
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 
         FIXES APPLIED HERE:
         1. flex-col: Explicitly states items stack vertically.
         2. gap-y-3: Adds physical space between items so shadows/borders don't overlap.
      */}
      <View className="w-full flex-col gap-y-3">
        {displayDocs.map((doc) => (
          // Wrapped in a View to ensure styles inside DocumentItem don't leak out
          <View key={doc.id} className="w-full">
            <DocumentItem
              document={doc}
              onPress={(d) => router.push(`/(app)/documents/${d.id}` as any)}
            />
          </View>
        ))}
      </View>
    </View>
  );
};
