import React from "react";
import { View, Text, Platform, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { GoogleButton } from "../../components/GoogleButton";
import { Button } from "../../components/Button";
import { useGoogleLogin } from "../../hooks/useGoogleLogin";

export default function Login() {
  const { promptAsync, request, isLoading } = useGoogleLogin();
  const router = useRouter();
  const isExpoGo = Constants.appOwnership === "expo";

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top", "bottom"]}
    >
      {/* Back Button */}
      <View className="px-4 py-2">
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          className="w-10 h-10 rounded-full items-center justify-center bg-gray-100 dark:bg-gray-800"
        >
          <Ionicons name="chevron-back" size={24} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View className="flex-1 justify-center items-center px-6">
        {/* Header */}
        <View className="items-center mb-12">
          <View className="w-20 h-20 rounded-2xl items-center justify-center mb-6 bg-primary-50 dark:bg-primary-900/30">
            <Ionicons name="documents" size={40} color="#6366F1" />
          </View>
          <Text className="text-3xl font-bold text-center mb-2 text-gray-900 dark:text-white">
            Welcome to Archeon
          </Text>
          <Text className="text-base text-center max-w-xs text-gray-500 dark:text-gray-400">
            Sign in to access your documents and start organizing your digital
            archive
          </Text>
        </View>

        {/* Login Options */}
        <View className="w-full max-w-sm gap-4">
          {/* Google Button */}
          <GoogleButton
            onPress={() => promptAsync()}
            isLoading={isLoading}
            disabled={!request}
          />

          {/* Email OTP Option for Android / Expo Go */}
          {(Platform.OS === "android" ||
            (isExpoGo && Platform.OS === "ios")) && (
            <>
              <View className="flex-row items-center my-2">
                <View className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <Text className="mx-4 text-sm text-gray-400 dark:text-gray-500">
                  or
                </Text>
                <View className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              </View>

              <Button
                title="Continue with Email"
                onPress={() => router.push("/(auth)/otp")}
                variant="secondary"
                icon={
                  <Ionicons name="mail-outline" size={20} color="#6b7280" />
                }
                className="w-full"
              />
            </>
          )}
        </View>
      </View>

      {/* Footer */}
      <View className="px-6 pb-4 items-center">
        <Text className="text-center text-sm text-gray-400 dark:text-gray-500">
          By continuing, you agree to our{" "}
          <Text className="text-primary">Terms of Service</Text> and{" "}
          <Text className="text-primary">Privacy Policy</Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}
