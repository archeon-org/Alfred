# ADR 0027: Provider-Neutral Content Store for Uploaded Files

- Status: Accepted implementation plan, validated by the product owner on 2026-09-17; revised
  2026-09-18 after six independent reviews
- Date: 2026-09-17
- Amends: [ADR 0010](0010-capability-flags-and-operational-fallbacks.md) (file storage paragraph
  and inventory row)
- Complements: [ADR 0005](0005-environment-feature-flags.md),
  [ADR 0028](0028-personal-file-library.md)
- Architecture constraints: ALF-DEC-054, ALF-DEC-029, ALF-DEC-013 and ALF-DEC-055 (`accepted`),
  ALF-DEC-010 (`accepted-with-risk`), workshop Revision 86 (owner steering); ALF-DEC-051 and
  ALF-DEC-019 (`in-discussion`, not implemented).

## Context

Alfred had no upload path: `FEATURE_FILE_UPLOADS_ENABLED` existed and stayed false, the right panel
tab « Fichiers » was a placeholder, and the composer paperclip did nothing. The product owner asked
for PDF, DOCX and image uploads that reach the agent, and for the storage to work against any
S3-compatible provider — AWS S3, MinIO, Cloudflare R2, IBM COS, Scaleway, OVH — while a developer
machine without a bucket keeps its files on disk.

ALF-DEC-054 already decided the boundary: PostgreSQL owns metadata, revisions, extracted text and
quotas, while exact bytes live behind an `ArtifactContentStore` port whose adapters may be a
protected filesystem, bounded PostgreSQL `bytea` or S3/COS. ALF-DEC-029 fixed the port's shape.
This ADR implements that port and its first two adapters; [ADR 0028](0028-personal-file-library.md)
covers the product model built on it.

## Decision

- `ArtifactContentStore` (`apps/api/src/modules/files/domain/content-store.port.ts`, an interface
  bound to the `ARTIFACT_CONTENT_STORE` symbol like the repository's other ports) is the only way
  product code touches file bytes: `put`, `get`, `exists`, `delete`, `probe`, `close`, keyed by an
  opaque server-derived `contentId`. No caller supplies a namespace, and no caller receives a bucket
  name, a provider address, a credential or a pre-signed URL. Every call takes an `AbortSignal`;
  the S3 adapter honours it, the development adapter's short local writes do not.
- **`put` is create-once**, as ALF-DEC-029 requires: writing a content identity again with the same
  bytes succeeds, so an upload retry is harmless; writing it with different bytes raises
  `content_conflict`, because a stored revision is immutable. It returns the byte size and the
  SHA-256. The local adapter publishes a staged file with a hard link, which fails when the name is
  taken; the S3 adapter reads before it writes, because a conditional `PutObject` is not portable
  across providers. Two writers on one identity do exist since 2026-09-20 — two requests carrying
  one `uploadId` share their content (ADR 0028) — and are harmless: admission pins the SHA-256, so
  both write the same bytes. Any other identity is a fresh server-side UUID.
- One key layout serves every adapter: `contents/{first two characters}/{contentId}`, optionally
  under a configured bucket prefix. Neither a file name nor any user-authored text reaches a key,
  and ALF-DEC-055 §6 keeps tenant and project identifiers out of physical keys: tenant isolation is
  enforced by the product layer, which resolves every `contentId` from one of its own rows. The
  fan-out only serves the on-disk adapter; a test pins that identities spread across it.
- `LocalContentStore` is the development adapter: staged write, `fsync`, publication by hard link,
  files `0600` and directories `0700`, and a second check that the resolved path stays inside the
  configured root. `S3ContentStore` is the production adapter: plain `PutObject`, `GetObject`,
  `HeadObject`, `DeleteObject` and `HeadBucket`, no provider-specific feature, one request per file
  because a file is capped at 25 MiB at most (`FILE_MAX_BYTES_CEILING`), below the multipart
  threshold, and `Content-MD5` on every write —
  the one integrity header every compatible provider verifies.
- The S3 client is configured for portability: `requestChecksumCalculation` and
  `responseChecksumValidation` at `WHEN_REQUIRED` (since v3.729 the SDK otherwise adds a CRC32
  checksum header to every upload, and `aws-chunked` framing to streamed ones; OVH rejects both);
  explicit connection, request and socket timeouts with `throwOnRequestTimeout`, because the
  handler's defaults are unlimited; `expectContinueHeader: false`, because from 2 MiB the SDK would
  send `Expect: 100-continue` on a fresh non-pooled connection that some corporate proxies stall on;
  `maxAttempts: 3`. `forcePathStyle` defaults to what the endpoint implies: path-style for a
  non-AWS endpoint, host-style for AWS.
- Static keys are optional and come as a pair, with an optional session token. Without them the
  SDK's default chain resolves an IAM role, IRSA or an ECS task role. The principal needs
  `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on the objects and `s3:ListBucket` on the
  bucket: without the latter a provider answers 403 instead of 404 for an absent key.
- "Absent" is `NoSuchKey` or `NotFound` by error name only. A missing bucket (`NoSuchBucket`, also
  a 404), a forbidden read and a response without a body are raised: reading them as absence would
  let a later collection purge metadata during a storage outage.
- The adapter is selected once at startup, by configuration only, and never at runtime: a failing
  bucket write is an error, never a silent write to a second store. A described bucket selects S3;
  no `FILE_STORAGE_S3_*` value selects the local directory; a partial description fails at startup,
  and `resolveFileStorageSettings` refuses it too rather than choosing the disk. The capability
  being off binds a `DisabledContentStore` that raises `storage_unavailable` — never `null` — and
  "on" means the effective flag of `FeatureFlagsService`, configured and implemented.
- The store is probed before the API accepts traffic (`ContentStoreLifecycle`): a write probe on
  disk, `HeadBucket` on S3. An enabled capability whose storage cannot be reached refuses to start.
  Readiness reports a cached `storage` dependency while the capability is on, and nothing otherwise.
- Local storage is a development profile by the owner's decision (2026-09-17):
  `validateFileStorageEnvironment` refuses it when `NODE_ENV` is `production`, where a bucket is
  required, its endpoint must be plain HTTPS without credentials, and its secret must not be a
  committed placeholder. The Compose API container has a read-only filesystem, so Compose work on
  uploads uses the `files` profile, whose bucket step creates a user limited to the bucket; the
  MinIO administrator is a separate generated secret that the API never receives.
- `describeContentStoreContract` is one suite both adapters pass, against the disk, an in-memory S3
  service whose errors carry the SDK's names, and a real provider when `TEST_FILE_STORAGE_S3_*` is
  set. The same suite qualifies R2, COS or AWS before a switch.

## Consequences

- A deployment can change provider without touching product code. ALF-DEC-054's `ContentLocation`
  indirection is not implemented: a deployment that switches store strands its existing content
  until that migration exists, and the port has no `list`, by ALF-DEC-029's design, so a
  reconciliation after a point-in-time restore needs a provider-side inventory.
- **Deviation from ADR 0010 and ALF-DEC-054, for the decision owner.** ADR 0010 made local
  persistent storage the default adapter, and ALF-DEC-054 accepts PostgreSQL `bytea` as the V1
  fallback so that a PostgreSQL-only client stays deployable. The owner selected S3-or-local with
  local for development only. A client without an object store needs a third adapter behind this
  port (`bytea`, or the local adapter allowed on a mounted persistent volume).
- **Deviation from Revision 86, for the owner of ALF-DEC-051/019.** Revision 86 accepted a brief
  retention of originals with automatic expiry. On the owner's instruction an original is kept
  until its owner deletes it. Originals are therefore durable user content held outside the
  PostgreSQL backup boundary: **bucket backup or versioning is a deployment prerequisite**, and on a
  versioned bucket `DeleteObject` only writes a delete marker, so a lifecycle rule that expires
  noncurrent versions is required for a deletion to be real.
- Enterprise egress is not addressed: the SDK's Node handler ignores `HTTPS_PROXY`, and an internal
  certificate authority must be supplied through `NODE_EXTRA_CA_CERTS`.
- The reference S3 server of the `files` profile, MinIO community edition, was archived in April
  2026 and receives no fix; its images come from quay.io. It is acceptable for development only,
  and a provider must be qualified with the contract suite before go-live.
- Azure Blob Storage is not S3-compatible and is out of scope; it would need its own adapter
  (`@azure/storage-blob`) behind this same port rather than an S3 gateway.

## Alternatives Considered

- **One adapter per provider (an R2 adapter, a COS adapter).** Rejected: ALF-DEC-054 explicitly
  refuses duplicating authorization, revision resolution and quota behaviour per provider, and it
  would make Alfred behave differently across installations.
- **Pre-signed upload and download URLs.** Rejected for V1: ALF-DEC-054 forbids handing a provider
  address or physical key to the browser or the agent runtime. Bytes pass through the API.
- **Conditional `PutObject` (`If-None-Match: *`) for create-once.** Not portable: providers without
  conditional writes answer 501. Read-before-write is, at the cost of one request on a first write.
- **Streaming multipart uploads (`@aws-sdk/lib-storage`).** Not needed while a file is capped at
  25 MiB at most; a single `PutObject` keeps the adapter and its tests small.
- **An explicit `FILE_STORAGE_DRIVER` variable.** The owner asked for selection by the presence of
  a bucket. The selection is logged at startup and probed, and an inconsistent description fails
  instead of falling back, which is what ADR 0010's "explicit and durable" protects.
