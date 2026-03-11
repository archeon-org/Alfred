import React from "react";
import { View, Text, TouchableOpacity, Switch, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import { useUser, useUpdateUser } from "../../../hooks/useUser";
import { getPreferencesWithDefaults } from "@archeon-org/types";

interface SettingItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBgColor: string;
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

const SettingItem: React.FC<SettingItemProps> = ({
  icon,
  iconColor,
  iconBgColor,
  title,
  description,
  value,
  onValueChange,
  disabled,
}) => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <View className="flex-row items-center p-4 bg-surface dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-700">
      <View
        className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${iconBgColor}`}
      >
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View className="flex-1 mr-3">
        <Text className="text-base font-semibold text-gray-900 dark:text-white mb-0.5">
          {title}
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{
          false: isDark ? "#374151" : "#D1D5DB",
          true: "#6366F1",
        }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
};

export default function PreferencesScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const { data: user } = useUser();
  const { mutate: updateUser, isPending } = useUpdateUser();

  // Get preferences with defaults
  const prefs = getPreferencesWithDefaults(user?.preferences);

  const handleUpdatePreference = (
    category: "home" | "notifications" | "display",
    key: string,
    value: boolean,
  ) => {
    updateUser({
      preferences: {
        [category]: {
          [key]: value,
        },
      },
    });
  };

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top"]}
    >
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-surface dark:bg-surface-dark items-center justify-center"
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={isDark ? "#FFFFFF" : "#1F2937"}
          />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          Preferences
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerClassName="pb-8"
        showsVerticalScrollIndicator={false}
      >
        {/* Home Screen Section */}
        <View className="mb-6">
          <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 ml-1">
            Home Screen
          </Text>
          <View className="gap-3">
            <SettingItem
              icon="bulb-outline"
              iconColor="#F59E0B"
              iconBgColor="bg-amber-100 dark:bg-amber-900/20"
              title="Show Tips"
              description="Display helpful tips on the home screen"
              value={prefs.home.showTips}
              onValueChange={(value) =>
                handleUpdatePreference("home", "showTips", value)
              }
              disabled={isPending}
            />
          </View>
        </View>

        {/* Notifications Section */}
        <View className="mb-6">
          <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 ml-1">
            Notifications
          </Text>
          <View className="gap-3">
            <SettingItem
              icon="notifications-outline"
              iconColor="#6366F1"
              iconBgColor="bg-indigo-100 dark:bg-indigo-900/20"
              title="Push Notifications"
              description="Receive push notifications on your device"
              value={prefs.notifications.pushEnabled}
              onValueChange={(value) =>
                handleUpdatePreference("notifications", "pushEnabled", value)
              }
              disabled={isPending}
            />
            <SettingItem
              icon="mail-outline"
              iconColor="#3B82F6"
              iconBgColor="bg-blue-100 dark:bg-blue-900/20"
              title="Email Notifications"
              description="Receive updates via email"
              value={prefs.notifications.emailEnabled}
              onValueChange={(value) =>
                handleUpdatePreference("notifications", "emailEnabled", value)
              }
              disabled={isPending}
            />
            <SettingItem
              icon="checkmark-circle-outline"
              iconColor="#10B981"
              iconBgColor="bg-emerald-100 dark:bg-emerald-900/20"
              title="Classification Alerts"
              description="Notify when document classification is complete"
              value={prefs.notifications.onDocumentClassified}
              onValueChange={(value) =>
                handleUpdatePreference(
                  "notifications",
                  "onDocumentClassified",
                  value,
                )
              }
              disabled={isPending}
            />
            <SettingItem
              icon="alert-circle-outline"
              iconColor="#EF4444"
              iconBgColor="bg-red-100 dark:bg-red-900/20"
              title="Error Alerts"
              description="Notify when there are document processing errors"
              value={prefs.notifications.onDocumentError}
              onValueChange={(value) =>
                handleUpdatePreference(
                  "notifications",
                  "onDocumentError",
                  value,
                )
              }
              disabled={isPending}
            />
          </View>
        </View>

        {/* Display Section */}
        <View className="mb-6">
          <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 ml-1">
            Display
          </Text>
          <View className="gap-3">
            <SettingItem
              icon="list-outline"
              iconColor="#8B5CF6"
              iconBgColor="bg-purple-100 dark:bg-purple-900/20"
              title="Compact Mode"
              description="Use a more compact layout for document lists"
              value={prefs.display.compactMode}
              onValueChange={(value) =>
                handleUpdatePreference("display", "compactMode", value)
              }
              disabled={isPending}
            />
          </View>
        </View>

        {/* Info Note */}
        <View className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
          <View className="flex-row items-start">
            <Ionicons
              name="information-circle"
              size={20}
              color={isDark ? "#6B7280" : "#9CA3AF"}
              style={{ marginRight: 8, marginTop: 1 }}
            />
            <Text className="flex-1 text-sm text-gray-500 dark:text-gray-400 leading-5">
              Your preferences are automatically saved and synced across all
              your devices.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
