import 'reflect-metadata';
import { runWorkspaceCommand } from './workspace-command-cli';

void runWorkspaceCommand(
  process.argv.slice(2),
  async () => (await import('./data-source')).default,
  {
    stdout: (message) => {
      process.stdout.write(message);
    },
    stderr: (message) => {
      process.stderr.write(message);
    },
  },
).then((exitCode) => {
  process.exitCode = exitCode;
});
