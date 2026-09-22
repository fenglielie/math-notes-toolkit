import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../../src/core/node.mjs';

const entry = (key, title = key) => '@book{' + key + ', author={Doe, Jane}, title={' + title + '}, year={2026}, publisher={Example Press}}';
const block = source => '{% bibtex begin %}\n' + source + '\n{% bibtex end %}';
const fence = String.fromCharCode(96).repeat(3);

test('embedded BibTeX supports forward, grouped and repeated citations, with cited-only references', async () => {
  const { html, toc } = await renderMarkdown('See [@second, pp. 2–4; @first]. Again [@second].\n\n' + block([entry('first'), entry('second'), entry('unused')].join('\n')));
  assert.match(html, /id="cite:1:1" href="#ref:1" title="second">1/);
  assert.match(html, /id="cite:1:2" href="#ref:1" title="second">1/);
  assert.match(html, /pp. 2–4/);
  assert.match(html, /<li id="ref:1" data-cite-key="second">/);
  assert.match(html, /<li id="ref:2" data-cite-key="first">/);
  assert.doesNotMatch(html, /unused|@book|bibtex begin/);
  assert.match(html, /href="#cite:1:2"/);
  assert.deepEqual(toc, [{ level: 2, title: 'References', id: 'bib:references' }]);
});

test('multiple blocks, footnotes, UTF-8 and TeX accents work together', async () => {
  const { html } = await renderMarkdown([
    block(entry('中文', '中文笔记')), 'A citation in a footnote.[^one]',
    '[^one]: See [@中文; @godel].',
    block('@article{godel, author={G{\\"o}del, Kurt}, title={A {Protected} Title}, journal={Journal}, year={1931}}')
  ].join('\n\n'));
  assert.match(html, /class="footnotes"/);
  assert.match(html, /中文笔记/);
  assert.match(html, /Gödel/);
  assert.match(html, /data-cite-key="godel"/);
});

test('code, math and link labels keep citation syntax literal', async () => {
  const { html } = await renderMarkdown([
    fence + 'markdown', '[@missing]', block(entry('sample')), fence,
    String.fromCharCode(96) + '[@missing]' + String.fromCharCode(96),
    '[@missing](https://example.org)', 'Literal \\[@missing]', '$[@missing]$',
    block(entry('unused'))
  ].join('\n\n'));
  assert.doesNotMatch(html, /class="citation"|class="references"/);
  assert.match(html, /href="https:\/\/example.org"/);
});

test('invalid blocks, duplicate keys and missing references report errors', async () => {
  await assert.rejects(renderMarkdown('[@missing]'), /Unknown citation key: missing/);
  await assert.rejects(renderMarkdown(block(entry('same') + '\n' + entry('same'))), /Duplicate BibTeX key: same/);
  await assert.rejects(renderMarkdown(block(entry('same')) + '\n' + block(entry('same'))), /Duplicate BibTeX key: same/);
  await assert.rejects(renderMarkdown(block('@book{broken, title={Unclosed}')), /BibTeX block at line 1/);
  await assert.rejects(renderMarkdown('{% bibtex begin %}\n' + entry('x')), /Unclosed bibtex block/);
  await assert.rejects(renderMarkdown('{% bibtex end %}'), /Unexpected bibtex end/);
});

test('bibliography markup and links cannot introduce scripts', async () => {
  const bib = '@misc{unsafe, title={<img src=x onerror=alert(1)> & text}, url={javascript:alert(1)}, year={2026}}\n' +
    '@article{safe, title={A paper}, author={Doe, Jane}, journal={Journal}, year={2026}, doi={10.1000/a_b}, url={https://example.org/?a=1&b=2}}';
  const { html } = await renderMarkdown('[@unsafe; @safe]\n\n' + block(bib));
  assert.doesNotMatch(html, /<img|<script|href="javascript:/);
  assert.match(html, /href="https:\/\/doi.org\/10.1000\/a_b"/);
  assert.match(html, /href="https:\/\/example.org\/\?a=1&amp;b=2"/);
});

test('reference links normalize DOI, avoid duplicate resolvers and search readable Unicode titles', async () => {
  const bib = [
    '@article{linked, title={A {Protected} Title}, doi={https://doi.org/10.1000/a_b}, url={http://dx.doi.org/10.1000/a_b}}',
    '@misc{unicode, title={中文 <i>标题</i> &amp; G{\\"o}del}, year={1931}}',
    '@misc{pdf, title={A PDF}, url={https://example.org/paper.pdf?download=1}}',
    '@misc{article, title={An Article}, url={https://example.org/paper}}',
    '@misc{missing, author={Doe, Jane}, year={2026}}'
  ].join('\n');
  const { html } = await renderMarkdown('[@linked; @unicode; @pdf; @article; @missing]\n\n' + block(bib));
  assert.equal((html.match(/href="https:\/\/doi.org\/10.1000\/a_b"/g) || []).length, 1);
  const queries = [...html.matchAll(/href="(https:\/\/scholar.google.com\/scholar\?q=[^"]+)"/g)].map(match => new URL(match[1]).searchParams.get('q'));
  assert.deepEqual(queries, ['A Protected Title', '中文 标题 & Gödel', 'A PDF', 'An Article']);
  assert.match(html, /href="https:\/\/example.org\/paper.pdf\?download=1">PDF/);
  assert.match(html, /href="https:\/\/example.org\/paper">Article/);
});
