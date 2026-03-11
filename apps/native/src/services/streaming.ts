type StreamingFetch = (input: string, init?: RequestInit) => Promise<Response>;

const resolveStreamingFetch = async (): Promise<StreamingFetch> => {
  const isReactNative =
    typeof navigator !== "undefined" && navigator.product === "ReactNative";

  if (isReactNative) {
    try {
      const expoFetch = await import("expo/fetch");
      if (typeof expoFetch.fetch === "function") {
        return expoFetch.fetch as StreamingFetch;
      }
    } catch {
      // Fallback to global fetch when expo/fetch isn't available.
    }
  }

  return fetch as StreamingFetch;
};

const parseNdjsonFromText = (
  text: string,
  processLine: (line: string) => void,
): void => {
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => processLine(line));
};

export const fetchStreamResponse = async (
  url: string,
  init: RequestInit,
): Promise<Response> => {
  const streamFetch = await resolveStreamingFetch();
  return streamFetch(url, init);
};

export const consumeNdjsonStream = async (
  response: Response,
  processLine: (line: string) => void,
): Promise<void> => {
  const responseBody = response.body as
    | { getReader?: () => ReadableStreamDefaultReader<Uint8Array> }
    | null
    | undefined;
  if (!responseBody || typeof responseBody.getReader !== "function") {
    const content = await response.text();
    parseNdjsonFromText(content, processLine);
    return;
  }

  const reader = responseBody.getReader();
  const decoder =
    typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8") : null;
  const decodeChunk = (value: Uint8Array, stream: boolean): string => {
    if (decoder) {
      return decoder.decode(value, { stream });
    }
    return String.fromCharCode(...value);
  };

  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    buffer += decodeChunk(value, true);
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      processLine(line);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  const tail = decoder ? decoder.decode() : "";
  if (tail) {
    buffer += tail;
  }
  if (buffer.trim()) {
    processLine(buffer);
  }
};
