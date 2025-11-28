import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEditProfileLogic } from "../../../hooks/useEditProfileLogic";
import { ControlledInput } from "../../../components/ControlledInput";
import { Button } from "../../../components/Button";
import { useUser } from "../../../hooks/useUser";
import { shadows } from "../../../constants/shadows";

export default function EditProfileScreen() {
  const router = useRouter();
  const { control, handleSave, isUpdating } = useEditProfileLogic();
  const { data: user } = useUser();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top"]}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-2">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
        </TouchableOpacity>
        <View className="flex-1 items-center">
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            Edit Profile
          </Text>
        </View>
        <View className="w-10" />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile Photo Section */}
          <View className="items-center py-6">
            <TouchableOpacity activeOpacity={0.8}>
              <View className="relative">
                <View
                  className="w-28 h-28 bg-indigo-100 dark:bg-indigo-900/30 rounded-full items-center justify-center overflow-hidden border-4 border-white dark:border-gray-800"
                  style={shadows.lg}
                >
                  {user?.profilePicture ? (
                    <Image
                      source={{ uri: user.profilePicture }}
                      className="w-full h-full"
                    />
                  ) : (
                    <Text className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">
                      {user?.firstName?.[0]}
                      {user?.lastName?.[0]}
                    </Text>
                  )}
                </View>
                <View
                  className="absolute bottom-0 right-0 w-10 h-10 bg-indigo-600 rounded-full items-center justify-center border-4 border-white dark:border-gray-900"
                  style={shadows.md}
                >
                  <Ionicons name="camera" size={18} color="white" />
                </View>
              </View>
            </TouchableOpacity>
            <Text className="text-indigo-600 dark:text-indigo-400 font-semibold text-sm mt-3">
              Change Photo
            </Text>
          </View>

          {/* Personal Information Section */}
          <View className="px-5 mb-6">
            <View className="flex-row items-center gap-2 mb-4">
              <View className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg items-center justify-center">
                <Ionicons name="person" size={16} color="#6366F1" />
              </View>
              <Text className="text-base font-bold text-gray-900 dark:text-white">
                Personal Information
              </Text>
            </View>

            <View className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 gap-4">
              <ControlledInput
                control={control}
                name="email"
                label="Email Address"
                placeholder="your@email.com"
                editable={false}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <ControlledInput
                    control={control}
                    name="firstName"
                    label="First Name"
                    placeholder="John"
                    autoCapitalize="words"
                  />
                </View>
                <View className="flex-1">
                  <ControlledInput
                    control={control}
                    name="lastName"
                    label="Last Name"
                    placeholder="Doe"
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <ControlledInput
                control={control}
                name="phone"
                label="Phone Number"
                placeholder="+1 (555) 000-0000"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Address Section */}
          <View className="px-5 mb-6">
            <View className="flex-row items-center gap-2 mb-4">
              <View className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg items-center justify-center">
                <Ionicons name="location" size={16} color="#10B981" />
              </View>
              <Text className="text-base font-bold text-gray-900 dark:text-white">
                Address
              </Text>
            </View>

            <View className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 gap-4">
              <ControlledInput
                control={control}
                name="street"
                label="Street Address"
                placeholder="123 Main Street"
                autoCapitalize="words"
              />

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <ControlledInput
                    control={control}
                    name="city"
                    label="City"
                    placeholder="New York"
                    autoCapitalize="words"
                  />
                </View>
                <View className="flex-1">
                  <ControlledInput
                    control={control}
                    name="state"
                    label="State"
                    placeholder="NY"
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <ControlledInput
                    control={control}
                    name="zipCode"
                    label="ZIP Code"
                    placeholder="10001"
                    keyboardType="number-pad"
                  />
                </View>
                <View className="flex-1">
                  <ControlledInput
                    control={control}
                    name="country"
                    label="Country"
                    placeholder="USA"
                    autoCapitalize="words"
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Danger Zone */}
          <View className="px-5">
            <View className="flex-row items-center gap-2 mb-4">
              <View className="w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded-lg items-center justify-center">
                <Ionicons name="warning" size={16} color="#EF4444" />
              </View>
              <Text className="text-base font-bold text-gray-900 dark:text-white">
                Danger Zone
              </Text>
            </View>

            <View className="bg-red-50 dark:bg-red-900/10 rounded-2xl p-4 border border-red-100 dark:border-red-900/30">
              <TouchableOpacity className="flex-row items-center justify-between py-2">
                <View className="flex-1">
                  <Text className="text-red-600 dark:text-red-400 font-semibold">
                    Delete Account
                  </Text>
                  <Text className="text-red-500/70 dark:text-red-400/70 text-xs mt-0.5">
                    Permanently delete your account and all data
                  </Text>
                </View>
                <View className="w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded-full items-center justify-center">
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Fixed Save Button */}
        <View className="absolute bottom-0 left-0 right-0 p-5 bg-background dark:bg-background-dark border-t border-gray-100 dark:border-gray-800">
          <Button
            onPress={handleSave}
            isLoading={isUpdating}
            disabled={isUpdating}
            title="Save Changes"
            icon={<Ionicons name="checkmark" size={20} color="white" />}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
