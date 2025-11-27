import React from "react";
import { TouchableOpacity, Text, ActivityIndicator, View } from "react-native";
import { GoogleIcon } from "./icons/GoogleIcon";
import { shadows } from "../constants/shadows";

interface GoogleButtonProps {
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  title?: string;
}

export const GoogleButton: React.FC<GoogleButtonProps> = ({
  onPress,
  isLoading = false,
  disabled = false,
  title = "Continue with Google",
}) => {
  const isDisabled = isLoading || disabled;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      className="flex-row items-center justify-center bg-white rounded-2xl px-6 py-4 border border-gray-100"
      style={[shadows.md, isDisabled && { opacity: 0.6 }]}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color="#6366F1" />
      ) : (
        <>
          <View className="mr-3">
            <GoogleIcon size={22} />
          </View>
          <Text className="text-base font-semibold text-gray-900">{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};
