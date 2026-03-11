import React, { useState, useMemo } from "react";
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  Text,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface IconPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (iconName: string) => void;
  selectedIcon?: string;
}

export const IconPicker = ({
  visible,
  onClose,
  onSelect,
  selectedIcon,
}: IconPickerProps) => {
  const [search, setSearch] = useState("");

  const iconNames = useMemo(() => {
    // @ts-ignore - glyphMap is available on the component
    return Object.keys(Ionicons.glyphMap || {});
  }, []);

  const filteredIcons = useMemo(() => {
    if (!search) return iconNames;
    return iconNames.filter((name) =>
      name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [search, iconNames]);

  const renderItem = ({ item }: { item: string }) => (
    <TouchableOpacity
      className={`flex-1 items-center justify-center p-4 m-1 rounded-xl border ${
        selectedIcon === item
          ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500"
          : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700"
      }`}
      onPress={() => {
        onSelect(item);
        onClose();
      }}
    >
      <Ionicons
        name={item as any}
        size={24}
        color={selectedIcon === item ? "#4F46E5" : "#6B7280"}
      />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-gray-50 dark:bg-gray-900">
        <View className="flex-row items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            Select Icon
          </Text>
          <TouchableOpacity
            onPress={onClose}
            className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full"
          >
            <Ionicons name="close" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <View className="p-4 bg-white dark:bg-gray-900">
          <View className="flex-row items-center bg-gray-100 dark:bg-gray-800 px-4 py-3 rounded-xl">
            <Ionicons name="search" size={20} color="#9CA3AF" />
            <TextInput
              className="flex-1 ml-3 text-base text-gray-900 dark:text-white"
              placeholder="Search icons..."
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <FlatList
          data={filteredIcons}
          renderItem={renderItem}
          keyExtractor={(item) => item}
          numColumns={4}
          contentContainerStyle={{ padding: 12 }}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={5}
          columnWrapperStyle={{ justifyContent: "space-between" }}
        />
      </View>
    </Modal>
  );
};
