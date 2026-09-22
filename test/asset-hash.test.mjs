import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hashAssets } from '../scripts/asset-hash.mjs';

test('content hashes update HTML and module imports, stay stable, and propagate dependency changes', () => {
  function fixture(search = 'export const value = 1;') {
    return new Map(Object.entries({
      'index.html': '<link href="/notes/assets/style.css"><script src="/notes/assets/app.js"></script>',
      'assets/style.css': 'body { color: teal; }',
      'assets/app.js': "import { value } from './search.js'; console.log(value);",
      'assets/search.js': search
    }).map(([name, text]) => [name, Buffer.from(text)]));
  }
  const first = fixture(), second = fixture();
  const names = hashAssets(first, '/notes/');
  assert.deepEqual(names, hashAssets(second, '/notes/'));
  for (const [original, renamed] of names) {
    const hash = createHash('sha256').update(first.get(renamed)).digest('hex').slice(0, 12);
    assert.ok(renamed.includes('.' + hash + '.'));
    assert.equal(first.has(original), false);
  }
  assert.ok(first.get('index.html').toString().includes('/notes/' + names.get('assets/style.css')));
  assert.ok(first.get('index.html').toString().includes('/notes/' + names.get('assets/app.js')));
  assert.ok(first.get(names.get('assets/app.js')).toString().includes(names.get('assets/search.js').slice('assets/'.length)));
  const changed = hashAssets(fixture('export const value = 2;'), '/notes/');
  assert.notEqual(names.get('assets/search.js'), changed.get('assets/search.js'));
  assert.notEqual(names.get('assets/app.js'), changed.get('assets/app.js'));
  assert.equal(names.get('assets/style.css'), changed.get('assets/style.css'));
});
