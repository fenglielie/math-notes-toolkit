import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { copyTestAssets } from './support/fixtures.mjs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('preview backs off occupied ports and serves base paths, redirects, HEAD, PDF ranges and 404 responses', { timeout: 30000 }, async () => {
  await fs.mkdir('.cache', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.cache/serve-test-'));
  const occupied = net.createServer();
  let child;
  try {
    await new Promise((resolve, reject) => { occupied.once('error', reject); occupied.listen(0, '127.0.0.1', resolve); });
    const port = occupied.address().port;
    for (const directory of ['scripts', 'src/core', 'styles']) {
      await fs.cp(directory, path.join(root, directory), { recursive: true });
    }
    await copyTestAssets(root);
    await fs.mkdir(path.join(root, 'content'));
    await fs.writeFile(path.join(root, 'site.config.mjs'), "throw new Error('Default configuration must not be loaded');");
    await fs.writeFile(path.join(root, 'site.demo.config.mjs'), "export default { title:'Test', base:'/sub/', url:'https://example.com' }");
    await fs.writeFile(path.join(root, 'content/note.md'), '---\ntitle: Test\nlang: en\nslug: "abcdef012345"\n---\n[Attachment](sample.pdf)');
    const pdf = '%PDF-1.4\n0123456789';
    await fs.writeFile(path.join(root, 'content/sample.pdf'), pdf);
    child = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), '--config', 'site.demo.config.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const origin = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Preview did not start: ' + log)), 20000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error('Preview exited with ' + code + ': ' + log)); });
      child.stderr.on('data', data => { log += data; });
      child.stdout.on('data', data => {
        log += data;
        const match = log.match(/Preview: (http:\/\/localhost:\d+)/);
        if (match) { clearTimeout(timeout); resolve(match[1].replace('localhost', '127.0.0.1')); }
      });
    });
    assert.ok(Number(new URL(origin).port) > port);
    assert.match(log, /is in use; trying/);
    let response = await fetch(origin + '/', { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/sub/');
    response = await fetch(origin + '/sub/en/abcdef012345?x=1', { redirect: 'manual' });
    assert.equal(response.headers.get('location'), '/sub/en/abcdef012345/?x=1');
    response = await fetch(origin + '/sub/en/abcdef012345/');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /__version/);
    response = await fetch(origin + '/sub/sitemap.xml');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/xml; charset=utf-8');
    const sitemap = await response.text();
    assert.match(sitemap, /<loc>https:\/\/example.com\/sub\/en\/abcdef012345\/<\/loc>/);
    assert.doesNotMatch(sitemap, /__version|<script>/);
    response = await fetch(origin + '/sub/robots.txt');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.match(await response.text(), /Sitemap: https:\/\/example.com\/sub\/sitemap.xml/);
    const url = origin + '/sub/files/sample.pdf';
    response = await fetch(url, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(Number(response.headers.get('content-length')), Buffer.byteLength(pdf));
    assert.equal(await response.text(), '');
    response = await fetch(url, { headers: { Range: 'bytes=0-4' } });
    assert.equal(response.status, 206);
    assert.equal(await response.text(), '%PDF-');
    assert.equal(response.headers.get('content-range'), 'bytes 0-4/' + Buffer.byteLength(pdf));
    response = await fetch(url, { headers: { Range: 'bytes=-4' } });
    assert.equal(await response.text(), '6789');
    response = await fetch(url, { headers: { Range: 'bytes=9999-' } });
    assert.equal(response.status, 416);
    response = await fetch(origin + '/sub/missing/');
    assert.equal(response.status, 404);
    assert.match(await response.text(), /404 · Page not found/);
    assert.equal((await fetch(origin + '/sub/', { method: 'POST' })).status, 405);
    await fs.writeFile(path.join(root, 'content/note.md'), '---\ntitle: Broken\n---\n$\\undefinedCommand{x}$');
    response = await fetch(origin + '/sub/');
    assert.equal(response.status, 500);
    assert.match(await response.text(), /Build failed/);
    await fs.writeFile(path.join(root, 'content/note.md'), '---\ntitle: Fixed\n---\nRepaired');
    response = await fetch(origin + '/sub/');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Fixed/);
    await assert.rejects(fs.access(path.join(root, 'public')));
  } finally {
    if (child && child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
    await new Promise(resolve => occupied.close(resolve));
    assert.ok(root.startsWith(path.resolve('.cache') + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
});
