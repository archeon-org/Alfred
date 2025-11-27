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
  useColorScheme,
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
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
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
          className="bg-background dark:bg-background-dark rounded-t-3xl"
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
          <View className="flex-row items-center justify-between px-5 pb-4">
            <TouchableOpacity
              onPress={onClose}
              disabled={isDisabled}
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center"
            >
              <Ionicons
                name="close"
                size={18}
                color={isDark ? "#9CA3AF" : "#6B7280"}
              />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-gray-900 dark:text-white">
              Edit Title
            </Text>
            <TouchableOpacity
              onPress={onSave}
              disabled={isDisabled || !title.trim()}
              className={`px-4 py-2 rounded-xl ${
                title.trim() && !isDisabled
                  ? "bg-primary"
                  : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text
                  className={`font-bold ${
                    title.trim() && !isDisabled
                      ? "text-white"
                      : "text-gray-400 dark:text-gray-500"
                  }`}
                >
                  Save
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View className="px-5 pb-6">
            {/* Title Input */}
            <View className="mb-5">
              <Text className="text-gray-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider mb-2">
                Document Title
              </Text>
              <View className="bg-surface dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3">
                <TextInput
                  value={title}
                  onChangeText={onTitleChange}
                  placeholder="Enter a descriptive title..."
                  placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                  className="text-gray-900 dark:text-white text-base"
                  editable={!isDisabled}
                  maxLength={60}
                  autoFocus
                />
              </View>
              <Text className="text-gray-400 dark:text-gray-500 text-xs mt-2 text-right">
                {title.length}/60
              </Text>
            </View>

            {/* Divider */}
            <View className="flex-row items-center mb-5">
              <View className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <Text className="text-gray-400 dark:text-gray-500 text-xs mx-3">
                OR
              </Text>
              <View className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            </View>

            {/* AI Generate Button */}
            <TouchableOpacity
              onPress={onGenerateAi}
              disabled={isDisabled}
              className={`flex-row items-center justify-center gap-3 py-4 rounded-2xl ${
                isDisabled
                  ? "bg-gray-100 dark:bg-gray-800"
                  : "bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 border border-indigo-100 dark:border-indigo-800"
              }`}
              style={{
                backgroundColor: isDisabled
                  ? isDark
                    ? "#1F2937"
                    : "#F3F4F6"
                  : isDark
                    ? "rgba(99, 102, 241, 0.15)"
                    : "#EEF2FF",
              }}
            >
              {isGenerating ? (
                <ActivityIndicator size="small" color="#6366F1" />
              ) : (
                <>
                  <View className="w-10 h-10 rounded-xl bg-primary/20 items-center justify-center">
                    <Ionicons name="sparkles" size={20} color="#6366F1" />
                  </View>
                  <View>
                    <Text className="text-primary dark:text-primary font-bold text-base">
                      Generate with AI
                    </Text>
                    <Text className="text-gray-500 dark:text-gray-400 text-xs">
                      Analyze document & suggest title
                    </Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Bottom spacing for home indicator */}
          <View className="h-6" />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
