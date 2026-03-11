const mockUseMutation = jest.fn();
const mockUploadDocument = jest.fn();
const mockUploadDocumentsBulk = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useMutation: (...args: any[]) => mockUseMutation(...args),
}));

jest.mock("../../src/services/document", () => ({
  uploadDocument: (...args: any[]) => mockUploadDocument(...args),
  uploadDocumentsBulk: (...args: any[]) => mockUploadDocumentsBulk(...args),
}));

import { useDocumentUpload } from "../../src/hooks/useDocumentUpload";

describe("hooks/useDocumentUpload", () => {
  beforeEach(() => {
    mockUseMutation.mockReset();
    mockUploadDocument.mockReset();
    mockUploadDocumentsBulk.mockReset();
  });

  it("delegates single and bulk uploads with composed state", async () => {
    const mutateSingle = jest.fn(async ({ uri }) => ({ id: uri }));
    const mutateBulk = jest.fn(async ({ documents }) => ({
      count: documents.length,
    }));

    mockUseMutation
      .mockReturnValueOnce({
        mutateAsync: mutateSingle,
        isPending: true,
        error: null,
        isSuccess: false,
      })
      .mockReturnValueOnce({
        mutateAsync: mutateBulk,
        isPending: false,
        error: null,
        isSuccess: true,
      });

    const hook = useDocumentUpload();

    expect(hook.isUploading).toBe(true);
    expect(hook.isSuccess).toBe(true);

    await hook.upload("file://doc.pdf", "AI", "doc.pdf", "application/pdf");
    expect(mutateSingle).toHaveBeenCalledWith({
      uri: "file://doc.pdf",
      classificationSource: "AI",
      originalFilename: "doc.pdf",
      mimeType: "application/pdf",
    });

    await hook.uploadBulk([{ uri: "a" }, { uri: "b" }] as any, "MANUAL", 3);
    expect(mutateBulk).toHaveBeenCalledWith({
      documents: [{ uri: "a" }, { uri: "b" }],
      classificationSource: "MANUAL",
      concurrency: 3,
    });
  });

  it("surfaces first available mutation error", () => {
    const error = new Error("upload failed");

    mockUseMutation
      .mockReturnValueOnce({
        mutateAsync: jest.fn(),
        isPending: false,
        error,
        isSuccess: false,
      })
      .mockReturnValueOnce({
        mutateAsync: jest.fn(),
        isPending: false,
        error: null,
        isSuccess: false,
      });

    const hook = useDocumentUpload();

    expect(hook.error).toBe(error);
  });
});
