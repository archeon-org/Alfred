# ADR 0006: Provider-Neutral Identity and Runtime Principal Boundary

- Status: Accepted
- Date: 2026-09-03

## Context

Google OAuth is useful for an external Alfred deployment but is not the Enterprise identity provider.
Binding the application user directly to a Google subject would make the database and future
Agent Server handoff provider-specific. Reusing the browser access token across the API and agent
runtime would also couple two independent trust boundaries to one symmetric secret.

## Decision

- `users` contains the provider-independent Alfred account. `user_identities` links that account to
  an external identity through the unique pair `(issuer, subject)` and records the provider only as
  metadata.
- A verified email is a profile and collision signal, not a federation key. Alfred never links a
  new issuer/subject to an existing account only because the email matches; the collision is
  rejected until an explicit account-linking policy exists.
- User and identity creation occurs in one PostgreSQL transaction. Concurrent first logins recover
  from the unique identity constraint instead of creating duplicate accounts.
- The short-lived HS256 browser token remains internal to the React-to-NestJS boundary. It must not
  be forwarded as the future Agent Server credential.
- The API-to-Agent-Server integration will authenticate the service channel independently and send
  only the minimum principal/authorization context required for the run. If the Agent Server must
  verify signed principal assertions independently, Alfred will use an asymmetric key and JWKS
  rotation rather than sharing the browser JWT secret.
- Browser/API wire contracts live in `packages/contracts` as runtime Zod schemas plus inferred
  TypeScript types. The package contains no persistence entities or business services.

## Consequences

- Enterprise SSO can be added as another identity adapter without changing the core user table or the
  browser session shape.
- Email ownership changes cannot silently take over an Alfred account. Intentional account linking
  needs a separate authenticated workflow and audit trail.
- The complete API-to-Agent-Server identity handoff remains deliberately unimplemented until the
  AG-UI invocation contract and Enterprise service-authentication mechanism are selected.
- Docker images that build API or web must build and include `@alfred/contracts`; host-only builds
  are not sufficient evidence.
