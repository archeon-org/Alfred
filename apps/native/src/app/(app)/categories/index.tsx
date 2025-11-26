import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCategoryScreenLogic } from "../../../hooks/useCategoryScreenLogic";
import { CategoryItem } from "../../../components/category/CategoryItem";
import { CategoryModal } from "../../../components/category/CategoryModal";
import { Skeleton } from "../../../components/common/Skeleton";

export default function CategoriesScreen() {
  const router = useRouter();
  const {
    categories,
    isLoading,
    refetch,
    modalVisible,
    editingCategory,
    handleOpenModal,
    handleCloseModal,
    handleSaveCategory,
    handleDeleteCategory,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    search,
    setSearch,
    hideEmpty,
    setHideEmpty,
  } = useCategoryScreenLogic();

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-background dark:bg-background-dark"
        edges={["top"]}
      >
        <View className="flex-row justify-between items-center px-4 py-2 mb-2">
          <Text className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            Categories
          </Text>
        </View>
        <View className="px-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <View key={i} className="flex-row items-center p-4 mb-3">
              <Skeleton className="w-14 h-14 rounded-2xl mr-4" />
              <View className="flex-1 gap-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
              </View>
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top"]}
    >
      <View className="flex-row justify-between items-center px-4 py-2 mb-2">
        <Text className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
          Categories
        </Text>
        <TouchableOpacity
          onPress={() => handleOpenModal()}
          className="bg-primary p-3 rounded-full shadow-lg shadow-primary/30"
        >
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <View className="px-4 mb-4 gap-4">
        <View className="flex-row items-center bg-surface dark:bg-surface-dark px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-800">
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            className="flex-1 ml-3 text-base text-gray-900 dark:text-white"
            placeholder="Search categories..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="text-gray-600 dark:text-gray-300 font-medium">
            Hide empty folders
          </Text>
          <Switch
            value={hideEmpty}
            onValueChange={setHideEmpty}
            trackColor={{ false: "#767577", true: "#4F46E5" }}
            thumbColor={hideEmpty ? "#fff" : "#f4f3f4"}
          />
        </View>
      </View>

      <FlatList
        data={categories}
        renderItem={({ item }) => (
          <CategoryItem
            item={item}
            onPress={(category) => router.push(`/categories/${category.id}`)}
            onLongPress={handleOpenModal}
          />
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
        onEndReached={() => {
          if (hasNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-4">
              <ActivityIndicator size="small" color="#6366F1" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-20">
            <View className="bg-surface dark:bg-surface-dark p-8 rounded-full mb-6">
              <Ionicons name="folder-open-outline" size={64} color="#9CA3AF" />
            </View>
            <Text className="text-gray-500 dark:text-gray-400 text-xl font-bold">
              No categories found
            </Text>
            <Text className="text-gray-400 dark:text-gray-500 text-base mt-2 text-center px-10">
              Create a category to organize your documents
            </Text>
          </View>
        }
      />

      <CategoryModal
        visible={modalVisible}
        onClose={handleCloseModal}
        onSave={handleSaveCategory}
        onDelete={handleDeleteCategory}
        category={editingCategory}
      />
    </SafeAreaView>
  );
}
