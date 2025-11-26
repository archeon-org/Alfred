import api from "./api";

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
  console.log("Calling verifyOtp with email:", email, "and otp:", otp);
  const response = await api.post("/auth/otp/verify", { email, otp });
  return response.data;
};
