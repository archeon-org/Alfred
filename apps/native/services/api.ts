import axios from "axios";
import * as SecureStore from "expo-secure-store";
import Config from "../constants/Config";

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

export const verifyGoogleToken = async (
  email: string,
  firstName: string | null,
  lastName: string | null,
  picture: string | null,
  googleAccessToken: string
) => {
  const response = await api.post("/auth/google/verify", {
    email,
    firstName,
    lastName,
    picture,
    googleAccessToken,
  });
  return response.data;
};

export const getProfile = async () => {
  const response = await api.get("/auth/me");
  return response.data;
};

export default api;
