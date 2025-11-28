import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from "react-native";

interface InputModalProps {
  visible: boolean;
  title: string;
  message: string;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad";
  onCancel: () => void;
  onSubmit: (value: string) => void;
  submitLabel?: string;
  cancelLabel?: string;
}

export function InputModal({
  visible,
  title,
  message,
  placeholder = "",
  keyboardType = "default",
  onCancel,
  onSubmit,
  submitLabel = "Submit",
  cancelLabel = "Cancel",
}: InputModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [value, setValue] = useState("");

  // Reset value when modal opens
  useEffect(() => {
    if (visible) {
      setValue("");
    }
  }, [visible]);

  const handleSubmit = () => {
    onSubmit(value);
    setValue("");
  };

  const handleCancel = () => {
    setValue("");
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleCancel}
          className="flex-1 bg-black/50 justify-center items-center px-6"
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            className="w-full bg-white dark:bg-gray-900 rounded-2xl overflow-hidden"
          >
            <View className="p-5">
              <Text className="text-lg font-semibold text-gray-900 dark:text-white text-center mb-2">
                {title}
              </Text>
              <Text className="text-sm text-gray-600 dark:text-gray-400 text-center mb-4">
                {message}
              </Text>
              <TextInput
                value={value}
                onChangeText={setValue}
                placeholder={placeholder}
                placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                keyboardType={keyboardType}
                autoFocus
                className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-3 rounded-xl text-base"
              />
            </View>
            <View className="flex-row border-t border-gray-200 dark:border-gray-800">
              <TouchableOpacity
                onPress={handleCancel}
                className="flex-1 py-4 border-r border-gray-200 dark:border-gray-800"
              >
                <Text className="text-base text-gray-600 dark:text-gray-400 text-center font-medium">
                  {cancelLabel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSubmit} className="flex-1 py-4">
                <Text className="text-base text-indigo-600 dark:text-indigo-400 text-center font-semibold">
                  {submitLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}
