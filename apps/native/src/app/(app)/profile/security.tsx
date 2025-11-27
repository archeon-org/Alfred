import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { useBiometric } from "../../../context/BiometricContext";

export default function SecurityScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const {
    isSupported,
    isEnrolled,
    biometricType,
    isEnabled,
    enableBiometric,
    disableBiometric,
  } = useBiometric();

  const [isToggling, setIsToggling] = useState(false);

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
        return "Biometric Lock";
    }
  };

  const handleToggleBiometric = async () => {
    if (isToggling) return;

    setIsToggling(true);
    try {
      if (isEnabled) {
        // Disable biometric
        await disableBiometric();
      } else {
        // Enable biometric
        const success = await enableBiometric();
        if (!success) {
          Alert.alert(
            "Authentication Failed",
            "Could not enable biometric authentication. Please try again."
          );
        }
      }
    } catch (error) {
      console.error("Error toggling biometric:", error);
    } finally {
      setIsToggling(false);
    }
  };

  const renderBiometricNotAvailable = () => {
    return (
      <View className="items-center px-6 py-12">
        <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-surface dark:bg-surface-dark">
          <Ionicons
            name="lock-closed-outline"
            size={40}
            color={isDark ? "#9CA3AF" : "#6B7280"}
          />
        </View>
        <Text className="mb-2 text-center text-lg font-bold text-gray-900 dark:text-white">
          Biometric Not Available
        </Text>
        <Text className="text-center text-gray-500 dark:text-gray-400">
          {!isSupported
            ? "Your device doesn't support biometric authentication."
            : "Please set up Face ID or Touch ID in your device settings first to use this feature."}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top", "bottom"]}
    >
      <View className="flex-1">
        {/* Header */}
        <View className="flex-row items-center border-b border-gray-100 px-4 py-4 dark:border-gray-700">
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-surface dark:bg-surface-dark"
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={isDark ? "#FFFFFF" : "#111827"}
            />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-900 dark:text-white">
            Security
          </Text>
        </View>

        <View className="flex-1 p-4">
          {!isSupported || !isEnrolled ? (
            renderBiometricNotAvailable()
          ) : (
            <>
              {/* Biometric Section */}
              <View className="mb-6">
                <Text className="mb-3 px-1 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  App Lock
                </Text>

                <View className="overflow-hidden rounded-2xl bg-surface dark:bg-surface-dark">
                  {/* Biometric Toggle */}
                  <View className="flex-row items-center justify-between border-b border-gray-100 p-4 dark:border-gray-700">
                    <View className="flex-1 flex-row items-center">
                      <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/30">
                        <Ionicons
                          name={getBiometricIcon() as any}
                          size={22}
                          color="#6366F1"
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-base font-semibold text-gray-900 dark:text-white">
                          {getBiometricLabel()}
                        </Text>
                        <Text className="text-sm text-gray-500 dark:text-gray-400">
                          Require authentication to open app
                        </Text>
                      </View>
                    </View>
                    <Switch
                      value={isEnabled}
                      onValueChange={handleToggleBiometric}
                      disabled={isToggling}
                      trackColor={{ false: "#E5E7EB", true: "#6366F1" }}
                      thumbColor="#FFFFFF"
                      ios_backgroundColor="#E5E7EB"
                    />
                  </View>

                  {/* Info */}
                  <View className="p-4">
                    <View className="flex-row items-start">
                      <Ionicons
                        name="information-circle"
                        size={18}
                        color={isDark ? "#9CA3AF" : "#6B7280"}
                        style={{ marginRight: 8, marginTop: 2 }}
                      />
                      <Text className="flex-1 text-sm leading-5 text-gray-500 dark:text-gray-400">
                        When enabled, you'll need to authenticate using{" "}
                        {getBiometricLabel()} every time you open the app.
                        There's a 30-second grace period for quick app switches.
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Additional Security Options (placeholder for future features) */}
              <View className="mb-6">
                <Text className="mb-3 px-1 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  More Options
                </Text>

                <View className="overflow-hidden rounded-2xl bg-surface dark:bg-surface-dark">
                  <View className="flex-row items-center p-4 opacity-50">
                    <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-accent-50 dark:bg-accent-500/20">
                      <Ionicons name="time-outline" size={22} color="#F59E0B" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-gray-900 dark:text-white">
                        Auto-Lock Timer
                      </Text>
                      <Text className="text-sm text-gray-500 dark:text-gray-400">
                        Coming soon
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={isDark ? "#6B7280" : "#9CA3AF"}
                    />
                  </View>
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
