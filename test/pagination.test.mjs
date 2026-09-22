import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { copyTestAssets } from './support/fixtures.mjs';
import { generate } from '../scripts/build.mjs';
import { paginate, pageNumbers } from '../assets/pagination.js';
import { templates } from '../scripts/templates.mjs';

test('pagination handles boundaries, invalid URL pages and compact page numbers', () => {
  const items = Array.from({ length: 23 }, (_, index) => index);
  assert.deepEqual(paginate(items, 3).items, [20, 21, 22]);
  for (const page of [-1, 0, 'bad', 1.5, Infinity]) assert.equal(paginate(items, page).page, 1);
  assert.equal(paginate(items, 999).page, 3);
  assert.deepEqual(paginate([], 99), { page: 1, totalPages: 1, items: [] });
  assert.deepEqual(pageNumbers(5, 20), [1, null, 4, 5, 6, null, 20]);
  assert.deepEqual(pageNumbers(1, 3), [1, 2, 3]);
});

test('build creates static pages with complete coverage, canonical URLs and base-aware navigation', async () => {
  await fs.mkdir('.cache', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.cache/pagination-test-'));
  try {
    await fs.mkdir(path.join(root, 'content'));
    await copyTestAssets(root);
    await fs.mkdir(path.join(root, 'branding'));
    await fs.writeFile(path.join(root, 'branding/icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await fs.writeFile(path.join(root, 'site.config.mjs'), "export default { title: 'Test', icon: 'branding/icon.svg', pageSize: 10, base: '/sub/', url: 'https://example.com' }");
    for (let index = 1; index <= 23; index++) {
      const lang = { 21: 'zh', 22: 'zh-CN', 23: 'zh-TW' }[index] || 'en';
      await fs.writeFile(path.join(root, 'content', index + '.md'), '---\ntitle: Note ' + String(index).padStart(2, '0') + '\nlang: ' + lang + '\nslug: "' + index.toString(16).padStart(12, '0') + '"\n---\nText');
    }
    const { output, posts, config } = await generate({ root });
    for (const post of posts.slice(-3)) {
      assert.equal(post.href, '/sub/zh/' + post.slug + '/');
      assert.ok(output.get(post.route + 'index.html').toString().includes('class="note" lang="' + post.lang + '"'));
    }
    assert.match(config.iconHref, /^\/sub\/favicon\.[a-f0-9]{12}\.svg$/);
    assert.equal(config.iconType, 'image/svg+xml');
    assert.equal(output.get(config.iconHref.slice('/sub/'.length)).toString(), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    assert.ok(output.get('index.html').toString().includes('rel="icon" href="' + config.iconHref + '"'));
    assert.equal((await generate({ root })).config.iconHref, config.iconHref);
    await fs.writeFile(path.join(root, 'branding/icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>');
    assert.notEqual((await generate({ root })).config.iconHref, config.iconHref);
    const seen = [];
    for (const [route, count] of [['index.html', 10], ['page/2/index.html', 10], ['page/3/index.html', 3]]) {
      const html = output.get(route).toString();
      const hrefs = [...html.matchAll(/<article class="note-row"><h2><a href="([^"]+)"/g)].map(match => match[1]);
      assert.equal(hrefs.length, count);
      seen.push(...hrefs);
    }
    assert.deepEqual(seen, posts.map(post => post.href));
    const first = output.get('index.html').toString(), second = output.get('page/2/index.html').toString(), last = output.get('page/3/index.html').toString();
    assert.match(first, /href="\/sub\/page\/2\/" rel="next"/);
    assert.doesNotMatch(first, /rel="prev"/);
    assert.match(second, /href="\/sub\/" rel="prev"/);
    assert.match(second, /rel="canonical" href="https:\/\/example.com\/sub\/page\/2\/"/);
    assert.doesNotMatch(last, /rel="next"/);
    assert.equal(output.has('page/1/index.html'), false);
    assert.equal(output.has('page/4/index.html'), false);
    assert.equal(JSON.parse(output.get('search-index.json')).length, 23);
    const small = templates({ title: 'Test', base: '/' }).home(posts.slice(0, 2));
    assert.doesNotMatch(small, /class="pagination"/);
    await fs.writeFile(path.join(root, 'site.config.mjs'), "export default { pageSize: 0 }");
    await assert.rejects(generate({ root }), /pageSize/);
  } finally {
    assert.ok(root.startsWith(path.resolve('.cache') + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
});
