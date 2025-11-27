import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { ControlledInput } from "../../components/ControlledInput";
import { useOtpLogin } from "../../hooks/useOtpLogin";

export default function OtpLogin() {
  const {
    control,
    step,
    isLoading,
    handleRequestOtp,
    handleVerifyOtp,
    reset,
    router,
    email,
  } = useOtpLogin();

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
        <View className="w-full max-w-sm">
          {/* Header */}
          <View className="items-center mb-8">
            <View
              className={`w-16 h-16 rounded-2xl items-center justify-center mb-4 ${
                step === "email"
                  ? "bg-primary-50 dark:bg-primary-900/30"
                  : "bg-secondary-50 dark:bg-secondary-900/30"
              }`}
            >
              <Ionicons
                name={step === "email" ? "mail-outline" : "key-outline"}
                size={32}
                color={step === "email" ? "#6366F1" : "#14B8A6"}
              />
            </View>
            <Text className="text-2xl font-bold text-center mb-2 text-gray-900 dark:text-white">
              {step === "email"
                ? "Sign in with Email"
                : "Enter Verification Code"}
            </Text>
            <Text className="text-base text-center text-gray-500 dark:text-gray-400">
              {step === "email"
                ? "We'll send you a one-time code to verify your identity"
                : `We sent a 6-digit code to ${email}`}
            </Text>
          </View>

          {step === "email" ? (
            <View className="gap-4">
              <ControlledInput
                control={control}
                name="email"
                label="Email Address"
                placeholder="name@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                autoCorrect={false}
              />
              <Button
                title="Send Code"
                onPress={handleRequestOtp}
                isLoading={isLoading}
              />
            </View>
          ) : (
            <View className="gap-4">
              <ControlledInput
                control={control}
                name="otp"
                label="Verification Code"
                placeholder="000000"
                keyboardType="number-pad"
                maxLength={6}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                className="text-center text-2xl tracking-widest"
              />
              <Button
                title="Verify & Sign In"
                onPress={handleVerifyOtp}
                isLoading={isLoading}
              />
              <TouchableOpacity
                onPress={reset}
                activeOpacity={0.7}
                className="items-center mt-2"
              >
                <Text className="font-medium text-primary">
                  Use a different email
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
