import React from "react";
import { View, Text, Pressable } from "react-native";
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
    <View className="flex-1 justify-center items-center bg-white p-6">
      <View className="w-full max-w-sm">
        <View className="items-center mb-8">
          <Text className="text-3xl font-bold text-gray-900 mb-2">
            {step === "email" ? "Sign in" : "Enter Code"}
          </Text>
          <Text className="text-gray-500 text-center">
            {step === "email"
              ? "Enter your email to receive a one-time password"
              : `We sent a code to ${email}`}
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
            <Pressable onPress={reset} className="items-center mt-2">
              <Text className="text-blue-600 font-medium">
                Change email address
              </Text>
            </Pressable>
          </View>
        )}

        <Pressable onPress={() => router.back()} className="items-center mt-8">
          <Text className="text-gray-500">Back to login options</Text>
        </Pressable>
      </View>
    </View>
  );
}
