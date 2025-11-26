import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
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
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-white dark:bg-gray-900">
        <View className="flex-row justify-between items-center p-4 border-b border-gray-100 dark:border-gray-800">
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            Add Tag
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
            placeholder="Search or create tag..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={onSearchChange}
            autoFocus
          />
        </View>

        <FlatList
          data={tags}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            search.trim().length > 0 ? (
              <TouchableOpacity
                className="flex-row items-center p-4"
                onPress={onCreate}
              >
                <View className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/20 items-center justify-center mr-3">
                  <Ionicons name="add" size={24} color="#4F46E5" />
                </View>
                <View>
                  <Text className="text-base font-medium text-gray-900 dark:text-white">
                    Create "{search}"
                  </Text>
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    Tap to create new tag
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View className="p-8 items-center">
                <Text className="text-gray-500 dark:text-gray-400">
                  No tags found
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            const isSelected = currentTagIds.includes(item.id);
            return (
              <TouchableOpacity
                className="flex-row items-center p-4 border-b border-gray-100 dark:border-gray-800"
                onPress={() => onSelect(item)}
                disabled={isSelected}
              >
                <View className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center mr-3">
                  <Ionicons name="pricetag-outline" size={20} color="#6B7280" />
                </View>
                <Text className="text-base font-medium text-gray-900 dark:text-white flex-1">
                  {item.name}
                </Text>
                {isSelected && (
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    Added
                  </Text>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
};
