import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Category } from "@archeon-org/types";
import { shadows } from "../../constants/shadows";

interface CategoryItemProps {
  item: Category;
  onPress: (category: Category) => void;
  onLongPress: (category: Category) => void;
}

export const CategoryItem = ({
  item,
  onPress,
  onLongPress,
}: CategoryItemProps) => {
  const documentCount = item.documentCount ?? 0;

  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      className="flex-row items-center p-4 bg-surface dark:bg-surface-dark rounded-3xl mb-3 border border-gray-100 dark:border-gray-800"
      // Using native shadow instead of NativeWind to avoid React Navigation context conflicts
      style={shadows.sm}
    >
      <View
        className="p-4 rounded-2xl mr-4 relative"
        style={{ backgroundColor: `${item.color}20` }}
      >
        <Ionicons name={item.icon as any} size={28} color={item.color} />
        {documentCount > 0 && (
          <View
            className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full items-center justify-center px-1.5"
            style={{ backgroundColor: item.color }}
          >
            <Text className="text-white text-xs font-bold">
              {documentCount > 99 ? "99+" : documentCount}
            </Text>
          </View>
        )}
      </View>
      <View className="flex-1">
        <Text className="font-bold text-gray-900 dark:text-white text-lg">
          {item.name}
        </Text>
        <Text className="text-gray-500 dark:text-gray-400 text-sm mt-1 font-medium">
          {documentCount} {documentCount === 1 ? "document" : "documents"}
        </Text>
      </View>
      <View className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-800 items-center justify-center">
        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
      </View>
    </TouchableOpacity>
  );
};
