import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../../src/core/node.mjs';

test('HTML images handle quoted attributes, entities, dimensions and local paths', async () => {
  const paths = [];
  const { html } = await renderMarkdown('<IMG\n src="assets/图 1.svg" alt="A &amp; B > C" title=Plot width="320" height=180 loading=lazy />', {
    resolveLink: value => { paths.push(value); return '/files/' + value; }
  });
  assert.deepEqual(paths, ['assets/%E5%9B%BE%201.svg']);
  assert.match(html, /<img src="\/files\/assets\/%E5%9B%BE%201.svg"/);
  assert.match(html, /alt="A &amp; B > C"/);
  assert.match(html, /width="320" height="180" loading="lazy"/);
});

test('HTML image examples stay literal in code and unsafe attributes are excluded', async () => {
  const { html } = await renderMarkdown('~~~html\n<img src="missing.png">\n~~~\n\n`<img src="missing.png">`\n\n<img src="figures/plot.svg" onerror="alert(1)" style="position:fixed" width="100%">\n\n<img src="javascript:alert(1)">');
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.match(html, /<img src="figures\/plot.svg" alt="">/);
  assert.doesNotMatch(html, /<img[^>]+(?:onerror|style=|javascript:)/);
  assert.match(html, /&lt;img src="missing.png"&gt;/);
});
