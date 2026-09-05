# Alfred Web

React 19 and Vite 8 browser application for the Alfred workspace.

## Application shell

- React Router exposes the public `/login` and `/auth/callback` routes and protects `/app`.
- `SessionProvider` restores the session with `POST /auth/refresh` and keeps the short-lived access
  token in React memory only. The refresh cookie is sent with `credentials: include`.
- The authenticated API client accepts only same-origin relative paths, deduplicates concurrent
  refreshes and retries safe reads once. Mutations are never replayed implicitly.
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

Only variables prefixed with `VITE_` are exposed to browser code. They must never contain secrets.

`VITE_API_URL` is a public API base URL. When omitted, browser requests use `/api`: the Vite
development server proxies that path to `ALFRED_DEV_API_PROXY_TARGET` (default
`http://127.0.0.1:3000`). A production deployment that keeps the relative fallback must provide the
equivalent reverse-proxy route. The Compose image instead compiles an explicit public API URL.
