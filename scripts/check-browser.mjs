import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import config from '../site.demo.config.mjs';
import { templates } from './templates.mjs';
import { checkEncryptionBrowser } from './check-encryption-browser.mjs';
await fs.mkdir('.cache', { recursive: true });
// Run against npm run dev:demo; on Windows use the installed Edge.
const channel = process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
const origin = (process.env.PREVIEW_URL || 'http://localhost:4321').replace(/\/$/, '');
const notes = await (await fetch(origin + '/search-index.json')).json();
assert.ok(['demo', 'The spectral theorem, geometrically'].every(title => notes.some(note => note.title === title))
  && notes.some(note => note.title.startsWith('一致收敛：')) && notes.some(note => note.kind === 'PDF'),
  'Browser checks require the demo site. Run npm run dev:demo and set PREVIEW_URL to its preview address.');
const demoHref = notes.find(note => note.title === 'demo').href;
const convergenceHref = notes.find(note => note.title.startsWith('一致收敛：')).href;
const spectralHref = notes.find(note => note.title === 'The spectral theorem, geometrically').href;
assert.equal(notes.find(note => note.href === spectralHref).encrypted, true);
const pdfHref = notes.find(note => note.kind === 'PDF').href;
assert.match(demoHref, /^\/en\/[a-f0-9]{12}\/$/);
assert.match(convergenceHref, /^\/zh\/[a-f0-9]{12}\/$/);
assert.match(pdfHref, /^\/en\/[a-f0-9]{12}\/$/);
const browser = await chromium.launch({ channel, headless: true });
async function checkJumpPosition(page) {
  let position;
  // Poll from Node so checks also progress when browser JavaScript is disabled.
  for (let attempt = 0; attempt < 100; attempt++) {
    position = await page.evaluate(() => {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (!target) return null;
      const top = target.getBoundingClientRect().top + scrollY;
      const expected = Math.max(0, Math.min(top - innerHeight * .33, document.documentElement.scrollHeight - innerHeight));
      return { scroll: scrollY, expected };
    });
    if (position && Math.abs(position.scroll - position.expected) < 3) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail('Unexpected anchor position: ' + JSON.stringify(position));
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const route of ['/en/does-not-exist/', '/404.html', '/notes/writing-guide/', '/notes/' + demoHref.split('/')[2] + '/']) {
    const response = await page.goto(origin + route);
    assert.equal(response.status(), 404);
    assert.equal(await page.getByRole('heading', { name: '404 · Page not found' }).count(), 1);
    assert.equal(await page.locator('main a').filter({ hasText: 'All notes' }).getAttribute('href'), '/');
    assert.equal(await page.getByRole('link', { name: 'Search notes', exact: true }).getAttribute('href'), '/search/');
  }
  await page.goto(origin + '/');
  await page.screenshot({ path: '.cache/home-desktop.png', fullPage: true });
  assert.equal(await page.locator('.note-row').count(), 4);
  assert.equal(await page.locator('.note-row .note-icon[aria-hidden="true"]').count(), 4);
  assert.equal(await page.locator('.note-row .note-icon-pdf').count(), 1);
  assert.equal(await page.locator('.note-row a').filter({ has: page.locator('.note-icon-pdf') }).getAttribute('href'), pdfHref);
  assert.ok(await page.locator('.note-row .tags a.tag').count() > 0);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      for (const row of await page.locator('.note-row').all()) {
        const title = await row.locator('h2 a').boundingBox();
        const labels = await row.locator('.tags').boundingBox();
        assert.ok(title.height >= 44, 'Article links need a comfortable tap target');
        assert.ok(width > 600 ? labels.x >= title.x + title.width + 24 : labels.y >= title.y + title.height + 8,
          'Tags should be clearly separated from article links');
      }
      await page.screenshot({ path: '.cache/home-list-' + width + '-' + theme + '.png', fullPage: true });
      const tag = page.locator('.note-row .tag').first();
      const name = await tag.textContent();
      await tag.click();
      await page.waitForURL(url => url.pathname === '/search/' && url.searchParams.get('tag') === name);
      await page.waitForFunction(count => document.querySelectorAll('#search-results article').length === count, notes.filter(note => note.tags.includes(name)).length);
      assert.equal(await page.locator('.search-tag[aria-pressed="true"]').getAttribute('data-tag'), name);
      await page.goto(origin + '/');
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  assert.equal(await page.locator('.collection .section-title').count(), 0);
  assert.equal(await page.locator('.site-tagline').count(), 0);
  assert.equal(await page.locator('.brand').getAttribute('href'), '/');
  const icon = await page.locator('link[rel="icon"]').getAttribute('href');
  assert.match(icon, /^\/favicon\.[a-f0-9]{12}\.(?:svg|png|ico|webp|jpe?g|gif)$/);
  const iconResponse = await page.request.get(origin + icon);
  assert.equal(iconResponse.status(), 200);
  assert.ok(iconResponse.headers()['content-type'].startsWith(await page.locator('link[rel="icon"]').getAttribute('type')));
  assert.deepEqual(await iconResponse.body(), await fs.readFile(config.icon));
  assert.equal(await page.locator('.note-row time, .note-date').count(), 0);
  assert.equal(await page.locator('.note-row p, .format, .note-arrow, .intro').count(), 0);
  assert.equal(await page.locator('.site-footer .all-notes').textContent(), 'All notes');
  assert.equal(await page.locator('.site-footer .all-notes').getAttribute('href'), origin + '/');
  assert.equal(await page.locator('.site-footer .footer-text').textContent(), config.footer);
  const homeBrand = await page.locator('.brand').boundingBox(), homeNav = await page.locator('.site-header nav').boundingBox();
  await page.goto(origin + demoHref);
  for (const [selector, expected] of [['.brand', homeBrand], ['.site-header nav', homeNav]]) {
    const actual = await page.locator(selector).boundingBox();
    assert.ok(Math.abs(actual.x - expected.x) < 1 && Math.abs(actual.y - expected.y) < 1, 'Header position must stay stable between home and article pages');
  }
  await page.goto(origin + '/');
  await page.getByRole('link', { name: 'Search', exact: true }).click();
  await page.waitForURL(origin + '/search/');
  await page.waitForFunction(() => document.querySelector('#search-results')?.children.length === 4);
  assert.equal(await page.getByRole('searchbox').evaluate(element => element === document.activeElement), true);
  assert.equal(await page.locator('.search-tag[aria-pressed="true"]').count(), 0);
  assert.equal(await page.locator('.search-status').textContent(), '');
  assert.equal(await page.locator('.site-header nav a').count(), 1);
  assert.equal(await page.getByRole('searchbox').getAttribute('placeholder'), 'Search notes…');
  await page.screenshot({ path: '.cache/search-desktop.png', fullPage: true });
  await page.getByRole('searchbox').fill('收敛');
  await page.waitForFunction(() => document.querySelector('.search-status').textContent.includes('notes found'));
  assert.ok(await page.locator('#search-results article').count() >= 1);
  await page.getByRole('searchbox').fill('diagonalization');
  await page.waitForFunction(() => document.querySelector('.search-status').textContent.startsWith('No matching'));
  await page.getByRole('searchbox').fill('geometrically');
  await page.waitForFunction(() => document.querySelector('.search-status').textContent === '1 note found');
  await page.getByRole('searchbox').fill('nothingwillmatch123');
  await page.waitForFunction(() => document.querySelector('.search-status').textContent.startsWith('No matching'));
  const pdfOption = page.getByRole('checkbox', { name: 'Search inside PDFs' });
  assert.equal(await pdfOption.isChecked(), false);
  await page.getByRole('searchbox').fill('Richardson');
  await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'Richardson' && document.querySelector('.search-status').textContent.startsWith('No matching'));
  await pdfOption.check();
  await page.waitForFunction(() => document.querySelector('.search-status').textContent === '1 note found');
  assert.equal(new URL(page.url()).searchParams.get('pdf'), '1');
  assert.match(await page.locator('#search-results p').textContent(), /Richardson/);
  await page.getByRole('button', { name: 'PDF 1', exact: true }).click();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.search-status').textContent === '1 note found');
  assert.equal(await pdfOption.isChecked(), true);
  assert.equal(new URL(page.url()).searchParams.get('tag'), 'PDF');
  await pdfOption.uncheck();
  await page.waitForFunction(() => document.querySelector('.search-status').textContent.startsWith('No matching'));
  assert.equal(new URL(page.url()).searchParams.has('pdf'), false);
  await page.getByRole('searchbox').fill('trapezoidal');
  await page.waitForFunction(() => document.querySelector('.search-status').textContent === '1 note found');
  await page.locator('#search-results h2 a').click();
  assert.match(await page.locator('.pdf-toolbar').textContent(), /2 pages/);
  assert.equal(await page.locator('.attachment-pages').textContent(), 'Attachment: 2 pages');
  const pdfUrl = await page.getByRole('link', { name: 'Open PDF', exact: true }).getAttribute('href');
  assert.equal(await page.getByRole('link', { name: 'Download', exact: true }).getAttribute('href'), pdfUrl);
  assert.equal(await page.locator('.pdf-viewer').getAttribute('src'), pdfHref + 'pdf.html');
  const pdfFrame = page.frameLocator('.pdf-viewer');
  await page.locator('.pdf-viewer').scrollIntoViewIfNeeded();
  await pdfFrame.locator('.textLayer span').first().waitFor();
  await pdfFrame.locator('#pdf-status').waitFor({ state: 'hidden' });
  const pdfResources = await pdfFrame.locator('body').getAttribute('data-resources');
  const wasm = await page.request.get(origin + pdfResources + 'wasm/openjpeg.wasm');
  assert.equal(wasm.status(), 200);
  assert.equal(wasm.headers()['content-type'], 'application/wasm');
  const pdfResponse = await page.request.get(origin + pdfUrl);
  assert.equal(pdfResponse.status(), 200);
  assert.match(pdfResponse.headers()['content-type'], /application\/pdf/);
  assert.equal((await pdfResponse.body()).subarray(0, 5).toString(), '%PDF-');
  await page.screenshot({ path: '.cache/pdf-note.png', fullPage: true });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const viewer = await page.locator('.pdf-viewer').boundingBox();
    const note = await page.locator('.note').boundingBox();
    assert.ok(Math.abs(viewer.width - note.width) < 1, 'PDF preview should fit the article');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.waitForFunction(() => {
      const doc = document.querySelector('.pdf-viewer').contentDocument;
      const area = doc.querySelector('#pdf-container'), sheet = doc.querySelector('.page');
      return sheet && Math.abs(sheet.getBoundingClientRect().width - area.clientWidth) < 5 && area.scrollWidth <= area.clientWidth;
    });
  }
  await page.screenshot({ path: '.cache/pdf-mobile.png', fullPage: true });
  await page.goto(origin + demoHref);
  const headingStyle = await page.locator('.prose h2').first().evaluate(element => ({
    content: getComputedStyle(element, '::before').content,
    size: parseFloat(getComputedStyle(element, '::before').fontSize)
  }));
  assert.ok(headingStyle.content.includes('#'));
  assert.ok(headingStyle.size > await page.locator('.prose h3').first().evaluate(element => parseFloat(getComputedStyle(element, '::before').fontSize)));
  assert.equal(await page.locator('.article-header h1').textContent(), 'demo');
  assert.match(await page.locator('.word-count').textContent(), /^\d+(?:\.\d+)?[km]? words$/);
  assert.equal(await page.locator('.article-copyright .permalink').textContent(), config.url + demoHref);
  assert.equal(await page.locator('.article-copyright a[rel="license"]').getAttribute('href'), 'https://creativecommons.org/licenses/by-nc-sa/4.0/');
  assert.equal(await page.locator('.article-end .article-tags .tag').count(), 2);
  assert.equal(await page.locator('.header-tags .tag').count(), 2);
  assert.equal(await page.locator('.article-meta > .header-tags').count(), 1);
  assert.equal(await page.locator('.note-navigation .prev a').getAttribute('href'), spectralHref);
  assert.equal(await page.locator('.note-navigation .next a').getAttribute('href'), pdfHref);
  assert.equal(await page.locator('.note-navigation a .neighbor-label').count(), 0);
  await page.locator('.article-end').screenshot({ path: '.cache/article-footer-mobile.png' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await page.locator('[data-mjx-error]').count(), 0);
  assert.equal(await page.locator('.article-header .back-link').count(), 0);
  assert.equal(await page.locator('.article-header h1').evaluate(element => getComputedStyle(element, '::before').content), 'none');
  assert.equal(await page.locator('.references li').count(), 3);
  assert.equal(await page.locator('.citation a[role="doc-biblioref"]').count(), 6);
  assert.equal(await page.locator('.reference-links a').filter({ hasText: 'Google Scholar' }).count(), 3);
  assert.equal(await page.locator('.reference-links a').filter({ hasText: /^DOI$/ }).count(), 3);
  const scholar = new URL(await page.locator('.reference-links a').filter({ hasText: 'Google Scholar' }).first().getAttribute('href'));
  assert.equal(scholar.searchParams.get('q'), 'Methods of Conjugate Gradients for Solving Linear Systems');
  await page.locator('.references').screenshot({ path: '.cache/references-mobile.png' });
  const tocDetails = page.locator('.toc details'), tocSummary = page.locator('.toc summary');
  assert.equal(await tocSummary.textContent(), 'Contents');
  assert.equal(await tocDetails.getAttribute('data-state'), 'collapsed');
  const allHeadings = await page.locator('.toc li').count();
  await tocSummary.press('Enter');
  assert.equal(await tocDetails.getAttribute('data-state'), 'top');
  assert.equal(await page.locator('.toc li[data-nested]:visible').count(), 0);
  assert.ok(await page.locator('.toc li:visible').count() > 0);
  await tocSummary.press('Space');
  assert.equal(await tocDetails.getAttribute('data-state'), 'all');
  assert.equal(await tocSummary.textContent(), 'Contents');
  assert.equal(await page.locator('.toc li:visible').count(), allHeadings);
  await tocSummary.click();
  assert.equal(await tocDetails.getAttribute('data-state'), 'collapsed');
  await page.locator('.citation a').first().click();
  assert.equal(decodeURIComponent(new URL(page.url()).hash), '#ref:1');
  await page.waitForFunction(() => document.getElementById('ref:1').classList.contains('jump-highlight'));
  await checkJumpPosition(page);
  await page.locator('.reference-backlinks a').first().click();
  assert.equal(decodeURIComponent(new URL(page.url()).hash), '#cite:1:1');
  await page.waitForFunction(() => document.getElementById('cite:1:1').closest('p').classList.contains('jump-highlight'));
  await page.locator('.footnote-ref a').first().click();
  await page.waitForFunction(() => document.querySelector('.footnotes li.jump-highlight'));
  await checkJumpPosition(page);
  await page.locator('.footnotes li .footnote-backref').first().click();
  await page.waitForFunction(() => document.querySelector('.footnote-ref')?.closest('p').classList.contains('jump-highlight'));
  assert.equal(await page.locator('.toc a[href="#bib:references"]').count(), 1);
  const python = page.locator('.code-block').filter({ has: page.locator('code.language-python') }).first();
  assert.ok(await python.locator('.hljs-keyword').count() > 0);
  assert.equal(await python.locator('.code-language').textContent(), 'Python');
  const source = await python.locator('code').textContent();
  assert.equal(await python.locator('.code-lines').count(), 0);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: async text => { window.copiedCode = text; } }
  }));
  await python.getByRole('button', { name: 'Copy code' }).click();
  await page.waitForFunction(() => typeof window.copiedCode === 'string');
  assert.equal(await page.evaluate(() => window.copiedCode), source);
  assert.equal(await python.locator('.copy-code').textContent(), 'Copied');
  const formula = page.locator('.math-block').first();
  const formulaContent = formula.locator('mjx-container');
  const originalStyle = await formulaContent.getAttribute('style');
  // Force overflow at both viewport sizes to check that only the formula moves.
  await formulaContent.evaluate(element => { element.style.minWidth = '1800px'; });
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const scroller = formula.locator('.math-scroll');
      await scroller.evaluate(element => { element.scrollLeft = 0; element.focus(); });
      const button = formula.locator('.copy-tex');
      assert.equal(await button.isEnabled(), true);
      await formula.hover({ position: { x: 5, y: 5 } });
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.copy-tex')).opacity === '0');
      const hitArea = await button.boundingBox();
      await page.mouse.move(hitArea.x - 5, hitArea.y + hitArea.height / 2);
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.copy-tex')).opacity === '1');
      const position = await formula.evaluate(element => {
        const button = element.querySelector('.copy-tex');
        const scroller = element.querySelector('.math-scroll');
        const before = button.getBoundingClientRect();
        scroller.scrollLeft = scroller.scrollWidth;
        const after = button.getBoundingClientRect();
        return { scroll: scroller.scrollLeft, dx: after.x - before.x, dy: after.y - before.y,
          right: element.getBoundingClientRect().right - after.right };
      });
      assert.ok(position.scroll > 100);
      assert.ok(Math.abs(position.dx) < 1 && Math.abs(position.dy) < 1, 'Copy LaTeX must stay fixed while the formula scrolls');
      assert.ok(Math.abs(position.right) < 12, 'Copy LaTeX must stay at the right edge');
      await formula.screenshot({ path: '.cache/formula-' + width + '-' + theme + '.png' });
      await button.click();
      assert.equal(await page.evaluate(() => window.copiedCode), await button.getAttribute('data-tex'));
    }
  }
  await formulaContent.evaluate((element, style) => {
    if (style === null) element.removeAttribute('style');
    else element.setAttribute('style', style);
  }, originalStyle);
  for (const width of [1279, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const button = formula.locator('.copy-tex');
    await page.waitForFunction(() => document.querySelector('.copy-tex').disabled);
    assert.equal(await button.isVisible(), false);
    await page.evaluate(() => { window.copiedCode = 'Unchanged'; document.querySelector('.copy-tex').click(); });
    assert.equal(await page.evaluate(() => window.copiedCode), 'Unchanged');
    const header = await page.locator('.article-header').boundingBox();
    const contents = await page.locator('.toc').boundingBox();
    const prose = await page.locator('.prose').boundingBox();
    assert.ok(contents.y >= header.y + header.height, 'Mobile contents must follow the article title and metadata');
    assert.ok(contents.y + contents.height <= prose.y, 'Mobile contents must precede the article body');
  }
  await page.setViewportSize({ width: 320, height: 900 });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    assert.match(await python.evaluate(element => getComputedStyle(element).backgroundImage), /linear-gradient/);
    const colors = await page.locator('.statement').evaluateAll(elements => {
      const values = new Map();
      for (const element of elements) values.set(element.className, getComputedStyle(element.querySelector('.statement-title')).color);
      return [...values.values()];
    });
    assert.equal(new Set(colors).size, 7, 'Statement colors should distinguish families in ' + theme);
    for (const kind of ['example', 'problem', 'corollary', 'note']) {
      assert.equal(await page.locator('.statement.' + kind).count(), 1);
    }
    const plainStatements = await page.locator('.statement.proof, .statement.solution, .statement.remark, .statement.note').evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderLeftWidth, otherBorders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth], padding: style.paddingLeft, shadow: style.boxShadow };
    }));
    assert.ok(plainStatements.every(style => style.background === 'rgba(0, 0, 0, 0)' && style.border === '3px' && style.otherBorders.every(width => width === '0px') && style.padding === '20px' && style.shadow === 'none'));
    const quoteStyle = await page.locator('.prose blockquote').first().evaluate(element => {
      const style = getComputedStyle(element);
      return [style.borderLeftWidth, style.padding, style.margin];
    });
    const statementStyles = await page.locator('.prose > .statement:is(.proof,.solution,.remark,.note)').evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return [style.borderLeftWidth, style.padding, style.margin];
    }));
    assert.ok(statementStyles.every(style => JSON.stringify(style) === JSON.stringify(quoteStyle)), 'Plain statements and blockquotes should share rule width and spacing');
    const boxes = await page.locator('.statement.theorem, .statement.lemma, .statement.definition, .statement.proposition, .statement.example, .statement.problem, .statement.corollary').evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
    }));
    assert.ok(boxes.every(widths => widths.every(width => width === '2px')), 'Boxes should have equal 2px borders on all sides');
    await page.locator('.statement.example').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.cache/statements-' + theme + '.png' });
    await python.scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.cache/code-' + theme + '.png' });
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const image of await page.locator('.prose img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(element => element.decode());
      const box = await image.boundingBox();
      const prose = await page.locator('.prose').boundingBox();
      const dimensions = await image.evaluate(element => ({ width: element.naturalWidth, ratio: element.naturalWidth / element.naturalHeight }));
      assert.ok(Math.abs(box.x + box.width / 2 - prose.x - prose.width / 2) < 1);
      assert.ok(box.width <= prose.width && box.width <= dimensions.width);
      assert.ok(Math.abs(box.width / box.height - dimensions.ratio) < 0.01);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Demo should fit narrow screens');
  }
  await page.screenshot({ path: '.cache/local-image-mobile.png' });
  await page.goto(origin + convergenceHref);
  for (const width of [1440, 1280, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const note = await page.locator('.note').boundingBox();
    assert.ok(Math.abs(note.x + note.width / 2 - width / 2) < 1, 'article must be centered at ' + width);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page must fit at ' + width);
    if (width >= 1280) {
      const toc = await page.locator('.toc').boundingBox();
      assert.ok(toc.x > note.x + note.width, 'TOC must sit outside the centered article');
      assert.ok(toc.x + toc.width <= width, 'TOC must remain inside the viewport');
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '.cache/article-centered.png' });
  await page.screenshot({ path: '.cache/article-desktop.png', fullPage: true });
  assert.ok(await page.locator('mjx-container').count() > 10);
  assert.equal(await page.locator('[data-mjx-error]').count(), 0);
  const refs = await page.locator('.MathJax_ref').count();
  assert.ok(refs > 0);
  const equation = page.locator('a[href="#mjx-eqn%3Aeq%3Auniform"]').first();
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const referenceColors = await equation.evaluate(element => ({
      text: getComputedStyle(element.closest('p')).color,
      fill: getComputedStyle(element.querySelector('use')).fill,
      stroke: getComputedStyle(element.querySelector('use')).stroke
    }));
    assert.equal(referenceColors.fill, referenceColors.text);
    assert.equal(referenceColors.stroke, referenceColors.text);
  }
  await equation.click();
  assert.ok(decodeURIComponent(new URL(page.url()).hash).includes('eq:uniform'));
  await page.waitForFunction(() => document.getElementById('mjx-eqn:eq:uniform').closest('.math-block').classList.contains('jump-highlight'));
  assert.equal(await page.locator('.jump-highlight').evaluate(element => getComputedStyle(element).animationDuration), '0.9s');
  await checkJumpPosition(page);
  await page.screenshot({ path: '.cache/jump-desktop.png' });
  await page.waitForFunction(() => !document.querySelector('.jump-highlight'));
  await equation.click();
  await page.waitForFunction(() => document.getElementById('mjx-eqn:eq:uniform').closest('.math-block').classList.contains('jump-highlight'));
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  const blocks = await page.locator('.statement:not(.proof):not(.solution):not(.remark):not(.note)').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    const title = getComputedStyle(element.querySelector('.statement-title'));
    return { background: style.backgroundColor, border: style.borderLeftColor, title: title.color };
  }));
  assert.ok(blocks.every(block => block.background !== 'rgba(0, 0, 0, 0)' && block.border !== 'rgb(44, 62, 67)'), 'Dark statements should have visible backgrounds and borders');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.screenshot({ path: '.cache/article-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/');
  await page.screenshot({ path: '.cache/home-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'home should fit mobile');
  await page.goto(origin + spectralHref);
  assert.equal(await page.locator('.prose').count(), 0);
  await page.getByLabel('Password', { exact: true }).fill('math-notes-demo');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.locator('.prose').waitFor();
  const table = await page.locator('.prose table').boundingBox();
  const prose = await page.locator('.prose').boundingBox();
  assert.ok(Math.abs(table.x + table.width / 2 - prose.x - prose.width / 2) < 1, 'Tables should be centered');
  await page.locator('.prose').evaluate(element => {
    const image = document.createElement('img');
    image.id = 'alignment-check';
    image.width = 120;
    image.height = 60;
    image.alt = 'Alignment check';
    image.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="teal"/></svg>');
    element.append(image);
  });
  const figure = await page.locator('#alignment-check').boundingBox();
  assert.ok(Math.abs(figure.x + figure.width / 2 - prose.x - prose.width / 2) < 1, 'Images should be centered');
  await page.locator('#alignment-check').evaluate(element => element.remove());
  assert.equal(await page.locator('.toc summary>span').first().textContent(), 'Contents');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: '.cache/contents-mobile-' + theme + '.png' });
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.screenshot({ path: '.cache/article-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'article should fit mobile');
  assert.equal(await page.locator('.toc details').getAttribute('open'), null);
  await page.locator('.toc summary').click();
  assert.equal(await page.locator('.toc details').getAttribute('data-state'), 'all');
  assert.equal(await page.locator('.toc li[data-nested]').count(), 0);
  await page.locator('.toc summary').click();
  assert.equal(await page.locator('.toc details').getAttribute('data-state'), 'collapsed');
  await page.locator('.toc summary').click();
  await page.locator('.toc a').first().click();
  assert.ok(new URL(page.url()).hash.length > 1);
  await page.waitForFunction(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.classList.contains('jump-highlight'));
  await checkJumpPosition(page);
  await page.screenshot({ path: '.cache/jump-mobile.png' });
  await page.goto(origin + '/search/');
  await page.getByRole('button', { name: '矩阵分析 1', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#search-results').children.length === 1);
  assert.equal(await page.locator('.search-status').textContent(), '1 note');
  assert.equal(new URL(page.url()).searchParams.get('tag'), '矩阵分析');
  assert.equal(await page.getByRole('button', { name: '矩阵分析 1', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('searchbox').fill('geometrically');
  await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'geometrically' && document.querySelector('#search-results').children.length === 1);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#search-results').children.length === 1);
  assert.equal(await page.getByRole('searchbox').inputValue(), 'geometrically');
  await page.getByRole('searchbox').fill('nonexistentkeyword');
  await page.waitForFunction(() => document.querySelector('.search-status').textContent.startsWith('No matching'));
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'Writing 1', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.search-status').textContent === '0 notes');
  assert.equal(await page.locator('#search-results article').count(), 0);
  assert.equal(await page.locator('.search-tag[aria-pressed="true"]').count(), 2);
  assert.deepEqual(new URL(page.url()).searchParams.getAll('tag'), ['矩阵分析', 'Writing']);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.search-status').textContent === '0 notes');
  assert.equal(await page.locator('#search-results article').count(), 0);
  assert.equal(await page.locator('.search-tag[aria-pressed="true"]').count(), 2);
  await page.getByRole('searchbox').fill('demo');
  await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'demo');
  assert.equal(await page.locator('#search-results article').count(), 0);
  await page.getByRole('button', { name: '矩阵分析 1', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.search-status').textContent === '1 note found');
  await page.getByRole('button', { name: '写作指南 1', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.search-tag[aria-pressed="true"]').length === 2);
  assert.deepEqual(new URL(page.url()).searchParams.getAll('tag'), ['Writing', '写作指南']);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.search-status').textContent === '1 note found');
  assert.equal(await page.locator('#search-results h2').textContent(), 'demo');
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'Writing 1', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#search-results').children.length === 1);
  await page.getByRole('button', { name: '写作指南 1', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#search-results').children.length === 4);
  assert.equal(await page.locator('.search-tag[aria-pressed="true"]').count(), 0);
  assert.equal(new URL(page.url()).searchParams.has('tag'), false);
  assert.equal(await page.locator('.search-status').textContent(), '');
  await page.screenshot({ path: '.cache/search-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await page.screenshot({ path: '.cache/search-dark.png', fullPage: true });
  await page.goto(origin + spectralHref);
  assert.equal(await page.locator('.prose').count(), 0);
  await page.locator('.article-header').getByRole('link', { name: '矩阵分析', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/search/');
  await page.waitForFunction(() => document.querySelector('#search-results')?.children.length === 1);
  assert.equal(await page.locator('.search-status').textContent(), '1 note');
  assert.equal(await page.getByRole('searchbox').evaluate(element => element === document.activeElement), true);
  assert.deepEqual(errors, []);
  const offline = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await offline.newPage();
  await staticPage.goto(origin + demoHref);
  assert.ok(await staticPage.locator('code.language-python .hljs-keyword').count() > 0);
  assert.equal(await staticPage.locator('.references li').count(), 3);
  assert.equal(await staticPage.locator('.reference-links a').filter({ hasText: 'Google Scholar' }).count(), 3);
  await staticPage.goto(origin + convergenceHref);
  assert.ok(await staticPage.locator('mjx-container svg').count() > 10);
  await staticPage.goto(origin + convergenceHref + '#mjx-eqn%3Aeq%3Auniform');
  await checkJumpPosition(staticPage);
  await staticPage.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await staticPage.locator('.brand').click();
  await staticPage.waitForURL(origin + '/');
  assert.equal(await staticPage.locator('.note-row').count(), 4);
  await offline.close();
  const paged = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pagerPage = await paged.newPage();
  const fixture = Array.from({ length: 23 }, (_, index) => ({
    title: 'Note ' + String(index + 1).padStart(2, '0'), tags: ['Batch'], text: 'Pagination example',
    date: '', href: demoHref, kind: 'MARKDOWN'
  }));
  await paged.route('**/search-index.json', route => route.fulfill({ json: fixture }));
  await pagerPage.goto(origin + '/search/?q=Note&tag=Batch&pdf=1&page=2');
  await pagerPage.waitForFunction(() => document.querySelectorAll('#search-results article').length === 10);
  assert.equal(await pagerPage.locator('#search-results h2').first().textContent(), 'Note 11');
  assert.equal(await pagerPage.locator('.search-status').textContent(), '23 notes found');
  await pagerPage.getByRole('link', { name: 'Next page', exact: true }).click();
  await pagerPage.waitForFunction(() => document.querySelectorAll('#search-results article').length === 3);
  for (const [key, value] of [['page', '3'], ['q', 'Note'], ['tag', 'Batch'], ['pdf', '1']]) {
    assert.equal(new URL(pagerPage.url()).searchParams.get(key), value);
  }
  await pagerPage.reload();
  await pagerPage.waitForFunction(() => document.querySelectorAll('#search-results article').length === 3);
  await pagerPage.goBack();
  await pagerPage.waitForFunction(() => document.querySelector('#search-results h2')?.textContent === 'Note 11');
  assert.equal(new URL(pagerPage.url()).searchParams.get('page'), '2');
  await pagerPage.getByRole('checkbox', { name: 'Search inside PDFs' }).uncheck();
  await pagerPage.waitForFunction(() => document.querySelector('#search-results h2')?.textContent === 'Note 01');
  assert.equal(new URL(pagerPage.url()).searchParams.has('page'), false);
  await pagerPage.getByRole('searchbox').fill('Note 23');
  await pagerPage.waitForFunction(() => document.querySelector('.search-status').textContent === '1 note found');
  assert.equal(await pagerPage.locator('.pagination').isVisible(), false);
  await pagerPage.goto(origin + '/search/?page=999');
  await pagerPage.waitForFunction(() => document.querySelectorAll('#search-results article').length === 3);
  assert.equal(new URL(pagerPage.url()).searchParams.get('page'), '3');
  assert.equal(await pagerPage.locator('.search-status').textContent(), '');
  await pagerPage.screenshot({ path: '.cache/pagination-mobile.png', fullPage: true });
  assert.ok(await pagerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await pagerPage.emulateMedia({ reducedMotion: 'reduce' });
  await pagerPage.goto(origin + demoHref + '#bib:references');
  await pagerPage.waitForFunction(() => document.getElementById('bib:references').classList.contains('jump-highlight'));
  await checkJumpPosition(pagerPage);
  assert.equal(await pagerPage.locator('.jump-highlight').evaluate(element => getComputedStyle(element).animationName), 'none');
  for (const theme of ['light', 'dark']) {
    await pagerPage.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const highlight = await pagerPage.locator('.jump-highlight').evaluate(element => {
      const style = getComputedStyle(element);
      return { color: style.outlineColor, width: style.outlineWidth, radius: style.borderRadius,
        background: style.backgroundColor, shadow: style.boxShadow };
    });
    assert.deepEqual(highlight, { color: 'rgb(250, 204, 21)', width: '2px', radius: '6px',
      background: 'rgba(0, 0, 0, 0)', shadow: 'none' });
    await pagerPage.screenshot({ path: '.cache/jump-outline-mobile-' + theme + '.png' });
  }
  await pagerPage.waitForFunction(() => !document.querySelector('.jump-highlight'));
  await pagerPage.goto(origin + demoHref);
  const annotations = pagerPage.locator('#highlighter-annotations + p + .code-block + p');
  for (const width of [1440, 390]) {
    await pagerPage.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await pagerPage.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await annotations.scrollIntoViewIfNeeded();
      const marks = await annotations.locator('mark').evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, color: style.color, lines: element.getClientRects().length };
      }));
      assert.deepEqual(marks.map(mark => mark.background), ['rgb(255, 255, 0)', 'rgb(152, 251, 152)', 'rgb(255, 182, 193)']);
      assert.ok(marks.every(mark => mark.color === 'rgb(23, 39, 44)' && mark.lines > 1));
      assert.ok(await pagerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await pagerPage.screenshot({ path: '.cache/highlights-' + width + '-' + theme + '.png' });
    }
  }
  await pagerPage.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await pagerPage.emulateMedia({ media: 'print', colorScheme: 'dark' });
  const printed = await pagerPage.locator('body').evaluate(element => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
  assert.deepEqual(printed, { color: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 255)' });
  assert.equal(await pagerPage.locator('.site-header').isVisible(), false);
  await paged.close();
  // Isolated draft fixtures exercise the actual templates and search UI without
  // adding unpublished notes to the maintained demo content.
  const drafts = await browser.newContext();
  const draftPage = await drafts.newPage();
  const draftNotes = [
    { title: 'A draft about convergence / 收敛笔记', draft: true, href: '/draft-ui/note/', route: 'draft-ui/note/' },
    { title: 'Published note', href: '/draft-ui/published/', route: 'draft-ui/published/' }
  ].map(note => ({ date: '', tags: ['Analysis'], lang: 'en', wordCount: 5, text: 'Notes about convergence.', kind: 'MARKDOWN', ...note }));
  const draftTemplates = templates({ ...config, base: '/' });
  const renderedDraft = { toc: [], html: '<p>This note is still being written.</p>', css: '' };
  await drafts.route('**/draft-ui/', route => route.fulfill({ contentType: 'text/html', body: draftTemplates.home(draftNotes) }));
  await drafts.route('**/draft-ui/note/', route => route.fulfill({ contentType: 'text/html', body: draftTemplates.post(draftNotes[0], renderedDraft, { next: draftNotes[1] }) }));
  await drafts.route('**/search-index.json', route => route.fulfill({ json: draftNotes }));
  for (const width of [1440, 390]) {
    await draftPage.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      for (const [route, selector] of [['/draft-ui/', '.note-row'], ['/search/', '#search-results article'], ['/draft-ui/note/', '.article-header']]) {
        await draftPage.goto(origin + route);
        await draftPage.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
        await draftPage.locator(selector + ' .draft-badge').waitFor();
        assert.equal(await draftPage.locator(selector + ' .draft-badge').count(), 1);
        if (route === '/draft-ui/') assert.equal(await draftPage.locator('.note-row h2 a .draft-badge').count(), 1);
        if (route.endsWith('/note/')) assert.equal(await draftPage.locator('.article-status > .draft-badge').count(), 1);
        if (route === '/search/') assert.equal(await draftPage.locator('#search-results article').count(), 2);
        if (route.endsWith('/note/')) assert.match(await draftPage.locator('.draft-notice').textContent(), /Unpublished · local preview only/);
        assert.ok(await draftPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await draftPage.screenshot({ path: '.cache/draft-' + (route === '/search/' ? 'search' : route.endsWith('/note/') ? 'article' : 'list') + '-' + width + '-' + theme + '.png' });
      }
    }
  }
  await drafts.close();
  await checkEncryptionBrowser(browser);
  console.log('Browser checks passed: desktop/mobile, Chinese/English search, PDF search option and document, tags, equations, TOC, theme persistence, no JS errors.');
} finally { await browser.close(); }
