import React from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Category } from "@archeon-org/types";

interface CategoryGridItemProps {
  item: Category;
  onPress: (category: Category) => void;
  onLongPress: (category: Category) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_PADDING = 16;
export const GRID_GAP = 16;
const COLUMNS = 2;
export const ITEM_WIDTH =
  (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

export const CategoryGridItem = ({
  item,
  onPress,
  onLongPress,
}: CategoryGridItemProps) => {
  const documentCount = item.documentCount ?? 0;

  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      className="bg-surface dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden active:scale-[0.98] transition-transform"
      style={{ width: ITEM_WIDTH, marginBottom: GRID_GAP }}
      activeOpacity={0.7}
    >
      {/* Icon area with colored background */}
      <View
        className="h-24 items-center justify-center"
        style={{ backgroundColor: `${item.color}15` }}
      >
        <View
          className="w-14 h-14 rounded-2xl items-center justify-center"
          style={{ backgroundColor: `${item.color}25` }}
        >
          <Ionicons name={item.icon as any} size={28} color={item.color} />
        </View>
      </View>

      {/* Content */}
      <View className="p-3">
        <Text
          className="text-sm font-semibold text-gray-900 dark:text-white text-center mb-1"
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400 text-center">
          {documentCount} {documentCount === 1 ? "document" : "documents"}
        </Text>
      </View>
    </TouchableOpacity>
  );
};
