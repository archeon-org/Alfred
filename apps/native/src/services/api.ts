import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { Alert } from "react-native";
import Config from "../constants/Config";
import { parseApiError } from "../utils/apiError";

const api = axios.create({
  baseURL: Config.API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add a request interceptor to add the auth token to every request
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync("auth_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle errors globally
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const appError = parseApiError(error);

    // Handle 401 Unauthorized globally (optional: redirect to login)
    // We let the AuthContext handle the state change, but we can clear the token here if needed.
    if (appError.statusCode === 401) {
      await SecureStore.deleteItemAsync("auth_token");
    }

    // Show Alert for critical errors (Network or Server errors)
    if (appError.statusCode === 0 || appError.statusCode >= 500) {
      Alert.alert("Error", appError.message);
    }

    return Promise.reject(appError);
  }
);

export default api;
