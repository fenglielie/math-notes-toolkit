import test from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import { extendMarkdownIt } from '../src/markdown.mjs';

test('all documented statement kinds and plain-text titles render', () => {
  const md = extendMarkdownIt(new MarkdownIt());
  for (const kind of ['theorem', 'lemma', 'proposition', 'corollary', 'definition', 'example', 'problem', 'proof', 'solution', 'remark', 'note']) {
    const html = md.render(`{% ${kind} begin <Title> %}\nText.\n{% ${kind} end %}`);
    assert.match(html, new RegExp('statement ' + kind));
    assert.match(html, /\(&lt;Title&gt;\)/);
    assert.doesNotMatch(html, /markdown-math-error/);
  }
});

test('color syntax supports its three documented colors and rejects malformed markers', () => {
  const md = extendMarkdownIt(new MarkdownIt());
  for (const color of ['yellow', 'green', 'pink']) {
    assert.match(md.render(`{% color ${color} begin %}**Text**{% color end %}`), new RegExp('highlight-' + color));
  }
  assert.match(md.render('{% color purple begin %}Text{% color end %}'), /Unknown highlight color/);
  assert.match(md.render('{% color green begin %}Text'), /Unclosed color begin marker/);
});

test('restricted images keep supported attributes and discard event handlers and invalid sizes', () => {
  const md = extendMarkdownIt(new MarkdownIt());
  const html = md.render('<img src="figures/test.svg" alt="Test" title="Title" width="240" height="0" loading="lazy" style="color:red" onerror="alert(1)">');
  assert.match(html, /src="figures\/test.svg"/);
  assert.match(html, /width="240"/);
  assert.match(html, /loading="lazy"/);
  assert.doesNotMatch(html, /height=|style=|onerror=/);
});

test('front matter is optional and formulas support all four delimiters', () => {
  const md = extendMarkdownIt(new MarkdownIt());
  const html = md.render('Inline $x^2$ and \\(y^2\\).\n\n\\[z^2\\]\n\n$$w^2$$');
  assert.equal((html.match(/class="markdown-math-tex/g) || []).length, 4);
  assert.equal((html.match(/data-display="true"/g) || []).length, 2);
  assert.doesNotMatch(html, /markdown-math-error/);
});

test('citations survive footnote token reordering and cached document switches', () => {
  const md = extendMarkdownIt(new MarkdownIt());
  const source = 'Main citation [@main] and a footnote[^detail].\n\n[^detail]: Footnote citation [@detail].\n\n'
    + '{% bibtex begin %}\n@book{main,title={Main source},author={Doe, Jane},year={2026}}\n'
    + '@book{detail,title={Footnote source},author={Smith, Alex},year={2025}}\n{% bibtex end %}';
  const tokens = md.parse(source, {});
  md.parse('A different document.', {});
  const html = md.renderer.render(tokens, md.options, {});
  assert.doesNotMatch(html, /markdown-math-error/);
  assert.match(html, /Main source/);
  assert.match(html, /Footnote source/);
  assert.match(html, /id="ref:1"/);
  assert.match(html, /id="ref:2"/);
  assert.match(html, /class="footnotes/);
});
