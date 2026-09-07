# ADR 0013: CI Security Risk Policy

- Status: Accepted
- Date: 2026-09-07
- Maintenance and residual-risk review owner: repository maintainer (role)
- Review cadence: weekly; first review due 2026-09-14
- Operational policy: [SECURITY.md](../../SECURITY.md)

## Context

PR 20's accepted policy distinguishes image findings with an available fix from findings without
one. On commit `76b60211360cd25ccc881e8df948c86133d32cf2`, all nine remote checks passed:
[CI 34151592390](https://github.com/archeon-org/archeon/actions/runs/34151592390) and
[Security 34151592391](https://github.com/archeon-org/archeon/actions/runs/34151592391).
The AMD64 image reports still contain **135 unfixed package findings**: PostgreSQL 75
(62 HIGH / 13 CRITICAL), local agent 60 (55 HIGH / 5 CRITICAL). API, migration, web and standalone
agent images report zero HIGH/CRITICAL findings. These are package findings, not 135 unique
vulnerabilities or vulnerabilities fixed by the policy. Passing checks do not establish production
readiness or non-exploitability.

## Decision

- Preserve complete HIGH/CRITICAL image reports, including unfixed findings, using
  `ignore-unfixed: false`. Only findings with a nonempty, trimmed `FixedVersion` block the image
  vulnerability gate. Unfixed HIGH and CRITICAL findings remain explicitly accepted residual risk;
  a newly reported fixed version makes them blocking on the next scan.
- Scanner failures and missing, malformed or unsupported reports are fatal. Report-generation
  `exit-code: '0'` does not waive technical failures. The separate
  [image policy checker](../../scripts/check-image-vulnerabilities.mjs) validates all six reports;
  there is no scanner `continue-on-error` exemption. Other dependency, configuration, source and
  secret gates retain their own thresholds.
- Retain only the exact historical Firebase occurrence exception recorded in
  [.gitleaksignore](../../.gitleaksignore), identified by commit, path, rule and line. The
  [provider review](../memory-bank/sessions/2026-09-07-firebase-client-key-review.md) records a
  cryptographic match to an active public Android client configuration key and inspected API
  restrictions. This is an evidence-based classification, not revocation or a blanket key/file
  exclusion. That dated review found application restrictions set to `None`; application
  restrictions and API allowlist minimization remain hardening follow-ups. No fresh provider
  inspection is implied by this ADR.

## Maintenance and Consequences

The repository maintainer owns the weekly review of full image reports, upstream advisories,
available fixes, runtime exposure and continued justification for residual risk. Record the run,
image identity, findings/count changes, mitigation or update actions, and next review date in the
existing security follow-up/session records. Review promptly when exploitability, exposure or
credential restrictions change; absence of a published fix does not mean absence of risk.

The full CI workflow must support weekly rebuilds/scans and manual dispatch. The workflow now includes these triggers; the verified `76b6021` baseline predates them. Scheduled
runs execute only from the default branch: a change on the PR branch alone does not activate them.
The maintainer must verify default-branch availability and a completed run; a missing/failed run
requires a manual full-CI rerun and investigation. The separate Security schedule does not replace
built-image scans. Reports currently expire after seven days; review them before expiry and retain
bounded evidence needed for open follow-ups, or rerun scans when evidence has expired.

Available fixes require an update/rebuild before the image gate can pass. Unfixed findings require
continued assessment and feasible mitigation, including removing unnecessary packages. An overdue
review or materially changed exposure requires explicit reassessment before relying on the accepted
risk for release; CI does not automatically enforce review dates or approve deployments.

The same role owns the Firebase restrictions follow-up, coordinating with the credential owner to
validate consumers before changes. Reassess the exact exception if API access, application
restrictions, service-account binding or usage changes; remove it if its justification no longer
holds. Full-history secret scanning remains enabled. The role assignment defines maintenance
responsibility and does not claim acceptance by a named person.
