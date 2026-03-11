import { AxiosError } from "axios";
import { AppError, parseApiError } from "../../src/utils/apiError";

describe("parseApiError", () => {
  it("returns the same AppError instance when already parsed", () => {
    const original = new AppError("Already parsed", 400);
    expect(parseApiError(original)).toBe(original);
  });

  it("parses Axios response errors with string messages", () => {
    const error = new AxiosError("Request failed", "ERR_BAD_REQUEST", {}, {}, {
      status: 422,
      data: {
        statusCode: 422,
        message: "Validation failed",
        error: "Unprocessable Entity",
      },
    } as any);

    const parsed = parseApiError(error);
    expect(parsed).toBeInstanceOf(AppError);
    expect(parsed.message).toBe("Validation failed");
    expect(parsed.statusCode).toBe(422);
    expect(parsed.originalError).toBe(error);
  });

  it("parses Axios response errors with array and plain-string payloads", () => {
    const withArray = new AxiosError(
      "Request failed",
      "ERR_BAD_REQUEST",
      {},
      {},
      {
        status: 400,
        data: {
          statusCode: 400,
          message: ["First", "Second"],
          error: "Bad Request",
        },
      } as any,
    );

    expect(parseApiError(withArray).message).toBe("First\nSecond");

    const withStringPayload = new AxiosError(
      "Request failed",
      "ERR_BAD_REQUEST",
      {},
      {},
      {
        status: 500,
        data: "Server exploded",
      } as any,
    );

    expect(parseApiError(withStringPayload).message).toBe("Server exploded");
  });

  it("returns network message when Axios request has no response", () => {
    const error = new AxiosError("Network down", "ERR_NETWORK", {}, {
      readyState: 4,
    } as any);

    const parsed = parseApiError(error);
    expect(parsed.message).toBe(
      "Network error. Please check your internet connection.",
    );
    expect(parsed.statusCode).toBe(0);
  });

  it("wraps generic Error and unknown values", () => {
    const generic = parseApiError(new Error("Oops"));
    expect(generic.message).toBe("Oops");
    expect(generic.statusCode).toBe(500);

    const unknown = parseApiError({ detail: "??" });
    expect(unknown.message).toBe("An unknown error occurred.");
    expect(unknown.statusCode).toBe(500);
  });
});
