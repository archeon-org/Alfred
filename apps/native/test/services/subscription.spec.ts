jest.mock("../../src/services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import api from "../../src/services/api";
import {
  checkCredits,
  formatBytes,
  formatCredits,
  getCredits,
  getOperationCost,
  getSubscriptionStatus,
  getSubscriptionTiers,
  upgradeTier,
  CREDIT_COSTS,
} from "../../src/services/subscription";

const mockedApi = api as jest.Mocked<typeof api>;

describe("subscription service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls status/credits/check endpoints", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { tier: "free" } });
    await getSubscriptionStatus();
    expect(mockedApi.get).toHaveBeenCalledWith("/subscription/status");

    mockedApi.get.mockResolvedValueOnce({ data: { credits: 10 } });
    const credits = await getCredits();
    expect(credits.credits).toBe(10);
    expect(mockedApi.get).toHaveBeenCalledWith("/subscription/credits");

    mockedApi.post.mockResolvedValueOnce({
      data: { canAfford: true, cost: 2, currentCredits: 10 },
    });
    const check = await checkCredits("ai_classification" as any);
    expect(check.canAfford).toBe(true);
    expect(mockedApi.post).toHaveBeenCalledWith("/subscription/check", {
      operation: "ai_classification",
    });
  });

  it("calls tier endpoints", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { free: {} } });
    await getSubscriptionTiers();
    expect(mockedApi.get).toHaveBeenCalledWith("/subscription/tiers");

    mockedApi.post.mockResolvedValueOnce({ data: { tier: "pro" } });
    await upgradeTier("pro" as any);
    expect(mockedApi.post).toHaveBeenCalledWith("/subscription/upgrade", {
      tier: "pro",
    });
  });

  it("formats helper values and returns operation cost", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatCredits(1)).toBe("1 credit");
    expect(formatCredits(5)).toBe("5 credits");

    const operation = Object.keys(CREDIT_COSTS)[0] as any;
    expect(getOperationCost(operation)).toBe(CREDIT_COSTS[operation]);
  });
});
