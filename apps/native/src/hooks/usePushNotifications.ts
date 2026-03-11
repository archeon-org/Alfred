import { useState, useEffect, useRef } from "react";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { useRouter, useNavigationContainerRef } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { updateUser } from "../services/user";
import { markNotificationAsRead } from "../services/notification";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      alert("Failed to get push token for push notification!");
      return;
    }
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;
      if (!projectId) {
        throw new Error("Project ID not found");
      }
      token = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      console.log("Expo Push Token:", token.data);
    } catch (e) {
      token = `${e}`;
    }
  } else {
    alert("Must use physical device for Push Notifications");
  }

  return typeof token === "object" ? token.data : token;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>("");
  const [notification, setNotification] = useState<
    Notifications.Notification | undefined
  >(undefined);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  const handleNotificationResponse = async (
    response: Notifications.NotificationResponse,
  ) => {
    const data = response.notification.request.content.data as {
      notificationId?: string;
      url?: string;
    };

    // Mark notification as read if ID is present
    if (data?.notificationId) {
      try {
        await markNotificationAsRead(data.notificationId);
        // Invalidate notifications query to update badge count and list
        await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      } catch (error) {
        console.error("Error marking notification as read:", error);
      }
    }

    // Navigate to URL if present
    if (data?.url) {
      // Check if this is a document URL - we need special handling
      const documentMatch = data.url.match(/\/documents\/([^/]+)$/);
      if (documentMatch) {
        // For document URLs, first navigate to documents tab, then to the document
        // This ensures proper back navigation
        setTimeout(() => {
          // First, make sure we're on the documents tab
          router.replace("/(app)/documents" as any);
          // Then navigate to the specific document
          setTimeout(() => {
            router.push(data.url as any);
          }, 100);
        }, 100);
      } else {
        router.push(data.url as any);
      }
    }
  };

  useEffect(() => {
    registerForPushNotificationsAsync().then((token) =>
      setExpoPushToken(token),
    );

    // Handle cold start (app launched from killed state)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
      }
    });

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        setNotification(notification);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse,
      );

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (expoPushToken && user?.id) {
      // Only update if the token has changed or doesn't exist in the backend
      if (user.pushToken !== expoPushToken) {
        console.log("Push token changed or missing. Updating backend...");
        console.log("Old token:", user.pushToken);
        console.log("New token:", expoPushToken);
        updateUser({ pushToken: expoPushToken })
          .then((updatedUser) => {
            console.log("User updated with push token:", updatedUser.pushToken);
          })
          .catch((error) => {
            console.error("Error updating push token:", error);
          });
      } else {
        console.log("Push token unchanged, skipping update");
      }
    } else {
      console.log(
        "Skipping push token update. Token:",
        expoPushToken,
        "User ID:",
        user?.id,
      );
    }
  }, [expoPushToken, user?.id, user?.pushToken]);

  return {
    expoPushToken,
    notification,
  };
}
