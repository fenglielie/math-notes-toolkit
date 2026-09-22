import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { copyTestAssets, samplePdf } from './support/fixtures.mjs';
import { frontmatter } from '../scripts/content.mjs';
import { build } from '../scripts/build.mjs';
import { createLiveSite } from '../scripts/live.mjs';

test('dev includes drafts and their resources while subsequent publication excludes them', async () => {
  await fs.mkdir('.cache', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.cache/draft-live-test-'));
  const write = async (name, data) => {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  };
  try {
    await copyTestAssets(root);
    await write('site.config.mjs', "export default { title:'Test', base:'/sub/', url:'https://example.com', pageSize:1 }");
    await write('content/published.md', '---\ntitle: Published\nslug: aaaaaaaaaaaa\n---\nPublic text');
    const draft = '---\ntitle: Draft note\nslug: bbbbbbbbbbbb\ndraft: true\ntags: [WorkInProgress]\n---\nDraft text\n![Plot](plot.svg)\n[PDF draft](draft-pdf.md)';
    await write('content/draft.md', draft);
    await write('content/plot.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await write('content/draft-pdf.md', '---\ntitle: Draft PDF\nslug: cccccccccccc\ndraft: true\npdf: draft.pdf\n---\nPDF draft text');
    await write('content/draft.pdf', samplePdf());
    const live = createLiveSite(root);
    let state = await live.refresh();
    assert.equal(state.error, '');
    assert.equal(state.snapshot.count, 3);
    const output = state.snapshot.output;
    assert.match(output.get('index.html').toString(), /Draft note/);
    assert.match(output.get('index.html').toString(), /class="draft-badge" lang="en">Draft/);
    assert.ok(output.has('page/3/index.html'));
    assert.match(output.get('search/index.html').toString(), /WorkInProgress/);
    assert.equal(JSON.parse(output.get('search-index.json')).length, 3);
    assert.equal(JSON.parse(output.get('search-index.json')).filter(note => note.draft).length, 2);
    const html = output.get('en/bbbbbbbbbbbb/index.html').toString();
    assert.match(html, /Draft text/);
    assert.match(html, /class="draft-notice"[^>]*>.*Unpublished · local preview only/);
    assert.doesNotMatch(output.get('en/aaaaaaaaaaaa/index.html').toString(), /class="draft-notice"/);
    assert.match(output.get('en/aaaaaaaaaaaa/index.html').toString(), /class="draft-badge"/);
    assert.match(html, /href="\/sub\/en\/cccccccccccc\/"/);
    assert.match(html, /src="\/sub\/files\/plot.svg"/);
    assert.ok(output.has('en/cccccccccccc/pdf.html'));
    assert.ok(output.has('files/draft.pdf'));
    assert.ok(output.has('files/plot.svg'));
    await assert.rejects(fs.access(path.join(root, 'public')));
    await write('content/draft.md', draft.replace('Draft text', 'Updated draft text'));
    state = await live.refresh();
    assert.equal(state.error, '');
    assert.match(state.snapshot.output.get('en/bbbbbbbbbbbb/index.html').toString(), /Updated draft text/);
    const published = await build({ root });
    assert.equal(published.posts.length, 1);
    for (const name of ['en/bbbbbbbbbbbb/index.html', 'en/cccccccccccc/index.html', 'en/cccccccccccc/pdf.html', 'files/draft.pdf', 'files/plot.svg', 'page/2/index.html']) {
      assert.equal(published.output.has(name), false, name);
      await assert.rejects(fs.access(path.join(root, 'public', name)));
    }
    assert.equal(JSON.parse(published.output.get('search-index.json')).length, 1);
    assert.equal(JSON.parse(published.output.get('search-index.json'))[0].draft, undefined);
    assert.doesNotMatch(published.output.get('index.html').toString(), /draft-badge/);
    assert.doesNotMatch(published.output.get('en/aaaaaaaaaaaa/index.html').toString(), /draft-badge|draft-notice/);
    assert.doesNotMatch(published.output.get('sitemap.xml').toString(), /bbbbbbbbbbbb|cccccccccccc/);
    assert.equal(frontmatter(await fs.readFile(path.join(root, 'content/draft.md'), 'utf8')).data.draft, true);
  } finally {
    assert.ok(root.startsWith(path.resolve('.cache') + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('live builds use source files, reload template modules, handle additions and recover from errors without touching public', async () => {
  await fs.mkdir('.cache', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.cache/live-test-'));
  const write = async (name, data) => {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  };
  try {
    for (const directory of ['scripts', 'src/core', 'styles']) {
      await fs.cp(directory, path.join(root, directory), { recursive: true });
    }
    await copyTestAssets(root);
    await write('site.config.mjs', "export default { title:'Test', icon:'branding/icon.svg', subtitle:'Notes', base:'/', url:'https://example.com' }");
    await write('branding/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await write('content/note.md', '---\ntitle: First\n---\nInitial text');
    const { pathToFileURL } = await import('node:url');
    const { createLiveSite } = await import(pathToFileURL(path.join(root, 'scripts/live.mjs')).href);
    const live = createLiveSite(root);
    let state = await live.refresh();
    assert.equal(state.error, '');
    const notePath = JSON.parse(state.snapshot.output.get('search-index.json'))[0].href.slice(1) + 'index.html';
    assert.match(state.snapshot.output.get(notePath).toString(), /Initial text/);
    const firstIcon = state.snapshot.config.iconHref;
    await write('branding/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>');
    state = await live.refresh();
    assert.notEqual(state.snapshot.config.iconHref, firstIcon);
    await fs.unlink(path.join(root, 'branding/icon.svg'));
    state = await live.refresh();
    assert.match(state.error, /ENOENT/);
    await write('branding/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    state = await live.refresh();
    assert.equal(state.error, '');
    assert.equal(state.snapshot.config.iconHref, firstIcon);
    await assert.rejects(fs.access(path.join(root, 'public')));
    await write('public/index.html', 'Do not read or overwrite this export');
    const version = state.version;
    const noteSource = await fs.readFile(path.join(root, 'content/note.md'), 'utf8');
    await write('content/note.md', noteSource.replace('title: First', 'title: Updated').replace('Initial text', 'Current text'));
    state = await live.refresh();
    assert.ok(state.version > version);
    assert.match(state.snapshot.output.get(notePath).toString(), /Current text/);
    await write('assets/style.css', 'body { color: tomato; }');
    state = await live.refresh();
    assert.match(state.snapshot.output.get('assets/style.css').toString(), /body \{ color: tomato; \}\s*$/);
    assert.match(state.snapshot.output.get('assets/style.css').toString(), /\.text-highlight/);
    const templatePath = path.join(root, 'scripts/templates.mjs');
    const template = await fs.readFile(templatePath, 'utf8');
    await fs.writeFile(templatePath, template.replace('class="site-header"', 'class="site-header" data-live-check="FRESH TEMPLATE"'));
    state = await live.refresh();
    assert.match(state.snapshot.output.get('index.html').toString(), /FRESH TEMPLATE/);
    await write('content/new.md', '---\ntitle: New note\n---\nNewly added text');
    state = await live.refresh();
    assert.equal(state.snapshot.count, 2);
    assert.match(state.snapshot.output.get('search-index.json').toString(), /Newly added text/);
    const newSource = await fs.readFile(path.join(root, 'content/new.md'), 'utf8');
    const newSlug = frontmatter(newSource).data.slug;
    await write('content/new.md', newSource.replace('Newly added text', '$\\invalidMathCommand{x}$'));
    state = await live.refresh();
    assert.match(state.error, /LaTeX/);
    await fs.unlink(path.join(root, 'content/new.md'));
    state = await live.refresh();
    assert.equal(state.error, '');
    assert.equal(state.snapshot.count, 1);
    assert.equal(state.snapshot.output.has('en/' + newSlug + '/index.html'), false);
    assert.equal(await fs.readFile(path.join(root, 'public/index.html'), 'utf8'), 'Do not read or overwrite this export');
  } finally {
    assert.ok(root.startsWith(path.resolve('.cache') + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
});
