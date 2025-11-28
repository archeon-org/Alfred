import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTags } from "../../hooks/useTags";
import { shadows } from "../../constants/shadows";

interface DocumentFilterModalProps {
  visible: boolean;
  onClose: () => void;
  filters: {
    processingStatus?: string;
    classificationSource?: string;
    tagId?: string;
  };
  onApplyFilters: (filters: {
    processingStatus?: string;
    classificationSource?: string;
    tagId?: string;
  }) => void;
  onResetFilters: () => void;
}

export const DocumentFilterModal = ({
  visible,
  onClose,
  filters,
  onApplyFilters,
  onResetFilters,
}: DocumentFilterModalProps) => {
  const { tags } = useTags();
  const [localFilters, setLocalFilters] = React.useState(filters);

  React.useEffect(() => {
    if (visible) {
      setLocalFilters(filters);
    }
  }, [visible, filters]);

  const handleApply = () => {
    onApplyFilters(localFilters);
    onClose();
  };

  const handleReset = () => {
    const resetFilters = {
      processingStatus: undefined,
      classificationSource: undefined,
      tagId: undefined,
    };
    setLocalFilters(resetFilters);
    onResetFilters();
    onClose();
  };

  const FilterSection = ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <View className="mb-6">
      <Text className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">
        {title}
      </Text>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );

  const FilterChip = ({
    label,
    selected,
    onPress,
  }: {
    label: string;
    selected: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      className={`px-4 py-2 rounded-full border ${
        selected
          ? "bg-primary border-primary"
          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
      }`}
    >
      <Text
        className={`font-medium ${
          selected ? "text-white" : "text-gray-700 dark:text-gray-300"
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-white dark:bg-gray-900 rounded-t-3xl h-[80%]">
          <View className="flex-row justify-between items-center p-4 border-b border-gray-100 dark:border-gray-800">
            <TouchableOpacity onPress={handleReset}>
              <Text className="text-gray-500 dark:text-gray-400 font-medium">
                Reset
              </Text>
            </TouchableOpacity>
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Filters
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 p-4">
            <FilterSection title="Status">
              {[
                { label: "Pending", value: "PENDING" },
                { label: "Processing", value: "PROCESSING" },
                { label: "Completed", value: "COMPLETED" },
                { label: "Failed", value: "FAILED" },
              ].map((status) => (
                <FilterChip
                  key={status.value}
                  label={status.label}
                  selected={localFilters.processingStatus === status.value}
                  onPress={() =>
                    setLocalFilters((prev) => ({
                      ...prev,
                      processingStatus:
                        prev.processingStatus === status.value
                          ? undefined
                          : status.value,
                    }))
                  }
                />
              ))}
            </FilterSection>

            <FilterSection title="Source">
              {[
                { label: "AI Classified", value: "AI" },
                { label: "Manual", value: "MANUAL" },
              ].map((source) => (
                <FilterChip
                  key={source.value}
                  label={source.label}
                  selected={localFilters.classificationSource === source.value}
                  onPress={() =>
                    setLocalFilters((prev) => ({
                      ...prev,
                      classificationSource:
                        prev.classificationSource === source.value
                          ? undefined
                          : source.value,
                    }))
                  }
                />
              ))}
            </FilterSection>

            <FilterSection title="Tags">
              {tags.map((tag) => (
                <FilterChip
                  key={tag.id}
                  label={tag.name}
                  selected={localFilters.tagId === tag.id}
                  onPress={() =>
                    setLocalFilters((prev) => ({
                      ...prev,
                      tagId: prev.tagId === tag.id ? undefined : tag.id,
                    }))
                  }
                />
              ))}
            </FilterSection>
          </ScrollView>

          <View className="p-4 border-t border-gray-100 dark:border-gray-800 safe-area-pb">
            <TouchableOpacity
              onPress={handleApply}
              className="bg-primary py-4 rounded-2xl items-center"
              style={shadows.primary}
            >
              <Text className="text-white font-bold text-lg">
                Apply Filters
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};
