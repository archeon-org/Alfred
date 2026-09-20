# Workspace affiliation operations

This runbook implements [ADR 0021](../adr/0021-multiple-workspace-memberships.md). Each account has
one tenant and may belong to multiple workspaces in that tenant. Workspace membership grants no access to another
account's projects, conversations, context or skills.

## Apply the migration

Use the established [migration gate](deployment.md#migration-gate) with a backup and the updated
API build. Drain/stop old API writers first: the new migration removes the old user workspace
column, which old builds still reference. Run migrations once, run the schema drift check and
then start the updated API. Publish the updated frontend after the API endpoint is available.

The historical `CreateWorkspaces1789280000000` creates `api_workspaces` and the initial single
affiliation. The next migration at timestamp `1789290000000` creates `api_workspace_memberships`,
copies each existing user/workspace link, then removes `api_users.workspace_id`. Keep both
migrations in history. Projects, conversations, ownership and content are not updated. Composite
foreign keys from the membership to the user and workspace require the same tenant; the primary
key prevents duplicate links. This is a transactional, coordinated rollout, not zero downtime.

Re-running the normal migration runner uses its ledger rather than reapplying the migration.
The default workspace remains the enrollment destination for new accounts in the bootstrap tenant.
Provisioning a new tenant or mapping enterprise identities to tenants is outside this command.

## Provision a team

Run with an explicitly injected `DATABASE_URL` and the normal validated database settings.
The operator must be authorized to manage accounts in this database. There is no HTTP admin
endpoint, browser self-assignment or implied privilege for the existing `admin` role.
Do not paste connection credentials into command history. Source commands run from the repository
root after installing dependencies and building `@alfred/contracts`.

```bash
pnpm --filter @alfred/api workspace:provision --help
pnpm --filter @alfred/api workspace:provision create <tenant-id> finance "Équipe Finance"
pnpm --filter @alfred/api workspace:provision rename <tenant-id> <workspace-id> "Finance Europe"
pnpm --filter @alfred/api workspace:provision assign <tenant-id> <workspace-id> <user-id>
pnpm --filter @alfred/api workspace:provision unassign <tenant-id> <workspace-id> <user-id>
pnpm --filter @alfred/api workspace:provision archive <tenant-id> <workspace-id>
```

Replace angle-bracket placeholders with verified UUIDs; do not type the brackets into a shell.
Creation outputs the new workspace ID. In a built API image, use
`node dist/database/provision-workspace.js` with the same arguments. The CLI does not apply
migrations automatically. `--help` and argument validation work without connecting to the database.
Invalid input or a failed operation exits unsuccessfully with a stable code and a controlled
diagnostic, without printing database credentials, raw input, stack traces or query details.

| Code                                       | Operator action                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `WORKSPACE_INVALID_ARGUMENTS`              | Follow the printed usage; verify UUIDs, slug and name limits.                       |
| `WORKSPACE_TENANT_UNAVAILABLE`             | Verify the tenant exists and is active.                                             |
| `WORKSPACE_UNAVAILABLE`                    | Verify the workspace belongs to that tenant and is active.                          |
| `WORKSPACE_USER_UNAVAILABLE`               | Verify the user belongs to that tenant.                                             |
| `WORKSPACE_LAST_MEMBERSHIP`                | Assign another team before removing this link.                                      |
| `WORKSPACE_DEFAULT_ARCHIVE_FORBIDDEN`      | Keep the default enrollment team active.                                            |
| `WORKSPACE_OCCUPIED`                       | Remove the team's memberships before archiving it.                                  |
| `WORKSPACE_SLUG_EXISTS`                    | Choose another slug within this tenant.                                             |
| `WORKSPACE_DATABASE_CONFIGURATION_INVALID` | Verify the URL and validated database environment settings.                         |
| `WORKSPACE_DATABASE_CONNECTION_REFUSED`    | Check that PostgreSQL is running and the configured host/port are reachable.        |
| `WORKSPACE_DATABASE_HOST_NOT_FOUND`        | Verify the configured hostname and DNS.                                             |
| `WORKSPACE_DATABASE_CONNECTION_TIMEOUT`    | Check network access and PostgreSQL availability.                                   |
| `WORKSPACE_DATABASE_AUTHENTICATION_FAILED` | Verify credentials and PostgreSQL authentication rules.                             |
| `WORKSPACE_DATABASE_PERMISSION_DENIED`     | Verify the operator role's provisioning grants.                                     |
| `WORKSPACE_DATABASE_NOT_FOUND`             | Verify the database name and initialization.                                        |
| `WORKSPACE_COMMAND_FAILED`                 | An unclassified failure occurred; use the deployment's restricted diagnostic tools. |

- Slugs are bounded lowercase alphanumeric/hyphen identifiers, unique within one tenant.
- Tenant and target workspace must be active for changes. Renaming preserves its ID and slug.
- Assignment requires the user and workspace to belong to the explicit tenant. It adds the link
  idempotently and preserves all existing memberships, the tenant and personal resources.
- Unassignment removes only the requested link and refuses to remove the user's last membership.
  To move someone, assign the new team first, then explicitly unassign the old team. The normal
  account creation/removal flows maintain at least one link; foreign keys alone do not enforce
  that minimum against arbitrary direct SQL.
- Archiving refuses the default enrollment workspace and any workspace still containing users,
  including disabled accounts. Reassign them explicitly first. There is no destructive delete.
- Operations serialize through tenant/workspace/user locks so archival cannot race a supported
  assignment or account enrollment into the same team. Direct ad hoc SQL bypasses application
  status rules even though the database still enforces required/composite foreign keys.

Record the operator, approved change and outcome in the deployment's existing restricted audit
process. This CLI does not introduce a new durable product audit log or member directory.

## Verify the result

The authenticated endpoint `GET /api/users/me/workspaces` returns only the caller's tenant and active
team IDs/names as a list sorted by French name collation, then ID for equal names. It replaces the singular endpoint. The sidebar displays these teams
alongside `Espace personnel`, with expansion for longer lists. Data stays fresh for 60 seconds;
mounting the view or returning focus revalidates stale data. There is no periodic polling and
rotating the session token alone does not reload affiliations. A network/5xx error may retain the
same account's last received names with a refresh warning. Authentication, authorization or invalid
response errors hide the names; missing initial data is shown as unavailable, never as another
user's cached team or a fabricated default. Tenant suspension does not reject this informational
read alone; user status and existing resource authorization still apply.

After adding a team, verify both memberships appear and the account's own existing projects and
standalone chats remain available. A second account in the same team must still get a 404 for
the first account's project/chat IDs and must not see those resources in its lists.

## Rollback

Keep the schema and use a compatible application build when possible. Old single-workspace builds
reference the removed column. Rollback of the new migration refuses if any user has zero or more
than one membership; it never chooses an arbitrary team or silently deletes extra links. The
older migration also protects customized workspaces. A deliberate reversal must preserve all
affiliation data and account for active writers. Do not delete user accounts, projects or
conversations to make a rollback pass.
