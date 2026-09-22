import { createHash } from 'node:crypto';
import path from 'node:path';

export function hashAssets(output, base) {
  const names = new Map(), active = new Set();
  const source = new Map([...output].filter(([file]) => /^assets\/.*\.(css|js)$/.test(file)));
  function fingerprint(file) {
    if (names.has(file)) return names.get(file);
    if (active.has(file)) throw new Error('Circular asset imports cannot be fingerprinted: ' + file);
    active.add(file);
    let text = source.get(file).toString();
    if (file.endsWith('.js')) {
      // Rewrite relative static and dynamic imports before hashing the importer.
      text = text.replace(/(\b(?:from\s*|import\s*(?:\(\s*)?)['"])(\.{1,2}\/[^'"]+)(['"])/g, (match, prefix, target, quote) => {
        const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
        if (!source.has(dependency)) return match;
        const renamed = fingerprint(dependency);
        let relative = path.posix.relative(path.posix.dirname(file), renamed);
        if (!relative.startsWith('.')) relative = './' + relative;
        return prefix + relative + quote;
      });
    }
    const data = Buffer.from(text);
    const digest = createHash('sha256').update(data).digest('hex').slice(0, 12);
    const extension = path.posix.extname(file);
    const renamed = file.slice(0, -extension.length) + '.' + digest + extension;
    output.delete(file);
    output.set(renamed, data);
    names.set(file, renamed);
    active.delete(file);
    return renamed;
  }
  for (const file of source.keys()) fingerprint(file);
  for (const [file, data] of output) {
    if (!file.endsWith('.html')) continue;
    let html = data.toString();
    for (const [original, renamed] of names) {
      html = html.replaceAll('"' + base + original + '"', '"' + base + renamed + '"');
    }
    output.set(file, Buffer.from(html));
  }
  return names;
}
