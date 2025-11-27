import React, { useState } from "react";
import {
  View,
  useColorScheme,
  Modal,
  Text,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useDocumentScanner } from "../../hooks/useDocumentScanner";
import { ScanEmptyState } from "../../components/scan/ScanEmptyState";
import { ScanPreview } from "../../components/scan/ScanPreview";
import { Button } from "../../components/Button";
import { cn } from "../../utils/cn";

export default function ScanScreen() {
  const { initialDocUri, initialDocName } = useLocalSearchParams<{
    initialDocUri?: string;
    initialDocName?: string;
  }>();
  const {
    scannedImages,
    isUploading,
    scanDocument,
    pickDocument,
    handleUpload,
    clearImages,
  } = useDocumentScanner(initialDocUri, initialDocName);

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const [classificationModalVisible, setClassificationModalVisible] =
    useState(false);

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark p-4">
      <View className="flex-1 items-center justify-center">
        {scannedImages.length > 0 ? (
          <ScanPreview scannedImages={scannedImages} />
        ) : (
          <ScanEmptyState />
        )}

        <View className="w-full gap-4 mt-auto">
          {scannedImages.length === 0 ? (
            <>
              {!isExpoGo && (
                <Button
                  onPress={scanDocument}
                  title="Start Scanning"
                  icon={<Ionicons name="camera" size={24} color="white" />}
                  className="bg-primary dark:bg-primary-600 rounded-3xl shadow-lg shadow-primary/30"
                  textClassName="text-lg font-bold ml-2"
                />
              )}

              <Button
                onPress={pickDocument}
                title="Upload from Files"
                variant="outline"
                icon={
                  <Ionicons
                    name="document-text-outline"
                    size={24}
                    color={isDark ? "#D1D5DB" : "#4B5563"}
                  />
                }
                className="bg-surface dark:bg-surface-dark border-gray-200 dark:border-gray-700 rounded-3xl"
                textClassName="text-gray-700 dark:text-gray-300 text-lg font-bold ml-2"
              />
            </>
          ) : (
            <>
              <Button
                onPress={() => setClassificationModalVisible(true)}
                disabled={isUploading}
                isLoading={isUploading}
                title={`Upload PDF (${scannedImages.length} pages)`}
                icon={
                  !isUploading && (
                    <Ionicons name="cloud-upload" size={24} color="white" />
                  )
                }
                className={cn(
                  isUploading
                    ? "bg-gray-400 dark:bg-gray-600"
                    : "bg-secondary dark:bg-secondary-600 shadow-lg shadow-secondary/30",
                  "rounded-3xl"
                )}
                textClassName="text-lg font-bold ml-2"
              />

              <Button
                onPress={clearImages}
                disabled={isUploading}
                title="Retake / Clear"
                variant="outline"
                className="bg-surface dark:bg-surface-dark border-gray-200 dark:border-gray-700 rounded-3xl"
                textClassName="text-gray-700 dark:text-gray-300 font-semibold"
              />
            </>
          )}
        </View>
      </View>

      {/* Classification Modal */}
      <Modal
        visible={classificationModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setClassificationModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="bg-surface dark:bg-surface-dark rounded-3xl w-full max-w-sm overflow-hidden">
            <View className="p-6">
              <View className="items-center mb-4">
                <View className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/40 items-center justify-center mb-4">
                  <Ionicons name="sparkles" size={32} color="#6366F1" />
                </View>
                <Text className="text-xl font-bold text-gray-900 dark:text-white text-center">
                  Classification
                </Text>
                <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-2">
                  How would you like to classify this document?
                </Text>
              </View>
            </View>

            <View className="border-t border-gray-100 dark:border-gray-800">
              <TouchableOpacity
                onPress={() => {
                  setClassificationModalVisible(false);
                  handleUpload(true);
                }}
                className="p-4 flex-row items-center border-b border-gray-100 dark:border-gray-800"
              >
                <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center mr-3">
                  <Ionicons name="sparkles-outline" size={20} color="#6366F1" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-gray-900 dark:text-white">
                    Auto (AI)
                  </Text>
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    Let AI classify your document
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setClassificationModalVisible(false);
                  handleUpload(false);
                }}
                className="p-4 flex-row items-center border-b border-gray-100 dark:border-gray-800"
              >
                <View className="w-10 h-10 rounded-full bg-secondary/10 items-center justify-center mr-3">
                  <Ionicons
                    name="hand-left-outline"
                    size={20}
                    color="#10B981"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-gray-900 dark:text-white">
                    Manual
                  </Text>
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    Choose a category yourself
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setClassificationModalVisible(false)}
                className="p-4 items-center"
              >
                <Text className="text-base font-medium text-gray-500 dark:text-gray-400">
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
