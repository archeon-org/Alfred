import { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { requestOtp, verifyOtp } from "../services";
import { useAuth } from "../context/AuthContext";
import { showError } from "../utils/apiError";

const otpSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  otp: z.string().length(6, "OTP must be 6 digits").optional(),
});

export type OtpFormValues = z.infer<typeof otpSchema>;

export const useOtpLogin = () => {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [isLoading, setIsLoading] = useState(false);
  const [confirmedEmail, setConfirmedEmail] = useState<string>("");
  const router = useRouter();
  const { signIn } = useAuth();

  const {
    control,
    handleSubmit,
    trigger,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<OtpFormValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: {
      email: "",
      otp: "",
    },
  });

  const handleRequestOtp = async () => {
    const isEmailValid = await trigger("email");
    if (!isEmailValid) return;

    const email = getValues("email");
    setConfirmedEmail(email);
    setIsLoading(true);
    try {
      await requestOtp(email);
      setStep("otp");
    } catch (error) {
      console.error(error);
      showError(error, "Request Failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const isOtpValid = await trigger("otp");
    if (!isOtpValid) return;

    const { otp } = getValues();
    const email = confirmedEmail;

    if (!otp) return;

    setIsLoading(true);
    try {
      const { accessToken } = await verifyOtp(email, otp);
      await signIn(accessToken);
      // Navigation is handled by AuthContext
    } catch (error) {
      console.error(error);
      showError(error, "Verification Failed");
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setStep("email");
    setValue("otp", "");
    setConfirmedEmail("");
  };

  return {
    control,
    step,
    isLoading,
    handleRequestOtp,
    handleVerifyOtp,
    reset,
    router,
    email: confirmedEmail || getValues("email"), // For display in step 2
  };
};
