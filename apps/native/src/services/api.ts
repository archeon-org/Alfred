import axios from "axios";
import * as SecureStore from "expo-secure-store";
import Config from "../constants/Config";
import { User, UpdateUserInput } from "@archeon-org/types";

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

export { User };
export type UpdateUserDto = UpdateUserInput;

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

export const requestOtp = async (email: string) => {
  const response = await api.post("/auth/otp/request", { email });
  return response.data;
};

export const verifyOtp = async (email: string, otp: string) => {
  const response = await api.post("/auth/otp/verify", { email, otp });
  return response.data;
};

export const getProfile = async (): Promise<User> => {
  const response = await api.get("/user/me");
  return response.data;
};

export const updateUser = async (data: UpdateUserDto): Promise<User> => {
  const response = await api.put("/user/me", data);
  return response.data;
};

export default api;
