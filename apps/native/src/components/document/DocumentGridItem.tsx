import React from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Document } from "@archeon-org/types";
import { formatDistanceToNow } from "date-fns";
import { shadows } from "../../constants/shadows";

interface DocumentGridItemProps {
  document: Document;
  onPress: (document: Document) => void;
  onLongPress?: (document: Document) => void;
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

const getFileBgColor = (mimetype: string) => {
  if (mimetype.includes("pdf")) return "bg-red-50 dark:bg-red-900/20";
  if (mimetype.includes("image")) return "bg-teal-50 dark:bg-teal-900/20";
  return "bg-indigo-50 dark:bg-indigo-900/20";
};

const screenWidth = Dimensions.get("window").width;
const itemWidth = (screenWidth - 48 - 12) / 2; // 48 = padding, 12 = gap

export const DocumentGridItem = ({
  document,
  onPress,
  onLongPress,
}: DocumentGridItemProps) => {
  return (
    <TouchableOpacity
      className="bg-surface dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden active:scale-[0.98] transition-transform"
      style={[shadows.sm, { width: itemWidth, marginBottom: 12 }]}
      onPress={() => onPress(document)}
      onLongPress={() => onLongPress && onLongPress(document)}
      activeOpacity={0.7}
    >
      {/* File icon area */}
      <View
        className={`h-24 items-center justify-center ${getFileBgColor(document.mimetype)}`}
      >
        <Ionicons
          name={getFileIcon(document.mimetype) as any}
          size={40}
          color={getFileColor(document.mimetype)}
        />
      </View>

      {/* Content */}
      <View className="p-3">
        <Text
          className="text-gray-900 dark:text-white font-semibold text-sm mb-1"
          numberOfLines={2}
        >
          {document.title || document.originalName}
        </Text>
        <View className="flex-row items-center justify-between">
          <Text className="text-gray-400 dark:text-gray-500 text-xs">
            {(document.size / 1024 / 1024).toFixed(1)} MB
          </Text>
          <Text className="text-gray-400 dark:text-gray-500 text-xs">
            {formatDistanceToNow(new Date(document.createdAt), {
              addSuffix: false,
            })}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};
