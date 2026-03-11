jest.mock("../../src/services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import api from "../../src/services/api";
import {
  addCreditPack,
  addCustomBonusSearches,
  addCustomCredits,
  getStats,
  getUserDetails,
  getUsers,
  resetDailySearch,
  setCustomStorage,
  setStoragePack,
  setUserTier,
} from "../../src/services/admin";

const mockedApi = api as jest.Mocked<typeof api>;

describe("admin service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.get.mockResolvedValue({ data: {} as any });
    mockedApi.post.mockResolvedValue({ data: {} as any });
  });

  it("builds user listing query with optional search", async () => {
    await getUsers(2, 15, "mustapha");
    expect(mockedApi.get).toHaveBeenCalledWith(
      "/admin/users?page=2&limit=15&search=mustapha",
    );

    await getUsers(1, 20);
    expect(mockedApi.get).toHaveBeenCalledWith("/admin/users?page=1&limit=20");
  });

  it("hits details endpoint", async () => {
    await getUserDetails("user-1");
    expect(mockedApi.get).toHaveBeenCalledWith("/admin/users/user-1");
  });

  it("sends mutation payloads for admin actions", async () => {
    await setUserTier("user-1", "pro" as any);
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/admin/users/user-1/upgrade-tier",
      { tier: "pro" },
    );

    await addCreditPack("user-1", "small" as any);
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/admin/users/user-1/add-credits",
      { pack: "small" },
    );

    await addCustomCredits("user-1", 20);
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/admin/users/user-1/add-credits-custom",
      { credits: 20, bonusSearches: 0, reason: "Admin adjustment" },
    );

    await addCustomBonusSearches("user-1", 5, "Special campaign");
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/admin/users/user-1/set-bonus-searches",
      { bonusSearches: 5, reason: "Special campaign" },
    );

    await setStoragePack("user-1", "starter" as any);
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/admin/users/user-1/set-storage",
      { pack: "starter" },
    );

    await setCustomStorage("user-1", 12);
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/admin/users/user-1/set-storage-custom",
      { storageGb: 12, reason: "Admin adjustment" },
    );

    await resetDailySearch("user-1");
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/admin/users/user-1/reset-daily-search",
    );
  });

  it("loads aggregate stats", async () => {
    await getStats();
    expect(mockedApi.get).toHaveBeenCalledWith("/admin/stats");
  });
});
