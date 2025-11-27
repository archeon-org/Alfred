import { useState, useEffect } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import { readAsStringAsync } from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useDocumentUpload } from "./useDocumentUpload";
import { useToast } from "../context/ToastContext";
import { parseApiError } from "../utils/apiError";

interface ScannedDocument {
  uri: string;
  originalFilename?: string;
}

export const useDocumentScanner = (
  initialDocUri?: string,
  initialDocName?: string
) => {
  const [scannedDocuments, setScannedDocuments] = useState<ScannedDocument[]>(
    []
  );
  const { isUploading, upload } = useDocumentUpload();
  const router = useRouter();
  const { success, warning, error: showError } = useToast();

  // For backward compatibility, expose just the URIs
  const scannedImages = scannedDocuments.map((doc) => doc.uri);

  useEffect(() => {
    if (initialDocUri) {
      setScannedDocuments((prev) => {
        // Prevent adding duplicates if the same URI is passed
        if (prev.some((doc) => doc.uri === initialDocUri)) return prev;
        return [
          ...prev,
          { uri: initialDocUri, originalFilename: initialDocName },
        ];
      });
    }
  }, [initialDocUri, initialDocName]);

  const scanDocument = async () => {
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      warning(
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
        // Scanned images don't have original filenames
        setScannedDocuments(newScannedImages.map((uri: string) => ({ uri })));
      }
    } catch (error) {
      console.error("Error scanning document:", error);
      const appError = parseApiError(error);
      showError("Failed to scan document", appError.message);
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

      // Store both URI and original filename
      setScannedDocuments((prev) => [
        ...prev,
        { uri: asset.uri, originalFilename: asset.name },
      ]);
    } catch (error) {
      console.error("Error picking document:", error);
      const appError = parseApiError(error);
      showError("Failed to pick document", appError.message);
    }
  };

  const pickFromGallery = async () => {
    try {
      // Request permissions
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        warning(
          "Permission Required",
          "Please grant access to your photo library to upload images."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.9,
        selectionLimit: 20,
      });

      if (result.canceled) return;

      // Add all selected images
      const newDocuments = result.assets.map((asset) => ({
        uri: asset.uri,
        originalFilename: asset.fileName || undefined,
      }));

      setScannedDocuments((prev) => [...prev, ...newDocuments]);
    } catch (error) {
      console.error("Error picking from gallery:", error);
      const appError = parseApiError(error);
      showError("Failed to pick images", appError.message);
    }
  };

  const handleUpload = async (autoClassify = true) => {
    if (scannedDocuments.length === 0) return;

    try {
      // Check if we have a single PDF file to upload directly
      // This avoids converting an existing PDF to images and back to PDF (which breaks it)
      if (
        scannedDocuments.length === 1 &&
        scannedDocuments[0].uri.toLowerCase().endsWith(".pdf")
      ) {
        const doc = scannedDocuments[0];
        const classificationSource = autoClassify ? "AI" : "MANUAL";
        const result = await upload(
          doc.uri,
          classificationSource,
          doc.originalFilename
        );

        if (result) {
          setScannedDocuments([]);
          if (autoClassify) {
            success("Upload Complete", "Document sent for AI classification!");
            router.back();
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
      const pagesHtmlPromises = scannedDocuments.map(async (doc) => {
        const base64 = await readAsStringAsync(doc.uri, {
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

      // For scanned documents, use a descriptive name based on date
      // since they don't have original filenames
      const scannedFilename = `Scanned Document ${new Date().toLocaleDateString()}.pdf`;

      // Upload
      const classificationSource = autoClassify ? "AI" : "MANUAL";
      const result = await upload(
        pdfUri,
        classificationSource,
        scannedFilename
      );

      if (result) {
        // Clear images after successful upload
        setScannedDocuments([]);

        if (autoClassify) {
          success("Upload Complete", "Document sent for AI classification!");
          router.back();
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
      const appError = parseApiError(error);
      showError("Failed to process document", appError.message);
    }
  };

  const clearImages = () => setScannedDocuments([]);

  return {
    scannedImages,
    isUploading,
    scanDocument,
    pickDocument,
    pickFromGallery,
    handleUpload,
    clearImages,
  };
};
