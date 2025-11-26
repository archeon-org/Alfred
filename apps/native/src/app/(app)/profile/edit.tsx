import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEditProfileLogic } from "../../../hooks/useEditProfileLogic";
import { ControlledInput } from "../../../components/ControlledInput";
import { Button } from "../../../components/Button";

export default function EditProfileScreen() {
  const router = useRouter();
  const { control, handleSave, isUpdating } = useEditProfileLogic();

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          Edit Profile
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1">
        <View className="items-center py-8 bg-surface dark:bg-surface-dark mb-6 border-b border-gray-100 dark:border-gray-800">
          <View className="w-24 h-24 bg-indigo-100 dark:bg-indigo-900/30 rounded-full items-center justify-center mb-3 border-4 border-white dark:border-gray-800 shadow-sm">
            <Ionicons name="person" size={40} color="#4F46E5" />
            <View className="absolute bottom-0 right-0 bg-indigo-600 p-2 rounded-full border-2 border-white dark:border-gray-800">
              <Ionicons name="camera" size={14} color="white" />
            </View>
          </View>
          <Text className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
            Change Profile Photo
          </Text>
        </View>

        <View className="px-4 pb-8 space-y-6">
          <View className="bg-surface dark:bg-surface-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-4">
            <Text className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-2">
              Personal Information
            </Text>

            <ControlledInput
              control={control}
              name="email"
              label="Email Address"
              placeholder="your@email.com"
              editable={false}
            />

            <View className="flex-row gap-4">
              <View className="flex-1">
                <ControlledInput
                  control={control}
                  name="firstName"
                  label="First Name"
                  placeholder="First name"
                />
              </View>
              <View className="flex-1">
                <ControlledInput
                  control={control}
                  name="lastName"
                  label="Last Name"
                  placeholder="Last name"
                />
              </View>
            </View>

            <ControlledInput
              control={control}
              name="phone"
              label="Phone Number"
              placeholder="Enter your phone number"
              keyboardType="phone-pad"
            />
          </View>

          <View className="bg-surface dark:bg-surface-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-4">
            <Text className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-2">
              Address
            </Text>

            <ControlledInput
              control={control}
              name="street"
              label="Street Address"
              placeholder="Enter your street address"
            />

            <View className="flex-row gap-4">
              <View className="flex-1">
                <ControlledInput
                  control={control}
                  name="city"
                  label="City"
                  placeholder="City"
                />
              </View>
              <View className="flex-1">
                <ControlledInput
                  control={control}
                  name="state"
                  label="State / Province"
                  placeholder="State"
                />
              </View>
            </View>

            <View className="flex-row gap-4">
              <View className="flex-1">
                <ControlledInput
                  control={control}
                  name="zipCode"
                  label="ZIP / Postal Code"
                  placeholder="ZIP Code"
                />
              </View>
              <View className="flex-1">
                <ControlledInput
                  control={control}
                  name="country"
                  label="Country"
                  placeholder="Country"
                />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <View className="p-4 bg-surface dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800">
        <Button
          onPress={handleSave}
          isLoading={isUpdating}
          disabled={isUpdating}
          title="Save Changes"
        />
      </View>
    </SafeAreaView>
  );
}
