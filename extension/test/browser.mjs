import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import MarkdownIt from 'markdown-it';
import { extendMarkdownIt } from '../src/markdown.mjs';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(directory, '.cache/preview');
await fs.mkdir(cache, { recursive: true });
const md = new MarkdownIt();
// Model a styling plugin that wraps the rendered article before our extension loads.
const render = md.renderer.render.bind(md.renderer);
md.renderer.render = (...args) => '<div class="preview-content">' + render(...args) + '</div>';
extendMarkdownIt(md);
const exampleSource = await fs.readFile(path.join(directory, 'examples/syntax-guide.md'), 'utf8');
const source = String.raw`---
title: Preview test
---

# Preview test

Forward reference $\eqref{eq:one}$.

{% theorem begin Sample theorem %}
For $x\in\mathbb{R}$, we have:
\begin{align}
f(x)&=\frac{x^2}{2}\label{eq:one}\\
g(x)&=\norm{x}+\boldsymbol{\alpha}\notag
\end{align}
{% proof begin %}
The formula follows directly. {% color green begin %}Done.{% color end %}
{% proof end %}
{% theorem end %}

## Further reading

See [@sample] for details and [@sample, p. 2] for an example.

{% bibtex begin %}
@book{sample, author={Doe, Jane}, title={Sample Mathematical Notes}, year={2026}}
{% bibtex end %}
`;
const server = http.createServer(async (request, response) => {
  try {
    if (request.url === '/favicon.ico') { response.writeHead(204).end(); return; }
    if (request.url === '/' || request.url === '/?delayed=1' || request.url === '/examples/syntax-guide.md') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'nonce-test\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; font-src data:"><link rel="stylesheet" href="/media/highlights.css"><link rel="stylesheet" href="/media/preview.css"><style>body{font:16px/1.6 sans-serif;margin:24px;color:#17272c;background:#fbfcfc}body.vscode-dark{color:#dbe5e7;background:#101719}.markdown-body{max-width:760px;margin:auto}</style><body class="vscode-light">'
        + (request.url === '/?delayed=1' ? '' : '<main class="markdown-body">' + md.render(request.url === '/' ? source : exampleSource) + '</main>')
        + '<script nonce="test" src="/media/preview.js"></script>');
      return;
    }
    const file = path.resolve(directory, '.' + decodeURIComponent(request.url.split('?')[0]));
    if (!['media', 'examples'].some(folder => file.startsWith(path.join(directory, folder) + path.sep))) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/css');
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  const faults = [], remoteRequests = [];
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  page.on('requestfailed', request => console.error('Request failed:', request.url(), request.failure()));
  page.on('pageerror', error => faults.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:')) remoteRequests.push(request.url()); });
  await page.goto('http://127.0.0.1:' + server.address().port);
  async function settled() {
    try {
      await page.waitForFunction(() => document.querySelector('.markdown-math-typeset-error')
        || [...document.querySelectorAll('.markdown-math-tex')].every(node => node.dataset.typeset === 'true'));
    } catch (error) {
      console.error(faults, await page.evaluate(() => ({ mathjax: Object.keys(window.MathJax || {}), scripts: [...document.scripts].map(s => s.src), body: document.body.innerText })));
      throw error;
    }
  }
  async function update(text) {
    await page.evaluate(html => {
      document.querySelector('.markdown-body').innerHTML = html;
      window.dispatchEvent(new Event('vscode.markdown.updateContent'));
    }, md.render(text));
    await settled();
  }
  await settled();
  assert.equal(await page.locator('.markdown-math-error').count(), 0, await page.locator('body').innerText());
  assert.ok(await page.locator('mjx-container svg').count() >= 3);
  assert.equal(await page.locator('[id="mjx-eqn:eq:one"]').count(), 1);
  assert.ok(await page.locator('a[href*="eq%3Aone"]').count());
  assert.equal(await page.locator('.statement.theorem').getAttribute('data-line'), '8');
  const theoremBackground = await page.locator('.statement.theorem').evaluate(element => getComputedStyle(element).backgroundColor);
  await page.locator('.markdown-body').evaluate(element => element.style.setProperty('--vscode-editor-background', '#101719'));
  assert.equal(await page.locator('.statement.theorem').evaluate(element => getComputedStyle(element).backgroundColor), theoremBackground,
    'Theorem tint must not depend on the editor background, which can differ from the preview background');
  await page.locator('.markdown-body').evaluate(element => element.style.removeProperty('--vscode-editor-background'));
  assert.equal(await page.locator('.preview-content > .references').count(), 1);
  const heading = await page.locator('.preview-content > h2').boundingBox();
  const bibliographyHeading = await page.locator('.references h2').boundingBox();
  assert.equal(heading.x, bibliographyHeading.x);
  await page.locator('.citation a').first().click();
  assert.equal(await page.evaluate(() => location.hash), '#ref:1');
  await page.locator('.reference-backlinks a').first().click();
  assert.equal(await page.evaluate(() => location.hash), '#cite:1:1');
  await page.screenshot({ path: path.join(cache, 'desktop-light.png'), fullPage: true });
  await page.evaluate(() => document.body.className = 'vscode-dark');
  await page.screenshot({ path: path.join(cache, 'desktop-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(cache, 'mobile-dark.png'), fullPage: true });
  await page.evaluate(() => document.body.className = 'vscode-light');
  await page.screenshot({ path: path.join(cache, 'mobile-light.png'), fullPage: true });
  await update(String.raw`$\newcommand{\onlyhere}{x}\onlyhere$`);
  assert.equal(await page.locator('.references').count(), 0);
  assert.equal(await page.locator('.markdown-math-error').count(), 0);
  await update(String.raw`$\onlyhere$`);
  assert.match(await page.locator('.markdown-math-error').innerText(), /Undefined control sequence/);
  await update(source);
  assert.equal(await page.locator('.markdown-math-error').count(), 0);
  assert.equal(await page.locator('[id="mjx-eqn:eq:one"]').count(), 1);
  // Rapid updates must leave only the final document's formulas and labels.
  for (let i = 0; i < 8; i++) {
    await page.evaluate(html => {
      document.querySelector('.markdown-body').innerHTML = html;
      window.dispatchEvent(new Event('vscode.markdown.updateContent'));
    }, md.render(String.raw`\begin{equation}x=${i}\label{last:${i}}\end{equation}`));
  }
  await settled();
  assert.equal(await page.locator('[id="mjx-eqn:last:7"]').count(), 1);
  assert.equal(await page.locator('[id^="mjx-eqn:"]').count(), 1);
  // Native VS Code injects the initial article after preview scripts can have run,
  // without firing vscode.markdown.updateContent for that first insertion.
  await page.goto('http://127.0.0.1:' + server.address().port + '/?delayed=1');
  await page.waitForFunction(() => window.markdownMathPreview);
  const delimiters = String.raw`Inline \(\frac{4}{3}\pi R^3\) and $R$.

\[
\begin{pmatrix}x \\ y\end{pmatrix}
\]

$$S=4\pi R^2$$`;
  await page.evaluate(html => {
    const root = document.createElement('main');
    root.className = 'markdown-body';
    root.innerHTML = html;
    document.body.append(root);
  }, md.render(delimiters));
  await page.waitForFunction(() => document.querySelectorAll('.markdown-math-tex svg').length === 4, null, { timeout: 5000 });
  assert.equal(await page.locator('.markdown-math-error').count(), 0);
  assert.equal(await page.locator('.markdown-math-display mjx-container[display="true"]').count(), 2);
  await page.goto('http://127.0.0.1:' + server.address().port + '/examples/syntax-guide.md');
  await settled();
  assert.equal(await page.locator('.markdown-math-error').count(), 0, await page.locator('body').innerText());
  assert.equal(await page.locator('.statement').count(), 11);
  const plainStatements = await page.locator('.statement:is(.proof,.solution,.remark,.note)').evaluateAll(elements => elements.map(element => {
    const title = element.querySelector('.statement-title');
    const first = title.nextElementSibling;
    return { kind: element.classList[1], titleTop: title.getBoundingClientRect().top, firstTop: first.getBoundingClientRect().top };
  }));
  assert.ok(plainStatements.every(({ titleTop, firstTop }) => Math.abs(titleTop - firstTop) <= 2),
    'Plain statement titles and first paragraphs should stay on one line');
  const proofEnd = await page.locator('.statement.proof').first().evaluate(element => ({
    block: getComputedStyle(element, '::after').content,
    paragraph: getComputedStyle(element.querySelector('p:last-child'), '::after').content
  }));
  assert.deepEqual(proofEnd, { block: 'none', paragraph: '"□"' });
  assert.equal(await page.locator('.references li').count(), 2);
  assert.equal(await page.locator('.text-highlight').count(), 3);
  await page.locator('img').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
  await page.setViewportSize({ width: 1100, height: 850 });
  await page.screenshot({ path: path.join(cache, 'syntax-guide.png'), fullPage: true });
  assert.deepEqual(faults, []);
  assert.deepEqual(remoteRequests, []);
  console.log('Preview browser checks passed: documented syntax example, reference layout and backlinks, offline math, all delimiters, delayed initial content, forward references, source markers, edit isolation, rapid updates, and screenshots.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
