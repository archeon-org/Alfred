import React, { useEffect, useState } from "react";
import { View, Text, Modal, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Category } from "@archeon-org/types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ControlledInput } from "../ControlledInput";
import { Button } from "../Button";
import { IconPicker } from "./IconPicker";

interface CategoryModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    icon: string;
    color: string;
  }) => Promise<void>;
  onDelete?: (category: Category) => void;
  category: Category | null;
  initialName?: string;
}

const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  icon: z.string().min(1, "Icon is required"),
  color: z.string(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

export const CategoryModal = ({
  visible,
  onClose,
  onSave,
  onDelete,
  category,
  initialName,
}: CategoryModalProps) => {
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      icon: "folder-outline",
      color: "#4F46E5",
    },
  });

  const [showIconPicker, setShowIconPicker] = useState(false);
  const selectedIcon = watch("icon");

  useEffect(() => {
    if (visible) {
      reset({
        name: category?.name || initialName || "",
        icon: category?.icon || "folder-outline",
        color: category?.color || "#4F46E5",
      });
    }
  }, [visible, category, initialName, reset]);

  const onSubmit = async (data: CategoryFormValues) => {
    await onSave(data);
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-white dark:bg-gray-900 rounded-t-3xl p-6">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-xl font-bold text-gray-900 dark:text-white">
              {category ? "Edit Category" : "New Category"}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View className="mb-4">
            <ControlledInput
              control={control}
              name="name"
              label="Name"
              placeholder="Category Name"
              containerClassName="mb-2"
            />
          </View>

          <View className="mb-6">
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Icon
            </Text>
            <TouchableOpacity
              onPress={() => setShowIconPicker(true)}
              className="flex-row items-center bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3"
            >
              <View className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 items-center justify-center mr-3">
                <Ionicons
                  name={selectedIcon as any}
                  size={24}
                  color="#4F46E5"
                />
              </View>
              <Text className="flex-1 text-base text-gray-900 dark:text-white font-medium">
                {selectedIcon}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <Button
            onPress={handleSubmit(onSubmit)}
            isLoading={isSubmitting}
            title={category ? "Save Changes" : "Create Category"}
          />

          {category && onDelete && (
            <TouchableOpacity
              onPress={() => {
                onDelete(category);
                onClose();
              }}
              className="mt-4 items-center"
            >
              <Text className="text-red-500 font-medium text-base">
                Delete Category
              </Text>
            </TouchableOpacity>
          )}
          <View className="h-8" />
        </View>
      </View>

      <IconPicker
        visible={showIconPicker}
        onClose={() => setShowIconPicker(false)}
        onSelect={(icon) => setValue("icon", icon)}
        selectedIcon={selectedIcon}
      />
    </Modal>
  );
};
