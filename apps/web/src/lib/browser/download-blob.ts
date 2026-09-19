/** How long the browser gets to start the download before its backing bytes are released. */
const REVOKE_DELAY_MS = 1_000;

/**
 * Saves bytes the application already holds under `fileName`. API bytes need the bearer token, so
 * a plain link to `/api/...` would answer 401: every download is fetched through the HTTP client,
 * then handed to the browser here (object URL, `<a download>`, revoke).
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  // Firefox only follows a programmatic click on an anchor that is in the document.
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
