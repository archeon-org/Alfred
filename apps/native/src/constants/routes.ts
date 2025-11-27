/**
 * Route Configuration
 *
 * This file defines route groups and public pages for the application.
 * Use this to manage which routes require authentication and which are publicly accessible.
 */

/**
 * Public pages that are accessible without authentication.
 * These pages won't trigger a redirect to the login/welcome screen.
 *
 * To add a new public page:
 * 1. Create the page in /app (root level, not inside (app) or (auth))
 * 2. Add the route segment name to this array
 * 3. Register the screen in /app/_layout.tsx
 */
export const PUBLIC_ROUTES = ["terms", "privacy"] as const;

/**
 * Route group identifiers used for navigation logic
 */
export const ROUTE_GROUPS = {
  /** Protected app routes - requires authentication */
  APP: "(app)",
  /** Authentication routes - login, register, etc. */
  AUTH: "(auth)",
  /** Onboarding flow */
  ONBOARDING: "onboarding",
} as const;

/**
 * Default routes for redirects
 */
export const DEFAULT_ROUTES = {
  /** Where to redirect unauthenticated users */
  UNAUTHENTICATED: "/(auth)/welcome",
  /** Where to redirect authenticated users after login */
  AUTHENTICATED: "/(app)/",
  /** Where to redirect users who haven't completed onboarding */
  ONBOARDING: "/onboarding",
} as const;

/**
 * Check if a route segment is a public page
 */
export const isPublicRoute = (segment: string): boolean => {
  return PUBLIC_ROUTES.includes(segment as (typeof PUBLIC_ROUTES)[number]);
};

/**
 * Check if currently in the auth group
 */
export const isAuthRoute = (segment: string): boolean => {
  return segment === ROUTE_GROUPS.AUTH;
};

/**
 * Check if currently in onboarding
 */
export const isOnboardingRoute = (segment: string): boolean => {
  return segment === ROUTE_GROUPS.ONBOARDING;
};
