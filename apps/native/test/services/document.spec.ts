jest.mock("../../src/services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("../../src/utils/apiError", () => ({
  parseApiError: jest.fn(),
}));

import api from "../../src/services/api";
import { parseApiError } from "../../src/utils/apiError";
import {
  bulkUpdateDocuments,
  deleteDocument,
  getActionRequiredDocuments,
  getDocumentUrl,
  getDocuments,
  getRecentDocuments,
  triggerAiClassification,
  triggerAiTitleGeneration,
  triggerEmbedding,
  triggerIndex,
  updateDocument,
  uploadDocument,
  uploadDocumentsBulk,
} from "../../src/services/document";

const mockedApi = api as jest.Mocked<typeof api>;
const mockedParseApiError = parseApiError as jest.MockedFunction<
  typeof parseApiError
>;

class MockFormData {
  public entries: Array<{ key: string; value: any }> = [];

  append(key: string, value: any) {
    this.entries.push({ key, value });
  }
}

describe("document service", () => {
  const OriginalFormData = global.FormData;

  beforeAll(() => {
    (global as any).FormData = MockFormData;
  });

  afterAll(() => {
    (global as any).FormData = OriginalFormData;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uploads single documents with inferred mime type and endpoint selection", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "doc-1" } as any });

    await uploadDocument("file:///tmp/invoice.PNG", "AI");

    const [endpoint, formData, config] = mockedApi.post.mock.calls[0];
    expect(endpoint).toBe("/documents/upload/ai");
    expect(config).toEqual({
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    const entries = (formData as any).entries;
    expect(entries[0].key).toBe("file");
    expect(entries[0].value.name).toBe("invoice.PNG");
    expect(entries[0].value.type).toBe("image/png");

    mockedApi.post.mockResolvedValueOnce({ data: { id: "doc-2" } as any });
    await uploadDocument(
      "file:///tmp/raw.bin",
      "MANUAL",
      "photo.heic",
      undefined,
    );
    expect(mockedApi.post.mock.calls[1][0]).toBe("/documents/upload/manual");
    expect((mockedApi.post.mock.calls[1][1] as any).entries[0].value.type).toBe(
      "image/heic",
    );
  });

  it("returns empty bulk result for empty input", async () => {
    const result = await uploadDocumentsBulk([]);
    expect(result).toEqual({ total: 0, succeeded: [], failed: [] });
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it("uses bulk endpoint and maps Gate failures back to input uri", async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: {
        total: 2,
        succeeded: 1,
        failed: 1,
        classificationSource: "AI",
        documents: [{ id: "doc-1" }],
        failures: [
          {
            originalName: "b.pdf",
            message: "Queue failed",
            code: "QUEUE_FAILED",
          },
        ],
      },
    });

    const result = await uploadDocumentsBulk(
      [
        { uri: "file:///a.pdf", originalFilename: "a.pdf" },
        { uri: "file:///b.pdf", originalFilename: "b.pdf" },
      ],
      "AI",
    );

    expect(mockedApi.post).toHaveBeenCalledWith(
      "/documents/upload/ai/bulk",
      expect.any(MockFormData),
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    expect(result.total).toBe(2);
    expect(result.succeeded).toEqual([{ id: "doc-1" }]);
    expect(result.failed).toEqual([
      {
        uri: "file:///b.pdf",
        originalFilename: "b.pdf",
        message: "Queue failed",
      },
    ]);
  });

  it("falls back to legacy uploads when bulk endpoint is unavailable", async () => {
    const bulkError = new Error("bulk missing");
    const perFileError = new Error("single failed");
    mockedApi.post
      .mockRejectedValueOnce(bulkError) // bulk
      .mockResolvedValueOnce({ data: { id: "doc-a" } }) // legacy file #1
      .mockRejectedValueOnce(perFileError); // legacy file #2

    mockedParseApiError.mockImplementation((error: unknown) => {
      if (error === bulkError) {
        return { message: "Bulk unavailable", statusCode: 404 } as any;
      }
      return { message: "One file failed", statusCode: 409 } as any;
    });

    const result = await uploadDocumentsBulk(
      [
        { uri: "file:///a.pdf", originalFilename: "a.pdf" },
        { uri: "file:///b.pdf", originalFilename: "b.pdf" },
      ],
      "MANUAL",
      10,
    );

    expect(result.total).toBe(2);
    expect(result.succeeded).toEqual([{ id: "doc-a" }]);
    expect(result.failed).toEqual([
      {
        uri: "file:///b.pdf",
        originalFilename: "b.pdf",
        message: "One file failed",
        statusCode: 409,
      },
    ]);
    expect(mockedApi.post.mock.calls[1][0]).toBe("/documents/upload/manual");
    expect(mockedApi.post.mock.calls[2][0]).toBe("/documents/upload/manual");
  });

  it("rethrows original error when bulk failure is not a compatibility case", async () => {
    const error = new Error("hard failure");
    mockedApi.post.mockRejectedValueOnce(error);
    mockedParseApiError.mockReturnValueOnce({
      message: "Server down",
      statusCode: 500,
    } as any);

    await expect(uploadDocumentsBulk([{ uri: "file:///a.pdf" }])).rejects.toBe(
      error,
    );
  });

  it("builds getDocuments query with filters", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { data: [], meta: {} } });
    await getDocuments(
      3,
      25,
      "cat-1",
      "invoice",
      ["PROCESSING", "FAILED"],
      "AI",
      "tag-1",
    );

    const calledUrl = mockedApi.get.mock.calls[0][0] as string;
    expect(calledUrl).toContain("page=3");
    expect(calledUrl).toContain("limit=25");
    expect(calledUrl).toContain("filter.categoryId=%24eq%3Acat-1");
    expect(calledUrl).toContain("search=invoice");
    expect(calledUrl).toContain(
      "filter.processingStatus=%24in%3APROCESSING%2CFAILED",
    );
    expect(calledUrl).toContain("filter.classificationSource=%24eq%3AAI");
    expect(calledUrl).toContain("filter.tags.id=%24eq%3Atag-1");
  });

  it("supports derived list helpers", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { data: [{ id: "d1" }] } });
    const recent = await getRecentDocuments(1);
    expect(recent).toEqual([{ id: "d1" }]);

    mockedApi.get.mockResolvedValueOnce({ data: { data: [], meta: {} } });
    await getActionRequiredDocuments(2);
    const actionUrl = mockedApi.get.mock.calls[1][0] as string;
    expect(actionUrl).toContain(
      "filter.processingStatus=%24in%3APENDING%2CFAILED",
    );
  });

  it("calls document read/update/mutation endpoints", async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: { document: { id: "doc-1" }, url: "https://signed" },
    });
    const docUrl = await getDocumentUrl("doc-1");
    expect(docUrl.url).toBe("https://signed");
    expect(mockedApi.get).toHaveBeenCalledWith("/documents/doc-1");

    mockedApi.patch.mockResolvedValueOnce({
      data: { id: "doc-1", title: "A" },
    });
    await updateDocument("doc-1", { title: "A" } as any);
    expect(mockedApi.patch).toHaveBeenCalledWith("/documents/doc-1", {
      title: "A",
    });

    mockedApi.patch.mockResolvedValueOnce(undefined as any);
    await bulkUpdateDocuments(["doc-1", "doc-2"], "cat-1");
    expect(mockedApi.patch).toHaveBeenCalledWith("/documents/bulk-update", {
      documentIds: ["doc-1", "doc-2"],
      categoryId: "cat-1",
    });

    mockedApi.post.mockResolvedValue({ data: { id: "doc-1" } as any });
    await triggerAiClassification("doc-1");
    await triggerAiTitleGeneration("doc-1");
    await triggerIndex("doc-1");
    await triggerEmbedding("doc-1");
    expect(mockedApi.post).toHaveBeenCalledWith("/documents/doc-1/classify");
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/documents/doc-1/generate-title",
    );
    expect(mockedApi.post).toHaveBeenCalledWith("/documents/doc-1/index");

    mockedApi.delete.mockResolvedValueOnce(undefined as any);
    await deleteDocument("doc-1");
    expect(mockedApi.delete).toHaveBeenCalledWith("/documents/doc-1");
  });
});
