import path from 'node:path';
import { parse, parseDocument } from 'yaml';

export function contentRoots(root, config) {
  const value = config.contentDirs ?? 'content';
  const directories = Array.isArray(value) ? value : [value];
  if (!directories.length || directories.some(dir => typeof dir !== 'string' || !dir.trim())) {
    throw new Error('contentDirs must be a nonempty path string or an array of nonempty path strings.');
  }
  return [...new Set(directories.map(dir => path.resolve(root, dir)))];
}

export function frontmatter(text, file = '') {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { data: {}, body: normalized, hasFrontmatter: false };
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) throw new Error(file + ': Unclosed YAML front matter');
  let data;
  try { data = parse(match[1]); }
  catch (error) { throw new Error(file + ': Invalid YAML front matter: ' + error.message); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(file + ': Front matter must be a key-value mapping');
  return { data, body: normalized.slice(match[0].length), hasFrontmatter: true };
}

export function withSlug(text, slug) {
  return text.replace(/^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/, (_, opening, yaml, closing) => {
    const document = parseDocument(yaml);
    const newline = opening.endsWith('\r\n') ? '\r\n' : '\n';
    if (!document.has('slug') && !document.contents.flow && !/^\.\.\.(?:\s|$)/m.test(yaml)) {
      return opening + yaml + newline + 'slug: "' + slug + '"' + closing;
    }
    document.set('slug', slug);
    return opening + document.toString().trimEnd().replace(/\n/g, newline) + closing;
  });
}

export function safePath(root, relative) {
  const resolved = path.resolve(root, relative);
  const rel = path.relative(path.resolve(root), resolved);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error('Path is outside the allowed directory: ' + relative);
  return resolved;
}

export function metadata(data, relative) {
  const title = data.title;
  if (typeof title !== 'string' || !title.trim()) throw new Error(relative + ': title must be a nonempty string');
  const tags = data.tags ?? [];
  if (!Array.isArray(tags) || tags.some(t => typeof t !== 'string' || !t.trim())) throw new Error(relative + ': tags must be an array of nonempty strings');
  const date = data.date == null ? '' : String(data.date);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error(relative + ': date must be a valid date in YYYY-MM-DD format');
  if (data.draft != null && typeof data.draft !== 'boolean') throw new Error(relative + ': draft must be a boolean');
  const hasPassword = Object.hasOwn(data, 'password');
  if (Object.hasOwn(data, 'encrypt') || Object.hasOwn(data, 'passwordEnv')) throw new Error(relative + ': use password in the article front matter to enable encryption');
  if (hasPassword && (typeof data.password !== 'string' || !data.password.trim())) throw new Error(relative + ': password must be a nonempty quoted string');
  if (data.pdf != null && typeof data.pdf !== 'string') throw new Error(relative + ': pdf must be a file path string');
  if (data.lang != null && !['en', 'zh', 'zh-CN', 'zh-TW'].includes(data.lang)) throw new Error(relative + ': lang must be en, zh, zh-CN, or zh-TW');
  const slug = data.slug;
  if (slug != null && (typeof slug !== 'string' || !/^[a-f0-9]{12}$/.test(slug))) throw new Error(relative + ': slug must be a quoted string of 12 lowercase hexadecimal characters');
  return { ...data, title: title.trim(), tags: [...new Set(tags.map(tag => tag.trim()))], date, slug, encrypted: hasPassword };
}
