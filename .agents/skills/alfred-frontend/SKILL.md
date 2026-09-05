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
- Follow `docs/development/frontend-guidelines.md` and ADR 0011: use local shadcn primitives first,
  then custom Tailwind compositions when needed. Reserve plain CSS for documented global or complex
  effects. Do not add another UI library solely to fill a missing widget.
- Use semantic role tokens from `styles.css`, not palette utilities or literal JSX colors. Shared
  primitives expose `data-slot`, native `ComponentProps`, typed variants and the `@/lib/cn` helper.
- Keep workspace rendering under `components/workspace` by domain, state in hooks and view models
  in `lib`. Pass the data and callbacks a component needs, not inferred hook return types.
- Preserve the light sage design, visible press/focus/disabled feedback, a relative 11px label
  minimum and OS/application reduced motion. Dark variants require explicit theme activation.
- Preview mocks remain deliberate application inputs until real contracts replace them. Do not
  use mocks as a fallback for failed real requests or introduce a speculative client-state store.
- Preserve keyboard access, labels, focus visibility, reduced motion and narrow-viewport behavior.
- Keep the composer inert until a conversation/AG-UI contract is implemented; do not fake success.
- Keep the source root responsibility-visible: `app`, `routes`, `screens`, `components`, `contexts`,
  `hooks`, `services` and `lib`; group product domains below those boundaries.
- Follow `route -> screen -> hook -> service -> HTTP client`. Components and screens do not call
  `fetch`; services do not import React. Reserve context for global client state, not server caches.
- Send API traffic through the shared same-origin HTTP client. Automatic refresh replay is limited
  to safe methods unless the caller explicitly opts a mutation into retry.
- Keep every test outside `src`, under `test/unit`, `test/integration`, `test/contract`,
  `test/architecture`, `test/e2e` or `test/support`.

## Delivery

Start with a user-observable test. Run frontend lint, typecheck, unit coverage and build. Run Playwright
for routing, authentication, storage or responsive-layout changes.
