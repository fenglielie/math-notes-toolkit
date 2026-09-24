import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { encryptArticle } from '../scripts/encryption.mjs';
import { decryptArticle } from '../assets/crypto.js';
import { build, generate } from '../scripts/build.mjs';
import { createLiveSite } from '../scripts/live.mjs';
import { metadata } from '../scripts/content.mjs';
import { createEncryptionFixture, testPassword, privateSlug, secretText, secretHeading, secretPdfText, secretImage } from './support/encryption-fixture.mjs';

const envelopeFrom = html => JSON.parse(html.match(/<script id="encrypted-article"[^>]*>([^<]+)<\/script>/)[1]);

test('article encryption authenticates passwords, ciphertext and article identity with fresh randomness', async () => {
  const payload = { html: '<p>中文 & private text</p>' };
  const first = await encryptArticle(payload, testPassword, '/en/aaaaaaaaaaaa/');
  const second = await encryptArticle(payload, testPassword, '/en/aaaaaaaaaaaa/');
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.deepEqual(await decryptArticle(first, testPassword, '/en/aaaaaaaaaaaa/'), payload);
  await assert.rejects(decryptArticle(first, 'wrong password', '/en/aaaaaaaaaaaa/'));
  await assert.rejects(decryptArticle(first, testPassword, '/en/bbbbbbbbbbbb/'));
  const bytes = Buffer.from(first.ciphertext, 'base64'); bytes[0] ^= 1;
  await assert.rejects(decryptArticle({ ...first, ciphertext: bytes.toString('base64') }, testPassword, '/en/aaaaaaaaaaaa/'));
  await assert.rejects(decryptArticle({ ...first, iterations: 1 }, testPassword, '/en/aaaaaaaaaaaa/'));
  for (const password of [null, true, 12345, '', '   ']) assert.throws(() => metadata({ title: 'Test', password }, 'note.md'), /password must/);
  assert.throws(() => metadata({ title: 'Test', passwordEnv: 'OLD_SETTING' }, 'note.md'), /use password in the article/);
});

test('each article specifies its own password', async () => {
  await fs.mkdir('.cache', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.cache/article-password-test-'));
  try {
    await createEncryptionFixture(root);
    const original = await fs.readFile(path.join(root, 'content/private.md'), 'utf8');
    const firstPassword = 'first-article-password-甲';
    const secondPassword = 'second-article-password-乙';
    await fs.writeFile(path.join(root, 'content/private.md'), original.replace(JSON.stringify(testPassword), JSON.stringify(firstPassword)));
    await fs.writeFile(path.join(root, 'content/second.md'), '---\ntitle: Another article\nslug: cccccccccccc\npassword: ' + JSON.stringify(secondPassword) + '\n---\nSecond secret text');
    const { output } = await build({ root });
    const first = envelopeFrom(output.get('en/' + privateSlug + '/index.html').toString());
    const second = envelopeFrom(output.get('en/cccccccccccc/index.html').toString());
    assert.match((await decryptArticle(first, firstPassword, '/sub/en/' + privateSlug + '/')).html, new RegExp(secretText));
    assert.match((await decryptArticle(second, secondPassword, '/sub/en/cccccccccccc/')).html, /Second secret text/);
    await assert.rejects(decryptArticle(first, secondPassword, '/sub/en/' + privateSlug + '/'));
    await assert.rejects(decryptArticle(second, firstPassword, '/sub/en/cccccccccccc/'));
    for (const data of output.values()) {
      assert.equal(data.includes(Buffer.from(firstPassword)), false);
      assert.equal(data.includes(Buffer.from(secondPassword)), false);
    }
  } finally {
    assert.ok(root.startsWith(path.resolve('.cache') + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('build and dev encrypt whole articles and local assets without leaking into published files or search', async () => {
  await fs.mkdir('.cache', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.cache/encryption-test-'));
  try {
    await createEncryptionFixture(root);
    await fs.writeFile(path.join(root, 'content/earlier.md'), '---\ntitle: A public note\nslug: cccccccccccc\n---\nPublic text');
    const result = await build({ root });
    const route = 'en/' + privateSlug + '/';
    const html = result.output.get(route + 'index.html').toString();
    assert.match(html, /Encrypted article/);
    assert.match(html, /type="password"[^>]*disabled/);
    assert.doesNotMatch(html, /class="toc"|class="prose"|class="pdf-viewer"/);
    const nav = html.match(/<nav class="note-navigation"[^>]*>[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav);
    assert.match(nav, /class="prev"[^>]*>[\s\S]*href="\/sub\/en\/cccccccccccc\/"/);
    assert.match(nav, /class="next"[^>]*>[\s\S]*href="\/sub\/en\/aaaaaaaaaaaa\/"/);
    const payload = await decryptArticle(envelopeFrom(html), testPassword, '/sub/' + route);
    assert.doesNotMatch(payload.html, /note-navigation/);
    assert.match(payload.html, new RegExp(secretText));
    assert.match(payload.html, new RegExp(secretHeading));
    assert.match(payload.html, /class="toc"/);
    assert.match(payload.html, /<mjx-container/);
    assert.match(payload.html, /class="copy-tex"/);
    assert.match(payload.html, /src="urn:math-notes:asset:/);
    assert.match(payload.html, /data-pdf-source="urn:math-notes:asset:/);
    assert.ok(payload.css.length > 0);
    assert.equal(payload.attachments.length, 3);
    assert.equal(Buffer.from(payload.attachments.find(file => file.name.endsWith('.svg')).data, 'base64').toString(), secretImage);
    assert.match(Buffer.from(payload.attachments.find(file => file.name.endsWith('.pdf')).data, 'base64').toString(), new RegExp(secretPdfText));
    const index = JSON.parse(result.output.get('search-index.json'));
    assert.equal(index.find(note => note.encrypted).text, '');
    assert.equal(index.find(note => note.encrypted).pdfText, undefined);
    assert.match(result.output.get('index.html').toString(), /class="encrypted-badge"/);
    assert.match(result.output.get(route + 'pdf.html').toString(), /data-file=""/);
    for (const [file, bytes] of result.output) {
      for (const secret of ['Confidential-', testPassword, 'private-document.pdf', 'private-image.svg', 'private-file.txt']) {
        assert.equal(bytes.includes(Buffer.from(secret)), false, file + ' leaks ' + secret);
      }
      assert.doesNotMatch(file, /private-document|private-image|private-file/);
    }
    const state = await createLiveSite(root).refresh();
    assert.equal(state.error, '');
    assert.ok(envelopeFrom(state.snapshot.output.get(route + 'index.html').toString()));
    const source = await fs.readFile(path.join(root, 'content/private.md'), 'utf8');
    await fs.writeFile(path.join(root, 'content/private.md'), source.replace(JSON.stringify(testPassword), 'null'));
    await assert.rejects(build({ root }), /password must/);
    assert.equal(await fs.readFile(path.join(root, 'public', route, 'index.html'), 'utf8'), html);
    await fs.writeFile(path.join(root, 'content/private.md'), source);
    await fs.appendFile(path.join(root, 'content/public.md'), '\n[Leaked attachment](private-document.pdf)');
    await assert.rejects(generate({ root }), /encrypted attachment is also referenced/);
    await fs.writeFile(path.join(root, 'content/public.md'), '---\ntitle: Public\n---\nPublic text');
    await fs.mkdir(path.join(root, 'assets/private'), { recursive: true });
    await fs.writeFile(path.join(root, 'assets/private/shared.txt'), 'Secret in assets');
    await fs.appendFile(path.join(root, 'content/private.md'), '\n[Unsafe](../assets/private/shared.txt)');
    await fs.writeFile(path.join(root, 'site.config.mjs'), "export default { title:'Test', contentDirs:['content','assets/private'] }");
    await assert.rejects(generate({ root }), /encrypted attachment is inside the public assets/);
  } finally {
    assert.ok(root.startsWith(path.resolve('.cache') + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
});
