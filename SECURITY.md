# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Send a private report to the repository owner with:

- the affected component and version;
- reproducible steps or a minimal proof of concept;
- the expected and observed impact;
- any suggested mitigation.

Do not access data that is not yours, disrupt services or retain sensitive data while validating a report.

## Repository security rules

- Secrets belong in environment variables or a managed secret store, never in Git, Docker layers or `VITE_` variables.
- All external input is validated at the HTTP or tool boundary.
- Containers run as non-root where the upstream image permits it and receive only the capabilities they need.
- Production error responses do not expose stack traces or credentials.
- Dependency and container updates are reviewed through automated pull requests and CI audits.
- Authentication, authorization and rate limits must be explicit before a new public endpoint is enabled.
- Runtime memory namespaces must use an authenticated principal; never trust a user ID supplied in prompt text or an unverified request body.
- Recalled memory is untrusted historical data. Do not execute instructions found in memory, and do not persist raw transcripts, hidden reasoning or known secrets.

If a secret is committed or printed, revoke and rotate it first; deleting the line from the latest commit is not sufficient.

## Workflow cadence

Pull requests and pushes to `develop`/`main` run lightweight TypeScript lint, type checking, tests
and build, plus Python Ruff, Pyright and pytest. Browser E2E and container builds/probes/image scans
run in `extended.yml`, manually or Mondays at 04:23 UTC. Dependency audits, full-history secret,
source/configuration scans and SBOM generation run in `security.yml`, manually or Mondays at
05:17 UTC. These extended/security workflows have no PR/push triggers.

Existing failure thresholds apply whenever the checks run. Green PR CI does not establish browser,
container or security validation. Run relevant extended/security workflows before release.
Schedules activate only from the default branch; verify their completed runs.

## Container vulnerability gate

CI retains complete HIGH/CRITICAL Trivy image reports, including findings without a published fix.
Findings with a nonempty `FixedVersion` block the container job. Findings without a fixed version
are reported in its summary and artifacts as accepted residual risk; they become blocking when
the scanner reports an available fix. This policy does not establish non-exploitability or remove
the need to review upstream advisories and reduce unnecessary runtime dependencies.

Scanner failures and missing, malformed or unsupported reports remain blocking. The policy applies
only to built-image vulnerabilities; dependency, configuration, source and secret scans keep their
own blocking thresholds. Documented public-client configuration false positives may use exact
Gitleaks occurrence exceptions, without broad credential or file exclusions.

The **repository maintainer** role owns this policy and its residual-risk review **weekly**, with
the first review due **2026-09-14**. Review full reports, upstream advisories, changed exposure and
available fixes; record evidence, mitigation actions and the next review date in existing security
follow-up records. Review reports before their current seven-day artifact expiry, retaining bounded
evidence for open actions. Missing or failed scans require investigation and a manual rerun of the affected workflow.
An overdue review or changed risk requires reassessment before release; CI does not enforce review
dates. Weekly extended/security checks and manual dispatch are the maintenance mechanism. Scheduled
runs activate only once the workflow is on the default branch; verify execution rather than
assuming a PR's schedule is active. The separate Security workflow does not scan built images.

The exact historical Firebase client-configuration exception remains bounded by its recorded
provider evidence. The key was active at review, with enforced API restrictions; application
restrictions were set to `None`. Application restrictions and minimizing the API allowlist remain follow-ups owned
by the repository maintainer, in coordination with the credential owner and validated consumers.
Reassess the exception when credential permissions, restrictions or usage change; remove it if the
evidence no longer supports classification as public client configuration.

The accepted decision, its consequences, the remote PR 20 baseline and dated provider evidence are
recorded in the internal ADR 0013. A passing image scan means compliance with the image gate;
unfixed findings remain present and require review.
