import { escape as e } from './markdown.mjs';
import { paginate, pageNumbers } from '../assets/pagination.js';

export function templates(config) {
  const base = config.base;
  const link = p => base + p.replace(/^\//, '');
  const tagUrl = t => link('search/?tag=' + encodeURIComponent(t));
  const tags = list => list.map(t => '<a class="tag" href="' + tagUrl(t) + '">' + e(t) + '</a>').join('');
  const date = d => d ? '<time datetime="' + e(d) + '">' + e(d.replaceAll('-', '.')) + '</time>' : '';
  const draftBadge = note => note.draft ? '<span class="draft-badge" lang="en">Draft</span>' : '';
  const encryptedBadge = note => note.encrypted ? '<span class="encrypted-badge" lang="en">Encrypted</span>' : '';
  const noteIcon = pdf => '<svg class="note-icon' + (pdf ? ' note-icon-pdf' : '') + '" viewBox="0 0 20 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 2h8l5 5v15H4z"/><path d="M12 2v5h5M7 12h7M7 16h5"/></svg>';
  const list = posts => '<div class="note-list">' + posts.map(p => '<article class="note-row"><h2><a href="' + p.href + '">' + noteIcon(p.pdf) + '<span>' + e(p.title) + draftBadge(p) + '</span>' + (p.pdf ? '<span class="sr-only"> (PDF)</span>' : '') + '</a>' + encryptedBadge(p) + '</h2><div class="tags">' + tags(p.tags) + '</div></article>').join('') + '</div>';
  const footer = { label: '@' + (config.author || 'Your Name'), url: config.homepage || 'https://example.com', ...config.footer };
  function layout(title, body, { current = '', route = '', css = '', noindex = false } = {}) {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>' + e(title === config.title ? title : title + ' · ' + config.title) + '</title>' +
      (noindex ? '<meta name="robots" content="noindex">' : config.url ? '<link rel="canonical" href="' + e(config.url + link(route)) + '">' : '') +
      '<link rel="icon" href="' + e(config.iconHref || link('favicon.svg')) + '" type="' + e(config.iconType || 'image/svg+xml') + '"><script src="' + link('assets/theme.js') + '"></script><link rel="stylesheet" href="' + link('assets/style.css') + '">' +
      (css ? '<style>' + css + '</style>' : '') + '<script type="module" src="' + link('assets/app.js') + '"></script></head><body data-base="' + e(base) + '" data-page-size="' + (config.pageSize ?? 10) + '"><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><a class="brand" href="' + base + '">' + e(config.title) + '</a><nav aria-label="Main navigation">' +
      '<a href="' + link('search/') + '"' + (current === 'Search' ? ' aria-current="page"' : '') + '>Search</a>' +
      '</nav></header><main id="main">' + body + '</main><footer class="site-footer"><a href="' + e(footer.url) + '">' + e(footer.label) + '</a><div class="footer-actions"><button id="back-to-top" class="back-to-top" type="button">Back to top</button><button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle color theme"><span class="theme-label-light">Light</span><span class="theme-label-dark">Dark</span></button></div></footer></body></html>';
  }
  function home(posts, requestedPage = 1) {
    const { page, totalPages, items } = paginate(posts, requestedPage, config.pageSize ?? 10);
    const route = page === 1 ? '' : 'page/' + page + '/';
    const pageLink = (number, label = number, rel = '') => '<a href="' + link(number === 1 ? '' : 'page/' + number + '/') + '"' + (rel ? ' rel="' + rel + '"' : '') + ' aria-label="' + (rel ? label + ' page' : 'Page ' + number) + '">' + label + '</a>';
    const navigation = totalPages > 1 ? '<nav class="pagination" aria-label="Pagination">' +
      (page > 1 ? pageLink(page - 1, 'Previous', 'prev') : '') +
      pageNumbers(page, totalPages).map(number => number === null ? '<span class="pagination-gap" aria-hidden="true">…</span>' : number === page ? '<span aria-current="page" aria-label="Page ' + page + '">' + page + '</span>' : pageLink(number)).join('') +
      (page < totalPages ? pageLink(page + 1, 'Next', 'next') : '') + '</nav>' : '';
    return layout(page === 1 ? config.title : 'Notes · Page ' + page, '<section class="collection" aria-label="Notes">' + (posts.length ? list(items) : '<p class="empty">No notes yet. Add a Markdown file with a title in its YAML front matter to a configured content directory.</p>') + navigation + '</section>', { current: 'Notes', route });
  }
  function notFound() {
    return layout('404 · Page not found', '<section class="page-heading"><h1 class="section-title">404 · Page not found</h1><p>This page does not exist. Browse the notes or search for an article.</p><p><a href="' + base + '">All notes</a> · <a href="' + link('search/') + '">Search notes</a></p></section>', { noindex: true });
  }
  function post(p, rendered, { previous, next, fragment = false } = {}) {
    const firstLevel = Math.min(...rendered.toc.map(h => h.level));
    const contents = rendered.toc.map(h => '<li' + (h.level > firstLevel ? ' data-nested' : '') + ' style="--level:' + (h.level - firstLevel) + '"><a href="#' + e(h.id) + '">' + e(h.title) + '</a></li>').join('');
    const toc = contents ? '<aside class="toc"><details open><summary><span>Contents</span></summary><nav aria-label="Table of contents"><ol>' + contents + '</ol></nav></details></aside>' : '';
    const pdf = p.pdfHref ? '<section class="pdf-section" id="pdf"><div class="pdf-toolbar"><span>PDF document' + (p.pages ? ' · ' + p.pages + (p.pages === 1 ? ' page' : ' pages') : '') + '</span><a href="' + p.pdfHref + '" target="_blank" rel="noopener">Open PDF</a><a href="' + p.pdfHref + '" download>Download</a></div><p class="pdf-hint">If the preview is unavailable, open or download the PDF to read it.</p><iframe class="pdf-viewer" src="' + link(p.route + 'pdf.html') + '"' + (p.encrypted ? ' data-pdf-source="' + e(p.pdfHref) + '"' : '') + ' title="' + e(p.title) + ' PDF" loading="lazy"></iframe></section>' : '';
    const rights = config.copyright ?? {};
    const author = rights.author || footer.label.replace(/^@/, ''), authorUrl = rights.authorUrl || footer.url;
    const permalink = (config.url || '') + p.href;
    const license = rights.licenseUrl ? '<a rel="license" href="' + e(rights.licenseUrl) + '">' + e(rights.license) + '</a>' : e(rights.license || '');
    const notice = rights.license ? 'Unless otherwise stated, this article is licensed under ' + license + '.' : 'All rights reserved.';
    const copyright = '<aside class="article-copyright" aria-label="Copyright notice"><p><strong>Author:</strong> <a href="' + e(authorUrl) + '">' + e(author) + '</a></p><p><strong>Link:</strong> <a class="permalink" href="' + e(permalink) + '">' + e(permalink) + '</a></p><p><strong>Copyright Notice:</strong> ' + notice + '</p></aside>';
    const neighbor = (note, direction, label) => note ? '<div class="' + direction + '"><span class="neighbor-label">' + label + '</span><a rel="' + direction + '" href="' + e(note.href) + '">' + e(note.title) + '</a>' + draftBadge(note) + encryptedBadge(note) + '</div>' : '';
    const navigation = previous || next ? '<nav class="note-navigation" aria-label="Article navigation">' + neighbor(previous, 'prev', 'Previous') + neighbor(next, 'next', 'Next') + '</nav>' : '';
    const end = '<div class="article-end" lang="en">' + copyright + (p.tags.length ? '<div class="tags article-tags" aria-label="Article tags">' + tags(p.tags) + '</div>' : '') + navigation + '</div>';
    const count = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(p.wordCount).toLowerCase();
    const words = '<span class="word-count" lang="en">' + count + (p.wordCount === 1 ? ' word' : ' words') + '</span>';
    const attachment = p.pdf && p.pages ? '<span class="attachment-pages" lang="en">Attachment: ' + p.pages + (p.pages === 1 ? ' page' : ' pages') + '</span>' : '';
    const draftNotice = p.draft ? '<p class="draft-notice" lang="en">' + draftBadge(p) + '<span>Unpublished · local preview only</span></p>' : '';
    const body = '<div class="article-layout"><article class="note" lang="' + e(p.lang) + '"><header class="article-header">' + draftNotice + '<h1>' + e(p.title) + '</h1><div class="article-meta">' + encryptedBadge(p) + date(p.date) + words + attachment + (p.tags.length ? '<div class="tags article-tags header-tags" aria-label="Article tags">' + tags(p.tags) + '</div>' : '') + '</div></header>' + toc + '<div class="prose">' + rendered.html + '</div>' + pdf + end + '</article></div>';
    return fragment ? body : layout(p.title, body, { current: 'Notes', route: p.route, css: rendered.css });
  }
  function lockedPost(p, envelope) {
    const data = JSON.stringify(envelope).replaceAll('<', '\\u003c');
    return layout(p.title, '<div class="article-layout"><article class="encrypted-note"><header class="article-header">' +
      (p.draft ? '<p class="draft-notice" lang="en">' + draftBadge(p) + '<span>Unpublished · local preview only</span></p>' : '') +
      '<h1>' + e(p.title) + '</h1><div class="article-meta">' + encryptedBadge(p) + date(p.date) + '<div class="tags">' + tags(p.tags) + '</div></div></header>' +
      '<section class="unlock-panel" aria-labelledby="unlock-heading"><h2 id="unlock-heading">Encrypted article</h2><p>Enter the password to read this article.</p>' +
      '<form class="unlock-form"><label for="article-password">Password</label><div class="unlock-controls"><input id="article-password" type="password" autocomplete="current-password" required disabled aria-describedby="unlock-status"><button type="submit" disabled>Unlock</button></div><p id="unlock-status" role="alert"></p></form>' +
      '<noscript><p>Enable JavaScript to unlock this article.</p></noscript></section></article></div><script id="encrypted-article" type="application/json" data-context="' + e(p.href) + '">' + data + '</script>',
      { current: 'Notes', route: p.route });
  }
  function searchPage(posts) {
    const counts = new Map();
    for (const p of posts) for (const tag of p.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
    const filters = [...counts].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([tag, count]) => '<button type="button" class="search-tag" data-tag="' + e(tag) + '" aria-pressed="false"><span class="tag">' + e(tag) + '</span> <span class="tag-count">' + count + '</span></button>').join('');
    return layout('Search', '<section class="search-page"><h1 class="search-title">Search</h1><form class="search-form" role="search"><label class="sr-only" for="query">Search query</label><svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input id="query" name="q" type="search" placeholder="Search notes…" autocomplete="off" spellcheck="false" autofocus aria-controls="search-results"></form><div class="search-tags" role="group" aria-label="Filter by tag">' + filters + '</div><label class="search-option"><input id="search-pdf" type="checkbox" aria-controls="search-results">Search inside PDFs</label><p class="search-status" role="status"></p><div id="search-results" class="search-results"></div><noscript><p>Search and tag filters require JavaScript. You can also <a href="' + base + '">browse all notes</a>.</p></noscript></section>', { current: 'Search', route: 'search/' });
  }
  function pdfViewer(p, resources) {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + e(p.title) + ' PDF</title><link rel="stylesheet" href="' + link('assets/pdfjs/viewer.css') + '"><link rel="stylesheet" href="' + link('assets/pdf-frame.css') + '"><script type="module" src="' + link('assets/pdf-frame.js') + '"></script></head><body data-file="' + e(p.pdfHref) + '" data-worker="' + link('assets/pdfjs/worker.js') + '" data-resources="' + link(resources) + '" data-images="' + link('assets/pdfjs/images/') + '"><div id="pdf-container" tabindex="0" role="region" aria-label="PDF pages"><div class="pdfViewer"></div></div><p id="pdf-status" role="status">Loading PDF…</p><noscript><p>Enable JavaScript to preview this document, or <a href="' + e(p.pdfHref) + '" target="_blank" rel="noopener">open the PDF</a>.</p></noscript></body></html>';
  }
  return { home, post, lockedPost, searchPage, pdfViewer, notFound, layout };
}
