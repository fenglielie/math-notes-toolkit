import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { copyTestAssets, samplePdf } from './support/fixtures.mjs';
import { contentRoots, frontmatter } from '../scripts/content.mjs';
import { generate } from '../scripts/build.mjs';
import { createLiveSite } from '../scripts/live.mjs';

test('content directory configuration accepts paths and rejects invalid lists', () => {
  const root = path.resolve('.');
  assert.deepEqual(contentRoots(root, {}), [path.join(root, 'content')]);
  assert.deepEqual(contentRoots(root, { contentDirs: 'notes' }), [path.join(root, 'notes')]);
  assert.deepEqual(contentRoots(root, { contentDirs: ['notes', './notes', path.join(root, 'notes')] }), [path.join(root, 'notes')]);
  for (const contentDirs of ['', [], [''], ['notes', 42], false, {}]) {
    assert.throws(() => contentRoots(root, { contentDirs }), /contentDirs/);
  }
});

test('merged roots preserve links, identities, distinct attachments and PDF sources', async () => {
  await fs.mkdir('.cache', { recursive: true });
  const area = await fs.mkdtemp(path.resolve('.cache/content-dirs-'));
  const root = path.join(area, 'site');
  const write = async (name, value) => {
    const file = path.join(area, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, value);
  };
  const configure = contentDirs => write('site/site.config.mjs', 'export default ' + JSON.stringify({
    title: 'Test', base: '/blog/', pageSize: 1, contentDirs
  }));
  try {
    await copyTestAssets(root);
    await configure(['notes', '../shared', 'notes/nested', './notes']);
    await write('site/notes/note.md', '---\ntitle: First\n---\n[Other](../../shared/note.md#section)\n\n![Plot](plot.svg)');
    await write('site/notes/nested/third.md', '---\ntitle: Third\n---\nThird text');
    await write('shared/note.md', '---\ntitle: Second\npdf: lecture.pdf\n---\n## Section\n[First](../site/notes/note.md)\n\n![Plot](plot.svg)');
    await write('site/notes/plot.svg', '<svg>first</svg>');
    await write('shared/plot.svg', '<svg>second</svg>');
    await write('shared/unused.txt', 'Not published');
    await write('shared/lecture.pdf', samplePdf({ text: 'Richardson extrapolation', pages: 2 }));
    let result = await generate({ root });
    assert.equal(result.posts.length, 3);
    assert.equal(JSON.parse(result.output.get('search-index.json')).length, 3);
    assert.ok(result.output.has('page/3/index.html'));
    const first = result.posts.find(post => post.title === 'First');
    const second = result.posts.find(post => post.title === 'Second');
    const html = post => result.output.get(post.route + 'index.html').toString();
    assert.ok(html(first).includes('href="' + second.href + '#section"'));
    assert.ok(html(second).includes('href="' + first.href + '"'));
    assert.ok(html(first).includes('/blog/files/1/plot.svg'));
    assert.ok(html(second).includes('/blog/files/2/plot.svg'));
    assert.equal(result.output.get('files/1/plot.svg').toString(), '<svg>first</svg>');
    assert.equal(result.output.get('files/2/plot.svg').toString(), '<svg>second</svg>');
    assert.ok(!result.output.has('files/2/unused.txt'));
    assert.equal(second.pdfHref, '/blog/files/2/lecture.pdf');
    assert.equal(second.pages, 2);
    assert.match(JSON.parse(result.output.get('search-index.json')).find(post => post.kind === 'PDF').pdfText, /Richardson/);
    const saved = await fs.readFile(path.join(area, 'shared/note.md'), 'utf8');
    assert.equal(frontmatter(saved).data.slug, second.slug);
    result = await generate({ root });
    assert.equal(result.posts.find(post => post.title === 'Second').href, second.href);
    await write('site/notes/copy.md', saved.replace('pdf: lecture.pdf\n', ''));
    await assert.rejects(generate({ root }), /Duplicate note slug/);
    await fs.unlink(path.join(root, 'notes/copy.md'));
    await write('outside.txt', 'Private');
    await write('site/notes/bad.md', '---\ntitle: Bad\n---\n[Outside](../../outside.txt)');
    await assert.rejects(generate({ root }), /outside the allowed content directories/);
    await fs.unlink(path.join(root, 'notes/bad.md'));
    await write('shared/note.md', saved.replace('[First](../site/notes/note.md)', 'Only external content'));
    await configure(path.join(area, 'shared'));
    result = await generate({ root });
    assert.equal(result.posts.length, 1);
    assert.equal(result.posts[0].href, second.href);
    assert.ok(result.output.has('files/plot.svg'));
    await configure('../missing');
    await assert.rejects(generate({ root }), /ENOENT/);
  } finally {
    assert.ok(area.startsWith(path.resolve('.cache') + path.sep));
    await fs.rm(area, { recursive: true, force: true });
  }
});

test('live preview watches external directories and configuration changes, including missing roots', async () => {
  await fs.mkdir('.cache', { recursive: true });
  const area = await fs.mkdtemp(path.resolve('.cache/content-live-'));
  const root = path.join(area, 'site');
  const write = async (name, value) => {
    const file = path.join(area, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, value);
  };
  const configure = contentDirs => write('site/site.config.mjs', 'export default ' + JSON.stringify({ title: 'Test', contentDirs }));
  try {
    await copyTestAssets(root);
    await configure('../external');
    await write('external/note.md', '---\ntitle: External\n---\nInitial');
    const live = createLiveSite(root);
    let state = await live.refresh();
    assert.equal(state.error, '');
    assert.equal(state.snapshot.count, 1);
    const saved = await fs.readFile(path.join(area, 'external/note.md'), 'utf8');
    await write('external/note.md', saved.replace('Initial', 'Updated outside the project'));
    state = await live.refresh();
    assert.match(state.snapshot.output.get('search-index.json').toString(), /Updated outside the project/);
    await write('external/new.md', '---\ntitle: Added\n---\nNew');
    state = await live.refresh();
    assert.equal(state.snapshot.count, 2);
    await fs.unlink(path.join(area, 'external/new.md'));
    state = await live.refresh();
    assert.equal(state.snapshot.count, 1);
    await configure(['../external', '../later']);
    state = await live.refresh();
    assert.match(state.error, /ENOENT/);
    await write('later/note.md', '---\ntitle: Later\n---\nRestored');
    state = await live.refresh();
    assert.equal(state.error, '');
    assert.equal(state.snapshot.count, 2);
    await configure('../later');
    state = await live.refresh();
    assert.equal(state.snapshot.count, 1);
    assert.match(state.snapshot.output.get('search-index.json').toString(), /Later/);
    await assert.rejects(fs.access(path.join(root, 'public')));
  } finally {
    assert.ok(area.startsWith(path.resolve('.cache') + path.sep));
    await fs.rm(area, { recursive: true, force: true });
  }
});
