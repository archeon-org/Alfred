import api from "./api";
import { User, UpdateUserInput } from "@archeon-org/types";

export type { User };
export type UpdateUserDto = UpdateUserInput;

export const getProfile = async (): Promise<User> => {
  const response = await api.get("/user/me");
  return response.data;
};

export const updateUser = async (data: UpdateUserDto): Promise<User> => {
  const response = await api.put("/user/me", data);
  return response.data;
};
