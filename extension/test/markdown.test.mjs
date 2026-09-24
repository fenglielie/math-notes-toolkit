import test from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { extendMarkdownIt } from '../src/markdown.mjs';

test('preview keeps soft line breaks and bare links consistent with the site', () => {
  const md = extendMarkdownIt(new MarkdownIt({ breaks: true }));
  for (const kind of ['remark', 'proof', 'note', 'solution']) {
    const html = md.render(`{% ${kind} begin %}\nFirst line\nsecond line\n{% ${kind} end %}`);
    assert.match(html, /First line\nsecond line/);
    assert.doesNotMatch(html, /<br\s*\/?\s*>/);
  }
  assert.match(md.render('https://example.com'), /<a href="https:\/\/example.com">https:\/\/example.com<\/a>/);
});

test('editor blocks retain original source lines including front matter and nested statements', () => {
  const md = extendMarkdownIt(new MarkdownIt());
  const source = ['---', 'title: Example', '---', '', '{% theorem begin Test %}',
    'Text.', '{% proof begin %}', '\\begin{align}', 'a&=b\\label{a}', '\\end{align}',
    '{% proof end %}', '{% theorem end %}'].join('\n');
  const html = md.render(source);
  assert.match(html, /data-line="4" class="code-line statement theorem"/);
  assert.match(html, /data-line="6" class="code-line statement proof"/);
  assert.match(html, /class="code-line" data-line="7"/);
  assert.match(html, /data-tex="\\begin\{align\}/);
  assert.doesNotMatch(html, /title: Example/);
});

test('cached tokens render citations independently after another document was parsed', () => {
  const md = extendMarkdownIt(new MarkdownIt());
  const source = title => `See [@ref].\n\n{% bibtex begin %}\n@book{ref,title={${title}},author={Doe, Jane},year={2025}}\n{% bibtex end %}`;
  const a = md.parse(source('First'), {});
  const b = md.parse(source('Second'), {});
  const render = tokens => md.renderer.render(tokens, md.options, {});
  assert.match(render(a), /First/);
  assert.doesNotMatch(render(a), /Second/);
  assert.match(render(b), /Second/);
  assert.equal((render(a).match(/id="cite:1:1"/g) || []).length, 1);
  assert.doesNotMatch(render(a), /cite:1:2/);
});

test('references remain inside other preview plugins\' content wrappers in either registration order', () => {
  const adaptor = liteAdaptor();
  const source = 'See [@ref] and again [@ref].\n\n{% bibtex begin %}\n@book{ref,title={Sample Notes},author={Doe, Jane},year={2026}}\n{% bibtex end %}';
  const wrap = md => {
    const render = md.renderer.render.bind(md.renderer);
    md.renderer.render = (...args) => '<article data-preview-wrapper="true">' + render(...args) + '</article>';
  };
  for (const wrapperFirst of [true, false]) {
    const md = new MarkdownIt();
    if (wrapperFirst) wrap(md);
    extendMarkdownIt(md);
    if (!wrapperFirst) wrap(md);
    const tokens = md.parse(source, {});
    for (let pass = 0; pass < 2; pass++) {
      const html = md.renderer.render(tokens, md.options, {});
      const body = adaptor.body(adaptor.parse(html));
      const references = adaptor.tags(body, 'section').filter(node => adaptor.getAttribute(node, 'class') === 'references');
      assert.equal(references.length, 1);
      assert.equal(adaptor.getAttribute(adaptor.parent(references[0]), 'data-preview-wrapper'), 'true');
      assert.match(html, /href="#cite:1:2"/);
    }
    assert.doesNotMatch(md.render('No citations here.'), /doc-bibliography/);
  }
});

test('incomplete syntax is escaped, reports a source line, and recovers after editing', () => {
  const md = extendMarkdownIt(new MarkdownIt());
  assert.match(md.render('\n\n{% theorem begin %}\nText'), /data-line="2"[^>]*>Unclosed theorem/);
  assert.match(md.render('{% theorem begin %}\nText\n{% theorem end %}'), /statement theorem/);
  assert.doesNotMatch(md.render('<script>alert(1)</script>'), /<script>/);
  assert.doesNotMatch(md.render('<img src="x.png" onerror="alert(1)">'), /onerror/);
});

test('math source, highlighted text and code examples remain distinct', () => {
  const md = extendMarkdownIt(new MarkdownIt());
  const html = md.render('Inline $a_b$ and {% color green begin %}green{% color end %}.\n\n```tex\n{% theorem begin %}\n$a$\n```');
  assert.match(html, /data-tex="a_b"/);
  assert.match(html, /highlight-green/);
  assert.match(html, /<code class="language-tex">\{% theorem begin %\}/);
  assert.equal((html.match(/markdown-math-tex/g) || []).length, 1);
});
