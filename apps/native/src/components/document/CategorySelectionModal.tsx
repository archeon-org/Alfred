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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Category } from "@archeon-org/types";

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
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 bg-white dark:bg-gray-900"
      >
        <View className="flex-row justify-between items-center p-4 border-b border-gray-100 dark:border-gray-800">
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            Select Category
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-indigo-600 dark:text-indigo-400 font-medium">
              Close
            </Text>
          </TouchableOpacity>
        </View>

        <View className="p-4 border-b border-gray-100 dark:border-gray-800">
          <TextInput
            className="bg-gray-100 dark:bg-gray-800 p-3 rounded-xl text-gray-900 dark:text-white"
            placeholder="Search or create category..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={onSearchChange}
          />
        </View>

        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
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
                className="flex-row items-center p-4 border-b border-gray-100 dark:border-gray-800"
                onPress={onCreate}
              >
                <View className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center mr-3">
                  <Ionicons name="add" size={24} color="#6B7280" />
                </View>
                <Text className="text-base font-medium text-indigo-600 dark:text-indigo-400">
                  Create "{search}"
                </Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              className="flex-row items-center p-4 border-b border-gray-100 dark:border-gray-800"
              onPress={() => onSelect(item)}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: `${item.color}20` }}
              >
                <Ionicons
                  name={item.icon as any}
                  size={20}
                  color={item.color}
                />
              </View>
              <Text className="text-base font-medium text-gray-900 dark:text-white">
                {item.name}
              </Text>
              {currentCategoryId === item.id && (
                <Ionicons
                  name="checkmark"
                  size={20}
                  color="#4F46E5"
                  style={{ marginLeft: "auto" }}
                />
              )}
            </TouchableOpacity>
          )}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
};
