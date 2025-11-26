import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Template } from "@archeon-org/types";
import { useOnboarding } from "../hooks/useOnboarding";

export default function OnboardingScreen() {
  const {
    templates,
    loading,
    applying,
    handleSelectTemplate,
    selectedTemplateId,
    templateCategories,
    isLoadingCategories,
    fetchNextCategories,
    hasNextCategories,
    isFetchingNextCategories,
    handleApplyTemplate,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    searchQuery,
    handleSearch,
  } = useOnboarding();

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const renderItem = ({ item }: { item: Template }) => (
    <TouchableOpacity
      onPress={() => handleSelectTemplate(item.id)}
      disabled={applying !== null}
      className={`mb-4 rounded-2xl border-2 border-gray-100 bg-white p-5 shadow-sm active:scale-98 dark:border-gray-800 dark:bg-gray-800`}
    >
      <View className="flex-row items-start">
        <View className="mr-4 h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600">
          <Ionicons name={item.icon as any} size={28} color="#FFFFFF" />
        </View>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900 dark:text-white">
            {item.name}
          </Text>
          <Text className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-400">
            {item.description}
          </Text>
        </View>
      </View>

      <View className="mt-4 flex-row flex-wrap gap-2">
        {item.categories?.slice(0, 4).map((cat, index) => (
          <View
            key={index}
            className="flex-row items-center rounded-lg bg-gray-50 px-3 py-1.5 dark:bg-gray-700"
          >
            <Ionicons
              name={cat.icon as any}
              size={14}
              color={cat.color}
              style={{ marginRight: 4 }}
            />
            <Text className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {cat.name}
            </Text>
          </View>
        ))}
        {item.categories?.length > 4 && (
          <View className="rounded-lg bg-indigo-50 px-3 py-1.5 dark:bg-indigo-900">
            <Text className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              +{item.categories.length - 4} more
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  if (selectedTemplate) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 dark:bg-black" edges={["top"]}>
        <View className="flex-1 px-6 pt-6">
          <TouchableOpacity
            onPress={() => handleSelectTemplate(null)}
            className="mb-6 flex-row items-center"
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color="#4B5563"
              className="dark:text-gray-400"
            />
            <Text className="ml-2 text-lg font-medium text-gray-600 dark:text-gray-400">
              Back to templates
            </Text>
          </TouchableOpacity>

          <View className="items-center">
            <View className="mb-6 h-24 w-24 items-center justify-center rounded-3xl bg-indigo-600 shadow-lg">
              <Ionicons
                name={selectedTemplate.icon as any}
                size={48}
                color="#FFFFFF"
              />
            </View>
            <Text className="text-center text-3xl font-extrabold text-gray-900 dark:text-white">
              {selectedTemplate.name}
            </Text>
            <Text className="mt-2 text-center text-base leading-6 text-gray-600 dark:text-gray-400">
              {selectedTemplate.description}
            </Text>
          </View>

          <View className="mt-8 flex-1">
            <Text className="mb-4 text-lg font-bold text-gray-900 dark:text-white">
              Included Categories
            </Text>
            {isLoadingCategories && templateCategories.length === 0 ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color="#4F46E5" />
              </View>
            ) : (
              <FlatList
                data={templateCategories}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 }}
                renderItem={({ item }) => (
                  <View className="mb-3 flex-row items-center rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
                    <View
                      className="mr-4 h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${item.color}20` }}
                    >
                      <Ionicons
                        name={item.icon as any}
                        size={20}
                        color={item.color}
                      />
                    </View>
                    <Text className="text-base font-medium text-gray-900 dark:text-white">
                      {item.name}
                    </Text>
                  </View>
                )}
                onEndReached={() => {
                  if (hasNextCategories && !isFetchingNextCategories) {
                    fetchNextCategories();
                  }
                }}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                  isFetchingNextCategories ? (
                    <View className="py-4">
                      <ActivityIndicator size="small" color="#4F46E5" />
                    </View>
                  ) : null
                }
              />
            )}
          </View>

          <View className="absolute bottom-0 left-0 right-0 bg-white px-6 py-4 shadow-lg dark:bg-gray-900">
            <TouchableOpacity
              onPress={handleApplyTemplate}
              disabled={applying !== null}
              className={`flex-row items-center justify-center rounded-xl bg-indigo-600 py-4 ${
                applying !== null ? "opacity-70" : ""
              }`}
            >
              {applying === selectedTemplate.id ? (
                <ActivityIndicator color="white" className="mr-2" />
              ) : (
                <Text className="text-lg font-bold text-white">
                  Apply Template
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-black" edges={["top"]}>
      <View className="flex-1 px-6 pt-6">
        <View className="mb-6">
          <Text className="mb-1 text-3xl font-extrabold text-gray-900 dark:text-white">
            Welcome to Archeon
          </Text>
          <Text className="text-base leading-6 text-gray-600 dark:text-gray-400">
            Choose a template to organize your documents
          </Text>
        </View>

        {/* Search Bar */}
        <View className="mb-4 flex-row items-center rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-gray-800">
          <Ionicons
            name="search-outline"
            size={20}
            color="#9CA3AF"
            className="dark:text-gray-400"
          />
          <TextInput
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder="Search templates..."
            placeholderTextColor="#9CA3AF"
            className="ml-3 flex-1 text-base text-gray-900 dark:text-white"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch("")}>
              <Ionicons
                name="close-circle"
                size={20}
                color="#9CA3AF"
                className="dark:text-gray-400"
              />
            </TouchableOpacity>
          )}
        </View>

        {loading && templates.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text className="mt-4 text-gray-500 dark:text-gray-400">
              Loading templates...
            </Text>
          </View>
        ) : (
          <FlatList
            data={templates}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={refetch} />
            }
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View className="py-4">
                  <ActivityIndicator size="small" color="#4F46E5" />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View className="items-center justify-center py-20">
                <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                  <Ionicons
                    name="search-outline"
                    size={40}
                    color="#9CA3AF"
                    className="dark:text-gray-400"
                  />
                </View>
                <Text className="text-lg font-semibold text-gray-500 dark:text-gray-400">
                  No templates found
                </Text>
                <Text className="mt-2 text-center text-sm text-gray-400 dark:text-gray-500">
                  Try adjusting your search
                </Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}
