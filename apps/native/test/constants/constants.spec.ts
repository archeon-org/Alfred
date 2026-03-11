import Colors from "../../src/constants/Colors";
import {
  DEFAULT_ROUTES,
  PUBLIC_ROUTES,
  ROUTE_GROUPS,
  isAuthRoute,
  isOnboardingRoute,
  isPublicRoute,
} from "../../src/constants/routes";
import { shadows } from "../../src/constants/shadows";

describe("constants", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  const loadConfig = (env: string, apiUrl?: string) => {
    process.env = { ...originalEnv, EXPO_PUBLIC_ENV: env };
    if (apiUrl) {
      process.env.EXPO_PUBLIC_API_URL = apiUrl;
    } else {
      delete process.env.EXPO_PUBLIC_API_URL;
    }

    let loaded: any;
    jest.isolateModules(() => {
      loaded = require("../../src/constants/Config").default;
    });
    return loaded;
  };

  it("exposes expected colors for light and dark themes", () => {
    expect(Colors.light.background).toBe("#fff");
    expect(Colors.dark.background).toBe("#000");
    expect(Colors.light.tabIconSelected).toBe(Colors.light.tint);
    expect(Colors.dark.tabIconSelected).toBe(Colors.dark.tint);
  });

  it("selects API URL based on environment and overrides", () => {
    expect(loadConfig("production").API_URL).toBe(
      "https://gate.egobis.cloud/api",
    );
    expect(loadConfig("development").API_URL).toBe(
      "https://gate.dev.egobis.cloud/api",
    );
    expect(loadConfig("local", "http://localhost:3000/api").API_URL).toBe(
      "http://localhost:3000/api",
    );
  });

  it("exports route groups and route guards", () => {
    expect(PUBLIC_ROUTES).toContain("terms");
    expect(ROUTE_GROUPS.AUTH).toBe("(auth)");
    expect(DEFAULT_ROUTES.UNAUTHENTICATED).toBe("/(auth)/welcome");

    expect(isPublicRoute("privacy")).toBe(true);
    expect(isPublicRoute("dashboard")).toBe(false);
    expect(isAuthRoute("(auth)")).toBe(true);
    expect(isAuthRoute("(app)")).toBe(false);
    expect(isOnboardingRoute("onboarding")).toBe(true);
    expect(isOnboardingRoute("(auth)")).toBe(false);
  });

  it("defines shadow presets with expected elevations", () => {
    expect(shadows.sm.elevation).toBe(1);
    expect(shadows.md.elevation).toBe(2);
    expect(shadows.lg.elevation).toBe(4);
    expect(shadows.primary.shadowColor).toBe("#6366F1");
  });
});
