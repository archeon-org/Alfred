import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import colors from "tailwindcss/colors";

export default function DocumentsScreen() {
  const folders = [
    {
      id: 1,
      name: "Finance",
      count: 12,
      color: "bg-green-100 dark:bg-green-900/30",
      iconColor: colors.green[600],
    },
    {
      id: 2,
      name: "Health",
      count: 5,
      color: "bg-red-100 dark:bg-red-900/30",
      iconColor: colors.red[600],
    },
    {
      id: 3,
      name: "Housing",
      count: 8,
      color: "bg-orange-100 dark:bg-orange-900/30",
      iconColor: colors.orange[600],
    },
    {
      id: 4,
      name: "Personal",
      count: 3,
      color: "bg-purple-100 dark:bg-purple-900/30",
      iconColor: colors.purple[600],
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <ScrollView className="p-4">
        <Text className="text-2xl font-bold text-black dark:text-white mb-6">
          My Documents
        </Text>

        <View className="flex-row flex-wrap gap-4">
          {folders.map((folder) => (
            <View
              key={folder.id}
              className={`w-[47%] p-4 rounded-xl ${folder.color} mb-2`}
            >
              <Ionicons name="folder" size={32} color={folder.iconColor} />
              <Text className="font-semibold text-lg mt-2 text-black dark:text-white">
                {folder.name}
              </Text>
              <Text className="text-gray-500 dark:text-gray-400 text-sm">
                {folder.count} files
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
