import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { runWorkspaceCommand } from '@api/database/workspace-command-cli';
import { parseDatabaseEnvironment } from '@api/database/database-environment';
import { WorkspaceCommandError } from '@api/modules/workspaces/application/workspace-command-error';

function fixture(error?: unknown) {
  const source = {
    initialize: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn().mockRejectedValue(error),
  };
  const loadSource = vi
    .fn<() => Promise<DataSource>>()
    .mockResolvedValue(source as unknown as DataSource);
  const output = { stdout: vi.fn(), stderr: vi.fn() };
  return { source, loadSource, output };
}
const args = ['create', '5aa72926-314f-48e0-8a90-d32b2ea2f3ed', 'team', 'Team'];

describe('workspace CLI safe diagnostics', () => {
  it('identifies invalid database configuration without printing its values', async () => {
    const { loadSource, output } = fixture();
    loadSource.mockImplementation(() => {
      parseDatabaseEnvironment({ DATABASE_URL: 'secret' });
      throw new Error('Unreachable');
    });
    expect(await runWorkspaceCommand(args, loadSource, output)).toBe(1);
    expect(output.stderr).toHaveBeenCalledWith(
      expect.stringContaining('WORKSPACE_DATABASE_CONFIGURATION_INVALID:'),
    );
    expect(JSON.stringify(output.stderr.mock.calls)).not.toContain('secret');
  });
  it('identifies Node URL parsing failures without printing the URL', async () => {
    const { loadSource, output } = fixture();
    loadSource.mockRejectedValue(
      Object.assign(new TypeError('secret'), { code: 'ERR_INVALID_URL', input: 'secret' }),
    );
    expect(await runWorkspaceCommand(args, loadSource, output)).toBe(1);
    expect(output.stderr).toHaveBeenCalledWith(
      expect.stringContaining('WORKSPACE_DATABASE_CONFIGURATION_INVALID:'),
    );
    expect(JSON.stringify(output.stderr.mock.calls)).not.toContain('secret');
  });
  it.each([
    ['ECONNREFUSED', 'WORKSPACE_DATABASE_CONNECTION_REFUSED'],
    ['ENOTFOUND', 'WORKSPACE_DATABASE_HOST_NOT_FOUND'],
    ['ETIMEDOUT', 'WORKSPACE_DATABASE_CONNECTION_TIMEOUT'],
    ['28P01', 'WORKSPACE_DATABASE_AUTHENTICATION_FAILED'],
    ['28000', 'WORKSPACE_DATABASE_AUTHENTICATION_FAILED'],
    ['42501', 'WORKSPACE_DATABASE_PERMISSION_DENIED'],
    ['3D000', 'WORKSPACE_DATABASE_NOT_FOUND'],
  ])('diagnoses %s directly and through a TypeORM driver error', async (code, diagnostic) => {
    for (const wrapped of [false, true]) {
      const driverError = Object.assign(new Error('secret'), { code, detail: 'secret' });
      const error = wrapped ? { driverError, query: 'secret' } : driverError;
      const { source, loadSource, output } = fixture(error);
      if (!wrapped) source.initialize.mockRejectedValue(error);
      expect(await runWorkspaceCommand(args, loadSource, output)).toBe(1);
      expect(output.stderr).toHaveBeenCalledWith(expect.stringContaining(`${diagnostic}:`));
      expect(JSON.stringify(output.stderr.mock.calls)).not.toContain('secret');
    }
  });
  it('shows help without loading database configuration', async () => {
    const { loadSource, output } = fixture();
    expect(await runWorkspaceCommand(['--help'], loadSource, output)).toBe(0);
    expect(output.stdout).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(loadSource).not.toHaveBeenCalled();
  });
  it.each(
    [
      [],
      ['create', 'postgres://secret@host/database', 'team', 'Team'],
      ['unknown', ...args.slice(1)],
    ].map((invalid) => ({ invalid })),
  )('rejects invalid arguments with safe help before loading the DB', async ({ invalid }) => {
    const { loadSource, output } = fixture();
    expect(await runWorkspaceCommand(invalid, loadSource, output)).toBe(1);
    expect(output.stderr).toHaveBeenCalledWith(
      expect.stringContaining('WORKSPACE_INVALID_ARGUMENTS'),
    );
    expect(output.stderr).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(JSON.stringify(output.stderr.mock.calls)).not.toContain('secret');
    expect(loadSource).not.toHaveBeenCalled();
  });
  it('prints a whitelisted business refusal and closes the database', async () => {
    const { source, loadSource, output } = fixture(
      new WorkspaceCommandError('WORKSPACE_LAST_MEMBERSHIP'),
    );
    expect(await runWorkspaceCommand(args, loadSource, output)).toBe(1);
    expect(output.stderr).toHaveBeenCalledWith(
      expect.stringContaining(
        'WORKSPACE_LAST_MEMBERSHIP: The last workspace membership cannot be removed',
      ),
    );
    expect(source.destroy).toHaveBeenCalledOnce();
  });
  it('translates the exact slug uniqueness constraint only', async () => {
    const { loadSource, output } = fixture({
      driverError: { code: '23505', constraint: 'uq_workspaces_tenant_slug', detail: 'secret' },
    });
    expect(await runWorkspaceCommand(args, loadSource, output)).toBe(1);
    expect(output.stderr).toHaveBeenCalledWith(expect.stringContaining('WORKSPACE_SLUG_EXISTS'));
    expect(JSON.stringify(output.stderr.mock.calls)).not.toContain('secret');
  });
  it.each([
    new Error('secret'),
    { code: 'ERR_INVALID_URL', message: 'secret' },
    { code: 'constructor', message: 'secret' },
    { code: '23505', constraint: 'other', message: 'secret' },
    { driverError: { code: '23503', constraint: 'uq_workspaces_tenant_slug', detail: 'secret' } },
  ])('masks unknown and unrelated database errors', async (error) => {
    const { loadSource, output } = fixture(error);
    expect(await runWorkspaceCommand(args, loadSource, output)).toBe(1);
    expect(output.stderr).toHaveBeenCalledWith(expect.stringContaining('WORKSPACE_COMMAND_FAILED'));
    expect(JSON.stringify(output.stderr.mock.calls)).not.toContain('secret');
  });
  it('masks configuration initialization failures', async () => {
    const { source, loadSource, output } = fixture();
    source.initialize.mockRejectedValue(new Error('secret'));
    expect(await runWorkspaceCommand(args, loadSource, output)).toBe(1);
    expect(source.destroy).not.toHaveBeenCalled();
    expect(JSON.stringify(output.stderr.mock.calls)).not.toContain('secret');
  });
  it('prints the successful action and closes the connection', async () => {
    const { source, loadSource, output } = fixture();
    source.transaction.mockResolvedValue('workspace-id');
    expect(await runWorkspaceCommand(args, loadSource, output)).toBe(0);
    expect(output.stdout).toHaveBeenCalledWith('create: workspace-id\n');
    expect(source.destroy).toHaveBeenCalledOnce();
  });
});
