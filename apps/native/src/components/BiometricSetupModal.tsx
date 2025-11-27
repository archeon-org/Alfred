import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useBiometric } from "../context/BiometricContext";

interface BiometricSetupModalProps {
  visible: boolean;
  onComplete: (enabled: boolean) => void;
  biometricType?: "faceid" | "fingerprint" | "iris" | null;
}

export const BiometricSetupModal: React.FC<BiometricSetupModalProps> = ({
  visible,
  onComplete,
  biometricType: propBiometricType,
}) => {
  const {
    biometricType: contextBiometricType,
    isSupported,
    isEnrolled,
  } = useBiometric();
  const [isEnabling, setIsEnabling] = useState(false);

  // Use prop if provided, otherwise fallback to context
  const biometricType = propBiometricType ?? contextBiometricType;

  if (!visible) return null;

  const getBiometricIcon = () => {
    switch (biometricType) {
      case "faceid":
        return "scan-outline";
      case "fingerprint":
        return "finger-print-outline";
      default:
        return "lock-closed-outline";
    }
  };

  const getBiometricLabel = () => {
    switch (biometricType) {
      case "faceid":
        return "Face ID";
      case "fingerprint":
        return Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
      default:
        return "Biometric Authentication";
    }
  };

  const handleEnable = async () => {
    setIsEnabling(true);
    try {
      // Just call onComplete with true, the parent will handle enabling
      onComplete(true);
    } finally {
      setIsEnabling(false);
    }
  };

  const handleSkip = () => {
    onComplete(false);
  };

  // If biometrics not supported or not enrolled, show different UI
  if (!isSupported || !isEnrolled) {
    return (
      <View className="absolute inset-0 z-50 items-center justify-center bg-black/90 px-6">
        <View className="w-full max-w-sm rounded-3xl bg-white p-8 dark:bg-gray-900">
          <View className="mb-6 items-center">
            <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <Ionicons name="lock-closed-outline" size={40} color="#6B7280" />
            </View>
            <Text className="text-center text-xl font-bold text-gray-900 dark:text-white">
              Biometric Not Available
            </Text>
            <Text className="mt-2 text-center text-gray-500 dark:text-gray-400">
              {!isSupported
                ? "Your device doesn't support biometric authentication."
                : "Please set up Face ID or Touch ID in your device settings first."}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleSkip}
            className="items-center rounded-xl bg-indigo-600 py-4"
          >
            <Text className="text-base font-bold text-white">Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="absolute inset-0 z-50 items-center justify-center bg-black/90 px-6">
      <View className="w-full max-w-sm rounded-3xl bg-white p-8 dark:bg-gray-900">
        {/* Icon */}
        <View className="mb-6 items-center">
          <View className="mb-4 h-24 w-24 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
            <Ionicons
              name={getBiometricIcon() as any}
              size={48}
              color="#6366F1"
            />
          </View>
          <Text className="text-center text-2xl font-bold text-gray-900 dark:text-white">
            Enable {getBiometricLabel()}
          </Text>
          <Text className="mt-2 text-center leading-6 text-gray-500 dark:text-gray-400">
            Protect your sensitive documents with{" "}
            {biometricType === "faceid" ? "Face ID" : "fingerprint"}{" "}
            authentication. Quick, secure, and convenient.
          </Text>
        </View>

        {/* Features */}
        <View className="mb-8 space-y-3">
          <View className="flex-row items-center">
            <View className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <Ionicons name="shield-checkmark" size={16} color="#10B981" />
            </View>
            <Text className="flex-1 text-gray-700 dark:text-gray-300">
              Secure access to your documents
            </Text>
          </View>
          <View className="flex-row items-center">
            <View className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
              <Ionicons name="flash" size={16} color="#6366F1" />
            </View>
            <Text className="flex-1 text-gray-700 dark:text-gray-300">
              Instant unlock with {getBiometricLabel()}
            </Text>
          </View>
          <View className="flex-row items-center">
            <View className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Ionicons name="eye-off" size={16} color="#F59E0B" />
            </View>
            <Text className="flex-1 text-gray-700 dark:text-gray-300">
              Privacy when app is in background
            </Text>
          </View>
        </View>

        {/* Buttons */}
        <View className="space-y-3">
          <TouchableOpacity
            onPress={handleEnable}
            disabled={isEnabling}
            className="flex-row items-center justify-center gap-2 rounded-xl bg-indigo-600 py-4"
            style={{ opacity: isEnabling ? 0.7 : 1 }}
          >
            {isEnabling ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons
                  name={getBiometricIcon() as any}
                  size={20}
                  color="white"
                />
                <Text className="text-base font-bold text-white">
                  Enable {getBiometricLabel()}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSkip}
            disabled={isEnabling}
            className="items-center rounded-xl py-4"
          >
            <Text className="font-medium text-gray-500 dark:text-gray-400">
              Skip for now
            </Text>
          </TouchableOpacity>
        </View>

        {/* Note */}
        <Text className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
          You can enable this later in Settings → Security
        </Text>
      </View>
    </View>
  );
};
