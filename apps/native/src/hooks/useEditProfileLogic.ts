import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useUser, useUpdateUser } from "./useUser";
import { useToast } from "../context/ToastContext";

const profileSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

export const useEditProfileLogic = () => {
  const router = useRouter();
  const { data: user } = useUser();
  const updateUserMutation = useUpdateUser();
  const { success, error: showError } = useToast();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      street: "",
      city: "",
      state: "",
      zipCode: "",
      country: "",
    },
  });

  useEffect(() => {
    if (user) {
      reset({
        email: user.email || "",
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        phone: user.phone || "",
        street: user.address?.street || "",
        city: user.address?.city || "",
        state: user.address?.state || "",
        zipCode: user.address?.zipCode || "",
        country: user.address?.country || "",
      });
    }
  }, [user, reset]);

  const onSubmit = (data: ProfileFormValues) => {
    updateUserMutation.mutate(
      {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone ?? "",
        address: {
          street: data.street ?? "",
          city: data.city ?? "",
          state: data.state ?? "",
          zipCode: data.zipCode ?? "",
          country: data.country ?? "",
        },
      },
      {
        onSuccess: () => {
          success("Profile Updated", "Your profile has been saved");
          router.back();
        },
        onError: (error) => {
          showError("Error", "Failed to update profile");
          console.error(error);
        },
      },
    );
  };

  return {
    control,
    handleSave: handleSubmit(onSubmit),
    isUpdating: updateUserMutation.isPending || isSubmitting,
  };
};
