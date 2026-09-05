---
name: alfred-frontend
description: Build or change Alfred React/Vite routes, secure session flows, UI components, layouts, accessibility, or frontend tests.
---

# Alfred Frontend

Work only in `apps/web` plus directly related API contracts and documentation. Alfred uses React and
Vite; do not migrate it to Next.js without an accepted architecture decision.

## Invariants

- Keep `/login` and `/auth/callback` public and place workspace routes behind `RequireSession`.
- Hydrate sessions through `POST /auth/refresh` with `credentials: include`. Keep access tokens only in
  React memory; never write tokens or conversation content to browser storage.
- Validate API envelopes at the boundary and fail closed on malformed or unavailable auth responses.
- Accept only same-origin relative return paths. Authentication UI must not become an open redirect.
- Keep feature components small and compose local shadcn-style primitives from `components/ui`.
- Preserve keyboard access, labels, focus visibility, reduced motion and narrow-viewport behavior.
- Keep the composer inert until a conversation/AG-UI contract is implemented; do not fake success.

## Delivery

Start with a user-observable test. Run frontend lint, typecheck, unit coverage and build. Run Playwright
for routing, authentication, storage or responsive-layout changes.
