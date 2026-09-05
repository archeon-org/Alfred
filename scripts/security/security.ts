// Static scanner fixtures only: this file must never be executed.
import { exec, execSync, spawn, execFile } from 'node:child_process';

declare const input: string;
// ruleid: alfred-js-dynamic-code
eval(input);
// ruleid: alfred-js-dynamic-code
new Function(input);
// ok: alfred-js-dynamic-code
JSON.parse(input);
// ruleid: alfred-js-shell-command
exec(input);
// ruleid: alfred-js-shell-command
execSync(input);
// ruleid: alfred-js-shell-command
spawn('echo', [input], { shell: true });
// ok: alfred-js-shell-command
spawn('echo', [input], { shell: false });
// ok: alfred-js-shell-command
execFile('echo', [input]);
