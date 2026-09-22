import { search } from './search.js';
import { paginate, pageNumbers } from './pagination.js';
import { initializeEncryption } from './encryption.js';

const theme = document.querySelector('#theme-toggle');
document.querySelector('#back-to-top')?.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'auto' });
  document.querySelector('.brand')?.focus({ preventScroll: true });
});
theme?.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('math-notes-theme', dark ? 'light' : 'dark'); } catch {}
});

function initializeArticle() {
  if (!document.querySelector('.note')) return;
  const copyTexMedia = matchMedia('(min-width: 1280px)');
  const copyTexButtons = [...document.querySelectorAll('.copy-tex')];
  const updateCopyTex = () => { for (const button of copyTexButtons) button.disabled = !copyTexMedia.matches; };
  updateCopyTex();
  copyTexMedia.addEventListener('change', updateCopyTex);
  for (const button of copyTexButtons) {
    button.addEventListener('click', async () => {
      if (!copyTexMedia.matches) return;
      try {
        await navigator.clipboard.writeText(button.dataset.tex);
        button.textContent = 'Copied';
      } catch { button.textContent = 'Copy failed'; }
      setTimeout(() => { button.textContent = 'Copy LaTeX'; }, 1800);
    });
  }

  const toc = document.querySelector('.toc details');
  for (const button of document.querySelectorAll('.copy-code')) {
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.closest('.code-block').querySelector('code').textContent);
        button.textContent = 'Copied';
      } catch { button.textContent = 'Copy failed'; }
      setTimeout(() => { button.textContent = 'Copy'; }, 1800);
    });
  }

  if (toc) {
    const narrow = matchMedia('(max-width: 1279px)');
    const summary = toc.querySelector('summary');
    const states = toc.querySelector('[data-nested]') ? ['collapsed', 'top', 'all'] : ['collapsed', 'all'];
    const labels = { collapsed: 'Collapsed', top: 'Top level', all: 'All levels' };
    function setState(state) {
      toc.dataset.state = state;
      toc.open = state !== 'collapsed';
      const label = states.length === 2 && state === 'all' ? 'Expanded' : labels[state];
      const next = states[(states.indexOf(state) + 1) % states.length];
      summary.setAttribute('aria-label', 'Contents: ' + label + '. ' + ({ collapsed: 'Collapse', top: 'Show top level', all: 'Show all levels' })[next]);
    }
    summary.addEventListener('click', event => {
      event.preventDefault();
      setState(states[(states.indexOf(toc.dataset.state) + 1) % states.length]);
    });
    const adapt = () => setState(narrow.matches ? 'collapsed' : 'all');
    adapt(); narrow.addEventListener('change', adapt);
    const links = [...toc.querySelectorAll('a')];
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (!visible.length) return;
      for (const a of links) {
        if (a.getAttribute('href') === '#' + visible[0].target.id) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      }
    }, { rootMargin: '-10% 0px -65% 0px' });
    for (const link of links) {
      const heading = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      if (heading) observer.observe(heading);
    }
  }

  const article = document.querySelector('.note');
  if (article) {
    let highlighted, clearTimer;
    function highlightTarget(hash = location.hash) {
      let id;
      try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
      const target = document.getElementById(id);
      if (!target || !article.contains(target)) return;
      const region = target.closest('.math-block, .references li, .footnotes li') || target.closest('h1,h2,h3,h4,h5,h6,p,li') || target;
      clearTimeout(clearTimer);
      highlighted?.classList.remove('jump-highlight');
      highlighted = region;
      // Restart the effect when the same anchor is activated again.
      void region.getBoundingClientRect();
      region.classList.add('jump-highlight');
      clearTimer = setTimeout(() => { region.classList.remove('jump-highlight'); highlighted = null; }, 900);
    }
    window.addEventListener('hashchange', () => highlightTarget());
    document.addEventListener('click', event => {
      const link = event.target.closest?.('a[href]');
      if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.getAttribute('target') && link.getAttribute('target') !== '_self')) return;
      const url = new URL(link.getAttribute('href'), location.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search && url.hash && url.hash === location.hash) {
        queueMicrotask(() => { if (!event.defaultPrevented) highlightTarget(url.hash); });
      }
    });
    highlightTarget();
  }
}

initializeArticle();
initializeEncryption(initializeArticle);
const form = document.querySelector('.search-form');

if (form) {
  const input = form.querySelector('input'), status = document.querySelector('.search-status'), results = document.querySelector('#search-results');
  const pdfOption = document.querySelector('#search-pdf');
  const pagination = document.createElement('nav');
  pagination.className = 'pagination';
  pagination.setAttribute('aria-label', 'Pagination');
  pagination.hidden = true;
  results.after(pagination);
  const pageSize = Number(document.body.dataset.pageSize) || 10;
  let dataPromise, generation = 0, timer;
  const selectedTags = new Set(new URLSearchParams(location.search).getAll('tag').filter(Boolean));
  const tagButtons = [...document.querySelectorAll('.search-tag')];
  const load = () => dataPromise ||= fetch(document.body.dataset.base + 'search-index.json').then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).catch(error => { dataPromise = null; throw error; });
  function highlight(element, text, query) {
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length);
    const lower = text.toLocaleLowerCase();
    let start = 0, position = 0;
    while (position < text.length) {
      const term = terms.find(t => lower.startsWith(t, position));
      if (!term) { position++; continue; }
      element.append(document.createTextNode(text.slice(start, position)));
      const mark = document.createElement('mark'); mark.textContent = text.slice(position, position + term.length); element.append(mark);
      position += term.length; start = position;
    }
    element.append(document.createTextNode(text.slice(start)));
  }
  async function run(requestedPage = 1, historyMode = 'replace') {
    const ticket = ++generation, query = input.value.trim();
    const includePdfContent = pdfOption.checked;
    const url = new URL(location.href);
    if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
    url.searchParams.delete('tag');
    for (const tag of selectedTags) url.searchParams.append('tag', tag);
    if (includePdfContent) url.searchParams.set('pdf', '1'); else url.searchParams.delete('pdf');
    for (const button of tagButtons) button.setAttribute('aria-pressed', String(selectedTags.has(button.dataset.tag)));
    results.replaceChildren();
    pagination.replaceChildren();
    pagination.hidden = true;
    status.textContent = query ? 'Searching…' : '';
    try {
      const docs = await load();
      if (ticket !== generation) return;
      const filtered = selectedTags.size ? docs.filter(doc => [...selectedTags].every(tag => doc.tags.includes(tag))) : docs;
      const matches = query ? search(filtered, query, { includePdfContent }) : filtered;
      const { page, totalPages, items } = paginate(matches, requestedPage, pageSize);
      if (page > 1) url.searchParams.set('page', page); else url.searchParams.delete('page');
      if (historyMode === 'push') history.pushState(null, '', url);
      else history.replaceState(null, '', url);
      const countLabel = matches.length + (matches.length === 1 ? ' note' : ' notes');
      status.textContent = query
        ? (matches.length ? countLabel + ' found' : 'No matching notes. Try another keyword or tag.')
        : (selectedTags.size ? countLabel : '');
      for (const doc of items) {
        const article = document.createElement('article');
        const h = document.createElement('h2'), a = document.createElement('a');
        a.href = doc.href; highlight(a, doc.title, query); h.append(a);
        if (doc.draft) {
          const badge = document.createElement('span');
          badge.className = 'draft-badge'; badge.lang = 'en'; badge.textContent = 'Draft';
          h.append(badge);
        }
        if (doc.encrypted) {
          const badge = document.createElement('span');
          badge.className = 'encrypted-badge'; badge.lang = 'en'; badge.textContent = 'Encrypted';
          h.append(badge);
        }
        const meta = document.createElement('small'); meta.className = 'search-meta';
        if (doc.date) {
          const date = document.createElement('time'); date.dateTime = doc.date; date.textContent = doc.date;
          meta.append(date);
        }
        for (const tag of doc.tags) {
          const label = document.createElement('span'); label.className = 'tag'; label.textContent = tag;
          meta.append(label);
        }
        article.append(h, meta);
        if (query) {
          const p = document.createElement('p'); highlight(p, doc.snippet, query);
          article.append(p);
        }
        results.append(article);
      }
      if (totalPages > 1) {
        const addLink = (number, label = String(number), rel = '') => {
          const a = document.createElement('a'), target = new URL(url);
          if (number > 1) target.searchParams.set('page', number); else target.searchParams.delete('page');
          a.href = target.href;
          a.dataset.page = number;
          a.textContent = label;
          a.setAttribute('aria-label', rel ? label + ' page' : 'Page ' + number);
          if (rel) a.rel = rel;
          pagination.append(a);
        };
        if (page > 1) addLink(page - 1, 'Previous', 'prev');
        for (const number of pageNumbers(page, totalPages)) {
          if (number !== null && number !== page) { addLink(number); continue; }
          const span = document.createElement('span');
          span.textContent = number === null ? '…' : String(number);
          if (number === null) { span.className = 'pagination-gap'; span.setAttribute('aria-hidden', 'true'); }
          else { span.setAttribute('aria-current', 'page'); span.setAttribute('aria-label', 'Page ' + page); }
          pagination.append(span);
        }
        if (page < totalPages) addLink(page + 1, 'Next', 'next');
        pagination.hidden = false;
      }
      if (historyMode === 'push') {
        results.setAttribute('tabindex', '-1');
        results.focus({ preventScroll: true });
        document.querySelector('.search-page').scrollIntoView({ block: 'start' });
      }
    } catch {
      if (ticket === generation) status.textContent = 'Could not load the search index. Check your connection and try again.';
    }
  }
  form.addEventListener('submit', e => { e.preventDefault(); clearTimeout(timer); run(); });
  input.addEventListener('input', () => { generation++; clearTimeout(timer); timer = setTimeout(run, 140); });
  pdfOption.addEventListener('change', () => { clearTimeout(timer); run(); });
  for (const button of tagButtons) button.addEventListener('click', () => {
    const tag = button.dataset.tag;
    if (selectedTags.has(tag)) selectedTags.delete(tag); else selectedTags.add(tag);
    clearTimeout(timer);
    run();
  });
  pagination.addEventListener('click', event => {
    const link = event.target.closest('a[data-page]');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    clearTimeout(timer);
    run(Number(link.dataset.page), 'push');
  });
  function restore() {
    clearTimeout(timer);
    const params = new URLSearchParams(location.search);
    input.value = params.get('q') || '';
    pdfOption.checked = params.get('pdf') === '1';
    selectedTags.clear();
    for (const tag of params.getAll('tag').filter(Boolean)) selectedTags.add(tag);
    run(params.get('page'));
  }
  window.addEventListener('popstate', restore);
  input.focus({ preventScroll: true });
  restore();
}
