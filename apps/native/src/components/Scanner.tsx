import React, { useState } from "react";
import { View, Text, Image, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Button } from "./Button";

// Conditionally import DocumentScanner only if not in Expo Go
let DocumentScanner: any;
if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
  try {
    DocumentScanner = require("react-native-document-scanner-plugin").default;
  } catch (e) {
    console.warn("DocumentScanner plugin not found");
  }
}

interface ScannerProps {
  onScan: (imageUri: string) => void;
}

export const Scanner: React.FC<ScannerProps> = ({ onScan }) => {
  const isExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  const handleScan = async () => {
    try {
      if (isExpoGo) {
        // Fallback for Expo Go: Use ImagePicker camera
        const permissionResult =
          await ImagePicker.requestCameraPermissionsAsync();

        if (permissionResult.granted === false) {
          Alert.alert("Permission to access camera is required!");
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          quality: 1,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
          onScan(result.assets[0].uri);
        }
      } else {
        // Native Build: Use Document Scanner
        const { scannedImages } = await DocumentScanner.scanDocument();
        if (scannedImages && scannedImages.length > 0) {
          onScan(scannedImages[0]);
        }
      }
    } catch (error) {
      console.error("Scanning failed:", error);
      Alert.alert("Error", "Failed to scan document.");
    }
  };

  return (
    <View className="items-center">
      <Text className="text-lg mb-4 text-gray-700">
        {isExpoGo
          ? "Document Scanner (Expo Go Mode: Camera)"
          : "Document Scanner"}
      </Text>
      <Button title="Scan Document" onPress={handleScan} />
    </View>
  );
};
