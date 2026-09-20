# Regression testing

Regression coverage protects the existing Alfred frontend/API streaming contract under
[ADR 0023](../adr/0023-durable-execution-streaming.md). The deterministic runtime fixtures speak
the existing native LangGraph HTTP protocol. They need neither a model provider nor changes to
the LangGraph platform.

## Automated gates

| Gate                                                       | Every PR and push to develop/main                                     | Weekly and manual                         |
| ---------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| Unit, contract and frontend integration tests              | All suites in `CI`                                                    | Available through manual CI               |
| TypeScript coverage                                        | Existing 80% thresholds for lines, branches, functions and statements | Same thresholds                           |
| Real PostgreSQL API integration                            | `Streaming regression` workflow                                       | Same suite                                |
| Concurrent chats, recovery and runtime diagnostics         | Chromium, Firefox and WebKit; diagnostics on and off                  | Same matrix                               |
| Native reconnect, lost acknowledgement and worker recovery | Fast deterministic regressions                                        | Two- and four-minute real-clock scenarios |
| Complete browser suite and container checks                | Existing cadence unchanged                                            | `Extended checks` workflow                |

Workflow files define the checks; branch protection must separately require their check names to
prevent merging a failing PR. This change does not configure remote branch protection.

## Local commands

Run the ordinary checks with `pnpm verify`. For targeted browser regression:

```bash
pnpm test:regression:browser
```

Install the matching Playwright browsers first if the machine does not have them. The command
runs all three engines twice, with diagnostics explicitly enabled then disabled. It owns fresh
preview servers at `127.0.0.1:4173` and `127.0.0.1:4174`, disables retries, and retains failure
traces, screenshots and videos in `apps/web/test-results/regression-debug-on` or
`regression-debug-off`. It does not use a caller-supplied remote base URL. Do not run another web
build, preview or browser suite concurrently: they share `apps/web/dist` and the regression preview
ports.

For API integration, use an explicitly disposable database: these suites mutate and clean tables.
Never point the test URLs at the application's database. For example:

```bash
docker run --detach --rm --name alfred-regression-pg \
  --publish 127.0.0.1:55445:5432 \
  --env POSTGRES_USER=postgres --env POSTGRES_PASSWORD=regression-test-only \
  --env POSTGRES_DB=alfred_test postgres:16
docker exec alfred-regression-pg pg_isready -U postgres -d alfred_test

export TEST_DATABASE_URL='postgresql://postgres:regression-test-only@127.0.0.1:55445/alfred_test'
export TEST_MIGRATION_DATABASE_URL="$TEST_DATABASE_URL"
export TEST_DATABASE_ADMIN_URL="$TEST_DATABASE_URL"
pnpm --filter @alfred/contracts build
pnpm test:regression:api
pnpm test:regression:soak 120000
pnpm test:regression:soak 240000

docker stop alfred-regression-pg
unset TEST_DATABASE_URL TEST_MIGRATION_DATABASE_URL TEST_DATABASE_ADMIN_URL
```

Wait for `pg_isready` to succeed before running tests. The regression command requires all three
database URLs and enables `REQUIRE_DATABASE_E2E`; missing configuration fails before any test starts.
The API command excludes optional long-run settings inherited from the shell. One pre-existing
runtime-privilege case requires different migration/runtime roles; using the same admin URL does
not exercise that condition. It is unrelated to the streaming soak.

The soak command runs two scenarios sequentially at the requested duration: lost native creation
acknowledgement with processor replacement, and concurrent conversations with the actual recovery
worker. Four minutes therefore means approximately eight minutes plus setup for the whole command.
It checks persisted final text, submission count, stream rejoin positions, browser reattachment and
heartbeat gaps. Regular API regression skips the two optional long scenarios; the soak command
explicitly enables both. Run database suites sequentially against each disposable database.

## Maintaining coverage

Place regression tests beside the relevant external test suites in `apps/api/test` or
`apps/web/test`. Reproduce the externally visible failure and assert the invariant: independent
conversations, a single submission, a retained reply, a bounded retry, or an unaffected session.
Prefer controlled promises, fake timers and protocol fixtures for races and transport faults.
The weekly soak is reserved for properties requiring elapsed wall-clock time.

The browser fixtures exercise the real UI with controlled HTTP responses. PostgreSQL fixtures
exercise the real Alfred services, worker, native adapter and SSE routes against deterministic
native protocol responses. These checks do not establish live-model behavior, reverse-proxy
behavior or recovery from every possible infrastructure outage. In particular, worker loss beyond
the native replay-retention window remains an explicit recovery boundary.
