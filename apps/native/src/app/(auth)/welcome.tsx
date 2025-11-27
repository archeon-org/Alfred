import React from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";

const features = [
  {
    icon: "scan-outline" as const,
    title: "Smart Scanning",
    description: "Instantly capture and digitize your documents",
    color: "#6366F1",
    bgColor: "bg-primary-50 dark:bg-primary-900/20",
  },
  {
    icon: "folder-outline" as const,
    title: "Organize",
    description: "Keep everything sorted with categories & tags",
    color: "#14B8A6",
    bgColor: "bg-secondary-50 dark:bg-secondary-900/20",
  },
  {
    icon: "cloud-outline" as const,
    title: "Secure Storage",
    description: "Your documents, safely backed up in the cloud",
    color: "#F59E0B",
    bgColor: "bg-accent-50 dark:bg-accent-900/20",
  },
];

export default function Welcome() {
  const router = useRouter();

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top", "bottom"]}
    >
      {/* Hero Section */}
      <View className="flex-1 justify-center items-center px-6">
        {/* App Icon / Logo */}
        <View className="w-24 h-24 rounded-3xl items-center justify-center mb-6 bg-primary-50 dark:bg-primary-900/30">
          <Ionicons name="documents" size={48} color="#6366F1" />
        </View>

        {/* Title */}
        <Text className="text-4xl font-bold text-center mb-3 text-gray-900 dark:text-white">
          Archeon
        </Text>
        <Text className="text-lg text-center mb-10 max-w-xs text-gray-500 dark:text-gray-400">
          Your personal document vault.{"\n"}Scan, organize, and access
          anywhere.
        </Text>

        {/* Features */}
        <View className="w-full max-w-sm gap-4">
          {features.map((feature, index) => (
            <View
              key={index}
              className="flex-row items-center p-4 rounded-2xl bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800"
            >
              <View
                className={`w-12 h-12 rounded-xl items-center justify-center mr-4 ${feature.bgColor}`}
              >
                <Ionicons name={feature.icon} size={24} color={feature.color} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold mb-0.5 text-gray-900 dark:text-white">
                  {feature.title}
                </Text>
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  {feature.description}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Bottom Action */}
      <View className="px-6 pb-4">
        <Button
          title="Get Started"
          onPress={() => router.push("/(auth)/login")}
          className="w-full"
        />
        <Text className="text-center text-sm mt-4 text-gray-400 dark:text-gray-500">
          By continuing, you agree to our{" "}
          <Text className="text-primary" onPress={() => router.push("/terms")}>
            Terms
          </Text>{" "}
          &{" "}
          <Text
            className="text-primary"
            onPress={() => router.push("/privacy")}
          >
            Privacy Policy
          </Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}
