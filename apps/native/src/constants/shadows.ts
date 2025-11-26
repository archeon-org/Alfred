/**
 * Shadow styles for React Native components
 *
 * Using native React Native shadow styles instead of NativeWind's shadow utilities
 * to avoid conflicts with React Navigation's context initialization.
 *
 * Issue: NativeWind shadow utilities (shadow-sm, shadow-md, etc.) can interfere
 * with React Navigation's context, causing the error:
 * "Couldn't find a navigation context. Have you wrapped your app with 'NavigationContainer'?"
 *
 * Solution: Use React Native's built-in shadow properties via the style prop.
 * This provides cross-platform shadows without triggering navigation context issues.
 */

import { ViewStyle } from "react-native";

export const shadows = {
  /** Small shadow - for cards, buttons, and small elevated elements */
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1, // Android elevation
  } as ViewStyle,

  /** Medium shadow - for modals, dropdowns, and medium elevated elements */
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  } as ViewStyle,

  /** Large shadow - for floating action buttons and highly elevated elements */
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  } as ViewStyle,

  /** Primary colored shadow - for primary buttons to add brand color glow */
  primary: {
    shadowColor: "#6366F1", // primary color
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  } as ViewStyle,
};
