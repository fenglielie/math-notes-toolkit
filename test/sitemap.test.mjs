import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { build, generate } from '../scripts/build.mjs';
import { sitemap } from '../scripts/sitemap.mjs';
import { copyTestAssets, samplePdf } from './support/fixtures.mjs';

const locations = xml => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);

test('sitemaps encode URLs, escape XML, and handle empty sites without inventing modification dates', () => {
  const config = { url: 'https://example.com', base: '/', pageSize: 10 };
  const empty = sitemap(config, []);
  assert.match(empty, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(empty, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.deepEqual(locations(empty), ['https://example.com/']);
  assert.doesNotMatch(empty, /lastmod|changefreq|priority/);
  const encoded = sitemap({ ...config, base: "/笔记&'资料/" }, []);
  assert.equal(locations(encoded)[0], 'https://example.com/%E7%AC%94%E8%AE%B0&amp;&apos;%E8%B5%84%E6%96%99/');
  assert.equal(sitemap({ base: '/', pageSize: 10 }, []), null);
});

test('build publishes base-aware sitemaps for merged content, pagination and PDF wrappers while excluding drafts', async () => {
  await fs.mkdir('.cache', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.cache/sitemap-test-'));
  const write = async (name, data) => {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  };
  const config = { title: 'Test', url: 'https://example.com/', base: '/sub/', pageSize: 2, contentDirs: ['notes', 'extra'] };
  try {
    await copyTestAssets(root);
    await write('site.config.mjs', 'export default ' + JSON.stringify(config));
    await write('notes/note.md', '---\ntitle: English\nslug: "aaaaaaaaaaaa"\nlang: en\n---\nPublished text');
    await write('extra/note.md', '---\ntitle: 中文\nslug: "bbbbbbbbbbbb"\nlang: zh\n---\n中文正文');
    await write('extra/lecture.md', '---\ntitle: Lecture\nslug: "cccccccccccc"\nlang: en\npdf: lecture.pdf\n---\nPDF summary');
    await write('extra/lecture.pdf', samplePdf());
    await write('extra/draft.md', '---\ntitle: Draft\nslug: "dddddddddddd"\ndraft: true\n---\nPrivate');
    await write('notes/scratch.md', 'Not an article');
    const result = await build({ root });
    const xml = await fs.readFile(path.join(root, 'public/sitemap.xml'), 'utf8');
    const urls = locations(xml);
    assert.equal(urls.length, 5);
    assert.equal(new Set(urls).size, urls.length);
    assert.deepEqual(new Set(urls), new Set([
      'https://example.com/sub/', 'https://example.com/sub/page/2/',
      'https://example.com/sub/en/aaaaaaaaaaaa/', 'https://example.com/sub/zh/bbbbbbbbbbbb/',
      'https://example.com/sub/en/cccccccccccc/'
    ]));
    assert.doesNotMatch(xml, /dddddddddddd|scratch|search|404|pdf\.html|lecture\.pdf/);
    for (const url of urls) {
      const route = new URL(url).pathname.slice('/sub/'.length);
      assert.ok(result.output.get(route + 'index.html').toString().includes('rel="canonical" href="' + url + '"'));
    }
    assert.equal(await fs.readFile(path.join(root, 'public/robots.txt'), 'utf8'),
      'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sub/sitemap.xml\n');
    delete config.url;
    await write('site.config.mjs', 'export default ' + JSON.stringify(config));
    const localOnly = await generate({ root });
    assert.equal(localOnly.output.has('sitemap.xml'), false);
    assert.equal(localOnly.output.has('robots.txt'), false);
  } finally {
    assert.ok(root.startsWith(path.resolve('.cache') + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
});
