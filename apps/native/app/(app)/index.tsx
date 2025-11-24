import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <ScrollView className="p-4">
        <Text className="text-2xl font-bold text-black dark:text-white mb-6">
          Good Morning
        </Text>

        <View className="bg-gray-100 dark:bg-gray-900 p-6 rounded-2xl mb-6">
          <Text className="text-lg font-semibold text-black dark:text-white mb-2">
            Recent Activity
          </Text>
          <Text className="text-gray-500 dark:text-gray-400">
            No recent documents uploaded.
          </Text>
        </View>

        <View className="flex-row gap-4">
          <View className="flex-1 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl">
            <Text className="font-semibold text-blue-600 dark:text-blue-400">
              Pending
            </Text>
            <Text className="text-2xl font-bold text-blue-700 dark:text-blue-300">
              0
            </Text>
          </View>
          <View className="flex-1 bg-green-50 dark:bg-green-900/20 p-4 rounded-xl">
            <Text className="font-semibold text-green-600 dark:text-green-400">
              Processed
            </Text>
            <Text className="text-2xl font-bold text-green-700 dark:text-green-300">
              0
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
