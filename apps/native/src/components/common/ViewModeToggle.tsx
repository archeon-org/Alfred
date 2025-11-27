import React from "react";
import { View, TouchableOpacity, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";

interface ViewModeToggleProps {
  mode: "list" | "grid";
  onModeChange: (mode: "list" | "grid") => void;
}

export const ViewModeToggle = ({ mode, onModeChange }: ViewModeToggleProps) => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <View
      className={`flex-row rounded-xl p-1 ${
        isDark ? "bg-gray-800" : "bg-gray-100"
      }`}
    >
      <TouchableOpacity
        onPress={() => onModeChange("list")}
        className={`p-2 rounded-lg ${
          mode === "list" ? (isDark ? "bg-gray-700" : "bg-white shadow-sm") : ""
        }`}
        activeOpacity={0.7}
      >
        <Ionicons
          name="list"
          size={18}
          color={mode === "list" ? "#6366F1" : isDark ? "#9CA3AF" : "#6B7280"}
        />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onModeChange("grid")}
        className={`p-2 rounded-lg ${
          mode === "grid" ? (isDark ? "bg-gray-700" : "bg-white shadow-sm") : ""
        }`}
        activeOpacity={0.7}
      >
        <Ionicons
          name="grid"
          size={18}
          color={mode === "grid" ? "#6366F1" : isDark ? "#9CA3AF" : "#6B7280"}
        />
      </TouchableOpacity>
    </View>
  );
};
