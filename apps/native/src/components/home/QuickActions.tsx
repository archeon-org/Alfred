import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { uploadDocument } from "../../services/document";
import { Alert } from "react-native";
import { showError } from "../../utils/apiError";

export const QuickActions = () => {
  const router = useRouter();

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      // Navigate to Scan screen with the URI to trigger the preview/classification workflow
      router.push({
        pathname: "/(app)/scan",
        params: { initialDocUri: result.assets[0].uri },
      });
    } catch (error) {
      console.error(error);
      showError(error, "Failed to pick document");
    }
  };

  const actions = [
    {
      label: "Upload",
      icon: "cloud-upload",
      color: "bg-primary",
      onPress: handleUpload,
    },
    {
      label: "Scan",
      icon: "scan",
      color: "bg-secondary",
      onPress: () => router.push("/(app)/scan"),
    },
    {
      label: "Search",
      icon: "search",
      color: "bg-accent",
      onPress: () => router.push("/(app)/documents"),
    },
    {
      label: "Categories",
      icon: "folder-open",
      color: "bg-violet-500",
      onPress: () => router.push("/(app)/categories"),
    },
  ];

  return (
    <View className="flex-row justify-between mb-8 px-2">
      {actions.map((action, index) => (
        <TouchableOpacity
          key={index}
          onPress={action.onPress}
          className="items-center gap-3"
          activeOpacity={0.7}
        >
          <View
            className={`w-16 h-16 rounded-3xl items-center justify-center shadow-lg shadow-gray-200 dark:shadow-none ${action.color}`}
          >
            <Ionicons name={action.icon as any} size={28} color="white" />
          </View>
          <Text className="text-xs font-bold text-gray-700 dark:text-gray-300">
            {action.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
