import { escape, mathPlugin } from './math-syntax.mjs';
import { statementKinds, texPackages, texOptions, renderStatementOpen } from './preset.mjs';
import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import { statements } from './statements.mjs';
import { htmlImages } from './images.mjs';
import { codeBlocks } from './code.mjs';
import { highlights } from './highlights.mjs';
import { citations } from './citations.mjs';
import { countMarkdownWords } from './word-count.mjs';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { MathJaxNewcmFont } from '@mathjax/mathjax-newcm-font/js/svg.js';
import '@mathjax/src/js/util/asyncLoad/esm.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js';
import '@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js';
import '@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import '@mathjax/src/js/input/tex/physics/PhysicsConfiguration.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
export { escape } from './math-syntax.mjs';

export async function renderMarkdown(source, { resolveLink = x => x } = {}) {
  const md = new MarkdownIt({ html: false, linkify: true }).use(footnote).use(mathPlugin).use(htmlImages).use(codeBlocks).use(highlights);
  const references = citations();
  md.use(references.plugin);
  md.use(statements, { kinds: statementKinds, renderOpen: renderStatementOpen });
  const toc = [], ids = new Map(), usedIds = new Set();
  md.core.ruler.push('headings-and-links', state => {
    for (let i = 0; i < state.tokens.length; i++) {
      const t = state.tokens[i];
      if (t.type === 'heading_open') {
        const title = state.tokens[i + 1].content;
        const key = title.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'section';
        let n = (ids.get(key) || 0) + 1;
        let id = key + (n > 1 ? '-' + n : '');
        while (usedIds.has(id)) id = key + '-' + (++n);
        ids.set(key, n);
        usedIds.add(id);
        t.attrSet('id', id);
        toc.push({ level: Number(t.tag.slice(1)), title, id });
      }
      for (const child of t.children || []) {
        for (const attr of ['href', 'src']) {
          const value = child.attrGet(attr);
          if (value) child.attrSet(attr, resolveLink(value));
        }
      }
    }
  });
  const env = {}, tokens = md.parse(source, env);
  const wordCount = countMarkdownWords(tokens);
  const rendered = md.renderer.render(tokens, md.options, env);
  const bibliography = references.bibliography();
  if (bibliography) toc.push({ level: 2, title: 'References', id: 'bib:references' });
  const errors = [];
  const tex = new TeX({
    packages: [...texPackages],
    ...texOptions,
    formatError(jax, error) {
      errors.push(error.message);
      return jax.formatError(error);
    }
  });
  const svg = new SVG({ fontCache: 'local', fontData: MathJaxNewcmFont });
  const document = mathjax.document(rendered, {
    InputJax: tex,
    OutputJax: svg,
    // Only parsed math tokens opt in; Markdown escapes can leave literal delimiters elsewhere.
    ignoreHtmlClass: '.*',
    processHtmlClass: 'math-inline|math-scroll'
  });
  await document.renderPromise();
  if (errors.length) throw new Error('LaTeX: ' + errors.join('; '));
  // Source annotations provide a readable fallback and let readers inspect/copy TeX.
  for (const item of document.math) {
    if (item.typesetRoot) {
      adaptor.setAttribute(item.typesetRoot, 'role', 'img');
      adaptor.setAttribute(item.typesetRoot, 'aria-label', item.math);
    }
  }
  return { html: adaptor.innerHTML(adaptor.body(document.document)) + bibliography, css: adaptor.cssText(svg.styleSheet(document)), toc, wordCount };
}
