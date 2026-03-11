jest.mock("../../src/services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

import api from "../../src/services/api";
import {
  requestOtp,
  verifyGoogleToken,
  verifyOtp,
} from "../../src/services/auth";
import {
  createCategory,
  deleteCategory,
  getCategories,
  getCategoryById,
  updateCategory,
} from "../../src/services/category";
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../../src/services/notification";
import { askQuestion, quickAnswer } from "../../src/services/question";
import { createTag, getTags } from "../../src/services/tag";
import {
  applyTemplate,
  getTemplateCategories,
  getTemplates,
} from "../../src/services/template";
import { getProfile, updateUser } from "../../src/services/user";

const mockedApi = api as jest.Mocked<typeof api>;

describe("core service wrappers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("auth service sends expected payloads", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { accessToken: "token" } });
    const google = await verifyGoogleToken(
      "user@test.com",
      "First",
      "Last",
      "pic.png",
      "google-token",
    );
    expect(google.accessToken).toBe("token");
    expect(mockedApi.post).toHaveBeenCalledWith("/auth/google/verify", {
      email: "user@test.com",
      firstName: "First",
      lastName: "Last",
      picture: "pic.png",
      googleAccessToken: "google-token",
    });

    mockedApi.post.mockResolvedValueOnce({ data: { ok: true } });
    await requestOtp("user@test.com");
    expect(mockedApi.post).toHaveBeenCalledWith("/auth/otp/request", {
      email: "user@test.com",
    });

    const logSpy = jest
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    mockedApi.post.mockResolvedValueOnce({
      data: { accessToken: "otp-token" },
    });
    await verifyOtp("user@test.com", "123456");
    expect(mockedApi.post).toHaveBeenCalledWith("/auth/otp/verify", {
      email: "user@test.com",
      otp: "123456",
    });
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("category service builds query params and CRUD routes", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { data: [], meta: {} } });
    await getCategories(2, 10, "invoice", true);
    expect(mockedApi.get).toHaveBeenCalledWith(
      expect.stringContaining("/categories?"),
    );
    const query = mockedApi.get.mock.calls[0][0] as string;
    expect(query).toContain("page=2");
    expect(query).toContain("limit=10");
    expect(query).toContain("search=invoice");
    expect(query).toContain("hideEmpty=true");

    mockedApi.get.mockResolvedValueOnce({ data: { id: "cat-1" } });
    await getCategoryById("cat-1");
    expect(mockedApi.get).toHaveBeenCalledWith("/categories/cat-1");

    mockedApi.post.mockResolvedValueOnce({ data: { id: "cat-2" } });
    await createCategory({ name: "Taxes" } as any);
    expect(mockedApi.post).toHaveBeenCalledWith("/categories", {
      name: "Taxes",
    });

    mockedApi.patch.mockResolvedValueOnce({ data: { id: "cat-1" } });
    await updateCategory("cat-1", { name: "Updated" } as any);
    expect(mockedApi.patch).toHaveBeenCalledWith("/categories/cat-1", {
      name: "Updated",
    });

    mockedApi.delete.mockResolvedValueOnce(undefined as any);
    await deleteCategory("cat-1");
    expect(mockedApi.delete).toHaveBeenCalledWith("/categories/cat-1");
  });

  it("template and tag services call expected endpoints", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { data: [], meta: {} } });
    await getTemplates(1, 10, "invoice");
    expect(mockedApi.get).toHaveBeenCalledWith(
      "/templates?page=1&limit=10&search=invoice",
    );

    mockedApi.post.mockResolvedValueOnce({ data: undefined });
    await applyTemplate("tpl-1");
    expect(mockedApi.post).toHaveBeenCalledWith("/templates/tpl-1/apply");

    mockedApi.get.mockResolvedValueOnce({ data: { data: [], meta: {} } });
    await getTemplateCategories("tpl-1", 3, 5);
    expect(mockedApi.get).toHaveBeenCalledWith(
      "/templates/tpl-1/categories?page=3&limit=5",
    );

    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await getTags();
    expect(mockedApi.get).toHaveBeenCalledWith("/tags");

    mockedApi.post.mockResolvedValueOnce({ data: { id: "tag-1" } });
    await createTag("Urgent", "#ff0000");
    expect(mockedApi.post).toHaveBeenCalledWith("/tags", {
      name: "Urgent",
      color: "#ff0000",
    });
  });

  it("user and notification services return API data", async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: { id: "user-1", subscription: { tier: "free" } },
    });
    const profile = await getProfile();
    expect(profile.id).toBe("user-1");
    expect(mockedApi.get).toHaveBeenCalledWith("/auth/me");

    mockedApi.put.mockResolvedValueOnce({ data: { id: "user-1", name: "A" } });
    await updateUser({ firstName: "A" } as any);
    expect(mockedApi.put).toHaveBeenCalledWith("/user/me", { firstName: "A" });

    mockedApi.get.mockResolvedValueOnce({ data: { data: [], meta: {} } });
    await getNotifications(4, 15);
    expect(mockedApi.get).toHaveBeenCalledWith("/notifications", {
      params: { page: 4, limit: 15 },
    });

    mockedApi.patch.mockResolvedValueOnce(undefined as any);
    await markAllNotificationsAsRead();
    expect(mockedApi.patch).toHaveBeenCalledWith("/notifications/read-all");

    mockedApi.patch.mockResolvedValueOnce(undefined as any);
    await markNotificationAsRead("notif-1");
    expect(mockedApi.patch).toHaveBeenCalledWith("/notifications/notif-1/read");

    mockedApi.delete.mockResolvedValueOnce(undefined as any);
    await deleteNotification("notif-1");
    expect(mockedApi.delete).toHaveBeenCalledWith("/notifications/notif-1");
  });

  it("question service normalizes citations and quick-answer payload", async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: {
        answer: "Answer",
        confidence: "high",
        processingTimeMs: 10,
      },
    });

    const response = await askQuestion("What is this?");
    expect(response.answer).toBe("Answer");
    expect(response.citations).toEqual([]);
    expect(mockedApi.post).toHaveBeenCalledWith("/question", {
      question: "What is this?",
      conversationHistory: undefined,
      agentMode: "normal",
    });

    mockedApi.post.mockResolvedValueOnce({
      data: { answer: "Quick", confidence: "medium" },
    });
    const quick = await quickAnswer("Short?");
    expect(quick.answer).toBe("Quick");
    expect(mockedApi.post).toHaveBeenCalledWith("/question/quick", {
      question: "Short?",
    });
  });
});
