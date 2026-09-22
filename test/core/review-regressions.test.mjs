import test from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { renderMarkdown } from '../../src/core/node.mjs';
import { extendMarkdownIt } from '../../extension/src/markdown.mjs';

const adaptor = liteAdaptor();
const hosts = {
  node: async source => (await renderMarkdown(source)).html,
  editor: source => extendMarkdownIt(new MarkdownIt()).render(source)
};

test('escaped delimiters stay literal while real formulas retain document-wide state', async () => {
  const literal = 'Show literal \\\\(x\\\\) and \\\\(\\notacommand\\\\).\n\n\\\\[y\\\\]';
  for (const [host, render] of Object.entries(hosts)) {
    const html = await render(literal);
    const text = adaptor.textContent(adaptor.body(adaptor.parse(html)));
    assert.match(text, /\\\(x\\\)/, host);
    assert.match(text, /\\\(\\notacommand\\\)/, host);
    assert.match(text, /\\\[y\\\]/, host);
    assert.doesNotMatch(html, /mjx-container|markdown-math-tex|role="alert"/, host);
  }
  const { html } = await renderMarkdown(literal + '\n\n$\\newcommand{\\RR}{\\mathbb{R}}\\RR$\n\nSee \\(\\eqref{eq:test}\\).\n\n\\begin{equation}x\\in\\RR\\label{eq:test}\\end{equation}');
  assert.equal((html.match(/<mjx-container /g) || []).length, 3);
  assert.match(html, /href="#mjx-eqn%3Aeq%3Atest"/);
  await assert.rejects(renderMarkdown('$\\notacommand$'), /Undefined control sequence/);
});

const marker = '{% theorem end %}';
const cases = [
  ['bullet opening fence', ['- ```markdown', '  ' + marker, '  ```']],
  ['ordered opening fence', ['1. ~~~markdown', '   ' + marker, '   ~~~']],
  ['nested list fence', ['- Item', '  - ```markdown', '    ' + marker, '    ```']],
  ['quoted list fence', ['> - ```markdown', '>   ' + marker, '>   ```']],
  ['long fence', ['- ````markdown', '  ```', '  ' + marker, '  `````']],
  ['different fence character', ['- ~~~markdown', '  ```', '  ' + marker, '  ~~~~']],
  ['indented code', ['    ' + marker]],
  ['list indented code', ['- Item', '', '      ' + marker]]
];
for (const [name, lines] of cases) {
  test('statement keeps ' + name + ' literal in both hosts', async () => {
    const source = ['{% theorem begin %}', '', ...lines, '', 'Still inside.', marker, '', 'Outside.'].join('\n');
    for (const [host, render] of Object.entries(hosts)) {
      const html = await render(source);
      const body = adaptor.body(adaptor.parse(html));
      const sections = adaptor.tags(body, 'section');
      assert.equal(sections.length, 1, host);
      assert.match(adaptor.textContent(sections[0]), /Still inside\./, host);
      assert.doesNotMatch(adaptor.textContent(sections[0]), /Outside\./, host);
      const code = adaptor.tags(sections[0], 'code');
      assert.equal(code.length, 1, host);
      assert.ok(adaptor.textContent(code[0]).includes(marker), host);
      assert.doesNotMatch(html, /role="alert"/, host);
    }
    const md = extendMarkdownIt(new MarkdownIt());
    const opening = md.parse(source, {}).find(token => token.type === 'statement_open');
    assert.deepEqual(opening.map, [0, lines.length + 5]);
  });
}

test('statements inside Markdown containers preserve nesting and error locations', async () => {
  for (const prefix of ['> ', '  ']) {
    const lines = ['{% theorem begin %}', 'Text.', '{% proof begin %}', 'Proof.', '{% proof end %}', marker];
    const source = (prefix === '  ' ? '- Item\n\n' : '') + lines.map(line => prefix + line).join('\n');
    for (const render of Object.values(hosts)) {
      const html = await render(source);
      assert.equal(adaptor.tags(adaptor.body(adaptor.parse(html)), 'section').length, 2);
      assert.doesNotMatch(html, /role="alert"/);
    }
  }
  const broken = ['{% theorem begin %}', '- ```', '  ' + marker, '  ```', '{% proof end %}'].join('\n');
  await assert.rejects(renderMarkdown(broken), /Mismatched statement end marker at line 5/);
  assert.match(hosts.editor(broken), /data-line="4"[^>]*>Mismatched statement/);
});

test('heading anchors are unique even when titles already contain generated suffixes', async () => {
  for (const titles of [
    ['Foo', 'Foo', 'Foo-2'],
    ['Foo-2', 'Foo', 'Foo', 'Foo-2', 'Foo-2-2', 'Foo'],
    ['!!!', 'Section', 'section-2', '!!!', '中文', '中文', '中文-2']
  ]) {
    const { html, toc } = await renderMarkdown(titles.map(title => '# ' + title).join('\n\n'));
    const ids = adaptor.tags(adaptor.body(adaptor.parse(html)), 'h1').map(node => adaptor.getAttribute(node, 'id'));
    assert.equal(new Set(ids).size, titles.length);
    assert.deepEqual(toc.map(item => item.id), ids);
    assert.deepEqual(toc.map(item => item.title), titles);
  }
  assert.equal((await renderMarkdown('# Foo')).toc[0].id, 'foo');
});

test('the reported list fence works without blank separator lines', async () => {
  const source = ['{% theorem begin %}', '- ```markdown', '  {% theorem end %}', '  ```', '{% theorem end %}'].join('\n');
  for (const render of Object.values(hosts)) {
    const html = await render(source);
    const body = adaptor.body(adaptor.parse(html));
    const sections = adaptor.tags(body, 'section');
    assert.equal(sections.length, 1);
    assert.equal(adaptor.tags(body, 'code').length, 1);
    assert.equal(adaptor.textContent(adaptor.tags(sections[0], 'code')[0]).trim(), marker);
  }
});

test('statement boundaries cannot cross list items or blockquotes', async () => {
  for (const source of [
    '- {% theorem begin %}\n  Text.\n\n{% theorem end %}',
    '> {% theorem begin %}\n> Text.\n\n{% theorem end %}',
    '{% theorem begin %}\n> {% theorem end %}',
    '- {% theorem begin %}\n- {% theorem end %}'
  ]) {
    await assert.rejects(renderMarkdown(source), /Unclosed theorem|Mismatched statement/);
    assert.match(hosts.editor(source), /role="alert"/);
  }
});
