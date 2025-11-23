import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import { useRouter, useSegments } from "expo-router";
import { getProfile } from "../services/api";

type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  picture?: string;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
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
            // Token invalid or expired
            await SecureStore.deleteItemAsync("auth_token");
            setUser(null);
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

    if (!user && !inAuthGroup) {
      // Redirect to the sign-in page.
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      // Redirect away from the sign-in page.
      router.replace("/(app)/");
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

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
