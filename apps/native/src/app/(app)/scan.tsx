import React, { useState } from "react";
import { View, Text, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Scanner } from "../../components/Scanner";
import { Button } from "../../components/Button";

export default function ScanScreen() {
  const [scannedImage, setScannedImage] = useState<string | undefined>();

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black" edges={["bottom"]}>
      <View className="flex-1 items-center justify-center p-4">
        {scannedImage ? (
          <View className="w-full h-full items-center justify-center">
            <Image
              resizeMode="contain"
              style={{ width: "100%", height: "80%" }}
              source={{ uri: scannedImage }}
            />
            <View className="mt-4 flex-row gap-4">
              <Button
                title="Retake"
                onPress={() => setScannedImage(undefined)}
                variant="secondary"
              />
              <Button
                title="Upload"
                onPress={() => {
                  // TODO: Implement upload logic
                  console.log("Upload", scannedImage);
                }}
              />
            </View>
          </View>
        ) : (
          <View className="items-center">
            <Text className="text-2xl font-bold text-black dark:text-white mb-8">
              Add New Document
            </Text>
            <Scanner onScan={setScannedImage} />
            <Text className="text-gray-500 dark:text-gray-400 mt-4 text-center px-8">
              Position your document within the frame to scan automatically.
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
