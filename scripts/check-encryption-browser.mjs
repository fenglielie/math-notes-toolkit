import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { build } from './build.mjs';
import { createEncryptionFixture, testPassword, privateSlug, secretText, secretPdfText } from '../test/support/encryption-fixture.mjs';

export async function checkEncryptionBrowser(browser) {
  const root = await fs.mkdtemp(path.resolve('.cache/encryption-browser-'));
  let server, context;
  try {
    await createEncryptionFixture(root);
    await fs.writeFile(path.join(root, 'content/earlier.md'), '---\ntitle: A public note\nslug: cccccccccccc\n---\nPublic text');
    const { output } = await build({ root });
    server = http.createServer((request, response) => {
      const url = new URL(request.url, 'http://localhost');
      const relative = decodeURIComponent(url.pathname.replace(/^\/sub\//, ''));
      const file = relative.endsWith('/') || !relative ? relative + 'index.html' : relative;
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
      response.writeHead(output.has(file) ? 200 : 404, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      response.end(output.get(file) || 'Not found');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const articleUrl = origin + '/sub/en/' + privateSlug + '/';
    context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/sub/');
    assert.equal(await page.locator('.note-row .encrypted-badge').count(), 1);
    await page.goto(origin + '/sub/search/');
    await page.locator('#search-results .encrypted-badge').waitFor();
    await page.getByRole('searchbox').fill(secretText);
    await page.waitForFunction(() => document.querySelector('.search-status').textContent.startsWith('No matching'));
    await page.goto(articleUrl);
    assert.equal(await page.locator('.note-navigation').count(), 1);
    assert.equal(await page.locator('.note-navigation .prev a').getAttribute('href'), '/sub/en/cccccccccccc/');
    assert.equal(await page.locator('.note-navigation .next a').getAttribute('href'), '/sub/en/aaaaaaaaaaaa/');
    await page.locator('.note-navigation .prev a').click();
    assert.equal(page.url(), origin + '/sub/en/cccccccccccc/');
    await page.goBack();
    await page.locator('.unlock-form').waitFor();
    await page.locator('.note-navigation').evaluate(element => { element.dataset.persist = 'true'; });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
        assert.equal(await page.locator('.prose, .toc, .pdf-viewer').count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: '.cache/encrypted-locked-' + width + '-' + theme + '.png' });
      }
    }
    await page.getByLabel('Password', { exact: true }).fill('incorrect');
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Incorrect password' }).waitFor();
    assert.equal(await page.locator('.prose').count(), 0);
    await page.getByLabel('Password', { exact: true }).fill(testPassword);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await page.locator('.prose').waitFor();
    assert.equal(await page.locator('.note-navigation').count(), 1);
    assert.equal(await page.locator('.note-navigation').getAttribute('data-persist'), 'true');
    assert.match(await page.locator('.prose').textContent(), new RegExp(secretText));
    assert.ok(await page.locator('.prose mjx-container svg').count() > 0);
    assert.equal(await page.locator('.toc details').getAttribute('data-state'), 'collapsed');
    assert.equal(await page.locator('.copy-tex').isVisible(), false);
    const image = page.locator('.prose img');
    await image.evaluate(image => image.decode());
    assert.equal(await image.evaluate(image => image.naturalWidth), 120);
    assert.match(await image.getAttribute('src'), /^blob:/);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Attachment', exact: true }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'private-file.txt');
    assert.equal(await fs.readFile(await download.path(), 'utf8'), 'Confidential-attachment-9d8140');
    await page.locator('.pdf-viewer').scrollIntoViewIfNeeded();
    const frame = page.frameLocator('.pdf-viewer');
    await frame.locator('.textLayer span').filter({ hasText: secretPdfText }).waitFor();
    assert.equal((await page.request.get(origin + '/sub/files/private-document.pdf')).status(), 404);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.copy-code').click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Confidential-code/);
    await page.locator('.copy-tex').focus();
    await page.locator('.copy-tex').click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /a\^2\+b\^2=c\^2/);
    await page.locator('.toc a').first().click();
    await page.waitForFunction(() => Boolean(document.querySelector('.jump-highlight')));
    await page.screenshot({ path: '.cache/encrypted-unlocked-desktop.png' });
    assert.deepEqual(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) })), { local: [], session: [] });
    await page.reload();
    await page.locator('.unlock-form').waitFor();
    assert.equal(await page.locator('.prose').count(), 0);
    assert.equal(await page.getByLabel('Password', { exact: true }).inputValue(), '');
    // A modified ciphertext must fail before inserting any decrypted content.
    const html = output.get('en/' + privateSlug + '/index.html').toString();
    await page.route(articleUrl, route => route.fulfill({ contentType: 'text/html', body: html.replace(/("ciphertext":")([A-Za-z0-9+/])/, (_, prefix, char) => prefix + (char === 'A' ? 'B' : 'A')) }));
    await page.goto(articleUrl);
    await page.getByLabel('Password', { exact: true }).fill(testPassword);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Incorrect password' }).waitFor();
    assert.equal(await page.locator('.prose').count(), 0);
    assert.deepEqual(errors, []);
    const offline = await browser.newContext({ javaScriptEnabled: false });
    try {
      const locked = await offline.newPage();
      await locked.goto(articleUrl);
      assert.equal(await locked.getByRole('button', { name: 'Unlock', exact: true }).isDisabled(), true);
      assert.equal(await locked.locator('.prose').count(), 0);
      assert.match(await locked.locator('noscript').textContent(), /Enable JavaScript/);
    } finally { await offline.close(); }
    console.log('Encryption browser checks passed: locked views, passwords, tampering, search, images, downloads, PDFs, math, copy controls, TOC and reload.');
  } finally {
    await context?.close();
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    assert.ok(root.startsWith(path.resolve('.cache') + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
}
