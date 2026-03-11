import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text, TouchableOpacity } from "react-native";

const mockUseNotifications = jest.fn();

jest.mock("../../src/hooks/useNotifications", () => ({
  useNotifications: () => mockUseNotifications(),
}));

import { __getRouter, __resetRouterMocks } from "expo-router";
import { __setColorScheme } from "react-native";
import { NotificationBell } from "../../src/components/NotificationBell";

describe("components/NotificationBell", () => {
  beforeEach(() => {
    __resetRouterMocks();
    mockUseNotifications.mockReset();
    __setColorScheme("light");
  });

  it("shows unread badge with capped count and navigates on press", () => {
    mockUseNotifications.mockReturnValue({ unreadCount: 120 });

    const tree = TestRenderer.create(<NotificationBell />);

    const texts = tree.root.findAllByType(Text);
    expect(texts[texts.length - 1].props.children).toBe("99+");

    act(() => {
      tree.root.findByType(TouchableOpacity).props.onPress();
    });

    expect(__getRouter().push).toHaveBeenCalledWith("/notifications");
  });

  it("hides unread badge when count is zero", () => {
    mockUseNotifications.mockReturnValue({ unreadCount: 0 });
    __setColorScheme("dark");

    const tree = TestRenderer.create(<NotificationBell />);

    expect(tree.root.findAllByType(Text)).toHaveLength(0);
  });
});
