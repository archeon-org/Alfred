import React, { createContext, useContext, useState, useEffect } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform, AppState, AppStateStatus } from "react-native";

const BIOMETRIC_ENABLED_KEY = "biometric_enabled";
const BIOMETRIC_LAST_AUTH_KEY = "biometric_last_auth";
// Grace period in milliseconds (30 seconds) - won't require re-auth if app was backgrounded briefly
const AUTH_GRACE_PERIOD = 30 * 1000;

type BiometricType = "faceid" | "fingerprint" | "iris" | null;

interface BiometricContextType {
  /** Whether the device supports biometrics */
  isSupported: boolean;
  /** Whether biometrics are enrolled on the device */
  isEnrolled: boolean;
  /** The type of biometric available */
  biometricType: BiometricType;
  /** Whether the user has enabled biometric lock */
  isEnabled: boolean;
  /** Whether the app is currently locked (needs authentication) */
  isLocked: boolean;
  /** Enable biometric authentication */
  enableBiometric: () => Promise<boolean>;
  /** Disable biometric authentication */
  disableBiometric: () => Promise<void>;
  /** Authenticate using biometrics */
  authenticate: () => Promise<boolean>;
  /** Unlock the app (after successful authentication) */
  unlock: () => void;
  /** Check if biometric is available */
  checkBiometricAvailability: () => Promise<void>;
}

const BiometricContext = createContext<BiometricContextType>({
  isSupported: false,
  isEnrolled: false,
  biometricType: null,
  isEnabled: false,
  isLocked: false,
  enableBiometric: async () => false,
  disableBiometric: async () => {},
  authenticate: async () => false,
  unlock: () => {},
  checkBiometricAvailability: async () => {},
});

export const useBiometric = () => useContext(BiometricContext);

export const BiometricProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Check biometric availability on mount
  useEffect(() => {
    checkBiometricAvailability();
    loadBiometricPreference();
  }, []);

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && isEnabled && isInitialized) {
        // Check if we need to re-authenticate
        const lastAuth = await SecureStore.getItemAsync(
          BIOMETRIC_LAST_AUTH_KEY,
        );
        const now = Date.now();

        if (lastAuth) {
          const timeSinceLastAuth = now - parseInt(lastAuth, 10);
          // If within grace period, don't require re-auth
          if (timeSinceLastAuth < AUTH_GRACE_PERIOD) {
            return;
          }
        }

        // Lock the app when coming back from background (past grace period)
        setIsLocked(true);
      } else if (nextAppState === "background" && isEnabled) {
        // Save the time when app went to background
        await SecureStore.setItemAsync(
          BIOMETRIC_LAST_AUTH_KEY,
          Date.now().toString(),
        );
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [isEnabled, isInitialized]);

  const checkBiometricAvailability = async () => {
    try {
      // Check if hardware supports biometrics
      const compatible = await LocalAuthentication.hasHardwareAsync();
      setIsSupported(compatible);

      if (compatible) {
        // Check if biometrics are enrolled
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setIsEnrolled(enrolled);

        // Get biometric type
        const types =
          await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (
          types.includes(
            LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
          )
        ) {
          setBiometricType("faceid");
        } else if (
          types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ) {
          setBiometricType("fingerprint");
        } else if (
          types.includes(LocalAuthentication.AuthenticationType.IRIS)
        ) {
          setBiometricType("iris");
        }
      }
    } catch (error) {
      console.error("Error checking biometric availability:", error);
    }
  };

  const loadBiometricPreference = async () => {
    try {
      const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
      const biometricEnabled = enabled === "true";
      setIsEnabled(biometricEnabled);

      // If biometric is enabled, start locked
      // Add a small delay to ensure the app UI is ready before showing lock screen
      if (biometricEnabled) {
        // Use requestAnimationFrame to defer locking until after initial render
        requestAnimationFrame(() => {
          setIsLocked(true);
        });
      }

      setIsInitialized(true);
    } catch (error) {
      console.error("Error loading biometric preference:", error);
      setIsInitialized(true);
    }
  };

  const enableBiometric = async (): Promise<boolean> => {
    try {
      // First authenticate to confirm identity
      const success = await authenticate();
      if (success) {
        await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true");
        await SecureStore.setItemAsync(
          BIOMETRIC_LAST_AUTH_KEY,
          Date.now().toString(),
        );
        setIsEnabled(true);
        setIsLocked(false);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error enabling biometric:", error);
      return false;
    }
  };

  const disableBiometric = async () => {
    try {
      await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
      await SecureStore.deleteItemAsync(BIOMETRIC_LAST_AUTH_KEY);
      setIsEnabled(false);
      setIsLocked(false);
    } catch (error) {
      console.error("Error disabling biometric:", error);
    }
  };

  const authenticate = async (): Promise<boolean> => {
    try {
      // Ensure we're in a valid state to authenticate
      if (!isSupported || !isEnrolled) {
        console.warn("Biometric authentication not available");
        return false;
      }

      const biometricLabel =
        biometricType === "faceid"
          ? "Face ID"
          : biometricType === "fingerprint"
            ? "Touch ID"
            : "Biometric";

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Authenticate with ${biometricLabel}`,
        cancelLabel: "Cancel",
        disableDeviceFallback: false, // Allow passcode as fallback
        fallbackLabel: "Use Passcode",
      });

      if (result.success) {
        await SecureStore.setItemAsync(
          BIOMETRIC_LAST_AUTH_KEY,
          Date.now().toString(),
        );
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error authenticating:", error);
      return false;
    }
  };

  const unlock = () => {
    setIsLocked(false);
  };

  return (
    <BiometricContext.Provider
      value={{
        isSupported,
        isEnrolled,
        biometricType,
        isEnabled,
        isLocked,
        enableBiometric,
        disableBiometric,
        authenticate,
        unlock,
        checkBiometricAvailability,
      }}
    >
      {children}
    </BiometricContext.Provider>
  );
};
