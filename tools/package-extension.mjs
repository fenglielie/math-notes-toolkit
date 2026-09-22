import './build-extension.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const executable = path.join(path.dirname(require.resolve('@vscode/vsce/package.json')), 'vsce');
const result = spawnSync(process.execPath, [executable, 'package', '--out', path.join(root, 'markdown-math-preview-' + manifest.version + '.vsix'), '--no-dependencies', '--allow-missing-repository', '--no-rewrite-relative-links', '--skip-license'], {
  cwd: path.join(root, 'extension'), windowsHide: true, stdio: 'inherit'
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
