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
import { ScanPreview } from "../../components/scan/ScanPreview";
import { Button } from "../../components/Button";
import { cn } from "../../utils/cn";
import { shadows } from "../../constants/shadows";

export default function ScanScreen() {
  const { initialDocUri, initialDocName } = useLocalSearchParams<{
    initialDocUri?: string;
    initialDocName?: string;
  }>();
  const {
    scannedImages,
    isUploading,
    isFileBatch,
    scanDocument,
    pickDocument,
    pickFromGallery,
    handleUpload,
    clearImages,
    removePage,
  } = useDocumentScanner(initialDocUri, initialDocName);

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const [classificationModalVisible, setClassificationModalVisible] =
    useState(false);

  const UploadOption = ({
    icon,
    label,
    color,
    bgColor,
    onPress,
    disabled,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    color: string;
    bgColor: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className="items-center"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <View
        className="w-20 h-20 rounded-full items-center justify-center mb-3"
        style={[{ backgroundColor: bgColor }, shadows.lg]}
      >
        <Ionicons name={icon} size={32} color={color} />
      </View>
      <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark p-4">
      <View className="flex-1 items-center justify-center">
        {scannedImages.length > 0 ? (
          <ScanPreview
            scannedImages={scannedImages}
            onRemovePage={removePage}
            onAddMore={isFileBatch ? pickDocument : pickFromGallery}
          />
        ) : (
          /* Empty State with Upload Options */
          <View className="flex-1 items-center justify-center">
            {/* Icon */}
            <View className="bg-indigo-100 dark:bg-indigo-900/30 p-8 rounded-full mb-6">
              <Ionicons name="cloud-upload-outline" size={64} color="#6366F1" />
            </View>

            {/* Title & Subtitle */}
            <Text className="text-gray-900 dark:text-white text-2xl font-bold mb-2 text-center">
              Add Document
            </Text>
            <Text className="text-gray-500 dark:text-gray-400 text-center px-8 text-base leading-6 mb-12">
              Choose how you'd like to add your document
            </Text>

            {/* Three Upload Options */}
            <View className="flex-row justify-center gap-8">
              <UploadOption
                icon="scan-outline"
                label="Scan"
                color="#FFFFFF"
                bgColor="#6366F1"
                onPress={scanDocument}
                disabled={isExpoGo}
              />
              <UploadOption
                icon="images-outline"
                label="Gallery"
                color="#FFFFFF"
                bgColor="#10B981"
                onPress={pickFromGallery}
              />
              <UploadOption
                icon="folder-outline"
                label="Files"
                color="#FFFFFF"
                bgColor="#F59E0B"
                onPress={pickDocument}
              />
            </View>

            {isExpoGo && (
              <Text className="text-gray-400 dark:text-gray-500 text-xs text-center mt-8 px-8">
                Scanning is not available in Expo Go. Use Gallery or Files
                instead.
              </Text>
            )}
          </View>
        )}

        {/* Bottom Actions when images are selected */}
        {scannedImages.length > 0 && (
          <View className="w-full gap-4 mt-auto">
            <Button
              onPress={() => setClassificationModalVisible(true)}
              disabled={isUploading}
              isLoading={isUploading}
              title={
                isFileBatch
                  ? `Upload ${scannedImages.length} ${scannedImages.length === 1 ? "Document" : "Documents"}`
                  : `Upload PDF (${scannedImages.length} ${scannedImages.length === 1 ? "page" : "pages"})`
              }
              icon={
                !isUploading && (
                  <Ionicons name="cloud-upload" size={24} color="white" />
                )
              }
              className={cn(
                isUploading
                  ? "bg-gray-400 dark:bg-gray-600"
                  : "bg-secondary dark:bg-secondary-600",
                "rounded-3xl",
              )}
              style={!isUploading ? shadows.primary : undefined}
              textClassName="text-lg font-bold ml-2"
            />

            <Button
              onPress={clearImages}
              disabled={isUploading}
              title="Clear Selection"
              variant="outline"
              className="bg-surface dark:bg-surface-dark border-gray-200 dark:border-gray-700 rounded-3xl"
              textClassName="text-gray-700 dark:text-gray-300 font-semibold"
            />
          </View>
        )}
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
                  {isFileBatch
                    ? "How would you like to classify these documents?"
                    : "How would you like to classify this document?"}
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
                    {isFileBatch
                      ? "Let AI classify your documents"
                      : "Let AI classify your document"}
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
                    {isFileBatch
                      ? "Choose categories yourself"
                      : "Choose a category yourself"}
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
