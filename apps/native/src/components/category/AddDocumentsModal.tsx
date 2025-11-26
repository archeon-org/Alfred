import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Document } from "@archeon-org/types";

interface AddDocumentsModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: () => void;
  documents: Document[];
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  isLoading: boolean;
  isAdding: boolean;
}

export const AddDocumentsModal: React.FC<AddDocumentsModalProps> = ({
  visible,
  onClose,
  onAdd,
  documents,
  selectedIds,
  onToggleSelection,
  isLoading,
  isAdding,
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
          <TouchableOpacity onPress={onClose}>
            <Text className="text-gray-500 dark:text-gray-400 font-medium">
              Cancel
            </Text>
          </TouchableOpacity>
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            Add Documents
          </Text>
          <TouchableOpacity
            onPress={onAdd}
            disabled={selectedIds.size === 0 || isAdding}
          >
            {isAdding ? (
              <ActivityIndicator size="small" color="#4F46E5" />
            ) : (
              <Text
                className={`font-bold ${
                  selectedIds.size > 0
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-gray-300 dark:text-gray-600"
                }`}
              >
                Add ({selectedIds.size})
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
        ) : (
          <FlatList
            data={documents}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <TouchableOpacity
                  onPress={() => onToggleSelection(item.id)}
                  className={`flex-row items-center p-4 border-b border-gray-100 dark:border-gray-800 ${
                    isSelected ? "bg-indigo-50 dark:bg-indigo-900/20" : ""
                  }`}
                >
                  <View className="flex-1">
                    <Text className="font-medium text-gray-900 dark:text-white">
                      {item.title}
                    </Text>
                    <Text className="text-sm text-gray-500 dark:text-gray-400">
                      {item.category?.name || "Uncategorized"}
                    </Text>
                  </View>
                  <View
                    className={`w-6 h-6 rounded-full border items-center justify-center ${
                      isSelected
                        ? "bg-indigo-600 border-indigo-600"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark" size={16} color="white" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View className="items-center justify-center py-20">
                <Text className="text-gray-500 dark:text-gray-400">
                  No available documents to add
                </Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
};
