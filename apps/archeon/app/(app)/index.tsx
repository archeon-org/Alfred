import React from "react";
import { View, Text } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/Button";

export default function HomeScreen() {
  const { user, signOut } = useAuth();

  return (
    <View className="flex-1 justify-center items-center bg-white p-6">
      <Text className="text-2xl font-bold mb-4">
        Welcome, {user?.firstName}!
      </Text>
      <Text className="text-gray-600 mb-8">{user?.email}</Text>

      <Button
        title="Sign Out"
        onPress={signOut}
        variant="outline"
        className="w-full max-w-xs"
      />
    </View>
  );
}
