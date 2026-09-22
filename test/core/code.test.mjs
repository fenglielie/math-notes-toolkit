import test from 'node:test';
import assert from 'node:assert/strict';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { renderMarkdown } from '../../src/core/node.mjs';

const fence = String.fromCharCode(96).repeat(3);
const adaptor = liteAdaptor();
function codeText(html) {
  const document = adaptor.parse(html);
  return adaptor.textContent(adaptor.tags(adaptor.body(document), 'code')[0]);
}

test('highlighting preserves exact source, blank lines, Unicode and multiline tokens', async () => {
  const source = '/* First line\n * 第二行\n */\n\nconst html = "<b>& value</b>";\n';
  const { html } = await renderMarkdown(fence + 'js\n' + source + fence);
  assert.match(html, /hljs-comment/);
  assert.match(html, /hljs-keyword/);
  assert.match(html, /code-language">JavaScript/);
  assert.doesNotMatch(html, /class="code-lines"/);
  assert.equal(codeText(html), source);
  assert.doesNotMatch(html, /<b>/);
});

test('unknown languages and indented code remain escaped plain text', async () => {
  const source = '<script>alert("x")</script>\n{% remark begin %}\n$not_math$\n';
  const { html } = await renderMarkdown(fence + 'unknown-language\n' + source + fence);
  assert.equal(codeText(html), source);
  assert.doesNotMatch(html, /<script|mjx-container|class="statement/);
  assert.equal(codeText((await renderMarkdown('    x < y\n')).html), 'x < y\n');
});
