import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { configFileFromArgs } from '../scripts/config.mjs';
import { generate } from '../scripts/build.mjs';
import { createLiveSite } from '../scripts/live.mjs';
import { copyTestAssets } from './support/fixtures.mjs';

test('configuration arguments select a file and reject invalid options', () => {
  assert.equal(configFileFromArgs([]), 'site.config.mjs');
  assert.equal(configFileFromArgs(['--config', 'custom/site.mjs']), 'custom/site.mjs');
  assert.equal(configFileFromArgs(['--config=site.demo.config.mjs']), 'site.demo.config.mjs');
  for (const args of [['--config'], ['--config', ''], ['--unknown'], ['extra']]) {
    assert.throws(() => configFileFromArgs(args));
  }
});

test('selected configuration controls builds and live reload independently of the personal site', async () => {
  await fs.mkdir('.cache', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.cache/config-test-'));
  const write = async (name, data) => {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  };
  const configFile = 'site.demo.config.mjs';
  try {
    await copyTestAssets(root);
    for (const directory of ['scripts', 'src/core', 'styles']) {
      await fs.cp(directory, path.join(root, directory), { recursive: true });
    }
    await write('site.config.mjs', "export default { title: 'Personal', contentDirs: ['personal'] }");
    await write(configFile, "export default { title: 'Demo', contentDirs: ['demo'], base: '/demo/' }");
    await write('personal/note.md', '---\ntitle: Personal note\n---\nPersonal content');
    await write('demo/note.md', '---\ntitle: Demo note\n---\nDemo content');
    assert.equal((await generate({ root })).posts[0].title, 'Personal note');
    await write('site.config.mjs', "throw new Error('Personal configuration must not be loaded');");
    const selected = await generate({ root, configFile });
    assert.deepEqual(selected.posts.map(post => post.title), ['Demo note']);
    assert.equal(selected.config.base, '/demo/');
    await promisify(execFile)(process.execPath, ['scripts/build.mjs', '--config', configFile], { cwd: root, windowsHide: true });
    const index = JSON.parse(await fs.readFile(path.join(root, 'public/search-index.json'), 'utf8'));
    assert.deepEqual(index.map(post => post.title), ['Demo note']);
    const live = createLiveSite(root, { configFile });
    let state = await live.refresh();
    assert.equal(state.error, '');
    assert.equal(state.snapshot.config.title, 'Demo');
    await write(configFile, "export default { title: 'Changed demo', contentDirs: ['personal'] }");
    state = await live.refresh();
    assert.equal(state.error, '');
    assert.equal(state.snapshot.config.title, 'Changed demo');
    assert.match(state.snapshot.output.get('search-index.json').toString(), /Personal note/);
    const source = await fs.readFile(path.join(root, 'personal/note.md'), 'utf8');
    await write('personal/note.md', source.replace('Personal content', 'Updated selected content'));
    state = await live.refresh();
    assert.match(state.snapshot.output.get('search-index.json').toString(), /Updated selected content/);
  } finally {
    assert.ok(root.startsWith(path.resolve('.cache') + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
});
