import test from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import { citations } from '../../src/core/index.mjs';

test('cached documents keep their bibliography after footnote reordering and document switches', () => {
  const refs = citations();
  const md = new MarkdownIt().use(footnote).use(refs.plugin);
  const source = 'See [@one] and a footnote[^n].\n\n[^n]: See [@two].\n\n'
    + '{% bibtex begin %}\n@book{one, title={First}, author={Doe, Jane}, year={2026}}\n'
    + '@book{two, title={Second}, author={Doe, Jane}, year={2025}}\n{% bibtex end %}';
  const cached = md.parse(source, {});
  md.parse('Another document without references.', {});
  refs.prepareRender(cached);
  const html = md.renderer.render(cached, md.options, {});
  const bibliography = refs.bibliography();
  assert.match(html, /href="#ref:1"/);
  assert.match(html, /href="#ref:2"/);
  assert.match(bibliography, /First/);
  assert.match(bibliography, /Second/);
  const empty = md.parse('No citations.', {});
  refs.prepareRender(empty);
  md.renderer.render(empty, md.options, {});
  assert.equal(refs.bibliography(), '');
});
