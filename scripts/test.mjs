import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Expand test paths ourselves: Windows shells do not expand the Unix wildcard.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tests = readdirSync(join(root, 'tests')).filter(name => name.endsWith('.test.mjs')).sort()
  .map(name => join(root, 'tests', name));
const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
for (const [command, args] of [
  [process.execPath, ['--test', ...tests]],
  [python, ['-m', 'unittest', 'discover', '-s', 'tests', '-v']],
]) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, PYTHON: python, PYTHONUTF8: '1' } });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
