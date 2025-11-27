import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import { useUpdateUser } from "../../hooks/useUser";
import {
  UserPreferences,
  getPreferencesWithDefaults,
} from "@archeon-org/types";

interface TipsSectionProps {
  preferences: Partial<UserPreferences> | undefined;
}

interface Tip {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
  bgColor: string;
}

const TIPS: Tip[] = [
  {
    id: "scan",
    icon: "scan-outline",
    title: "Scan Documents",
    description:
      "Use the scan feature to quickly digitize paper documents. The AI will automatically detect edges and enhance quality.",
    color: "#6366F1",
    bgColor: "bg-primary-100 dark:bg-primary-900/30",
  },
  {
    id: "ai-classify",
    icon: "sparkles-outline",
    title: "AI Classification",
    description:
      "Let our AI automatically categorize your documents. Just upload and we'll handle the rest!",
    color: "#10B981",
    bgColor: "bg-secondary-100 dark:bg-secondary-900/30",
  },
  {
    id: "search",
    icon: "search-outline",
    title: "Smart Search",
    description:
      "Ask questions about your documents in natural language. Our AI understands context and finds what you need.",
    color: "#F59E0B",
    bgColor: "bg-accent-50 dark:bg-accent-500/20",
  },
  {
    id: "categories",
    icon: "folder-outline",
    title: "Organize with Categories",
    description:
      "Create custom categories to keep your documents organized. Drag and drop to reorganize anytime.",
    color: "#8B5CF6",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  {
    id: "tags",
    icon: "pricetag-outline",
    title: "Use Tags",
    description:
      "Add tags to your documents for quick filtering. One document can have multiple tags!",
    color: "#EC4899",
    bgColor: "bg-pink-100 dark:bg-pink-900/30",
  },
  {
    id: "gallery",
    icon: "images-outline",
    title: "Import from Gallery",
    description:
      "Select multiple images from your gallery to create a single PDF document. Great for receipts!",
    color: "#14B8A6",
    bgColor: "bg-teal-100 dark:bg-teal-900/30",
  },
  {
    id: "expiry",
    icon: "calendar-outline",
    title: "Set Expiry Dates",
    description:
      "Never miss important deadlines. Set expiry dates on documents and get notified before they expire.",
    color: "#EF4444",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  {
    id: "share",
    icon: "share-outline",
    title: "Share Documents",
    description:
      "Easily share documents with others. Generate secure links or export as PDF.",
    color: "#3B82F6",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
];

export const TipsSection: React.FC<TipsSectionProps> = ({ preferences }) => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { mutate: updateUser, isPending } = useUpdateUser();

  // Get preferences with defaults
  const prefs = getPreferencesWithDefaults(preferences);

  // Local state to hide immediately when dismissed
  const [isHidden, setIsHidden] = useState(false);

  // Random tip state
  const [currentTip, setCurrentTip] = useState<Tip | null>(null);

  // Select a random tip on mount
  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * TIPS.length);
    setCurrentTip(TIPS[randomIndex]);
  }, []);

  // Don't render if tips are disabled (from preferences or local state)
  if (!prefs.home.showTips || isHidden) {
    return null;
  }

  if (!currentTip) {
    return null;
  }

  const handleDismiss = () => {
    // Hide immediately via local state
    setIsHidden(true);
    // Then persist to database
    updateUser({
      preferences: {
        home: {
          showTips: false,
        },
      },
    });
  };

  const handleNextTip = () => {
    const currentIndex = TIPS.findIndex((t) => t.id === currentTip.id);
    const nextIndex = (currentIndex + 1) % TIPS.length;
    setCurrentTip(TIPS[nextIndex]);
  };

  return (
    <View className="rounded-2xl bg-surface dark:bg-surface-dark p-4 border border-gray-100 dark:border-gray-700">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <View className="w-6 h-6 rounded-full bg-accent-50 dark:bg-accent-500/20 items-center justify-center mr-2">
            <Ionicons name="bulb" size={14} color="#F59E0B" />
          </View>
          <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400">
            Quick Tip
          </Text>
        </View>

        {/* Dismiss Button */}
        <TouchableOpacity
          onPress={handleDismiss}
          disabled={isPending}
          className="p-1"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name="close"
            size={18}
            color={isDark ? "#6B7280" : "#9CA3AF"}
          />
        </TouchableOpacity>
      </View>

      {/* Tip Content */}
      <View className="flex-row">
        <View
          className={`w-12 h-12 rounded-xl ${currentTip.bgColor} items-center justify-center mr-3`}
        >
          <Ionicons name={currentTip.icon} size={24} color={currentTip.color} />
        </View>

        <View className="flex-1">
          <Text className="text-base font-bold text-gray-900 dark:text-white mb-1">
            {currentTip.title}
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 leading-5">
            {currentTip.description}
          </Text>
        </View>
      </View>

      {/* Footer Actions */}
      <View className="flex-row items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
        <TouchableOpacity
          onPress={handleDismiss}
          disabled={isPending}
          className="flex-row items-center"
        >
          <Ionicons
            name="eye-off-outline"
            size={16}
            color={isDark ? "#6B7280" : "#9CA3AF"}
          />
          <Text className="text-xs text-gray-400 dark:text-gray-500 ml-1">
            Don't show tips
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleNextTip}
          className="flex-row items-center bg-primary-50 dark:bg-primary-900/20 px-3 py-1.5 rounded-full"
        >
          <Text className="text-xs font-semibold text-primary dark:text-primary-400 mr-1">
            Next tip
          </Text>
          <Ionicons name="arrow-forward" size={14} color="#6366F1" />
        </TouchableOpacity>
      </View>
    </View>
  );
};
