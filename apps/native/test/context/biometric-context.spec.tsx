import React from "react";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  AuthenticationType: {
    FACIAL_RECOGNITION: 1,
    FINGERPRINT: 2,
    IRIS: 3,
  },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { __emitAppStateChange } from "react-native";
import {
  BiometricProvider,
  useBiometric,
} from "../../src/context/BiometricContext";

describe("context/BiometricContext", () => {
  const mockLocalAuth = LocalAuthentication as jest.Mocked<
    typeof LocalAuthentication
  >;
  const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-05T12:00:00.000Z"));

    mockLocalAuth.hasHardwareAsync.mockReset();
    mockLocalAuth.isEnrolledAsync.mockReset();
    mockLocalAuth.supportedAuthenticationTypesAsync.mockReset();
    mockLocalAuth.authenticateAsync.mockReset();

    mockSecureStore.getItemAsync.mockReset();
    mockSecureStore.setItemAsync.mockReset();
    mockSecureStore.deleteItemAsync.mockReset();

    mockLocalAuth.hasHardwareAsync.mockResolvedValue(true);
    mockLocalAuth.isEnrolledAsync.mockResolvedValue(true);
    mockLocalAuth.supportedAuthenticationTypesAsync.mockResolvedValue([1]);
    mockLocalAuth.authenticateAsync.mockResolvedValue({ success: true } as any);
    mockSecureStore.getItemAsync.mockResolvedValue(null as any);
    mockSecureStore.setItemAsync.mockResolvedValue(undefined as any);
    mockSecureStore.deleteItemAsync.mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("loads biometric availability and enabled preference", async () => {
    mockSecureStore.getItemAsync.mockImplementation(async (key: string) => {
      if (key === "biometric_enabled") return "true" as any;
      return null as any;
    });

    let biometric: ReturnType<typeof useBiometric> | null = null;

    const Probe = () => {
      biometric = useBiometric();
      return null;
    };

    await act(async () => {
      TestRenderer.create(
        <BiometricProvider>
          <Probe />
        </BiometricProvider>,
      );
      await Promise.resolve();
    });

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(biometric?.isSupported).toBe(true);
    expect(biometric?.isEnrolled).toBe(true);
    expect(biometric?.biometricType).toBe("faceid");
    expect(biometric?.isEnabled).toBe(true);
    expect(biometric?.isLocked).toBe(true);
  });

  it("enables and disables biometric lock", async () => {
    let biometric: ReturnType<typeof useBiometric> | null = null;

    const Probe = () => {
      biometric = useBiometric();
      return null;
    };

    await act(async () => {
      TestRenderer.create(
        <BiometricProvider>
          <Probe />
        </BiometricProvider>,
      );
      await Promise.resolve();
    });

    let enabled = false;
    await act(async () => {
      enabled = await (biometric as any).enableBiometric();
    });

    expect(enabled).toBe(true);
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      "biometric_enabled",
      "true",
    );
    expect((biometric as any).isEnabled).toBe(true);
    expect((biometric as any).isLocked).toBe(false);

    await act(async () => {
      await (biometric as any).disableBiometric();
    });

    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(
      "biometric_enabled",
    );
    expect((biometric as any).isEnabled).toBe(false);
    expect((biometric as any).isLocked).toBe(false);
  });

  it("returns false when authenticate is attempted without support", async () => {
    mockLocalAuth.hasHardwareAsync.mockResolvedValue(false as any);

    let biometric: ReturnType<typeof useBiometric> | null = null;

    const Probe = () => {
      biometric = useBiometric();
      return null;
    };

    await act(async () => {
      TestRenderer.create(
        <BiometricProvider>
          <Probe />
        </BiometricProvider>,
      );
      await Promise.resolve();
    });

    let result = true;
    await act(async () => {
      result = await (biometric as any).authenticate();
    });

    expect(result).toBe(false);
    expect(mockLocalAuth.authenticateAsync).not.toHaveBeenCalled();
  });

  it("locks app when returning from background past grace period", async () => {
    mockSecureStore.getItemAsync.mockImplementation(async (key: string) => {
      if (key === "biometric_enabled") return "true" as any;
      if (key === "biometric_last_auth") {
        return `${Date.now() - 31_000}` as any;
      }
      return null as any;
    });

    let biometric: ReturnType<typeof useBiometric> | null = null;

    const Probe = () => {
      biometric = useBiometric();
      return null;
    };

    await act(async () => {
      TestRenderer.create(
        <BiometricProvider>
          <Probe />
        </BiometricProvider>,
      );
      await Promise.resolve();
    });

    act(() => {
      jest.runOnlyPendingTimers();
    });

    act(() => {
      (biometric as any).unlock();
    });
    expect((biometric as any).isLocked).toBe(false);

    await act(async () => {
      __emitAppStateChange("active");
      await Promise.resolve();
    });

    expect((biometric as any).isLocked).toBe(true);
  });
});
