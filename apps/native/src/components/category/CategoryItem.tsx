import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Category } from "@archeon-org/types";

interface CategoryItemProps {
  item: Category;
  onPress: (category: Category) => void;
  onLongPress: (category: Category) => void;
}

export const CategoryItem = ({
  item,
  onPress,
  onLongPress,
}: CategoryItemProps) => (
  <TouchableOpacity
    onPress={() => onPress(item)}
    onLongPress={() => onLongPress(item)}
    className="flex-row items-center p-4 bg-surface dark:bg-surface-dark rounded-3xl mb-3 shadow-sm border border-gray-100 dark:border-gray-800"
  >
    <View
      className="p-4 rounded-2xl mr-4"
      style={{ backgroundColor: `${item.color}20` }}
    >
      <Ionicons name={item.icon as any} size={28} color={item.color} />
    </View>
    <View className="flex-1">
      <Text className="font-bold text-gray-900 dark:text-white text-lg">
        {item.name}
      </Text>
      <Text className="text-gray-500 dark:text-gray-400 text-sm mt-1 font-medium">
        {item.isSystemDefault ? "System Default" : "Custom Category"}
      </Text>
    </View>
    <View className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-800 items-center justify-center">
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </View>
  </TouchableOpacity>
);
