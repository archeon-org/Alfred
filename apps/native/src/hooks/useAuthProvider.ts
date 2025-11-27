import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import { RelativePathString, useRouter, useSegments } from "expo-router";

import { User } from "@archeon-org/types";
import { getProfile } from "@/services/user";
import { AppError } from "@/utils/apiError";
import {
  isPublicRoute,
  isAuthRoute,
  isOnboardingRoute,
  DEFAULT_ROUTES,
} from "@/constants/routes";

export const useAuthProvider = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  // Load user on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const token = await SecureStore.getItemAsync("auth_token");
        if (token) {
          try {
            const userData = await getProfile();
            setUser(userData);
          } catch (error) {
            // Only clear token if it's an authentication error (401)
            if (error instanceof AppError && error.statusCode === 401) {
              await SecureStore.deleteItemAsync("auth_token");
              setUser(null);
            } else if (error instanceof AppError && error.statusCode === 0) {
              // Network error - keep user logged in locally
              console.log("Network error during loadUser, keeping token.");
            } else {
              // Other errors (500, etc) - keep the token
              console.error("Failed to load user profile", error);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load user", error);
      } finally {
        setIsLoading(false);
        await SplashScreen.hideAsync();
      }
    };

    loadUser();
  }, []);

  // Handle navigation based on auth state
  useEffect(() => {
    if (isLoading) return;

    const currentSegment = segments[0] as string;

    // Public routes are always accessible
    if (isPublicRoute(currentSegment)) {
      return;
    }

    const inAuthGroup = isAuthRoute(currentSegment);
    const inOnboarding = isOnboardingRoute(currentSegment);

    if (!user) {
      // Unauthenticated user trying to access protected route
      if (!inAuthGroup) {
        router.replace(DEFAULT_ROUTES.UNAUTHENTICATED);
      }
    } else {
      // Authenticated user
      if (!user.isOnboarded) {
        // User needs to complete onboarding
        if (!inOnboarding) {
          router.replace(DEFAULT_ROUTES.ONBOARDING);
        }
      } else if (inAuthGroup || inOnboarding) {
        // Fully authenticated user on auth/onboarding pages - redirect to app
        router.replace(DEFAULT_ROUTES.AUTHENTICATED as RelativePathString);
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
