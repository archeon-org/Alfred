import type { DataSource } from 'typeorm';
import { z } from 'zod';
import { WorkspaceCommandError } from '../modules/workspaces/application/workspace-command-error';
import {
  parseWorkspaceCommand,
  provisionWorkspace,
} from '../modules/workspaces/application/workspace-provisioning';

const usage =
  'Usage: create <tenant-id> <slug> <name> | rename <tenant-id> <workspace-id> <name> | assign <tenant-id> <workspace-id> <user-id> | unassign <tenant-id> <workspace-id> <user-id> | archive <tenant-id> <workspace-id>';
const slugConflict = z.object({
  driverError: z.object({
    code: z.literal('23505'),
    constraint: z.literal('uq_workspaces_tenant_slug'),
  }),
});
const errorCode = z.object({ code: z.string() });
const wrappedErrorCode = z.object({ driverError: errorCode });
const databaseDiagnostics: Readonly<Record<string, string>> = {
  ECONNREFUSED:
    'WORKSPACE_DATABASE_CONNECTION_REFUSED: Database connection refused. Check that PostgreSQL is running and the configured host and port are reachable.',
  ENOTFOUND:
    'WORKSPACE_DATABASE_HOST_NOT_FOUND: Database host could not be resolved. Check the configured hostname and DNS.',
  ETIMEDOUT:
    'WORKSPACE_DATABASE_CONNECTION_TIMEOUT: Database connection timed out. Check network access and PostgreSQL availability.',
  '28P01':
    'WORKSPACE_DATABASE_AUTHENTICATION_FAILED: PostgreSQL rejected authentication. Check the configured credentials and database access rules.',
  '28000':
    'WORKSPACE_DATABASE_AUTHENTICATION_FAILED: PostgreSQL rejected authentication. Check the configured credentials and database access rules.',
  '42501':
    'WORKSPACE_DATABASE_PERMISSION_DENIED: The database role lacks required permissions. Check its workspace provisioning grants.',
  '3D000':
    'WORKSPACE_DATABASE_NOT_FOUND: The configured database does not exist. Check the database name and initialization.',
};

function safeDiagnostic(error: unknown): string {
  if (error instanceof WorkspaceCommandError) {
    return `${error.code}: ${error.message}${error.code === 'WORKSPACE_INVALID_ARGUMENTS' ? `\n${usage}` : ''}`;
  }
  if (slugConflict.safeParse(error).success) {
    return 'WORKSPACE_SLUG_EXISTS: A workspace with this slug already exists in this tenant.';
  }
  const direct = errorCode.safeParse(error);
  if (
    error instanceof z.ZodError ||
    (error instanceof TypeError && direct.success && direct.data.code === 'ERR_INVALID_URL')
  ) {
    return 'WORKSPACE_DATABASE_CONFIGURATION_INVALID: Database configuration is invalid. Check DATABASE_URL, DATABASE_POOL_MAX, DATABASE_SSL and NODE_ENV.';
  }
  const wrapped = wrappedErrorCode.safeParse(error);
  const code = wrapped.success ? wrapped.data.driverError.code : direct.data?.code;
  if (code && Object.hasOwn(databaseDiagnostics, code)) return databaseDiagnostics[code]!;
  return 'WORKSPACE_COMMAND_FAILED: An unexpected workspace command error occurred. Known configuration and database failures have separate diagnostic codes.';
}

export async function runWorkspaceCommand(
  args: readonly string[],
  loadSource: () => Promise<DataSource>,
  output: { stdout: (message: string) => void; stderr: (message: string) => void },
): Promise<number> {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    output.stdout(`${usage}\n`);
    return 0;
  }
  try {
    const command = parseWorkspaceCommand(args);
    const source = await loadSource();
    await source.initialize();
    try {
      const workspaceId = await provisionWorkspace(source, command);
      output.stdout(`${command.action}: ${workspaceId}\n`);
    } finally {
      await source.destroy();
    }
    return 0;
  } catch (error: unknown) {
    output.stderr(`${safeDiagnostic(error)}\n`);
    return 1;
  }
}
