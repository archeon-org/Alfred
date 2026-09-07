# CORE-04 idempotency

Import `IdempotencyModule` once (wired in AppModule), then add `@Idempotent()` to a
private POST handler returning a single finite JSON response through Nest. No product route
opts in yet. The authenticated user ID and key identify a reservation across sessions.
The SHA-256 fingerprint includes uppercase method, original URL (concrete path and query),
and recursively key-sorted JSON body; array order matters. Query order is deliberately significant.
Guards still run before replay. Headers are never stored or replayed. Public/auth routes,
non-POST methods and cookie-setting responses are rejected for keyed execution.

The decorator must never be used for credential-bearing payloads, streams, raw `@Res()` handlers,
or responses transformed by outer interceptors. Authors must ensure their JSON bodies contain no
authentication secrets; arbitrary product fields are not classified as secrets by their names.
The body is captured only after successful observable completion, before Nest sends the response.

Reservation uses an autocommitted INSERT ON CONFLICT before calling the handler. Contenders
wait at most two seconds including database latency, then receive 409. A timed-out database
operation may finish later, but cannot cause the handler to run after timeout.
Only 2xx status and a JSON snapshot are persisted before returning success; 204 stores JSON null.
Each row adds a non-null `reservation_id uuid` generated for the winning attempt. Completion
requires this token and an unexpired row, so a delayed old handler cannot fill a replacement
reservation even with the same user, key and hash. Cleanup uses PostgreSQL `now()` to avoid
application clock skew releasing keys early.
All entries expire 24 hours after reservation and are removed hourly or on expired-key reuse.

## Transaction and failure limitation

This interceptor does **not** transact the handler's business writes with response persistence.
A handler can commit, throw, crash, disconnect, or succeed while storing the response fails.
Deleting the reservation immediately on any such uncertainty could duplicate the write.
Therefore pending, failed and non-2xx executions retain their reservation until its original
24-hour expiry; they return 409 (or 422 for a changed request) during that window. Even a
validation failure after reservation is retained because this layer cannot prove no side effect.

The deduplication window is **24 hours**, including handler execution and response storage.
Handlers must finish within that window. There is no exactly-once guarantee after expiry,
for handlers that outlive the window, across business transactions, or after database loss.
An operator must reconcile the business outcome before attempting an uncertain request under
a new key. A future feature needing atomic recovery must explicitly join its business write
and stored response in the same database transaction. No migrations run at replica startup.
