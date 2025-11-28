import api from "./api";
import { User, UpdateUserInput, SubscriptionStatus } from "@archeon-org/types";

/** Response from /auth/me endpoint - includes subscription status */
export interface UserWithSubscription extends User {
  subscription: SubscriptionStatus;
}

export type { User };
export type UpdateUserDto = UpdateUserInput;

export const getProfile = async (): Promise<UserWithSubscription> => {
  const response = await api.get("/auth/me");
  return response.data;
};

export const updateUser = async (data: UpdateUserDto): Promise<User> => {
  const response = await api.put("/user/me", data);
  return response.data;
};
