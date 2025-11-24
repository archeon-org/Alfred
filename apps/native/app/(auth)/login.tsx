import React from "react";
import { View, Text, Image } from "react-native";
import { Button } from "../../src/components/Button";
import { useGoogleLogin } from "../../src/hooks/useGoogleLogin";
import { useAuth } from "../../src/context/AuthContext";

export default function Login() {
  const { promptAsync, request, isLoading } = useGoogleLogin();
  const { signIn } = useAuth();

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

        {__DEV__ && (
          <Button
            title="Dev Login (Bypass)"
            onPress={() => signIn("dev-token")}
            variant="secondary"
            className="w-full"
          />
        )}
      </View>
    </View>
  );
}
