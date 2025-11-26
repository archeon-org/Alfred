import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Document } from "@archeon-org/types";
import { formatDistanceToNow } from "date-fns";

interface DocumentItemProps {
  document: Document;
  onPress: (document: Document) => void;
}

const getFileIcon = (mimetype: string) => {
  if (mimetype.includes("pdf")) return "document-text";
  if (mimetype.includes("image")) return "image";
  return "document";
};

const getFileColor = (mimetype: string) => {
  if (mimetype.includes("pdf")) return "#EF4444"; // red-500
  if (mimetype.includes("image")) return "#14B8A6"; // secondary (teal)
  return "#6366F1"; // primary (indigo)
};

export const DocumentItem = ({ document, onPress }: DocumentItemProps) => {
  return (
    <TouchableOpacity
      className="flex-row items-center bg-surface dark:bg-surface-dark p-4 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm shadow-gray-100 dark:shadow-none mb-3 active:scale-[0.98] transition-transform"
      onPress={() => onPress(document)}
      activeOpacity={0.7}
    >
      <View className="w-14 h-14 bg-gray-50 dark:bg-gray-800 rounded-2xl items-center justify-center mr-4 border border-gray-100 dark:border-gray-700">
        <Ionicons
          name={getFileIcon(document.mimetype) as any}
          size={28}
          color={getFileColor(document.mimetype)}
        />
      </View>
      <View className="flex-1 gap-1">
        <Text
          className="text-gray-900 dark:text-white font-bold text-base"
          numberOfLines={1}
        >
          {document.title || document.originalName}
        </Text>
        <View className="flex-row items-center">
          <Text className="text-gray-500 dark:text-gray-400 text-xs font-medium mr-2 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md overflow-hidden">
            {(document.size / 1024 / 1024).toFixed(2)} MB
          </Text>
          <Text className="text-gray-400 dark:text-gray-500 text-xs">
            {formatDistanceToNow(new Date(document.createdAt), {
              addSuffix: true,
            })}
          </Text>
        </View>
      </View>
      <View className="w-8 h-8 rounded-full bg-gray-50 dark:bg-gray-800 items-center justify-center">
        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
      </View>
    </TouchableOpacity>
  );
};
