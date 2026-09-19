# ADR 0025: WebAssembly Under the Web Content Security Policy

- Status: Accepted
- Date: 2026-09-16
- Amends: [ADR 0011](0011-frontend-design-system.md) (2026-09-16 revision: rendering dependencies)
- Architecture constraints: ALF-DEC-046 (`accepted`, browser surface), ALF-DEC-021 (`accepted`,
  deployment profile of the web container). No register record decides the Content Security Policy
  directives themselves.

## Context

The chat answer highlights finished code blocks with `shiki` (ADR 0011 revision). The JavaScript
regular-expression engine tokenised whole TypeScript lines as one token on WebKit, so the
highlighter loads the Oniguruma engine, a WebAssembly module bundled with the application and
compiled from bytes at first use (`lib/markdown/highlight.ts`).

nginx serves the production bundle with `script-src 'self'`. Under that directive the browser
refuses to compile WebAssembly (`CompileError: … violates … script-src 'self'`); the highlighter
catches the failure and every block stays plain text, with no visible signal. The Docker image
verified on 2026-09-16 still shipped the JavaScript engine, so the 9/9 browser pass recorded that
day did not cover the final combination; an independent review reproduced the failure against a
copy of the current bundle and nginx configuration.

The target-architecture chapters take a position: `docs/architecture/05-frontend-react-vite.md`
("no WASM in V1", written about office editors) and `07-communication-et-securite.md` ("no
`'wasm-unsafe-eval'` by default; if a component requires it, the directive is added and
documented in an ADR, never silently").

## Decision

- `script-src` becomes `'self' 'wasm-unsafe-eval'` in `apps/web/nginx.conf`. `'wasm-unsafe-eval'`
  is the directive the CSP specification introduced for exactly this case: it allows compiling
  WebAssembly and nothing else. `'unsafe-eval'` (JavaScript `eval`, `new Function`) stays refused,
  as do inline scripts, remote scripts, nonces and hashes.
- The highlighter keeps the Oniguruma engine, for identical tokens on Chromium, Firefox and WebKit.
- Two checks tie the two files together so that neither changes alone: an architecture test
  (`test/architecture/content-security-policy.spec.ts`) asserts the `script-src` sources whenever
  the highlighter imports the Oniguruma engine, and the Markdown browser suite serves every page
  under the policy read from `nginx.conf` (`test/e2e/support/csp.ts`), so the built bundle's
  highlighting is verified by the browser on three engines, at 390 and 1440 px.

## Consequences

- The only code that can run WebAssembly is code already allowed by `script-src 'self'`: the
  directive widens what our own bundle may do, not who may provide code. A future report-only
  `require-trusted-types-for` (architecture chapter 07) is unaffected.
- This is the documented divergence chapter 07 asks for. Chapter 05's "no WASM in V1" refusal was
  written for office editors; the decision owner may still prefer to give up cross-browser token
  fidelity instead. The alternative is one line in `highlight.ts` (JavaScript engine) and one in
  `nginx.conf`, plus the architecture test; the browser suite then documents WebKit's coarser
  tokens. Shiki's precompiled grammars (`@shikijs/langs-precompiled`, JavaScript raw engine) are
  a third option to evaluate: no WebAssembly, no regex translation at runtime, ES2024 regex
  support required from the browser.
- Mermaid's `style-src 'unsafe-inline'` (ADR 0011 revision) is unchanged.
