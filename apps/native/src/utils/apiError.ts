import { Alert } from "react-native";
import { AxiosError } from "axios";

export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly originalError: any;

  constructor(message: string, statusCode: number = 500, originalError?: any) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

export const parseApiError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof AxiosError) {
    const response = error.response;

    if (response) {
      const data = response.data as ApiErrorResponse;
      const statusCode = response.status;

      let message = "An unexpected error occurred.";

      if (data) {
        if (typeof data.message === "string") {
          message = data.message;
        } else if (Array.isArray(data.message)) {
          message = data.message.join("\n");
        } else if (typeof data === "string") {
          message = data;
        }
      }

      return new AppError(message, statusCode, error);
    } else if (error.request) {
      // The request was made but no response was received
      return new AppError(
        "Network error. Please check your internet connection.",
        0,
        error
      );
    }
  }

  if (error instanceof Error) {
    return new AppError(error.message, 500, error);
  }

  return new AppError("An unknown error occurred.", 500, error);
};

export const showError = (error: unknown, title: string = "Error") => {
  const appError = parseApiError(error);
  Alert.alert(title, appError.message);
};
