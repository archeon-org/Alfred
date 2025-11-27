import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Category } from "@archeon-org/types";
import { BlurView } from "expo-blur";

interface CategorySelectionModalProps {
  visible: boolean;
  onClose: () => void;
  search: string;
  onSearchChange: (text: string) => void;
  categories: Category[];
  onSelect: (category: Category) => void;
  onCreate: () => void;
  currentCategoryId?: string;
  onEndReached?: () => void;
  isFetchingNextPage?: boolean;
}

export const CategorySelectionModal: React.FC<CategorySelectionModalProps> = ({
  visible,
  onClose,
  search,
  onSearchChange,
  categories,
  onSelect,
  onCreate,
  currentCategoryId,
  onEndReached,
  isFetchingNextPage,
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-end"
      >
        {/* Backdrop */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          className="absolute inset-0 bg-black/60"
        />

        {/* Modal Content */}
        <View
          className="bg-background dark:bg-background-dark rounded-t-3xl max-h-[85%]"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.15,
            shadowRadius: 20,
            elevation: 20,
          }}
        >
          {/* Handle */}
          <View className="items-center pt-3 pb-2">
            <View className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          </View>

          {/* Header */}
          <View className="flex-row justify-between items-center px-5 pb-4">
            <Text className="text-xl font-bold text-gray-900 dark:text-white">
              Select Category
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center"
            >
              <Ionicons
                name="close"
                size={18}
                color={isDark ? "#9CA3AF" : "#6B7280"}
              />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View className="px-5 pb-4">
            <View className="flex-row items-center bg-surface dark:bg-surface-dark px-4 py-3 rounded-2xl border border-gray-100 dark:border-gray-800">
              <Ionicons
                name="search"
                size={20}
                color={isDark ? "#6B7280" : "#9CA3AF"}
              />
              <TextInput
                className="flex-1 ml-3 text-base text-gray-900 dark:text-white"
                placeholder="Search or create category..."
                placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                value={search}
                onChangeText={onSearchChange}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => onSearchChange("")}>
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={isDark ? "#6B7280" : "#9CA3AF"}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Categories List */}
          <FlatList
            data={categories}
            keyExtractor={(item) => item.id}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View className="py-4">
                  <ActivityIndicator size="small" color="#6366F1" />
                </View>
              ) : null
            }
            ListHeaderComponent={
              search.trim().length > 0 && categories.length === 0 ? (
                <TouchableOpacity
                  className="flex-row items-center p-4 mb-2 bg-primary/10 dark:bg-primary/20 rounded-2xl border border-primary/20"
                  onPress={onCreate}
                >
                  <View className="w-12 h-12 rounded-xl bg-primary/20 items-center justify-center mr-3">
                    <Ionicons name="add" size={24} color="#6366F1" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-bold text-primary dark:text-primary">
                      Create "{search}"
                    </Text>
                    <Text className="text-sm text-gray-500 dark:text-gray-400">
                      Add as new category
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#6366F1" />
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              search.trim().length === 0 ? (
                <View className="items-center py-12">
                  <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center mb-4">
                    <Ionicons
                      name="folder-outline"
                      size={32}
                      color={isDark ? "#6B7280" : "#9CA3AF"}
                    />
                  </View>
                  <Text className="text-gray-500 dark:text-gray-400 text-base">
                    No categories yet
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const isSelected = currentCategoryId === item.id;
              return (
                <TouchableOpacity
                  className={`flex-row items-center p-4 mb-2 rounded-2xl border ${
                    isSelected
                      ? "bg-primary/10 dark:bg-primary/20 border-primary/30"
                      : "bg-surface dark:bg-surface-dark border-gray-100 dark:border-gray-800"
                  }`}
                  onPress={() => onSelect(item)}
                  activeOpacity={0.7}
                >
                  <View
                    className="w-12 h-12 rounded-xl items-center justify-center mr-3"
                    style={{ backgroundColor: `${item.color}20` }}
                  >
                    <Ionicons
                      name={item.icon as any}
                      size={24}
                      color={item.color}
                    />
                  </View>
                  <Text
                    className={`text-base font-semibold flex-1 ${
                      isSelected
                        ? "text-primary dark:text-primary"
                        : "text-gray-900 dark:text-white"
                    }`}
                  >
                    {item.name}
                  </Text>
                  {isSelected && (
                    <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
                      <Ionicons name="checkmark" size={16} color="white" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
