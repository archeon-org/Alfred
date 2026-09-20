import { access, lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bank = join(root, 'docs', 'memory-bank');
const requiredRoles = new Set([
  'project',
  'architecture',
  'decisions',
  'active_context',
  'progress',
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function bankIsPresent() {
  try {
    await access(join(bank, 'index.json'));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // `docs/` is git-ignored: the memory bank exists only on core-team checkouts.
  if (!(await bankIsPresent())) {
    console.log('Memory bank not present (docs/ is not published); check skipped.');
    return;
  }

  const manifest = JSON.parse(await readFile(join(bank, 'index.json'), 'utf8'));
  assert(manifest.version === 1, 'Memory bank manifest version must be 1.');
  assert(Array.isArray(manifest.documents), 'Memory bank documents must be an array.');
  const realBank = await realpath(bank);

  const roles = new Set(manifest.documents.map((document) => document.role));
  assert(
    roles.size === requiredRoles.size && [...requiredRoles].every((role) => roles.has(role)),
    'Memory bank manifest roles are incomplete.',
  );

  for (const document of manifest.documents) {
    assert(
      typeof document.path === 'string' && typeof document.role === 'string',
      'Every memory bank entry must contain string path and role fields.',
    );
    const relativePath = normalize(document.path);
    assert(
      !isAbsolute(relativePath) && relativePath !== '..' && !relativePath.startsWith(`..${sep}`),
      `Unsafe memory bank path: ${document.path}`,
    );
    const absolutePath = join(bank, relativePath);
    await access(absolutePath);
    const fileStats = await lstat(absolutePath);
    assert(!fileStats.isSymbolicLink(), `Symlinks are not allowed: ${document.path}`);
    const realFile = await realpath(absolutePath);
    const confinedPath = relative(realBank, realFile);
    assert(
      confinedPath !== '..' && !confinedPath.startsWith(`..${sep}`) && !isAbsolute(confinedPath),
      `Memory bank path escapes its root: ${document.path}`,
    );
    const content = await readFile(absolutePath, 'utf8');
    assert(
      content.startsWith('# '),
      `Memory bank document must start with a title: ${document.path}`,
    );
  }

  const instructions = (await readFile(join(root, 'AGENTS.md'), 'utf8')).toLowerCase();
  assert(
    instructions.includes('docs/memory-bank/index.json') &&
      instructions.includes('read the memory bank before') &&
      instructions.includes('never store raw chain-of-thought'),
    'AGENTS.md must define the memory-bank read and safety protocol.',
  );

  const codexConfig = await readFile(join(root, '.codex', 'config.toml'), 'utf8');
  assert(
    codexConfig.includes('[agents.memory_keeper]') &&
      codexConfig.includes('config = ".codex/agents/memory-keeper.toml"'),
    'The memory_keeper Codex role must stay registered.',
  );
  await access(join(root, '.codex', 'agents', 'memory-keeper.toml'));
  await access(join(root, '.agents', 'skills', 'alfred-memory-bank', 'SKILL.md'));

  console.log(`Memory bank valid: ${manifest.documents.length} indexed documents.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
