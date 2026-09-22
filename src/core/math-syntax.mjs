export const escape = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function mathEnd(source, open, close, environment) {
  // Preserve offsets while ignoring TeX comments and escaped percent signs.
  const chars = source.split('');
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '\\') { i++; continue; }
    if (chars[i] === '%') while (i < chars.length && chars[i] !== '\n') chars[i++] = ' ';
  }
  const code = chars.join('');
  if (!environment) return code.indexOf(close, open.length);
  let depth = 0;
  for (const match of code.matchAll(/\\(begin|end)\{([^}]+)\}/g)) {
    if (match[2] !== environment) continue;
    depth += match[1] === 'begin' ? 1 : -1;
    if (depth === 0) return match.index;
  }
  return -1;
}

// Capture TeX before Markdown handles backslashes, underscores, or asterisks.
export function mathPlugin(md) {
  md.inline.ruler.before('escape', 'math', (state, silent) => {
    const source = state.src.slice(state.pos);
    const open = source.startsWith('\\(') ? '\\(' : source.startsWith('$') && !source.startsWith('$$') ? '$' : null;
    if (!open || (open === '$' && /\s/.test(source[1] || ' '))) return false;
    const close = open === '$' ? '$' : '\\)';
    let end = open.length;
    while ((end = source.indexOf(close, end)) !== -1) {
      let slashes = 0;
      for (let i = end - 1; i >= 0 && source[i] === '\\'; i--) slashes++;
      if (slashes % 2 === 0) break;
      end += close.length;
    }
    if (end < 0 || source.slice(0, end).includes('\n') || (open === '$' && (/\s/.test(source[end - 1]) || /\d/.test(source[end + 1] || '')))) return false;
    if (!silent) {
      const token = state.push('math_inline', '', 0);
      token.content = source.slice(open.length, end);
    }
    state.pos += end + close.length;
    return true;
  });
  md.block.ruler.before('fence', 'math_block', (state, start, end, silent) => {
    if (state.sCount[start] - state.blkIndent >= 4) return false;
    const first = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
    const env = first.match(/^\\begin\{([a-zA-Z]+\*?)\}/);
    const open = first.startsWith('$$') ? '$$' : first.startsWith('\\[') ? '\\[' : env?.[0];
    if (!open) return false;
    const close = open === '$$' ? '$$' : open === '\\[' ? '\\]' : '\\end{' + env[1] + '}';
    if (silent) return true;
    let line = start;
    let raw = first;
    while (mathEnd(raw, open, close, env?.[1]) < 0 && ++line < end) {
      raw += '\n' + state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
    }
    const closing = mathEnd(raw, open, close, env?.[1]);
    if (closing < 0) throw new Error('Unclosed math block at line ' + (start + 1));
    if (raw.slice(closing + close.length).trim()) throw new Error('Add a newline after the closing math delimiter at line ' + (start + 1));
    const token = state.push('math_block', '', 0);
    token.content = env ? raw : raw.slice(open.length, closing);
    token.map = [start, line + 1];
    state.line = line + 1;
    return true;
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.renderer.rules.math_inline = (tokens, i) => '<span class="math-inline" data-tex="' + escape(tokens[i].content) + '">\\(' + escape(tokens[i].content) + '\\)</span>';
  md.renderer.rules.math_block = (tokens, i) => '<div class="math-block"><button class="copy-tex" type="button" data-tex="' + escape(tokens[i].content) + '">Copy LaTeX</button><div class="math-scroll" tabindex="0" aria-label="Mathematical formula">\\[' + escape(tokens[i].content) + '\\]</div></div>\n';
}

