import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../../src/core/node.mjs';

test('color markers support wrapping, inline formatting, math and resolved links', async () => {
  const { html, wordCount } = await renderMarkdown(
    '{% color yellow begin %}Yellow words{% color end %} '
    + '{% color green begin %}Green\nwords{% color end %} '
    + '{% color pink begin %}Pink{% color end %}\n\n'
    + '{% color green begin %}**Bold** and *emphasis* with [link](note.md) and $x=1${% color end %}',
    { resolveLink: href => href === 'note.md' ? '/en/aaaaaaaaaaaa/' : href }
  );
  assert.equal((html.match(/<mark /g) || []).length, 4);
  assert.match(html, /highlight-yellow">Yellow words<\/mark>/);
  assert.match(html, /highlight-green">Green\nwords<\/mark>/);
  assert.match(html, /highlight-pink">Pink<\/mark>/);
  assert.match(html, /<mark[^>]*><strong>Bold<\/strong> and <em>emphasis<\/em>/);
  assert.match(html, /href="\/en\/aaaaaaaaaaaa\/"/);
  assert.match(html, /<mjx-container/);
  assert.equal(wordCount, 11);
});

test('color markers preserve code, escapes, ordinary equals signs and HTML safety', async () => {
  const { html } = await renderMarkdown([
    '`{% color pink begin %}code{% color end %}`',
    '```text\n{% color green begin %}fenced{% color end %}\n```',
    '\\{% color green begin %}escaped\\{% color end %}',
    '==ordinary text==',
    '{% color pink begin %}<script>alert(1)</script>{% color end %}',
    '{% color green begin %}code `{% color end %}` and $x == y$ stays together{% color end %}'
  ].join('\n\n'));
  assert.equal((html.match(/<mark /g) || []).length, 2);
  assert.match(html, /<code>\{% color pink begin %\}code\{% color end %\}<\/code>/);
  assert.match(html, /<p>\{% color green begin %\}escaped\{% color end %\}<\/p>/);
  assert.match(html, /<p>==ordinary text==<\/p>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<mark[^>]*>code <code>\{% color end %\}<\/code>/);
});

test('color markers pair within Markdown scopes and reject malformed annotations', async () => {
  const { html } = await renderMarkdown(
    '**{% color green begin %}bold{% color end %}**\n\n'
    + '[{% color pink begin %}link{% color end %}](https://example.com)\n\n'
    + '{% color yellow begin %}\nouter {% color green begin %}inner{% color end %}\n{% color end %}'
  );
  assert.match(html, /<strong><mark[^>]*>bold<\/mark><\/strong>/);
  assert.match(html, /<a[^>]*><mark[^>]*>link<\/mark><\/a>/);
  assert.match(html, /highlight-yellow">\nouter <mark[^>]*>inner<\/mark>\n<\/mark>/);
  for (const [source, error] of [
    ['{% color green begin %}unclosed', /Unclosed color begin/],
    ['{% color end %}', /Unexpected color end/],
    ['{% color blue begin %}unsupported{% color end %}', /Unknown highlight color/],
    ['{% color green begin %}one\n\ntwo{% color end %}', /Unclosed color begin/]
  ]) await assert.rejects(() => renderMarkdown(source), error);
});
