import React from "react";
import TestRenderer from "react-test-renderer";

const mockUseAuthProvider = jest.fn();

jest.mock("../../src/hooks/useAuthProvider", () => ({
  useAuthProvider: () => mockUseAuthProvider(),
}));

import { AuthProvider, useAuth } from "../../src/context/AuthContext";

describe("context/AuthContext", () => {
  beforeEach(() => {
    mockUseAuthProvider.mockReset();
  });

  it("returns default context values outside provider", async () => {
    let current: ReturnType<typeof useAuth> | null = null;

    const Probe = () => {
      current = useAuth();
      return null;
    };

    TestRenderer.create(<Probe />);

    expect(current?.user).toBeNull();
    expect(current?.isLoading).toBe(true);
    await expect(
      current?.signIn("token") as Promise<void>,
    ).resolves.toBeUndefined();
    await expect(current?.signOut() as Promise<void>).resolves.toBeUndefined();
    await expect(
      current?.refreshUser() as Promise<void>,
    ).resolves.toBeUndefined();
  });

  it("provides auth state and actions from useAuthProvider", () => {
    const authValue = {
      user: { id: "user-1" },
      isLoading: false,
      signIn: jest.fn(async () => {}),
      signOut: jest.fn(async () => {}),
      refreshUser: jest.fn(async () => {}),
    };
    mockUseAuthProvider.mockReturnValue(authValue);

    let current: ReturnType<typeof useAuth> | null = null;

    const Probe = () => {
      current = useAuth();
      return null;
    };

    TestRenderer.create(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(mockUseAuthProvider).toHaveBeenCalledTimes(1);
    expect(current).toBe(authValue);
  });
});
