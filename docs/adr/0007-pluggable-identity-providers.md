# ADR 0007: Pluggable Identity Provider Boundary

- Status: Accepted
- Date: 2026-09-04

## Context

ADR 0006 separated Alfred users from external identities, but the authentication orchestration,
routes and React login page still depended directly on Google. Adding Microsoft, GitHub or an
enterprise identity system would therefore have required changes throughout the API and web
application. OAuth login state also did not record the provider that created it, leaving no common
boundary at which to reject a callback presented to the wrong provider.

## Decision

- External identity integrations implement the `IdentityProvider` port. An adapter owns its remote
  protocol, configuration, callback credential verification and conversion to `VerifiedIdentity`.
- `IdentityProviderRegistry` is the only provider lookup used by the authentication orchestrator.
  It rejects unknown, disabled and duplicate provider keys and publishes only safe display
  metadata.
- One-time login state records `providerKey` and an adapter-owned string context. State consumption
  verifies the callback provider before the state can be consumed, preventing provider mix-up.
- OAuth-compatible adapters use `/auth/providers/:provider/start` and
  `/auth/providers/:provider/callback`. The existing Google routes remain temporary compatibility
  aliases so already-registered callback URLs continue to work during migration.
- `GET /auth/providers` is the public source of truth for the login page. React renders the returned
  providers and constructs only the generic start URL; session restoration and access-token use
  remain provider-neutral.
- Provider access tokens, ID tokens and assertions remain inside their adapter and are never used as
  Alfred API bearer tokens. Successful verification continues through the existing user identity
  and Alfred session services.
- Protocol-specific HTTP handling may use a small controller adapter. For example, a SAML POST
  binding can normalize its assertion before invoking the same authentication orchestrator; the
  core port does not require every provider to expose identical wire parameters.

## Consequences

- Adding an OIDC/OAuth provider now requires an adapter, its validated configuration, registration
  in the module provider array and focused tests. It does not change users, refresh sessions,
  protected API guards or the React session contract.
- Enterprise issuer, tenant, domain, group and role policies remain explicit adapter or deployment
  policy. Email alone still never links identities.
- This is a compile-time extension boundary, not arbitrary runtime plugin loading. That preserves
  dependency review, startup validation and a closed set of trusted authentication code.
- A future multi-tenant deployment still needs a separate tenant-to-provider policy and explicit
  account-linking workflow. This ADR does not infer either policy from email domains.
