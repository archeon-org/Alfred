# ADR 0029: Object-URL Images Under the Web Content Security Policy

- Status: Accepted
- Date: 2026-09-18
- Amends: [ADR 0025](0025-content-security-policy-webassembly.md) (same header, another directive)
- Complements: [ADR 0027](0027-uploaded-file-content-store.md)
- Architecture constraints: ALF-DEC-054 and ALF-DEC-013 (`accepted`: file bytes are served by the
  API, never from a storage address). ALF-DEC-021 and ALF-DEC-023 (`to-decide`: artifact workspace
  and renderer matrix) are **not** implemented here. No register record decides the Content
  Security Policy directives themselves.

## Context

The file library shows a thumbnail for each ready image (`GET /api/files/:id/preview`, a reduced
JPEG copy). The browser authenticates API calls with `Authorization: Bearer`, kept in React memory;
only `/auth/refresh` uses a cookie. An `<img src="/api/files/…/preview">` therefore carries no
credential and answers 401. Every byte path goes through the shared HTTP client instead: the
response is read as a `Blob`, shown through `URL.createObjectURL`, and the URL is revoked when the
image leaves the page (`components/workspace/files/file-thumbnail.tsx`).

nginx serves the production bundle with `img-src 'self' data: https:`. An object URL has the
`blob:` scheme, which that directive does not list: the browser refuses the image and the
thumbnail stays empty, with no visible signal, in production only. Vite's development and preview
servers send no policy, so the defect cannot show there. `apps/web/nginx.conf` is the only place
the policy is written; `test/e2e/support/csp.ts` reads it from that file.

The target-architecture chapters already plan the source:
`docs/architecture/05-frontend-react-vite.md` and `07-communication-et-securite.md` both list
`img-src 'self' data: blob:`.

## Decision

- `img-src` becomes `'self' data: blob: https:` in `apps/web/nginx.conf`. `blob:` is added to
  `img-src` **only**. A `blob:` URL can only be minted by script already running in the page, from
  bytes that script already holds: it names no remote origin and causes no request, so it opens no
  exfiltration channel that `connect-src 'self'` does not already bound.
- `frame-src`, `object-src`, `media-src`, `worker-src` and `script-src` are unchanged. Documents
  (PDF, DOCX) are **not** previewed inside the application: that would need `frame-src blob:` or
  an in-page renderer, which belongs to the undecided ALF-DEC-021/023. A document is downloaded
  (`Content-Disposition: attachment`, fetched through the client and saved by
  `lib/browser/download-blob.ts`).
- An architecture test (`test/architecture/content-security-policy.spec.ts`) pins the `img-src`
  sources whenever the thumbnail creates an object URL, and asserts that no other directive lists
  `blob:`, so that neither file changes alone.

## Consequences

- Image thumbnails render in production. The Markdown renderer is unaffected: it never loads an
  image, whatever the policy allows (`MarkdownView`, ADR 0011 revision).
- `https:` stays in `img-src` for now. Chapter 07's target policy drops it; nothing in the bundle
  needs it today, and removing it is a separate hardening step for the owner of that chapter.
- The browser suites that serve pages under the production policy (`installProductionCsp`) cover
  thumbnails as soon as a scenario opens the explorer with an image; `test/e2e/files.e2e.spec.ts`
  does so.

## Alternatives Considered

- **A cookie or a signed URL for `/files/:id/preview`.** Rejected: it would add a second credential
  path to the API for one `<img>`, against the session model of
  [ADR 0003](0003-authentication-and-persistence.md) (access token in React memory, a cookie for
  refresh only).
- **`data:` URLs built from the bytes.** Already allowed by the policy, but each image would be
  base64-encoded in memory and in the DOM, a third larger and never released by a revoke.
- **No thumbnail.** Rejected by the product owner: previews of images are part of the explorer.
