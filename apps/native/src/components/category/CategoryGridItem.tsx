import React from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Category } from "@archeon-org/types";

interface CategoryGridItemProps {
  item: Category;
  onPress: (category: Category) => void;
  onLongPress: (category: Category) => void;
  isExpandable?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: (category: Category) => void;
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
  isExpandable = false,
  isExpanded = false,
  onToggleExpand,
}: CategoryGridItemProps) => {
  const documentCount = item.documentCount ?? 0;
  const isSubfolder = !!item.parentId;
  const handlePress = () => {
    if (isExpandable && onToggleExpand) {
      onToggleExpand(item);
      return;
    }
    onPress(item);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
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
        {isExpandable ? (
          <View className="items-center mb-1">
            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color="#9CA3AF"
            />
          </View>
        ) : null}
        {isSubfolder ? (
          <View className="self-center px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 mb-1">
            <Text className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-300">
              Subfolder
            </Text>
          </View>
        ) : null}
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
