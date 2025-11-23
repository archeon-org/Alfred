import React, { useState } from "react";
import { Image, View, Text } from "react-native";
import { Button } from "@/components/Button";
import { Scanner } from "@/components/Scanner";

export default () => {
  const [scannedImage, setScannedImage] = useState<string | undefined>();

  return (
    <View className="flex-1 items-center justify-center bg-white p-4">
      {scannedImage ? (
        <View className="w-full h-full items-center justify-center">
          <Image
            resizeMode="contain"
            style={{ width: "100%", height: "80%" }}
            source={{ uri: scannedImage }}
          />
          <Button
            title="Scan Again"
            onPress={() => setScannedImage(undefined)}
            className="mt-4"
          />
        </View>
      ) : (
        <Scanner onScan={setScannedImage} />
      )}
    </View>
  );
};
