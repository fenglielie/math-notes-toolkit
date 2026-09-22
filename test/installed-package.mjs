import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const execute = promisify(execFile);
const project = fileURLToPath(new URL('../', import.meta.url));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'math-notes-package-'));
const site = path.join(temporary, 'site');
const npm = process.env.npm_execpath;
assert.ok(npm, 'Run this check through npm run test:package.');
const run = (args, cwd = site) => execute(process.execPath, args, { cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
let server;
try {
  const result = await run([npm, 'pack', '--json', '--ignore-scripts', '--pack-destination', temporary], project);
  const archive = JSON.parse(result.stdout)[0];
  assert.ok(archive.files.every(file => !file.path.startsWith('node_modules/') && !file.path.startsWith('extension/media/')), 'Node package must not bundle dependencies or editor resources');
  const bundle = path.join(temporary, archive.filename);
  await run([path.join(project, 'bin/math-notes-cli.mjs'), 'init', site], temporary);
  assert.match(await fs.readFile(path.join(site, '.gitignore'), 'utf8'), /node_modules\//);
  await run([npm, 'install', bundle, '--ignore-scripts', '--no-audit', '--no-fund']);
  const cli = path.join(site, 'node_modules/math-notes-cli/bin/math-notes-cli.mjs');
  const installedRequire = createRequire(cli);
  const renderer = await import(pathToFileURL(installedRequire.resolve('math-notes-cli/core')));
  assert.equal(typeof renderer.mathPlugin, 'function');
  assert.equal(typeof renderer.citations, 'function');
  const nodeRenderer = await import(pathToFileURL(installedRequire.resolve('math-notes-cli/render')));
  assert.equal(typeof nodeRenderer.renderMarkdown, 'function');
  for (const developmentOnly of ['vscode', '@vscode/vsce', 'esbuild', 'markdown-math-core', 'markdown-math-preview']) {
    assert.throws(() => installedRequire.resolve(developmentOnly), { code: 'MODULE_NOT_FOUND' });
  }
  assert.equal((await fs.lstat(path.join(site, 'node_modules/math-notes-cli'))).isSymbolicLink(), false);
  await fs.writeFile(path.join(site, 'content/welcome.md'), '---\ntitle: Package test\nslug: a1b2c3d4e5f6\nlang: en\n---\n\\[x^2\\]\n\n{% theorem begin Packaged %}\nSee [@sample].\n{% theorem end %}\n\n{% bibtex begin %}\n@book{sample, author={Doe, Jane}, title={Example}, year={2026}}\n{% bibtex end %}\n');
  await fs.writeFile(path.join(site, 'site.config.mjs'), "export default {title:'Package test',base:'/sub/',styles:['custom.css']}\n");
  await fs.writeFile(path.join(site, 'custom.css'), ':root { --package-test: 123; }');
  // Exercise the installed bin through the generated site's npm script.
  await run([npm, 'run', 'build']);
  const html = await fs.readFile(path.join(site, 'public/en/a1b2c3d4e5f6/index.html'), 'utf8');
  assert.match(html, /mjx-container/);
  assert.match(html, /statement theorem/);
  assert.match(html, /References/);
  const style = html.match(/href="\/sub\/(assets\/style\.[a-f0-9]+\.css)"/)[1];
  assert.match(await fs.readFile(path.join(site, 'public', style), 'utf8'), /--package-test: 123/);
  // Preview must resolve its content from the caller, not the installed package.
  server = spawn(process.execPath, [cli, 'dev'], { cwd: site, env: { ...process.env, PORT: '45670' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview startup timeout: ' + log)), 30000);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error('Preview exited ' + code + ': ' + log)); });
    server.stderr.on('data', data => { log += data; });
    server.stdout.on('data', data => {
      log += data;
      const match = log.match(/Preview: (http:\/\/localhost:\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const response = await fetch(origin + '/sub/en/a1b2c3d4e5f6/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Package test/);
  console.log('Installed package check passed: clean external site, integrated renderer without VS Code or build tools, CLI init/build/dev, default assets, math, references, base paths, and custom CSS.');
} finally {
  if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill(); await stopped; }
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
