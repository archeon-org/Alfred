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
