import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Category } from "@archeon-org/types";
import { RelativePathString, useRouter } from "expo-router";
import { Skeleton } from "../common/Skeleton";

interface CategoryListProps {
  categories: Category[];
  isLoading: boolean;
}

export const CategoryList = ({ categories, isLoading }: CategoryListProps) => {
  const router = useRouter();

  if (isLoading) {
    return (
      <View className="mb-8">
        <View className="flex-row justify-between items-center mb-4 px-1">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-16" />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 20 }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} className="mr-4 items-center">
              <Skeleton className="w-20 h-20 rounded-3xl mb-2" />
              <Skeleton className="h-3 w-16" />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="mb-8">
      <View className="flex-row justify-between items-center mb-4 px-1">
        <Text className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
          Categories
        </Text>
        <TouchableOpacity onPress={() => router.push("/(app)/categories")}>
          <Text className="text-primary dark:text-primary-400 font-bold text-sm">
            See All
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 20 }}
      >
        {categories.slice(0, 5).map((category) => (
          <TouchableOpacity
            key={category.id}
            className="mr-3 items-center w-20"
            onPress={() => router.push(`/categories/${category.id}`)}
            activeOpacity={0.7}
          >
            <View
              className="w-20 h-20 rounded-3xl items-center justify-center mb-2"
              style={{ backgroundColor: category.color + "20" }} // Slightly more opaque
            >
              <Ionicons
                name={category.icon as any}
                size={32}
                color={category.color}
              />
            </View>
            <Text
              className="text-xs font-bold text-gray-700 dark:text-gray-300 text-center"
              numberOfLines={1}
            >
              {category.name}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          className="mr-3 items-center w-20"
          onPress={() => router.push("/(app)/categories")}
          activeOpacity={0.7}
        >
          <View className="w-20 h-20 rounded-3xl bg-surface dark:bg-surface-dark items-center justify-center mb-2 border border-dashed border-gray-300 dark:border-gray-700">
            <Ionicons name="grid-outline" size={28} color="#9CA3AF" />
          </View>
          <Text className="text-xs font-bold text-gray-500 dark:text-gray-400">
            View All
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};
