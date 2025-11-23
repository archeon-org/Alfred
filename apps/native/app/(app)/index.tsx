import React, { useState } from "react";
import { Image, View, Text } from "react-native";
import DocumentScanner from "react-native-document-scanner-plugin";
import { Button } from "../../components/Button";

export default () => {
  const [scannedImage, setScannedImage] = useState<string | undefined>();

  const scanDocument = async () => {
    try {
      const scanResult = await DocumentScanner.scanDocument();
      const scannedImages = scanResult.scannedImages;
      if (scannedImages && scannedImages.length > 0) {
        setScannedImage(scannedImages[0]);
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-white p-4">
      {scannedImage ? (
        <View className="w-full h-full items-center justify-center">
          <Image
            resizeMode="contain"
            style={{ width: "100%", height: "80%" }}
            source={{ uri: scannedImage }}
          />
          <Button title="Scan Again" onPress={scanDocument} className="mt-4" />
        </View>
      ) : (
        <View className="items-center">
          <Text className="text-lg mb-4 text-gray-700">
            No document scanned yet
          </Text>
          <Button title="Scan Document" onPress={scanDocument} />
        </View>
      )}
    </View>
  );
};
