import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useBiometric } from "../context/BiometricContext";

interface BiometricLockScreenProps {
  onUnlock?: () => void;
}

export const BiometricLockScreen: React.FC<BiometricLockScreenProps> = ({
  onUnlock,
}) => {
  const { biometricType, authenticate, unlock, isLocked } = useBiometric();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Auto-trigger authentication when lock screen appears
  useEffect(() => {
    if (isLocked) {
      handleAuthenticate();
    }
  }, [isLocked]);

  const handleAuthenticate = async () => {
    if (isAuthenticating) return;

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const success = await authenticate();
      if (success) {
        unlock();
        onUnlock?.();
      } else {
        setAuthError("Authentication failed. Please try again.");
      }
    } catch (error) {
      setAuthError("An error occurred. Please try again.");
    } finally {
      setIsAuthenticating(false);
    }
  };

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
        return "Biometric";
    }
  };

  if (!isLocked) return null;

  return (
    <View className="absolute inset-0 z-50 items-center justify-center bg-black/95">
      {/* App Icon */}
      <View className="mb-8">
        <View className="w-24 h-24 rounded-3xl bg-indigo-600 items-center justify-center shadow-2xl">
          <Ionicons name="documents" size={48} color="white" />
        </View>
      </View>

      {/* Title */}
      <Text className="text-white text-2xl font-bold mb-2">Archeon</Text>
      <Text className="text-gray-400 text-base mb-12">
        Your documents are protected
      </Text>

      {/* Biometric Icon */}
      <View className="mb-8">
        {isAuthenticating ? (
          <ActivityIndicator size="large" color="#6366F1" />
        ) : (
          <View className="w-20 h-20 rounded-full bg-indigo-600/20 items-center justify-center">
            <Ionicons
              name={getBiometricIcon() as any}
              size={40}
              color="#6366F1"
            />
          </View>
        )}
      </View>

      {/* Error Message */}
      {authError && (
        <View className="mb-6 px-6">
          <Text className="text-red-400 text-center text-sm">{authError}</Text>
        </View>
      )}

      {/* Authenticate Button */}
      <TouchableOpacity
        onPress={handleAuthenticate}
        disabled={isAuthenticating}
        className="bg-indigo-600 px-8 py-4 rounded-2xl flex-row items-center gap-2"
        style={{
          opacity: isAuthenticating ? 0.7 : 1,
        }}
      >
        <Ionicons name={getBiometricIcon() as any} size={22} color="white" />
        <Text className="text-white font-bold text-base">
          {isAuthenticating
            ? "Authenticating..."
            : `Use ${getBiometricLabel()}`}
        </Text>
      </TouchableOpacity>

      {/* Hint */}
      <Text className="text-gray-500 text-sm mt-8 text-center px-8">
        {biometricType === "faceid"
          ? "Look at your device to unlock"
          : "Place your finger on the sensor to unlock"}
      </Text>
    </View>
  );
};
