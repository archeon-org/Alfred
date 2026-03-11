import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { ActivityIndicator, Text, TouchableOpacity } from "react-native";

const mockUseNotifications = jest.fn();

jest.mock("../../src/hooks/useNotifications", () => ({
  useNotifications: () => mockUseNotifications(),
}));

jest.mock("../../src/components/notification/SwipeableNotificationItem", () => {
  const React = require("react");
  return {
    SwipeableNotificationItem: (props: any) =>
      React.createElement("SwipeableNotificationItem", props),
  };
});

import { __getRouter, __resetRouterMocks } from "expo-router";
import NotificationsScreen from "../../src/app/notifications";

describe("app/notifications", () => {
  beforeEach(() => {
    __resetRouterMocks();
    mockUseNotifications.mockReset();
  });

  it("shows loading state", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [],
      isLoading: true,
      refetch: jest.fn(),
      handleMarkAsRead: jest.fn(),
      handleMarkAllAsRead: jest.fn(),
      handleDelete: jest.fn(),
      unreadCount: 0,
      isMarkingAllAsRead: false,
    });

    const tree = TestRenderer.create(<NotificationsScreen />);

    expect(tree.root.findByType(ActivityIndicator)).toBeTruthy();
  });

  it("shows empty state when no notifications", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [],
      isLoading: false,
      refetch: jest.fn(),
      handleMarkAsRead: jest.fn(),
      handleMarkAllAsRead: jest.fn(),
      handleDelete: jest.fn(),
      unreadCount: 0,
      isMarkingAllAsRead: false,
    });

    const tree = TestRenderer.create(<NotificationsScreen />);

    const text = tree.root.findAllByType(Text).find((node) => {
      const value = node.props.children;
      return (
        typeof value === "string" && value.includes("No notifications yet")
      );
    });

    expect(text).toBeTruthy();
  });

  it("handles mark-all, item press/delete and pull-to-refresh", async () => {
    const refetch = jest.fn(async () => {});
    const handleMarkAsRead = jest.fn();
    const handleMarkAllAsRead = jest.fn();
    const handleDelete = jest.fn();

    mockUseNotifications.mockReturnValue({
      notifications: [
        {
          id: "n-1",
          isRead: false,
          redirect: "/(app)/documents/1",
        },
      ],
      isLoading: false,
      refetch,
      handleMarkAsRead,
      handleMarkAllAsRead,
      handleDelete,
      unreadCount: 1,
      isMarkingAllAsRead: false,
    });

    const tree = TestRenderer.create(<NotificationsScreen />);

    const markAllButton = tree.root
      .findAllByType(TouchableOpacity)
      .find((node) => node.props.onPress === handleMarkAllAsRead);

    expect(markAllButton).toBeTruthy();
    act(() => {
      markAllButton?.props.onPress();
    });
    expect(handleMarkAllAsRead).toHaveBeenCalledTimes(1);

    const item = tree.root.findByType("SwipeableNotificationItem");

    act(() => {
      item.props.onPress();
    });

    expect(handleMarkAsRead).toHaveBeenCalledWith("n-1");
    expect(__getRouter().push).toHaveBeenCalledWith("/(app)/documents/1");

    act(() => {
      item.props.onDelete();
    });
    expect(handleDelete).toHaveBeenCalledWith("n-1");

    const scrollView = tree.root.findByType("GestureHandlerScrollView");

    await act(async () => {
      await scrollView.props.refreshControl.props.onRefresh();
    });

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
