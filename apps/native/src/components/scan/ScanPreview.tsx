import React from "react";
import { View, Text, Image, ScrollView, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { cn } from "../../utils/cn";

interface ScanPreviewProps {
  scannedImages: string[];
}

export const ScanPreview: React.FC<ScanPreviewProps> = ({ scannedImages }) => {
  const { width } = Dimensions.get("window");
  // Subtract padding (p-4 = 16px * 2 = 32px)
  const cardWidth = width - 32;
  const isExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  return (
    <View className="w-full h-3/4 mb-4">
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        className="w-full h-full rounded-lg border border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
      >
        {scannedImages.map((img, index) => (
          <View
            key={index}
            className="h-full items-center justify-center"
            style={{ width: cardWidth }}
          >
            {img.toLowerCase().endsWith(".pdf") ? (
              isExpoGo ? (
                <View className="flex-1 items-center justify-center p-4">
                  <Ionicons name="document-text" size={64} color="#9CA3AF" />
                  <Text className="text-gray-500 text-center mt-4">
                    PDF Preview not available in Expo Go
                  </Text>
                </View>
              ) : (
                (() => {
                  const Pdf = require("react-native-pdf").default;
                  return (
                    <Pdf
                      source={{ uri: img, cache: true }}
                      style={{
                        flex: 1,
                        width: cardWidth,
                        height: "100%",
                        backgroundColor: "transparent",
                      }}
                      fitPolicy={0} // Width
                      enablePaging={true}
                      onError={(error: any) => {
                        console.log(error);
                      }}
                    />
                  );
                })()
              )
            ) : (
              <Image
                source={{ uri: img }}
                className="w-full h-full"
                resizeMode="contain"
              />
            )}
            <View className="absolute bottom-4 bg-black/50 px-3 py-1 rounded-full">
              <Text className="text-white text-sm">
                Page {index + 1} of {scannedImages.length}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};
