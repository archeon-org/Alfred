# Alfred Web

React 19 and Vite 8 browser application for the Alfred workspace.

## Commands

- `pnpm --filter @alfred/web dev` starts the development server on port 5173.
- `pnpm --filter @alfred/web build` type-checks and creates the production bundle.
- `pnpm --filter @alfred/web test` runs Vitest component tests once.
- `pnpm --filter @alfred/web test:coverage` enforces 80% global coverage.
- `pnpm --filter @alfred/web test:e2e` runs the Playwright browser suite.
- `docker build -f apps/web/Dockerfile .` builds the unprivileged Nginx image.

Only variables prefixed with `VITE_` are exposed to browser code. They must never contain secrets.

## TDD state

The initial component and browser contracts are intentionally in the RED phase. `src/App.tsx` and
`src/main.tsx` are left for the GREEN phase.
