# Alfred Web

React 19 and Vite 8 browser application for the Alfred workspace.

## Application shell

- React Router exposes the public `/login` and `/auth/callback` routes and protects `/app`.
- `SessionProvider` restores the session with `POST /auth/refresh` and keeps the short-lived access
  token in React memory only. The refresh cookie is sent with `credentials: include`.
- The authenticated API client accepts only same-origin relative paths, serializes refreshes across
  tabs with Web Locks and retries safe reads once. Tokens are never persisted or broadcast, and
  mutations are never replayed implicitly.
- Google login is displayed only when the public `GET /features` manifest reports
  `googleOAuth=true`. OAuth starts through the API at `/auth/google/start`; the backend feature guard
  rejects that route when disabled, and no provider secret or client credential is embedded in the
  browser bundle.
- The responsive workspace composes a sidebar, header, conversation area, composer and contextual
  panel from local components.
- Tailwind CSS v4 is compiled by its Vite plugin. The shadcn CLI contract is kept in
  `components.json`; reusable UI primitives live in `src/components/ui`.
- ESLint enforces the latest React Hooks rules and the maintained ESLint-10-compatible JSX
  accessibility rule set.

## Commands

- `pnpm --filter @alfred/web dev` starts the development server on port 5173.
- `pnpm --filter @alfred/web build` type-checks and creates the production bundle.
- `pnpm --filter @alfred/web test` runs Vitest component tests once.
- `pnpm --filter @alfred/web test:coverage` enforces 80% global coverage.
- `pnpm --filter @alfred/web test:e2e` runs the Playwright browser suite.
- `docker build -f apps/web/Dockerfile .` builds the unprivileged Nginx image.

Playwright serves a fresh production build through Vite preview, so its session/StrictMode timing
matches the shipped bundle rather than the development-only effect replay.

Only variables prefixed with `VITE_` are exposed to browser code. They must never contain secrets.

`VITE_API_URL` may only be a same-origin relative base path and defaults to `/api`; absolute URLs are
rejected at build time. The Vite development server proxies that path to the server-only
`ALFRED_DEV_API_PROXY_TARGET` (default `http://127.0.0.1:3000`). Production must provide the
equivalent same-origin reverse-proxy route. Compose compiles `/api` and does not expose the upstream
API origin to browser code.
