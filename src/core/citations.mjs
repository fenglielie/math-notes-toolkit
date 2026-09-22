import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';

const adaptor = liteAdaptor();
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function doiLink(value) {
  let doi = String(value || '').trim().replace(/^doi:\s*/i, '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  try { doi = decodeURIComponent(doi); } catch { return ''; }
  return /^10\.\d{4,9}\/\S+$/.test(doi) ? 'https://doi.org/' + doi.split('/').map(encodeURIComponent).join('/') : '';
}

export function citations() {
  let entries = new Map(), used = new Map();
  const documents = new WeakMap();
  function plugin(md) {
    md.block.ruler.before('fence', 'bibtex', (state, start, end, silent) => {
      if (state.sCount[start] - state.blkIndent >= 4) return false;
      const line = n => state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);
      const marker = line(start).match(/^\{%\s*bibtex\s+(begin|end)\s*%\}\s*$/);
      if (!marker) return false;
      if (silent) return true;
      if (marker[1] === 'end') throw new Error('Unexpected bibtex end marker at line ' + (start + 1));
      let closing = start + 1;
      while (closing < end && !/^\{%\s*bibtex\s+end\s*%\}\s*$/.test(line(closing))) closing++;
      if (closing === end) throw new Error('Unclosed bibtex block at line ' + (start + 1));
      const token = state.push('bibtex', '', 0);
      token.content = Array.from({ length: closing - start - 1 }, (_, i) => line(start + i + 1)).join('\n');
      token.map = [start, closing + 1];
      state.line = closing + 1;
      return true;
    }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
    md.renderer.rules.bibtex = () => '';
    // Collect every block before inline references are rendered, allowing forward citations.
    md.core.ruler.before('inline', 'bibliography-data', state => {
      entries = new Map();
      used = new Map();
      documents.set(state.tokens, entries);
      for (const token of state.tokens.filter(token => token.type === 'bibtex')) {
        // Footnote processing can replace the token array while retaining these tokens.
        documents.set(token, entries);
        try {
          const parsed = new Cite(token.content, { forceType: '@bibtex/text' }).data;
          for (const entry of parsed) {
            const key = entry['citation-key'] || entry.id;
            if (!key) throw new Error('Every BibTeX entry needs a citation key');
            if (entries.has(key)) throw new Error('Duplicate BibTeX key: ' + key);
            entries.set(key, entry);
          }
        } catch (error) {
          throw new Error('BibTeX block at line ' + (token.map[0] + 1) + ': ' + error.message);
        }
      }
    });
    md.inline.ruler.before('link', 'citation', (state, silent) => {
      if (state.linkLevel || !state.src.startsWith('[@', state.pos)) return false;
      const match = state.src.slice(state.pos, state.posMax).match(/^\[(@[^\]\n]+)\]/);
      if (!match || /^[([]/.test(state.src[state.pos + match[0].length] || '')) return false;
      const items = match[1].split(';').map(item => item.trim().match(/^@([^\s,;\[\]]+)(?:,\s*(.+))?$/));
      if (items.some(item => !item)) return false;
      if (!silent) state.push('citation', '', 0).meta = items.map(item => ({ key: item[1], locator: item[2] || '' }));
      state.pos += match[0].length;
      return true;
    });
    md.renderer.rules.citation = (tokens, i) => '<span class="citation">[' + tokens[i].meta.map(({ key, locator }) => {
      if (!entries.has(key)) throw new Error('Unknown citation key: ' + key + '. Add it in a bibtex begin/end block.');
      if (!used.has(key)) used.set(key, { number: used.size + 1, count: 0 });
      const reference = used.get(key);
      const occurrence = ++reference.count;
      return '<a role="doc-biblioref" id="cite:' + reference.number + ':' + occurrence + '" href="#ref:' + reference.number + '" title="' + escape(key) + '">' + reference.number + '</a>' + (locator ? ', ' + escape(locator) : '');
    }).join('; ') + ']</span>';
  }

  function safeMarkup(node) {
    const kind = adaptor.kind(node);
    if (kind === '#text') return escape(adaptor.value(node));
    const content = adaptor.childNodes(node).map(safeMarkup).join('');
    return ['i', 'b', 'em', 'strong', 'sup', 'sub'].includes(kind) ? '<' + kind + '>' + content + '</' + kind + '>' : content;
  }
  function referenceHtml(entry) {
    // Format bibliographic fields locally; links are added separately after URL validation.
    const cite = new Cite([{ ...entry, URL: undefined, DOI: undefined }]);
    const html = cite.format('bibliography', { format: 'html', template: 'vancouver', lang: 'en-US' });
    const body = adaptor.body(adaptor.parse(html));
    const text = adaptor.tags(body, 'div').find(node => adaptor.getAttribute(node, 'class') === 'csl-right-inline');
    if (!text) throw new Error('Could not format reference: ' + entry.id);
    const links = [], seen = new Set();
    const addLink = (href, label) => {
      const key = href.startsWith('https://doi.org/') ? href.toLowerCase() : href;
      if (seen.has(key)) return;
      seen.add(key);
      links.push('<a href="' + escape(href) + '">' + label + '</a>');
    };
    const doi = doiLink(entry.DOI);
    if (doi) addLink(doi, 'DOI');
    if (entry.URL) {
      try {
        const url = new URL(entry.URL);
        if (['https:', 'http:'].includes(url.protocol)) {
          const resolvedDoi = /^(?:dx\.)?doi\.org$/i.test(url.hostname) ? doiLink(url.href) : '';
          addLink(resolvedDoi || url.href, resolvedDoi ? 'DOI' : /\.pdf$/i.test(url.pathname) ? 'PDF' : 'Article');
        }
      } catch { /* Invalid links do not prevent the reference text from being displayed. */ }
    }
    // CSL titles can contain formatting tags and entities; search the readable title.
    const title = adaptor.textContent(adaptor.body(adaptor.parse(String(entry.title || '')))).replace(/\s+/g, ' ').trim();
    if (title) addLink('https://scholar.google.com/scholar?q=' + encodeURIComponent(title), 'Google Scholar');
    return safeMarkup(text) + (links.length ? ' <span class="reference-links">' + links.join('') + '</span>' : '');
  }
  function bibliography() {
    if (!used.size) return '';
    const items = [...used].map(([key, { number, count }]) => {
      const backlinks = Array.from({ length: count }, (_, i) => '<a role="doc-backlink" href="#cite:' + number + ':' + (i + 1) + '" aria-label="Back to reference ' + number + ', citation ' + (i + 1) + '">Back' + (count > 1 ? ' ' + (i + 1) : '') + '</a>').join(' ');
      return '<li id="ref:' + number + '" data-cite-key="' + escape(key) + '">' + referenceHtml(entries.get(key)) + ' <span class="reference-backlinks">' + backlinks + '</span></li>';
    }).join('\n');
    return '<section class="references" role="doc-bibliography" aria-labelledby="bib:references"><h2 id="bib:references">References</h2><ol>' + items + '</ol></section>';
  }
  // Editor previews can render cached tokens after parsing a different document.
  function prepareRender(tokens) {
    entries = documents.get(tokens) || tokens.map(token => documents.get(token)).find(Boolean) || new Map();
    used = new Map();
  }
  return { plugin, bibliography, prepareRender };
}
