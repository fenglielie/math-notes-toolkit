import fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configFileFromArgs, loadConfig } from './config.mjs';
import { contentRoots, frontmatter, metadata, safePath, withSlug } from './content.mjs';
import { renderMarkdown } from './markdown.mjs';
import { templates } from './templates.mjs';
import { hashAssets } from './asset-hash.mjs';
import { sitemap } from './sitemap.mjs';
import { encryptArticle } from './encryption.mjs';
import { compileLatex } from './latex.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const encodedPath = p => p.split('/').map(encodeURIComponent).join('/');
async function renameWithRetry(source, destination) {
  for (let attempt = 0; ; attempt++) {
    try { return await fs.rename(source, destination); }
    catch (error) {
      if (attempt >= 5 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}
async function walk(root, relative = '') {
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  const results = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) results.push(...await walk(root, name));
    else results.push(name);
  }
  return results;
}

async function pdfText(file) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(await fs.readFile(file)), useSystemFonts: true, isEvalSupported: false });
  let doc;
  try {
    doc = await task.promise;
    const chunks = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      chunks.push(content.items.map(item => item.str || '').join(' '));
      page.cleanup();
    }
    return { text: chunks.join('\n'), pages: doc.numPages };
  } finally { await task.destroy(); }
}

export async function generate({ root = process.cwd(), configFile = 'site.config.mjs', includeDrafts = false, latex = false, reuseLatex = false } = {}) {
  const config = await loadConfig(root, configFile);
  config.pageSize ??= 10;
  if (!Number.isSafeInteger(config.pageSize) || config.pageSize < 1) throw new Error('pageSize must be a positive integer.');
  config.base = '/' + (config.base || '/').split('/').filter(Boolean).join('/');
  if (!config.base.endsWith('/')) config.base += '/';
  if (config.url) {
    const url = new URL(config.url);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('url must be an HTTP(S) site address');
    config.url = config.url.replace(/\/$/, '');
  }
  const roots = contentRoots(root, config), files = new Map();
  for (const [index, contentRoot] of roots.entries()) {
    for (const relative of await walk(contentRoot)) {
      const file = path.join(contentRoot, relative);
      if (!files.has(file)) files.set(file, {
        relative,
        asset: (roots.length > 1 ? (index + 1) + '/' : '') + relative
      });
    }
  }
  // Register generated PDFs before resolving links, including on a fresh checkout.
  const latexSources = new Map(), preparedPdfs = new Set();
  for (const [file, info] of [...files]) {
    if (!/\.tex$/i.test(file)) continue;
    const pdf = file.replace(/\.tex$/i, '.pdf');
    latexSources.set(pdf, file);
    if (!files.has(pdf)) files.set(pdf, {
      relative: info.relative.replace(/\.tex$/i, '.pdf'),
      asset: info.asset.replace(/\.tex$/i, '.pdf')
    });
  }
  const resolveFile = (sourceFile, value) => {
    const file = path.resolve(path.dirname(sourceFile), value);
    if (!roots.some(dir => {
      const relative = path.relative(dir, file);
      return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
    })) throw new Error('Path is outside the allowed content directories: ' + value);
    return file;
  };
  const posts = [], sourceMap = new Map(), slugs = new Map(), pendingSlugs = [];
  for (const [sourceFile, { relative }] of files) {
    if (!/\.md$/i.test(sourceFile)) continue;
    const source = await fs.readFile(sourceFile, 'utf8');
    const { data, body, hasFrontmatter } = frontmatter(source, relative);
    if (!hasFrontmatter) continue;
    const meta = metadata(data, relative);
    if (!meta.slug) {
      meta.slug = createHash('sha256').update(randomUUID()).digest('hex').slice(0, 12);
      pendingSlugs.push({ file: sourceFile, source, slug: meta.slug });
    }
    if (slugs.has(meta.slug)) throw new Error('Duplicate note slug ' + meta.slug + ': ' + slugs.get(meta.slug) + ' and ' + sourceFile + '. Remove slug from the copied note to generate a new identity.');
    slugs.set(meta.slug, sourceFile);
    let pdfFile;
    if (meta.pdf) {
      pdfFile = resolveFile(sourceFile, meta.pdf);
      if (!/\.pdf$/i.test(pdfFile)) throw new Error(sourceFile + ': pdf must reference a .pdf file');
      if (!files.has(pdfFile)) throw new Error(sourceFile + ': PDF file not found: ' + meta.pdf);
      meta.pdf = files.get(pdfFile).relative;
    }
    if (includeDrafts || !meta.draft) posts.push({ ...meta, relative, sourceFile, pdfFile, body });
  }
  for (const p of posts) {
    p.lang ||= /[\p{Script=Han}]/u.test(p.title + p.body) ? 'zh-CN' : 'en';
    p.route = (p.lang.startsWith('zh') ? 'zh' : 'en') + '/' + encodedPath(p.slug) + '/';
    p.href = config.base + p.route;
    p.kind = p.pdf ? 'PDF' : 'MARKDOWN';
    sourceMap.set(p.sourceFile, p.href);
  }
  posts.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'zh-CN'));
  const output = new Map();
  const write = async (relative, text) => {
    safePath(root, relative);
    output.set(relative, Buffer.from(text));
  };
  const iconPath = config.icon ?? 'assets/favicon.svg';
  const iconTypes = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };
  const iconExtension = typeof iconPath === 'string' ? path.extname(iconPath).toLowerCase() : '';
  if (!iconTypes[iconExtension]) throw new Error('icon must be a project-local SVG, PNG, ICO, WebP, JPEG, or GIF file path.');
  const iconData = await fs.readFile(config.icon == null ? path.join(project, 'assets/favicon.svg') : safePath(root, iconPath));
  const iconFile = 'favicon.' + createHash('sha256').update(iconData).digest('hex').slice(0, 12) + iconExtension;
  await write(iconFile, iconData);
  config.iconHref = config.base + iconFile;
  config.iconType = iconTypes[iconExtension];
  let pdfResources = '';
  if (posts.some(p => p.pdf)) {
    const pdfjs = path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
    for (const [source, destination] of [
      ['build/pdf.mjs', 'pdf.js'], ['build/pdf.worker.mjs', 'worker.js'],
      ['web/pdf_viewer.mjs', 'viewer.js'], ['web/pdf_viewer.css', 'viewer.css'], ['LICENSE', 'LICENSE'],
    ]) await write('assets/pdfjs/' + destination, await fs.readFile(path.join(pdfjs, source)));
    const resources = new Map(), digest = createHash('sha256');
    for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
      for (const file of await walk(path.join(pdfjs, folder))) {
        const name = folder + '/' + file, data = await fs.readFile(path.join(pdfjs, folder, file));
        resources.set(name, data);
        digest.update(name).update(data);
      }
    }
    pdfResources = 'pdfjs-resources.' + digest.digest('hex').slice(0, 12) + '/';
    for (const [file, data] of resources) await write(pdfResources + file, data);
    for (const file of await walk(path.join(pdfjs, 'web/images'))) {
      await write('assets/pdfjs/images/' + file, await fs.readFile(path.join(pdfjs, 'web/images', file)));
    }
  }
  const t = templates(config), index = [], assets = new Set(), protectedAssets = new Set();
  const publishAsset = file => {
    if (!files.has(file)) throw new Error('Referenced file not found: ' + file);
    if (/\.(md|ya?ml)$/i.test(file)) throw new Error('Cannot publish note source files as attachments: ' + file);
    assets.add(file);
    return config.base + 'files/' + encodedPath(files.get(file).asset);
  };
  for (const [position, p] of posts.entries()) {
    const articleAssets = new Map(), referencedPdfs = new Set();
    const articleAsset = file => {
      if (latexSources.has(file)) referencedPdfs.add(file);
      if (!p.encrypted) return publishAsset(file);
      if (!files.has(file)) throw new Error('Referenced file not found: ' + file);
      if (/\.(md|ya?ml)$/i.test(file)) throw new Error('Cannot publish note source files as attachments: ' + file);
      protectedAssets.add(file);
      if (!articleAssets.has(file)) articleAssets.set(file, 'urn:math-notes:asset:' + articleAssets.size);
      return articleAssets.get(file);
    };
    const resolveLink = value => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(value)) return value;
      const match = value.match(/^([^?#]*)(.*)$/);
      if (!match[1]) return p.href + match[2];
      const decoded = decodeURIComponent(match[1]);
      const absolute = resolveFile(p.sourceFile, decoded);
      if (/\.md$/i.test(absolute)) {
        if (!sourceMap.has(absolute)) throw new Error(p.sourceFile + ': Link points to a missing or unpublished note: ' + value);
        return sourceMap.get(absolute) + match[2];
      }
      return articleAsset(absolute) + match[2];
    };
    if (p.pdf) p.pdfHref = articleAsset(p.pdfFile);
    let rendered;
    try { rendered = await renderMarkdown(p.body, { resolveLink }); }
    catch (error) { throw new Error(p.relative + ': ' + error.message, { cause: error }); }
    for (const pdf of referencedPdfs) {
      if (preparedPdfs.has(pdf)) continue;
      if (latex) await compileLatex(latexSources.get(pdf), pdf, { reuse: reuseLatex });
      else {
        try { await fs.access(pdf); }
        catch (error) {
          if (error.code !== 'ENOENT') throw error;
          throw new Error('PDF not found: ' + pdf + '. Run npm run build:latex locally or in CI using the same site configuration, then deploy public/. Ordinary builds require existing PDFs.', { cause: error });
        }
      }
      preparedPdfs.add(pdf);
    }
    let pdfContent = '';
    if (p.pdf) {
      try {
        const extracted = await pdfText(p.pdfFile);
        p.pages = extracted.pages;
        pdfContent = extracted.text;
        if (!extracted.text.trim()) console.warn(p.pdf + ': No extractable text; scanned documents need OCR. Title, tags, and Markdown body remain searchable.');
      } catch (error) {
        console.warn(p.pdf + ': PDF text extraction failed; only title, tags, and Markdown body will be indexed. ' + error.message);
      }
    }
    p.wordCount = rendered.wordCount;
    if (p.pdf) rendered.toc.push({ level: 2, title: 'PDF document', id: 'pdf' });
    const neighbors = { previous: posts[position - 1], next: posts[position + 1] };
    if (p.encrypted) {
      const mediaTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.pdf': 'application/pdf' };
      const attachments = [];
      for (const [file, id] of articleAssets) attachments.push({ id, name: path.basename(file), type: mediaTypes[path.extname(file).toLowerCase()] || 'application/octet-stream', data: (await fs.readFile(file)).toString('base64') });
      const envelope = await encryptArticle({ html: t.post(p, rendered, { ...neighbors, fragment: true }), css: rendered.css, attachments }, p.password, p.href);
      await write(p.route + 'index.html', t.lockedPost(p, envelope, neighbors));
    } else await write(p.route + 'index.html', t.post(p, rendered, neighbors));
    // Encrypted PDF viewers are empty shells; the unlocked parent supplies a blob.
    if (p.pdf) await write(p.route + 'pdf.html', t.pdfViewer(p.encrypted ? { ...p, pdfHref: '' } : p, pdfResources));
    index.push({ title: p.title, date: p.date, tags: p.tags, href: p.href, kind: p.kind,
      ...(p.draft ? { draft: true } : {}),
      ...(p.encrypted ? { encrypted: true } : {}),
      text: p.encrypted ? '' : p.body.replace(/\s+/g, ' ').trim(),
      ...(p.pdf && !p.encrypted ? { pdfText: pdfContent.replace(/\s+/g, ' ').trim() } : {}) });
  }
  if ([...protectedAssets].some(file => assets.has(file) || file === path.resolve(root, iconPath))) {
    throw new Error('An encrypted attachment is also referenced by public content or the site icon. Use separate files for public and encrypted content.');
  }
  await write('index.html', t.home(posts));
  for (let page = 2; page <= Math.ceil(posts.length / config.pageSize); page++) {
    await write('page/' + page + '/index.html', t.home(posts, page));
  }
  await write('search/index.html', t.searchPage(posts));
  await write('search-index.json', JSON.stringify(index));
  await write('404.html', t.notFound());
  // Framework assets are installed with the package; site assets are optional overrides.
  for (const assetRoot of [path.join(project, 'assets'), path.join(root, 'assets')]) {
    try { await fs.access(assetRoot); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const asset of await walk(assetRoot)) {
      if (asset === 'favicon.svg') continue;
      if (protectedAssets.has(path.join(assetRoot, asset))) throw new Error('An encrypted attachment is inside the public assets directory. Move it into a private content directory.');
      await write('assets/' + asset, await fs.readFile(safePath(assetRoot, asset)));
    }
  }
  const highlights = await fs.readFile(fileURLToPath(new URL('../styles/highlights.css', import.meta.url)), 'utf8');
  const extraStyles = config.styles ?? [];
  if (!Array.isArray(extraStyles) || extraStyles.some(file => typeof file !== 'string' || !file.trim())) throw new Error('styles must be an array of project-local CSS paths.');
  const customStyles = await Promise.all(extraStyles.map(file => fs.readFile(safePath(root, file), 'utf8')));
  await write('assets/style.css', highlights + '\n' + output.get('assets/style.css').toString() + '\n' + customStyles.join('\n'));
  await write('assets/search.js', await fs.readFile(path.join(project, 'scripts/search.mjs')));
  for (const asset of assets) {
    await write('files/' + files.get(asset).asset, await fs.readFile(asset));
  }
  if (config.url) {
    await write('CNAME', new URL(config.url).hostname + '\n');
    await write('sitemap.xml', sitemap(config, posts));
    await write('robots.txt', 'User-agent: *\nAllow: /\n\nSitemap: ' + new URL(config.url + config.base + 'sitemap.xml').href + '\n');
  }
  // Persist identities only after rendering succeeds; never replace a newer edit.
  for (const { file, source, slug } of pendingSlugs) {
    if (await fs.readFile(file, 'utf8') !== source) throw new Error(file + ': Source changed during the build; retry to assign its slug.');
    await fs.writeFile(file, withSlug(source, slug));
  }
  return { posts, config, output };
}

export async function build({ root = process.cwd(), out = path.join(root, 'public'), configFile = 'site.config.mjs', latex = false } = {}) {
  const allowedOut = path.resolve(root, 'public');
  if (path.resolve(out) !== allowedOut) throw new Error('Build output must be the project-local public/ directory');
  const result = await generate({ root, configFile, latex });
  hashAssets(result.output, result.config.base);
  // Only the export command writes to disk; previews use the generated map.
  const staging = await fs.mkdtemp(path.join(root, '.build-'));
  try {
    for (const [relative, data] of result.output) {
      const target = safePath(staging, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, data);
    }
    const backup = safePath(root, '.build-backup-' + randomUUID());
    let previous = false;
    try { await renameWithRetry(allowedOut, backup); previous = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await renameWithRetry(staging, allowedOut); }
    catch (error) {
      if (previous) {
        try { await renameWithRetry(backup, allowedOut); }
        catch (restoreError) { throw new Error('Publishing failed; the previous export is preserved at ' + backup + '. ' + restoreError.message, { cause: error }); }
      }
      throw error;
    }
    if (previous) {
      try { await fs.rm(backup, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
      catch (error) { console.warn('Export succeeded, but the previous export could not be removed: ' + backup + '. ' + error.message); }
    }
    console.log('Built ' + result.posts.length + ' notes → ' + allowedOut);
    return result;
  } finally { await fs.rm(staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => build({ configFile: configFileFromArgs() }))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
