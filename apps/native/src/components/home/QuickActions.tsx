import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { shadows } from "../../constants/shadows";
import * as DocumentPicker from "expo-document-picker";
import { useToast } from "../../context/ToastContext";
import { parseApiError } from "../../utils/apiError";

interface QuickActionsProps {
  onSearchPress?: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  onSearchPress,
}) => {
  const router = useRouter();
  const { error: showError } = useToast();

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];

      // Navigate to Scan screen with the URI and filename to trigger the preview/classification workflow
      router.push({
        pathname: "/(app)/scan",
        params: {
          initialDocUri: asset.uri,
          initialDocName: asset.name,
        },
      });
    } catch (error) {
      console.error(error);
      const appError = parseApiError(error);
      showError("Failed to pick document", appError.message);
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
      icon: "sparkles",
      color: "bg-accent",
      onPress: onSearchPress || (() => router.push("/(app)/documents")),
    },
    {
      label: "Documents",
      icon: "documents",
      color: "bg-violet-500",
      onPress: () => router.push("/(app)/documents"),
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
            className={`w-16 h-16 rounded-3xl items-center justify-center ${action.color}`}
            style={shadows.lg}
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
