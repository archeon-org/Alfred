import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
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
    parentId?: string | null;
  }) => Promise<void>;
  onDelete?: (category: Category) => void;
  category: Category | null;
  initialName?: string;
  rootCategories: Category[];
}

const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  icon: z.string().min(1, "Icon is required"),
  color: z.string(),
  parentId: z.string().nullable().optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

export const CategoryModal = ({
  visible,
  onClose,
  onSave,
  onDelete,
  category,
  initialName,
  rootCategories,
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
      parentId: null,
    },
  });

  const [showIconPicker, setShowIconPicker] = useState(false);
  const [folderLevel, setFolderLevel] = useState<"root" | "subfolder">("root");
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [parentError, setParentError] = useState<string | null>(null);
  const selectedIcon = watch("icon");
  const availableParentCategories = rootCategories.filter(
    (item) => item.id !== category?.id,
  );

  useEffect(() => {
    if (visible) {
      const parentId = category?.parentId ?? null;
      reset({
        name: category?.name || initialName || "",
        icon: category?.icon || "folder-outline",
        color: category?.color || "#4F46E5",
        parentId,
      });
      setFolderLevel(parentId ? "subfolder" : "root");
      setSelectedParentId(parentId);
      setParentError(null);
    }
  }, [visible, category, initialName, reset]);

  const onSubmit = async (data: CategoryFormValues) => {
    if (folderLevel === "subfolder" && !selectedParentId) {
      setParentError("Please select a parent folder");
      return;
    }

    await onSave({
      ...data,
      parentId: folderLevel === "subfolder" ? selectedParentId : null,
    });
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 justify-end bg-black/50">
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
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

              <View className="mb-6">
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Folder level
                </Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      setFolderLevel("root");
                      setSelectedParentId(null);
                      setParentError(null);
                    }}
                    className={`flex-1 rounded-xl border p-3 ${
                      folderLevel === "root"
                        ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500"
                        : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <Text
                      className={`text-center font-semibold ${
                        folderLevel === "root"
                          ? "text-indigo-600 dark:text-indigo-300"
                          : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      Root folder
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setFolderLevel("subfolder");
                      setParentError(null);
                    }}
                    className={`flex-1 rounded-xl border p-3 ${
                      folderLevel === "subfolder"
                        ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500"
                        : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <Text
                      className={`text-center font-semibold ${
                        folderLevel === "subfolder"
                          ? "text-indigo-600 dark:text-indigo-300"
                          : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      Subfolder
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {folderLevel === "subfolder" && (
                <View className="mb-6">
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Parent folder
                  </Text>
                  {availableParentCategories.length === 0 ? (
                    <View className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-4">
                      <Text className="text-gray-500 dark:text-gray-400 text-sm">
                        Create a root folder first to add subfolders.
                      </Text>
                    </View>
                  ) : (
                    <View className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden">
                      {availableParentCategories.map((rootCategory) => {
                        const isSelected = selectedParentId === rootCategory.id;
                        return (
                          <TouchableOpacity
                            key={rootCategory.id}
                            onPress={() => {
                              setSelectedParentId(rootCategory.id);
                              setValue("parentId", rootCategory.id);
                              setParentError(null);
                            }}
                            className={`flex-row items-center px-3 py-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0 ${
                              isSelected
                                ? "bg-indigo-50 dark:bg-indigo-900/20"
                                : ""
                            }`}
                          >
                            <View
                              className="w-9 h-9 rounded-xl mr-3 items-center justify-center"
                              style={{
                                backgroundColor: `${rootCategory.color}20`,
                              }}
                            >
                              <Ionicons
                                name={rootCategory.icon as any}
                                size={20}
                                color={rootCategory.color}
                              />
                            </View>
                            <Text
                              className={`flex-1 font-medium ${
                                isSelected
                                  ? "text-indigo-600 dark:text-indigo-300"
                                  : "text-gray-900 dark:text-white"
                              }`}
                            >
                              {rootCategory.name}
                            </Text>
                            {isSelected && (
                              <Ionicons
                                name="checkmark-circle"
                                size={18}
                                color="#4F46E5"
                              />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  {parentError ? (
                    <Text className="text-red-500 text-xs mt-2">
                      {parentError}
                    </Text>
                  ) : null}
                </View>
              )}

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
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <IconPicker
        visible={showIconPicker}
        onClose={() => setShowIconPicker(false)}
        onSelect={(icon) => setValue("icon", icon)}
        selectedIcon={selectedIcon}
      />
    </Modal>
  );
};
