import React from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { Button } from "../../components/Button";
import { useGoogleLogin } from "../../hooks/useGoogleLogin";

export default function Login() {
  const { promptAsync, request, isLoading } = useGoogleLogin();
  const router = useRouter();
  const isExpoGo = Constants.appOwnership === "expo";

  return (
    <View className="flex-1 justify-center items-center bg-white p-6">
      <View className="items-center mb-12">
        <Text className="text-4xl font-bold text-gray-900 mb-2">Archeon</Text>
        <Text className="text-gray-500 text-lg">Welcome back!</Text>
      </View>

      <View className="w-full max-w-sm gap-4">
        <Button
          title="Sign in with Google"
          onPress={() => promptAsync()}
          isLoading={isLoading || !request}
          className="w-full"
        />

        {isExpoGo && (
          <>
            <View className="flex-row items-center my-2">
              <View className="flex-1 h-px bg-gray-200" />
              <Text className="mx-4 text-gray-400">OR</Text>
              <View className="flex-1 h-px bg-gray-200" />
            </View>

            <Button
              title="Continue with Email"
              onPress={() => router.push("/(auth)/otp")}
              variant="outline"
              className="w-full"
            />
          </>
        )}
      </View>
    </View>
  );
}
