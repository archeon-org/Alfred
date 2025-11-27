import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import { RelativePathString, useRouter, useSegments } from "expo-router";

import { User } from "@archeon-org/types";
import { getProfile } from "@/services/user";
import { AppError } from "@/utils/apiError";

export const useAuthProvider = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const token = await SecureStore.getItemAsync("auth_token");
        if (token) {
          // Verify token and get user info
          try {
            const userData = await getProfile();
            setUser(userData);
          } catch (error) {
            // Only clear token if it's an authentication error (401)
            // or if we can't determine the error (safety fallback, but maybe risky for network errors)
            // Since api.ts handles 401 by clearing token, we might just need to sync state.
            // But let's be explicit.
            if (error instanceof AppError && error.statusCode === 401) {
              await SecureStore.deleteItemAsync("auth_token");
              setUser(null);
            } else if (error instanceof AppError && error.statusCode === 0) {
              // Network error, do nothing (keep user logged in locally if possible, or maybe retry)
              // For now, we don't clear token on network error.
              console.log("Network error during loadUser, keeping token.");
            } else {
              // Other errors (500, etc). Maybe we should keep the token?
              // If the server is down, we shouldn't logout the user.
              console.error("Failed to load user profile", error);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load user", error);
      } finally {
        setIsLoading(false);
        // Hide splash screen once we know if we are logged in or not
        await SplashScreen.hideAsync();
      }
    };

    loadUser();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboarding = (segments[0] as string) === "onboarding";

    if (!user && !inAuthGroup) {
      // Redirect to the welcome page for unauthenticated users.
      router.replace("/(auth)/welcome");
    } else if (user) {
      if (!user.isOnboarded) {
        if (!inOnboarding) {
          router.replace("/onboarding");
        }
      } else if (inAuthGroup || inOnboarding) {
        // Redirect away from the sign-in page or onboarding.
        router.replace("/(app)/" as RelativePathString);
      }
    }
  }, [user, segments, isLoading]);

  const signIn = async (token: string) => {
    await SecureStore.setItemAsync("auth_token", token);
    const userData = await getProfile();
    setUser(userData);
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync("auth_token");
    setUser(null);
  };

  const refreshUser = async () => {
    const userData = await getProfile();
    setUser(userData);
  };

  return {
    user,
    isLoading,
    signIn,
    signOut,
    refreshUser,
  };
};
