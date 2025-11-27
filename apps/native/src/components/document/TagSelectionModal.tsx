import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tag } from "@archeon-org/types";

interface TagSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  search: string;
  onSearchChange: (text: string) => void;
  tags: Tag[];
  onSelect: (tag: Tag) => void;
  onCreate: () => void;
  currentTagIds?: string[];
}

export const TagSelectionModal: React.FC<TagSelectionModalProps> = ({
  visible,
  onClose,
  search,
  onSearchChange,
  tags,
  onSelect,
  onCreate,
  currentTagIds = [],
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
              Add Tag
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
                placeholder="Search or create tag..."
                placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                value={search}
                onChangeText={onSearchChange}
                autoFocus
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

          {/* Tags List */}
          <FlatList
            data={tags}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              search.trim().length > 0 ? (
                <TouchableOpacity
                  className="flex-row items-center p-4 bg-primary/10 dark:bg-primary/20 rounded-2xl border border-primary/20"
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
                      Add as new tag
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#6366F1" />
                </TouchableOpacity>
              ) : (
                <View className="items-center py-12">
                  <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center mb-4">
                    <Ionicons
                      name="pricetags-outline"
                      size={32}
                      color={isDark ? "#6B7280" : "#9CA3AF"}
                    />
                  </View>
                  <Text className="text-gray-500 dark:text-gray-400 text-base">
                    No tags yet
                  </Text>
                  <Text className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                    Type to create a new tag
                  </Text>
                </View>
              )
            }
            renderItem={({ item }) => {
              const isSelected = currentTagIds.includes(item.id);
              return (
                <TouchableOpacity
                  className={`flex-row items-center p-4 mb-2 rounded-2xl border ${
                    isSelected
                      ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                      : "bg-surface dark:bg-surface-dark border-gray-100 dark:border-gray-800"
                  }`}
                  onPress={() => !isSelected && onSelect(item)}
                  activeOpacity={isSelected ? 1 : 0.7}
                  disabled={isSelected}
                >
                  <View
                    className={`w-12 h-12 rounded-xl items-center justify-center mr-3 ${
                      isSelected
                        ? "bg-emerald-100 dark:bg-emerald-900/40"
                        : "bg-gray-100 dark:bg-gray-800"
                    }`}
                  >
                    <Ionicons
                      name={isSelected ? "checkmark" : "pricetag-outline"}
                      size={22}
                      color={
                        isSelected ? "#10B981" : isDark ? "#9CA3AF" : "#6B7280"
                      }
                    />
                  </View>
                  <Text
                    className={`text-base font-semibold flex-1 ${
                      isSelected
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-gray-900 dark:text-white"
                    }`}
                  >
                    {item.name}
                  </Text>
                  {isSelected && (
                    <Text className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                      Added
                    </Text>
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
