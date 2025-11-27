import React from "react";
import { View, Alert, useColorScheme } from "react-native";
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
                onPress={() => {
                  Alert.alert(
                    "Classification",
                    "How would you like to classify this document?",
                    [
                      {
                        text: "Auto (AI)",
                        onPress: () => handleUpload(true),
                      },
                      {
                        text: "Manual",
                        onPress: () => handleUpload(false),
                      },
                      {
                        text: "Cancel",
                        style: "cancel",
                      },
                    ]
                  );
                }}
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
    </SafeAreaView>
  );
}
