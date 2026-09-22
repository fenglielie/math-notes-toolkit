import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { copyTestAssets } from './support/fixtures.mjs';
import { build } from '../scripts/build.mjs';

test('export retries temporary locks and restores the previous output when replacement fails', async t => {
  await fs.mkdir('.cache', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.cache/publish-test-'));
  try {
    await copyTestAssets(root);
    await fs.mkdir(path.join(root, 'content'));
    await fs.writeFile(path.join(root, 'site.config.mjs'), "export default { title: 'Test' }");
    const source = '---\ntitle: Original\nslug: "abcdef012345"\n---\nBody';
    await fs.writeFile(path.join(root, 'content/note.md'), source);
    await build({ root });
    const original = await fs.readFile(path.join(root, 'public/index.html'), 'utf8');
    await fs.writeFile(path.join(root, 'content/note.md'), source.replace('Original', 'Updated'));
    const rename = fs.rename;
    let failures = 0, failAlways = true;
    t.mock.method(fs, 'rename', async (from, to) => {
      if (to === path.join(root, 'public') && path.basename(from).startsWith('.build-') && !path.basename(from).startsWith('.build-backup-') && (failAlways || failures < 2)) {
        failures++;
        throw Object.assign(new Error('Simulated temporary directory lock'), { code: 'EPERM' });
      }
      return rename(from, to);
    });
    await assert.rejects(build({ root }), /Simulated temporary directory lock/);
    assert.equal(await fs.readFile(path.join(root, 'public/index.html'), 'utf8'), original);
    assert.equal((await fs.readdir(root)).filter(name => name.startsWith('.build-')).length, 0);
    failAlways = false;
    failures = 0;
    await build({ root });
    assert.equal(failures, 2);
    assert.match(await fs.readFile(path.join(root, 'public/index.html'), 'utf8'), /Updated/);
    assert.equal((await fs.readdir(root)).filter(name => name.startsWith('.build-')).length, 0);
  } finally {
    t.mock.restoreAll();
    assert.ok(root.startsWith(path.resolve('.cache') + path.sep));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
