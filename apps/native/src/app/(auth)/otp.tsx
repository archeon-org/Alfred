import React, { useState } from "react";
import { View, Text, TextInput, Alert, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../../components/Button";
import { requestOtp, verifyOtp } from "../../services/api";
import { useAuth } from "../../context/AuthContext";

export default function OtpLogin() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");

  const [step, setStep] = useState<"email" | "otp">("email");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { signIn } = useAuth();

  const handleRequestOtp = async () => {
    if (!email) {
      Alert.alert("Error", "Please enter your email address");
      return;
    }

    setIsLoading(true);
    try {
      await requestOtp(email);
      setStep("otp");
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to request OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      Alert.alert("Error", "Please enter the complete 6-digit OTP code");
      return;
    }

    setIsLoading(true);
    try {
      const { accessToken } = await verifyOtp(email, otp);
      await signIn(accessToken);
      // Navigation is handled by AuthContext
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Invalid OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

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
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">
                Email Address
              </Text>
              <TextInput
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray-900"
                placeholder="name@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                // Keyboard & Autofill Config
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                autoCorrect={false}
              />
            </View>
            <Button
              title="Send Code"
              onPress={handleRequestOtp}
              isLoading={isLoading}
            />
          </View>
        ) : (
          <View className="gap-4">
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">
                Verification Code
              </Text>
              <TextInput
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray

-900 text-center text-2xl tracking-widest"
                placeholder="000000"
                value={otp}
                // Force numeric input only
                onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                maxLength={6}
                // Autofill Config
                textContentType="oneTimeCode" // iOS SMS Autofill
                autoComplete="sms-otp" // Android SMS Autofill
              />
            </View>
            <Button
              title="Verify & Sign In"
              onPress={handleVerifyOtp}
              isLoading={isLoading}
            />
            <TouchableOpacity
              onPress={() => {
                setStep("email");
                setOtp(""); // Clear OTP when going back
              }}
              className="items-center mt-2"
            >
              <Text className="text-blue-600 font-medium">
                Change email address
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          onPress={() => router.back()}
          className="items-center mt-8"
        >
          <Text className="text-gray-500">Back to login options</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
