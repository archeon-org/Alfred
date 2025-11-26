import React, { useEffect } from "react";
import { View, Text, Modal, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Category } from "@archeon-org/types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ControlledInput } from "../ControlledInput";
import { Button } from "../Button";

interface CategoryModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    icon: string;
    color: string;
  }) => Promise<void>;
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
  category,
  initialName,
}: CategoryModalProps) => {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      icon: "folder-outline",
      color: "#4F46E5",
    },
  });

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
            <ControlledInput
              control={control}
              name="icon"
              label="Icon (Ionicons name)"
              placeholder="e.g. folder-outline"
              autoCapitalize="none"
              containerClassName="mb-2"
            />
          </View>

          <Button
            onPress={handleSubmit(onSubmit)}
            isLoading={isSubmitting}
            title={category ? "Save Changes" : "Create Category"}
          />
          <View className="h-8" />
        </View>
      </View>
    </Modal>
  );
};
