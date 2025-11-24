import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
  useColorScheme, // Import this
} from "react-native";
import DocumentScanner from "react-native-document-scanner-plugin";
import * as Print from "expo-print";
import { readAsStringAsync } from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import { useDocumentUpload } from "../../hooks/useDocumentUpload";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export default function ScanScreen() {
  const [scannedImages, setScannedImages] = useState<string[]>([]);
  const { isUploading, upload } = useDocumentUpload();
  const router = useRouter();

  // Detect system theme for Icon colors
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const scanDocument = async () => {
    try {
      const { scannedImages: newScannedImages } =
        await DocumentScanner.scanDocument();
      if (newScannedImages && newScannedImages.length > 0) {
        setScannedImages(newScannedImages);
      }
    } catch (error) {
      console.error("Error scanning document:", error);
      Alert.alert("Error", "Failed to scan document.");
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];

      if (asset.mimeType === "application/pdf") {
        Alert.alert("Upload Document", `Do you want to upload ${asset.name}?`, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Upload",
            onPress: async () => {
              try {
                const result = await upload(asset.uri);
                if (result) {
                  Alert.alert("Success", "Document uploaded successfully!", [
                    { text: "OK", onPress: () => router.back() },
                  ]);
                }
              } catch (e) {
                console.error(e);
                Alert.alert("Error", "Failed to upload document.");
              }
            },
          },
        ]);
      } else if (asset.mimeType?.startsWith("image/")) {
        setScannedImages((prev) => [...prev, asset.uri]);
      }
    } catch (error) {
      console.error("Error picking document:", error);
      Alert.alert("Error", "Failed to pick document.");
    }
  };

  const handleUpload = async () => {
    if (scannedImages.length === 0) return;

    try {
      // Generate HTML for all pages
      const pagesHtmlPromises = scannedImages.map(async (img) => {
        const base64 = await readAsStringAsync(img, {
          encoding: "base64",
        });
        return `
          <div style="width: 100vw; height: 100vh; display: flex; justify-content: center; align-items: center; page-break-after: always;">
            <img src="data:image/jpeg;base64,${base64}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
          </div>
        `;
      });

      const pagesHtml = (await Promise.all(pagesHtmlPromises)).join("");

      // Note: We keep the PDF background white explicitly for printing purposes
      const html = `
        <html>
          <body style="margin: 0; padding: 0; background-color: white;">
            ${pagesHtml}
          </body>
        </html>
      `;

      // Convert to PDF
      const { uri: pdfUri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      // Upload
      const result = await upload(pdfUri);
      if (result) {
        Alert.alert("Success", "Document uploaded successfully!", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error("Error converting/uploading:", error);
      Alert.alert("Error", "Failed to process document.");
    }
  };

  return (
    // Added dark:bg-gray-900
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-900 p-4">
      <View className="flex-1 items-center justify-center">
        {scannedImages.length > 0 ? (
          <View className="w-full h-3/4 mb-4">
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              // Added dark:bg-gray-800 dark:border-gray-700
              className="w-full h-full rounded-lg border border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
            >
              {scannedImages.map((img, index) => (
                <View
                  key={index}
                  className="w-full h-full items-center justify-center"
                  style={{ width: 350 }}
                >
                  <Image
                    source={{ uri: img }}
                    className="w-full h-full"
                    resizeMode="contain"
                  />
                  <View className="absolute bottom-4 bg-black/50 px-3 py-1 rounded-full">
                    <Text className="text-white text-sm">
                      Page {index + 1} of {scannedImages.length}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : (
          <View className="items-center justify-center mb-8 flex-1">
            {/* Added dark:bg-gray-800 */}
            <View className="bg-gray-100 dark:bg-gray-800 p-8 rounded-full mb-6">
              <Ionicons
                name="scan-outline"
                size={80}
                color={isDark ? "#D1D5DB" : "#4B5563"}
              />
            </View>
            {/* Added dark:text-white */}
            <Text className="text-gray-800 dark:text-white text-2xl font-bold mb-2">
              Scan Document
            </Text>
            {/* Added dark:text-gray-400 */}
            <Text className="text-gray-500 dark:text-gray-400 text-center px-8">
              Take a photo of your document to convert it to PDF and upload it
              securely.
            </Text>
          </View>
        )}

        <View className="w-full gap-4 mt-auto">
          {scannedImages.length === 0 ? (
            <>
              <TouchableOpacity
                onPress={scanDocument}
                // Added dark:bg-blue-700 for slightly better contrast in dark mode
                className="bg-blue-600 dark:bg-blue-700 p-4 rounded-xl items-center flex-row justify-center shadow-sm"
              >
                <Ionicons
                  name="camera"
                  size={24}
                  color="white"
                  className="mr-2"
                />
                <Text className="text-white font-bold text-lg ml-2">
                  Start Scanning
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={pickDocument}
                className="bg-gray-100 dark:bg-gray-800 p-4 rounded-xl items-center flex-row justify-center shadow-sm border border-gray-200 dark:border-gray-700"
              >
                <Ionicons
                  name="document-text-outline"
                  size={24}
                  color={isDark ? "#D1D5DB" : "#4B5563"}
                  className="mr-2"
                />
                <Text className="text-gray-700 dark:text-gray-300 font-bold text-lg ml-2">
                  Upload from Files
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                onPress={handleUpload}
                disabled={isUploading}
                // Added dark:bg-green-700
                className={`p-4 rounded-xl items-center flex-row justify-center shadow-sm ${isUploading ? "bg-gray-400 dark:bg-gray-600" : "bg-green-600 dark:bg-green-700"}`}
              >
                {isUploading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Ionicons
                      name="cloud-upload"
                      size={24}
                      color="white"
                      className="mr-2"
                    />
                    <Text className="text-white font-bold text-lg ml-2">
                      Upload PDF ({scannedImages.length} pages)
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setScannedImages([])}
                disabled={isUploading}
                // Added dark:bg-gray-800 dark:border-gray-700
                className="bg-gray-100 dark:bg-gray-800 p-4 rounded-xl items-center border border-gray-200 dark:border-gray-700"
              >
                {/* Added dark:text-gray-300 */}
                <Text className="text-gray-700 dark:text-gray-300 font-semibold">
                  Retake / Clear
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
