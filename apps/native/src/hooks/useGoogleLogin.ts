import { useEffect, useState, useCallback } from "react";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import Constants, { ExecutionEnvironment } from "expo-constants";
import axios from "axios";
import Config from "../constants/Config";
import { useAuth } from "../context/AuthContext";
import { verifyGoogleToken } from "../services";
import { useToast } from "../context/ToastContext";
import { parseApiError } from "../utils/apiError";

WebBrowser.maybeCompleteAuthSession();

export const useGoogleLogin = () => {
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const { error: showError, warning } = useToast();

  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: Config.GOOGLE_CLIENT_IDS.ios,
    androidClientId: Config.GOOGLE_CLIENT_IDS.android,
    webClientId: Config.GOOGLE_CLIENT_IDS.web,
  });

  const handleGoogleSignIn = useCallback(
    async (googleAccessToken?: string) => {
      if (!googleAccessToken) return;

      try {
        setIsLoading(true);

        // Use axios instead of fetch for Google User Info
        const userInfoResponse = await axios.get(
          "https://www.googleapis.com/userinfo/v2/me",
          {
            headers: { Authorization: `Bearer ${googleAccessToken}` },
          }
        );

        const userInfo = userInfoResponse.data;

        // Verify with backend and get app token
        const { accessToken } = await verifyGoogleToken(
          userInfo.email,
          userInfo.given_name,
          userInfo.family_name,
          userInfo.picture,
          googleAccessToken
        );

        await signIn(accessToken);
      } catch (error) {
        console.error("Login failed:", error);
        const appError = parseApiError(error);
        showError("Login Failed", appError.message);
      } finally {
        setIsLoading(false);
      }
    },
    [signIn, showError]
  );

  useEffect(() => {
    if (response?.type === "success") {
      handleGoogleSignIn(response.authentication?.accessToken);
    }
  }, [response, handleGoogleSignIn]);

  const handlePromptAsync = useCallback(async () => {
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      warning(
        "Not Supported in Expo Go",
        "Google Login requires a development build or production build."
      );
      return;
    }
    await promptAsync();
  }, [promptAsync, warning]);

  return {
    promptAsync: handlePromptAsync,
    request,
    isLoading,
  };
};
