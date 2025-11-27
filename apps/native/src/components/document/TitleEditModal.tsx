import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface TitleEditModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  onTitleChange: (title: string) => void;
  onSave: () => void;
  onGenerateAi: () => void;
  isSaving: boolean;
  isGenerating: boolean;
}

export const TitleEditModal = ({
  visible,
  onClose,
  title,
  onTitleChange,
  onSave,
  onGenerateAi,
  isSaving,
  isGenerating,
}: TitleEditModalProps) => {
  const isDisabled = isSaving || isGenerating;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white dark:bg-gray-900 rounded-t-3xl">
            {/* Header */}
            <View className="flex-row items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800">
              <TouchableOpacity
                onPress={onClose}
                disabled={isDisabled}
                className="p-2 -ml-2"
              >
                <Text className="text-gray-500 dark:text-gray-400 font-medium">
                  Cancel
                </Text>
              </TouchableOpacity>
              <Text className="text-lg font-bold text-gray-900 dark:text-white">
                Edit Title
              </Text>
              <TouchableOpacity
                onPress={onSave}
                disabled={isDisabled || !title.trim()}
                className="p-2 -mr-2"
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#4F46E5" />
                ) : (
                  <Text
                    className={`font-bold ${
                      title.trim()
                        ? "text-indigo-600 dark:text-indigo-400"
                        : "text-gray-300 dark:text-gray-600"
                    }`}
                  >
                    Save
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View className="p-4 space-y-4">
              {/* Title Input */}
              <View>
                <Text className="text-gray-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider mb-2">
                  Document Title
                </Text>
                <TextInput
                  value={title}
                  onChangeText={onTitleChange}
                  placeholder="Enter a descriptive title..."
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white text-base"
                  editable={!isDisabled}
                  maxLength={60}
                  autoFocus
                />
                <Text className="text-gray-400 dark:text-gray-500 text-xs mt-1 text-right">
                  {title.length}/60
                </Text>
              </View>

              {/* AI Generate Button */}
              <View className="pt-2">
                <Text className="text-gray-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider mb-2">
                  Or let AI help
                </Text>
                <TouchableOpacity
                  onPress={onGenerateAi}
                  disabled={isDisabled}
                  className={`flex-row items-center justify-center gap-2 py-3 rounded-xl border ${
                    isDisabled
                      ? "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      : "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800"
                  }`}
                >
                  {isGenerating ? (
                    <ActivityIndicator size="small" color="#4F46E5" />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={18} color="#4F46E5" />
                      <Text className="text-indigo-600 dark:text-indigo-400 font-bold">
                        Generate Title with AI
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text className="text-gray-400 dark:text-gray-500 text-xs mt-2 text-center">
                  AI will analyze your document and suggest a descriptive title
                </Text>
              </View>
            </View>

            {/* Bottom spacing for home indicator */}
            <View className="h-8" />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
