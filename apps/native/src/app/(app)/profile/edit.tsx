import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser, useUpdateUser } from "../../../hooks/useUser";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import colors from "tailwindcss/colors";
import { Ionicons } from "@expo/vector-icons";

export default function EditProfileScreen() {
  const router = useRouter();
  const { data: user } = useUser();
  const updateUserMutation = useUpdateUser();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("");

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setPhone(user.phone || "");
      if (user.address) {
        setStreet(user.address.street || "");
        setCity(user.address.city || "");
        setState(user.address.state || "");
        setZipCode(user.address.zipCode || "");
        setCountry(user.address.country || "");
      }
    }
  }, [user]);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert("Error", "First name and last name are required");
      return;
    }

    updateUserMutation.mutate(
      {
        firstName,
        lastName,
        phone,
        address: {
          street,
          city,
          state,
          zipCode,
          country,
        },
      },
      {
        onSuccess: () => {
          Alert.alert("Success", "Profile updated successfully");
          router.back();
        },
        onError: (error) => {
          Alert.alert("Error", "Failed to update profile");
          console.error(error);
        },
      }
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black" edges={["bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView className="flex-1 p-4">
          <View className="mb-6">
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              First Name
            </Text>
            <TextInput
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-black dark:text-white"
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Enter your first name"
              placeholderTextColor={colors.gray[400]}
            />
          </View>

          <View className="mb-6">
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Last Name
            </Text>
            <TextInput
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-black dark:text-white"
              value={lastName}
              onChangeText={setLastName}
              placeholder="Enter your last name"
              placeholderTextColor={colors.gray[400]}
            />
          </View>

          <View className="mb-6">
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Phone Number
            </Text>
            <TextInput
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-black dark:text-white"
              value={phone}
              onChangeText={setPhone}
              placeholder="Enter your phone number"
              placeholderTextColor={colors.gray[400]}
              keyboardType="phone-pad"
            />
          </View>

          <View className="mb-6">
            <Text className="text-lg font-bold text-black dark:text-white mb-4">
              Address
            </Text>

            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Street
              </Text>
              <TextInput
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-black dark:text-white"
                value={street}
                onChangeText={setStreet}
                placeholder="Street Address"
                placeholderTextColor={colors.gray[400]}
              />
            </View>

            <View className="flex-row space-x-4 mb-4">
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  City
                </Text>
                <TextInput
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-black dark:text-white"
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                  placeholderTextColor={colors.gray[400]}
                />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  State
                </Text>
                <TextInput
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-black dark:text-white"
                  value={state}
                  onChangeText={setState}
                  placeholder="State"
                  placeholderTextColor={colors.gray[400]}
                />
              </View>
            </View>

            <View className="flex-row space-x-4">
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Zip Code
                </Text>
                <TextInput
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-black dark:text-white"
                  value={zipCode}
                  onChangeText={setZipCode}
                  placeholder="Zip Code"
                  placeholderTextColor={colors.gray[400]}
                />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Country
                </Text>
                <TextInput
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-black dark:text-white"
                  value={country}
                  onChangeText={setCountry}
                  placeholder="Country"
                  placeholderTextColor={colors.gray[400]}
                />
              </View>
            </View>
          </View>
        </ScrollView>

        <View className="p-4 border-t border-gray-100 dark:border-gray-900">
          <TouchableOpacity
            onPress={handleSave}
            disabled={updateUserMutation.isPending}
            className={`w-full bg-blue-600 p-4 rounded-xl items-center justify-center ${
              updateUserMutation.isPending ? "opacity-70" : ""
            }`}
          >
            {updateUserMutation.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-lg">
                Save Changes
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
