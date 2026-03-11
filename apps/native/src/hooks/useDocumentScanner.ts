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
import { useQueryClient } from "@tanstack/react-query";
import { SUBSCRIPTION_QUERY_KEY } from "./useSubscription";

interface ScannedDocument {
  uri: string;
  originalFilename?: string;
  mimeType?: string;
  source: "file" | "image";
}

/**
 * Check if the error is related to insufficient credits
 */
const isInsufficientCreditsError = (message: string): boolean => {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("insufficient credits") ||
    lowerMessage.includes("not enough credits")
  );
};

/**
 * Check if the error is related to storage limit exceeded
 */
const isStorageLimitError = (message: string): boolean => {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("storage limit") ||
    lowerMessage.includes("storage exceeded") ||
    lowerMessage.includes("not enough storage")
  );
};

export const useDocumentScanner = (
  initialDocUri?: string,
  initialDocName?: string,
) => {
  const [scannedDocuments, setScannedDocuments] = useState<ScannedDocument[]>(
    [],
  );
  const { isUploading, upload, uploadBulk } = useDocumentUpload();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { success, warning, error: showError } = useToast();

  const scannedImages = scannedDocuments.map((doc) => doc.uri);
  const hasFiles = scannedDocuments.some((doc) => doc.source === "file");
  const hasImages = scannedDocuments.some((doc) => doc.source === "image");
  const isFileBatch = scannedDocuments.length > 0 && !hasImages;

  useEffect(() => {
    if (initialDocUri) {
      setScannedDocuments((prev) => {
        if (prev.some((doc) => doc.uri === initialDocUri)) return prev;
        return [
          ...prev,
          {
            uri: initialDocUri,
            originalFilename: initialDocName,
            source: "file",
          },
        ];
      });
    }
  }, [initialDocUri, initialDocName]);

  const handleUploadError = (message: string) => {
    if (isInsufficientCreditsError(message)) {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
      router.push({
        pathname: "/(app)/profile/subscription",
        params: { reason: "insufficient_credits" },
      });
      return;
    }

    if (isStorageLimitError(message)) {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
      router.push({
        pathname: "/(app)/profile/subscription",
        params: { reason: "insufficient_storage" },
      });
      return;
    }

    showError("Failed to process document", message);
  };

  const scanDocument = async () => {
    if (hasFiles) {
      warning(
        "Mixed Selection",
        "Please clear your selected files first, or upload them before scanning pages.",
      );
      return;
    }

    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      warning(
        "Not Available",
        "Document scanning is not available in Expo Go. Please use a development build or upload from files.",
      );
      return;
    }

    try {
      const DocumentScanner =
        require("react-native-document-scanner-plugin").default;
      const { scannedImages: newScannedImages } =
        await DocumentScanner.scanDocument();

      if (newScannedImages && newScannedImages.length > 0) {
        setScannedDocuments(
          newScannedImages.map((uri: string) => ({
            uri,
            source: "image",
          })),
        );
      }
    } catch (error) {
      console.error("Error scanning document:", error);
      const appError = parseApiError(error);
      showError("Failed to scan document", appError.message);
    }
  };

  const pickDocument = async () => {
    if (hasImages) {
      warning(
        "Mixed Selection",
        "Please clear your scanned/gallery pages first, or upload them as one PDF before adding files.",
      );
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
        multiple: true,
      } as any);

      if (result.canceled) return;

      const newDocuments = result.assets.map((asset) => ({
        uri: asset.uri,
        originalFilename: asset.name,
        mimeType: asset.mimeType || undefined,
        source: "file" as const,
      }));

      setScannedDocuments((prev) => [...prev, ...newDocuments]);
    } catch (error) {
      console.error("Error picking document:", error);
      const appError = parseApiError(error);
      showError("Failed to pick document", appError.message);
    }
  };

  const pickFromGallery = async () => {
    if (hasFiles) {
      warning(
        "Mixed Selection",
        "Please clear your selected files first, or upload them before adding gallery images.",
      );
      return;
    }

    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        warning(
          "Permission Required",
          "Please grant access to your photo library to upload images.",
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

      const newDocuments = result.assets.map((asset) => ({
        uri: asset.uri,
        originalFilename: asset.fileName || undefined,
        source: "image" as const,
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

    const classificationSource = autoClassify ? "AI" : "MANUAL";

    try {
      if (isFileBatch) {
        const result = await uploadBulk(
          scannedDocuments.map((doc) => ({
            uri: doc.uri,
            originalFilename: doc.originalFilename,
            mimeType: doc.mimeType,
          })),
          classificationSource,
          3,
        );

        const successCount = result.succeeded.length;
        const failedCount = result.failed.length;

        if (successCount === 0 && failedCount > 0) {
          handleUploadError(result.failed[0].message);
          return;
        }

        queryClient.invalidateQueries({ queryKey: ["documents"] });
        queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });

        if (successCount > 0) {
          setScannedDocuments([]);
        }

        if (failedCount > 0) {
          warning(
            "Bulk Upload Partial",
            `${successCount} uploaded, ${failedCount} failed. First error: ${result.failed[0].message}`,
          );
        } else {
          success(
            "Upload Complete",
            autoClassify
              ? `${successCount} documents sent for AI classification!`
              : `${successCount} documents uploaded successfully!`,
          );
        }

        if (!autoClassify && successCount === 1 && failedCount === 0) {
          router.push({
            pathname: `/(app)/documents/${result.succeeded[0].id}`,
            params: { openCategoryModal: "true" },
          } as any);
        } else {
          router.back();
        }

        return;
      }

      const pagesHtmlPromises = scannedDocuments.map(async (doc) => {
        const base64 = await readAsStringAsync(doc.uri, {
          encoding: "base64",
        });

        return `
          <div style="width: 100vw; height: 100vh; display: flex; justify-content: center; align-items: center; page-break-after: always;">
            <img src="data:image/jpeg;base64,${base64}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
          </div>
        `;
      });

      const pagesHtml = (await Promise.all(pagesHtmlPromises)).join("");

      const html = `
        <html>
          <body style="margin: 0; padding: 0; background-color: white;">
            ${pagesHtml}
          </body>
        </html>
      `;

      const { uri: pdfUri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      const scannedFilename = `Scanned Document ${new Date().toLocaleDateString()}.pdf`;

      const result = await upload(
        pdfUri,
        classificationSource,
        scannedFilename,
        "application/pdf",
      );

      if (result) {
        setScannedDocuments([]);

        queryClient.invalidateQueries({ queryKey: ["documents"] });
        queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });

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
    } catch (error) {
      console.error("Error converting/uploading:", error);
      const appError = parseApiError(error);
      handleUploadError(appError.message);
    }
  };

  const clearImages = () => setScannedDocuments([]);

  const removePage = (index: number) => {
    setScannedDocuments((prev) => prev.filter((_, i) => i !== index));
  };

  return {
    scannedImages,
    isUploading,
    isFileBatch,
    scanDocument,
    pickDocument,
    pickFromGallery,
    handleUpload,
    clearImages,
    removePage,
  };
};
