import hljs from 'highlight.js';

export function codeBlocks(md) {
  const escape = md.utils.escapeHtml;
  function render(source, info = '') {
    const language = info.trim().split(/\s+/)[0].toLowerCase();
    const grammar = language && hljs.getLanguage(language);
    const highlighted = grammar ? hljs.highlight(source, { language, ignoreIllegals: true }).value : escape(source);
    const label = grammar?.name || (language && !['text', 'txt', 'plain'].includes(language) ? language : 'Text');
    return '<div class="code-block"><div class="code-toolbar"><span class="code-language">' + escape(label) + '</span><button class="copy-code" type="button" aria-label="Copy code" aria-live="polite">Copy</button></div><pre tabindex="0" aria-label="' + escape(label) + ' code"><code' + (language ? ' class="language-' + escape(language) + '"' : '') + '>' + highlighted + '</code></pre></div>\n';
  }
  md.renderer.rules.fence = (tokens, i) => render(tokens[i].content, tokens[i].info);
  md.renderer.rules.code_block = (tokens, i) => render(tokens[i].content);
}
