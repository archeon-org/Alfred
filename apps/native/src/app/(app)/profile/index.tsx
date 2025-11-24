import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../context/AuthContext";
import { useUser } from "../../../hooks/useUser";
import colors from "tailwindcss/colors";
import { useRouter } from "expo-router";

const formatBytes = (bytes: number, decimals = 2) => {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { data: user, isLoading } = useUser();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();

  const menuItems = [
    {
      icon: "person-outline",
      label: "Account Settings",
      onPress: () => router.push("/(app)/profile/edit"),
    },
    { icon: "notifications-outline", label: "Notifications" },
    { icon: "shield-checkmark-outline", label: "Privacy & Security" },
    { icon: "help-circle-outline", label: "Help & Support" },
  ];

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-black justify-center items-center">
        <ActivityIndicator size="large" color={colors.blue[500]} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <ScrollView className="p-4">
        <Text className="text-2xl font-bold text-black dark:text-white mb-6">
          Profile
        </Text>

        <View className="items-center mb-8">
          <View className="w-24 h-24 bg-gray-200 dark:bg-gray-800 rounded-full items-center justify-center mb-4 overflow-hidden">
            {user?.profilePicture ? (
              <Image
                source={{ uri: user.profilePicture }}
                className="w-full h-full"
              />
            ) : (
              <Ionicons
                name="person"
                size={40}
                color={isDark ? colors.gray[400] : colors.gray[500]}
              />
            )}
          </View>
          <Text className="text-xl font-semibold text-black dark:text-white">
            {user?.firstName} {user?.lastName}
          </Text>
          <Text className="text-gray-500 dark:text-gray-400">
            {user?.email}
          </Text>
        </View>

        {/* Storage Usage Section */}
        <View className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 mb-6">
          <View className="flex-row justify-between mb-2">
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Storage Used
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              {formatBytes(user?.storageUsed || 0)} /{" "}
              {formatBytes(user?.storageLimit || 0)}
            </Text>
          </View>
          <View className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <View
              className="h-full bg-blue-500"
              style={{
                width: `${Math.min(
                  ((user?.storageUsed || 0) / (user?.storageLimit || 1)) * 100,
                  100
                )}%`,
              }}
            />
          </View>
          <Text className="text-xs text-gray-400 mt-2">
            {user?.searchCount || 0} searches performed
          </Text>
        </View>

        <View className="bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden mb-6">
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              onPress={item.onPress}
              className={`flex-row items-center p-4 ${index !== menuItems.length - 1 ? "border-b border-gray-200 dark:border-gray-800" : ""}`}
            >
              <Ionicons
                name={item.icon as any}
                size={24}
                color={isDark ? colors.gray[300] : colors.gray[700]}
                style={{ marginRight: 16 }}
              />
              <Text className="flex-1 text-base text-black dark:text-white">
                {item.label}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.gray[400]}
              />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={signOut}
          className="flex-row items-center justify-center p-4 bg-red-50 dark:bg-red-900/20 rounded-xl"
        >
          <Ionicons
            name="log-out-outline"
            size={24}
            color={isDark ? colors.red[400] : colors.red[600]}
            style={{ marginRight: 8 }}
          />
          <Text className="text-red-600 dark:text-red-400 font-semibold text-base">
            Sign Out
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
