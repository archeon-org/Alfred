import { useState, useEffect } from "react";
import { Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Print from "expo-print";
import { readAsStringAsync } from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useDocumentUpload } from "./useDocumentUpload";
import { showError } from "../utils/apiError";

export const useDocumentScanner = (initialDocUri?: string) => {
  const [scannedImages, setScannedImages] = useState<string[]>([]);
  const { isUploading, upload } = useDocumentUpload();
  const router = useRouter();

  useEffect(() => {
    if (initialDocUri) {
      setScannedImages((prev) => {
        // Prevent adding duplicates if the same URI is passed
        if (prev.includes(initialDocUri)) return prev;
        return [...prev, initialDocUri];
      });
    }
  }, [initialDocUri]);

  const scanDocument = async () => {
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      Alert.alert(
        "Not Available",
        "Document scanning is not available in Expo Go. Please use a development build or upload from files."
      );
      return;
    }

    try {
      // Dynamically require the module to avoid crashes in Expo Go
      const DocumentScanner =
        require("react-native-document-scanner-plugin").default;
      const { scannedImages: newScannedImages } =
        await DocumentScanner.scanDocument();
      if (newScannedImages && newScannedImages.length > 0) {
        setScannedImages(newScannedImages);
      }
    } catch (error) {
      console.error("Error scanning document:", error);
      showError(error, "Failed to scan document");
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

      // Instead of uploading immediately, we add it to the scanned images
      // This allows the user to preview it and choose AI vs Manual
      setScannedImages((prev) => [...prev, asset.uri]);
    } catch (error) {
      console.error("Error picking document:", error);
      showError(error, "Failed to pick document");
    }
  };

  const handleUpload = async (autoClassify = true) => {
    if (scannedImages.length === 0) return;

    try {
      // Check if we have a single PDF file to upload directly
      // This avoids converting an existing PDF to images and back to PDF (which breaks it)
      if (
        scannedImages.length === 1 &&
        scannedImages[0].toLowerCase().endsWith(".pdf")
      ) {
        const classificationSource = autoClassify ? "AI" : "MANUAL";
        const result = await upload(scannedImages[0], classificationSource);

        if (result) {
          setScannedImages([]);
          if (autoClassify) {
            Alert.alert(
              "Success",
              "Document uploaded and sent for AI classification!",
              [{ text: "OK", onPress: () => router.back() }]
            );
          } else {
            router.push({
              pathname: `/(app)/documents/${result.id}`,
              params: { openCategoryModal: "true" },
            } as any);
          }
        }
        return;
      }

      // Generate HTML for all pages
      const pagesHtmlPromises = scannedImages.map(async (img) => {
        const base64 = await readAsStringAsync(img, {
          encoding: "base64",
        });
        // Check if it's a PDF or Image to render correctly
        // For simplicity, we assume images for now as that's what the scanner returns
        // If pickDocument returns a PDF, we might need to handle it differently
        // But for now, let's assume we are converting images to PDF
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
      const classificationSource = autoClassify ? "AI" : "MANUAL";
      const result = await upload(pdfUri, classificationSource);

      if (result) {
        // Clear images after successful upload
        setScannedImages([]);

        if (autoClassify) {
          Alert.alert(
            "Success",
            "Document uploaded and sent for AI classification!",
            [{ text: "OK", onPress: () => router.back() }]
          );
        } else {
          // Direct redirect for manual classification
          router.push({
            pathname: `/(app)/documents/${result.id}`,
            params: { openCategoryModal: "true" },
          } as any);
        }
      }
    } catch (error) {
      console.error("Error converting/uploading:", error);
      showError(error, "Failed to process document");
    }
  };

  const clearImages = () => setScannedImages([]);

  return {
    scannedImages,
    isUploading,
    scanDocument,
    pickDocument,
    handleUpload,
    clearImages,
  };
};
