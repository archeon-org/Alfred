import React from "react";
import TestRenderer from "react-test-renderer";
import { UserType } from "@archeon-org/types";

const mockUsePushNotifications = jest.fn();
const mockUseNotifications = jest.fn();
const mockUseUser = jest.fn();

jest.mock("../../src/hooks/usePushNotifications", () => ({
  usePushNotifications: () => mockUsePushNotifications(),
}));

jest.mock("../../src/hooks/useNotifications", () => ({
  useNotifications: () => mockUseNotifications(),
}));

jest.mock("../../src/hooks/useUser", () => ({
  useUser: () => mockUseUser(),
}));

import { __setPlatformOS } from "react-native";
import AppLayout from "../../src/app/(app)/_layout";

describe("app/(app)/_layout", () => {
  beforeEach(() => {
    mockUsePushNotifications.mockReset();
    mockUseNotifications.mockReset();
    mockUseUser.mockReset();

    mockUseNotifications.mockReturnValue({ unreadCount: 0 });
  });

  it("hides admin tab for non-admin users", () => {
    __setPlatformOS("ios");
    mockUseUser.mockReturnValue({ data: { role: UserType.USER } });

    const tree = TestRenderer.create(<AppLayout />);
    const tabs = tree.root.findByType("Tabs");
    const screens = tree.root.findAllByType("TabsScreen");

    const admin = screens.find((screen) => screen.props.name === "admin");
    expect(admin?.props.options.href).toBeNull();

    expect(tabs.props.screenOptions.tabBarStyle.paddingBottom).toBeUndefined();
    expect(mockUsePushNotifications).toHaveBeenCalledTimes(1);
  });

  it("shows admin tab for admins and applies android tab bar padding", () => {
    __setPlatformOS("android");
    mockUseUser.mockReturnValue({ data: { role: UserType.ADMIN } });

    const tree = TestRenderer.create(<AppLayout />);
    const tabs = tree.root.findByType("Tabs");
    const screens = tree.root.findAllByType("TabsScreen");

    const admin = screens.find((screen) => screen.props.name === "admin");
    expect(admin?.props.options.href).toBeUndefined();

    expect(tabs.props.screenOptions.tabBarStyle).toEqual(
      expect.objectContaining({
        paddingBottom: 8,
        height: 60,
      }),
    );
  });
});
