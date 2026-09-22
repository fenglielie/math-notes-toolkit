import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { copyTestAssets, samplePdf } from './support/fixtures.mjs';
import { frontmatter, metadata, safePath, withSlug } from '../scripts/content.mjs';
import { renderMarkdown } from '../scripts/markdown.mjs';
import { search } from '../scripts/search.mjs';
import { build, generate } from '../scripts/build.mjs';

test('YAML, UTF-8 and metadata validation', () => {
  const parsed = frontmatter('\uFEFF---\r\ntitle: 中英 Notes\r\ntags: [分析, Analysis]\r\n---\r\nText');
  assert.equal(parsed.body, 'Text');
  assert.equal(parsed.hasFrontmatter, true);
  assert.equal(frontmatter('# Ordinary document').hasFrontmatter, false);
  assert.deepEqual(metadata(parsed.data, 'x.md').tags, ['分析', 'Analysis']);
  assert.deepEqual(metadata({ title: 'Test', tags: [' Analysis ', 'Analysis', ' 分析 '] }, 'x.md').tags, ['Analysis', '分析']);
  const emptySlug = withSlug('---\ntitle: Test\nslug:\n---\nBody', 'abcdef012345');
  assert.equal(frontmatter(emptySlug).data.slug, 'abcdef012345');
  assert.equal((emptySlug.match(/^slug:/gm) || []).length, 1);
  assert.throws(() => frontmatter('---\ntitle: Missing end'));
  assert.throws(() => frontmatter('---\nfalse\n---'), /mapping/);
  assert.throws(() => frontmatter('---\n\n---'), /mapping/);
  assert.throws(() => metadata({}, 'x.md'), /title/);
  assert.throws(() => metadata({ title: 'Test', date: '2026-02-30' }, 'x.md'), /date/);
  assert.throws(() => metadata({ title: 'Test', tags: 'analysis' }, 'x.md'), /tags/);
  for (const slug of ['../escape', 'folder/note', 'not-a-hash', 123456789012]) {
    assert.throws(() => metadata({ title: 'Test', slug }, 'x.md'), /slug/);
  }
  for (const source of ['\uFEFF---\r\ntitle: Test # Keep comment\r\n---\r\nBody\r\n', '---\n{title: Test}\n---\nBody\n']) {
    const saved = withSlug(source, '012345678901');
    assert.equal(frontmatter(saved).data.slug, '012345678901');
    assert.equal(frontmatter(saved).body, frontmatter(source).body);
    if (source.includes('\r\n')) {
      assert.ok(saved.startsWith('\uFEFF'));
      assert.match(saved, /# Keep comment/);
      assert.doesNotMatch(saved, /(?<!\r)\n/);
    }
  }
  assert.throws(() => safePath(process.cwd(), '../outside'));
});

test('MathJax handles delimiters, AMS references, forward references and code isolation', async () => {
  const source = String.raw`
## 中文 Heading

Forward reference $\eqref{eq:test}$ and $x_i^2$ and \(a+b\).

\begin{equation}
\int_0^1 x^2\,\mathrm{d}x = \frac13 \label{eq:test}
\end{equation}

\[
\begin{pmatrix}1&0\\0&1\end{pmatrix}
\]

~~~latex
$not_math$ \unknowncommand
~~~

## 中文 Heading
`;
  const first = await renderMarkdown(source);
  assert.match(first.html, /<svg/);
  assert.match(first.html, /href="#mjx-eqn%3Aeq%3Atest"/);
  assert.doesNotMatch(first.html, /data-mjx-error|merror|Undefined control/);
  const code = first.html.match(/<code class="language-latex">([\s\S]*?)<\/code>/)[1];
  assert.equal(code.replace(/<[^>]*>/g, ''), '$not_math$ \\unknowncommand\n');
  assert.doesNotMatch(code, /mjx-container/);
  assert.deepEqual(first.toc.map(h => h.id), ['中文-heading', '中文-heading-2']);
  const again = await renderMarkdown(source);
  assert.match(again.html, /id="mjx-eqn:eq:test"/);
  assert.match(first.html, /aria-label="x_i\^2"/);
});

test('invalid TeX fails and statement labels stay English in Chinese notes', async () => {
  await assert.rejects(() => renderMarkdown('$\\unknownMathCommand{x}$'), /LaTeX/);
  await assert.rejects(() => renderMarkdown('$$\nx'), /Unclosed math block/);
  assert.match((await renderMarkdown('{% theorem begin Result %}\nText\n{% theorem end %}')).html, /Theorem \(Result\)/);
  assert.match((await renderMarkdown('{% proof begin %}\n证明\n{% proof end %}', { lang: 'zh-CN' })).html, /class="statement-title">Proof/);
  const escaped = await renderMarkdown('<script>alert(1)</script>\n\n\\$5 and \\$10');
  assert.doesNotMatch(escaped.html, /<script>/);
  assert.doesNotMatch(escaped.html, /<svg/);
});

test('search supports Chinese, English, TeX, ranking and all-term matching', () => {
  const docs = [
    { title: 'Convergence 一致收敛', tags: ['Analysis'], text: '证明 \\int 积分', date: '2026-01-01' },
    { title: 'Other', tags: [], text: 'convergence is useful', date: '2026-02-01' }
  ];
  assert.equal(search(docs, 'CONVERGENCE')[0].title, docs[0].title);
  assert.equal(search(docs, '收敛 \\int').length, 1);
  assert.equal(search(docs, '收敛 missing').length, 0);
  assert.equal(search(docs, '').length, 0);
});

test('word counts include Chinese characters and English words but exclude code, math and bibliography records', async () => {
  const fence = String.fromCharCode(96).repeat(3);
  const source = ['## 中文标题', 'Hello **world** 中文。 [A link](https://example.org/ignored/path)',
    '`ignored inline code` $x+y$', fence + 'js\nconst ignored = 10;\n' + fence,
    '$$\na+b\n$$', '{% bibtex begin %}\n@book{book, title={Ignored bibliography title}, year={2026}}\n{% bibtex end %}',
    '[@book]', 'Footnote.[^one]', '[^one]: Two words.'
  ].join('\n\n');
  assert.equal((await renderMarkdown(source)).wordCount, 13);
  assert.equal((await renderMarkdown('')).wordCount, 0);
});

test('moving a note bundle and editing text preserves identity and resolves links from the Markdown directory', async () => {
  await fs.mkdir('.cache', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.cache/identity-test-'));
  const write = async (name, data) => {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  };
  try {
    await copyTestAssets(root);
    await write('site.config.mjs', "export default { title: 'Test', base: '/', url: 'https://example.com' }");
    await write('content/topic/note.md', '---\ntitle: Same title\n---\n[Next](next.md#section)\n\n![Plot](figures/plot.svg)\n\n<img src="assets/picture.svg" alt="HTML">\n\n[Data](assets/data.txt)');
    await write('content/topic/next.md', '---\ntitle: Same title\n---\n## Section\nTarget');
    await write('content/topic/figures/plot.svg', '<svg/>');
    await write('content/topic/assets/picture.svg', '<svg/>');
    await write('content/topic/assets/data.txt', 'Data');
    await write('content/topic/scratch.md', '# Scratch');
    const first = await generate({ root });
    assert.equal(first.posts.length, 2);
    const note = first.posts.find(p => p.relative.endsWith('/note.md'));
    const next = first.posts.find(p => p.relative.endsWith('/next.md'));
    assert.notEqual(note.slug, next.slug, 'Identical titles still have distinct identities');
    const original = await fs.readFile(path.join(root, 'content/topic/note.md'), 'utf8');
    await fs.mkdir(path.join(root, 'content/arbitrary/deep'), { recursive: true });
    await fs.rename(path.join(root, 'content/topic'), path.join(root, 'content/arbitrary/deep/bundle'));
    await fs.rename(path.join(root, 'content/arbitrary/deep/bundle/note.md'), path.join(root, 'content/arbitrary/deep/bundle/renamed.md'));
    await write('content/arbitrary/deep/bundle/renamed.md', original.replace('title: Same title', 'title: Changed title') + '\nEdited body.');
    const second = await generate({ root });
    const moved = second.posts.find(p => p.title === 'Changed title');
    assert.equal(moved.href, note.href);
    const html = second.output.get(moved.route + 'index.html').toString();
    assert.ok(html.includes('href="' + next.href + '#section"'));
    for (const resource of ['figures/plot.svg', 'assets/picture.svg', 'assets/data.txt']) {
      const published = 'files/arbitrary/deep/bundle/' + resource;
      assert.ok(second.output.has(published));
      assert.ok(html.includes('/' + published));
    }
    const saved = await fs.readFile(path.join(root, 'content/arbitrary/deep/bundle/renamed.md'), 'utf8');
    await generate({ root });
    assert.equal(await fs.readFile(path.join(root, 'content/arbitrary/deep/bundle/renamed.md'), 'utf8'), saved);
    await write('content/arbitrary/deep/bundle/copy.md', saved);
    await assert.rejects(generate({ root }), /Duplicate note slug.*Remove slug/);
    await write('content/arbitrary/deep/bundle/copy.md', saved.replace(/^slug:.*\n/m, ''));
    const copied = await generate({ root });
    assert.equal(copied.posts.length, 3);
  } finally {
    assert.ok(root.startsWith(path.resolve('.cache') + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('build publishes stable hash routes, PDF text, relative assets and base paths; hides drafts and preserves good output on errors', async () => {
  await fs.mkdir('.cache', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.cache/test-'));
  const write = async (file, data) => { await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.writeFile(path.join(root, file), data); };
  try {
    await copyTestAssets(root);
    await write('site.config.mjs', "export default { title:'Test', subtitle:'Notes', base:'/sub/', url:'https://example.com' }");
    await write('content/中文.md', '---\ntitle: 中文笔记\ntags: [分析]\n---\n## 内容\n[Other](other.md#hello)\n[Same page](?view=compact#内容)\n![Plot](plot.svg)\n\n<img src="figures/曲线 图.svg" alt="中文曲线" width="400">');
    await write('content/other.md', '---\ntitle: Other\n---\n## Hello\nTest');
    await write('content/lecture.pdf', samplePdf());
    await write('content/lecture.md', '---\ntitle: Lecture\npdf: lecture.pdf\ntags: [Algebra]\n---\n## Abstract\nEigenvectors.');
    await write('content/private.md', '---\ntitle: Secret\ndraft: true\npdf: private.pdf\n---\nHidden text');
    await write('content/private.pdf', samplePdf());
    await write('content/plot.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await write('content/figures/曲线 图.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await write('content/unreferenced.txt', 'Private unreferenced attachment');
    await write('content/README.md', '# Ordinary Markdown is not a post');
    await write('content/standalone.pdf', samplePdf());
    const result = await build({ root });
    assert.equal(result.posts.length, 3);
    const notFound = result.output.get('404.html').toString();
    assert.match(notFound, /404 · Page not found/);
    assert.match(notFound, /name="robots" content="noindex"/);
    assert.doesNotMatch(notFound, /rel="canonical"/);
    assert.match(notFound, /href="\/sub\/search\/">Search notes/);
    const note = result.posts.find(p => p.relative === '中文.md');
    const other = result.posts.find(p => p.relative === 'other.md');
    const lecture = result.posts.find(p => p.relative === 'lecture.md');
    assert.equal(note.href, '/sub/zh/' + note.slug + '/');
    assert.equal(other.href, '/sub/en/' + other.slug + '/');
    assert.equal(lecture.route, 'en/' + lecture.slug + '/');
    assert.equal([...result.output.keys()].some(name => name.startsWith('notes/')), false);
    assert.equal(lecture.wordCount, 2, 'PDF text is excluded from the Markdown word count');
    for (const [position, post] of result.posts.entries()) {
      const page = result.output.get(post.route + 'index.html').toString();
      const navigation = page.match(/<nav class="note-navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1] || '';
      if (position > 0) assert.ok(navigation.includes('rel="prev" href="' + result.posts[position - 1].href + '"'));
      else assert.doesNotMatch(navigation, /rel="prev"/);
      if (position < result.posts.length - 1) assert.ok(navigation.includes('rel="next" href="' + result.posts[position + 1].href + '"'));
      else assert.doesNotMatch(navigation, /rel="next"/);
      assert.doesNotMatch(navigation, /Secret/);
      assert.ok(page.includes('class="permalink" href="https://example.com' + post.href + '"'));
    }
    for (const post of result.posts) {
      assert.match(post.slug, /^[a-f0-9]{12}$/);
      const saved = frontmatter(await fs.readFile(path.join(root, 'content', post.relative), 'utf8'));
      assert.equal(saved.data.slug, post.slug);
    }
    const html = await fs.readFile(path.join(root, 'public', note.route, 'index.html'), 'utf8');
    assert.ok(html.includes('href="' + other.href + '#hello"'));
    assert.ok(html.includes('href="' + note.href + '?view=compact#%E5%86%85%E5%AE%B9"'));
    assert.match(html, /src="\/sub\/files\/plot.svg"/);
    assert.match(html, /src="\/sub\/files\/figures\/%E6%9B%B2%E7%BA%BF%20%E5%9B%BE.svg"/);
    assert.match(html, /alt="中文曲线" width="400"/);
    await fs.access(path.join(root, 'public/files/figures/曲线 图.svg'));
    assert.ok(html.includes('https://example.com' + note.href));
    const index = JSON.parse(await fs.readFile(path.join(root, 'public/search-index.json'), 'utf8'));
    assert.equal(search(index, 'Searchable eigenvalue').length, 0);
    const pdfMatches = search(index, 'Searchable eigenvalue', { includePdfContent: true });
    assert.equal(pdfMatches.length, 1);
    assert.match(pdfMatches[0].snippet, /Searchable eigenvalue/);
    for (const term of ['Lecture', 'Algebra', 'Eigenvectors']) {
      assert.equal(search(index, term).length, 1, 'PDF metadata and Markdown remain searchable');
    }
    assert.equal(search(index, 'Algebra Searchable').length, 0);
    assert.equal(search(index, 'Algebra Searchable', { includePdfContent: true }).length, 1);
    assert.equal(search(index, 'Secret').length, 0);
    await assert.rejects(fs.access(path.join(root, 'public/files/private.pdf')));
    await assert.rejects(fs.access(path.join(root, 'public/files/unreferenced.txt')));
    await assert.rejects(fs.access(path.join(root, 'public/files/standalone.pdf')));
    const searchPage = await fs.readFile(path.join(root, 'public/search/index.html'), 'utf8');
    assert.match(searchPage, /data-tag="分析"/);
    assert.match(html, /href="\/sub\/search\/\?tag=%E5%88%86%E6%9E%90"/);
    const pdfPage = await fs.readFile(path.join(root, 'public', lecture.route, 'index.html'), 'utf8');
    assert.match(pdfPage, /iframe/);
    assert.match(pdfPage, /PDF document · 1 page</);
    assert.match(pdfPage, /class="word-count" lang="en">2 words/);
    assert.match(pdfPage, /class="attachment-pages" lang="en">Attachment: 1 page/);
    assert.ok(pdfPage.includes('src="' + lecture.href + 'pdf.html"'));
    const viewerPage = await fs.readFile(path.join(root, 'public', lecture.route, 'pdf.html'), 'utf8');
    assert.match(viewerPage, /data-file="\/sub\/files\/lecture.pdf"/);
    const worker = viewerPage.match(/data-worker="\/sub\/([^"]+)"/)[1];
    assert.match(worker, /worker\.[a-f0-9]{12}\.js$/);
    await fs.access(path.join(root, 'public', worker));
    const resources = viewerPage.match(/data-resources="\/sub\/([^"]+)"/)[1];
    assert.match(resources, /^pdfjs-resources\.[a-f0-9]{12}\/$/);
    await fs.access(path.join(root, 'public', resources, 'wasm/openjpeg_nowasm_fallback.js'));
    await write('content/bad.md', '---\ntitle: Broken\n---\n[Broken](missing.md)');
    await assert.rejects(build({ root }), /unpublished/);
    assert.equal(await fs.readFile(path.join(root, 'public', note.route, 'index.html'), 'utf8'), html);
    assert.equal(frontmatter(await fs.readFile(path.join(root, 'content/bad.md'), 'utf8')).data.slug, undefined);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve('.cache') + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
});
