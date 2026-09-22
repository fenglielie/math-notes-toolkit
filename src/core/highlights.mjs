// Use Markdown's delimiter pairing so code, escaped markers, and nested inline
// formatting retain their usual parsing behavior.
export function highlights(md) {
  md.inline.ruler.before('emphasis', 'highlight', (state, silent) => {
    if (silent || state.src[state.pos] !== '{') return false;
    const match = state.src.slice(state.pos).match(/^\{%\s*color\s+(?:([a-z]+)\s+begin|(end))\s*%\}/);
    if (!match) return false;
    const color = match[1];
    if (color && !['yellow', 'green', 'pink'].includes(color)) {
      throw new Error('Unknown highlight color: ' + color);
    }
    const markup = match[0];
    const token = state.push('text', '', 0);
    token.content = markup;
    state.delimiters.push({
      marker: 0x10000, length: 0, token: state.tokens.length - 1, end: -1,
      open: Boolean(color), close: !color, color
    });
    state.pos += markup.length;
    return true;
  });

  md.inline.ruler2.before('emphasis', 'highlight', state => {
    const process = delimiters => {
      const paired = new Set();
      for (const start of delimiters) {
        if (start.marker !== 0x10000 || start.end < 0) continue;
        paired.add(start.token);
        paired.add(delimiters[start.end].token);
        const open = state.tokens[start.token];
        const close = state.tokens[delimiters[start.end].token];
        open.type = 'mark_open';
        open.tag = 'mark';
        open.nesting = 1;
        open.markup = open.content;
        open.content = '';
        open.attrSet('class', 'text-highlight highlight-' + start.color);
        close.type = 'mark_close';
        close.tag = 'mark';
        close.nesting = -1;
        close.markup = close.content;
        close.content = '';
      }
      for (const delimiter of delimiters) {
        if (delimiter.marker === 0x10000 && !paired.has(delimiter.token)) {
          throw new Error(delimiter.open ? 'Unclosed color begin marker' : 'Unexpected color end marker');
        }
      }
    };
    process(state.delimiters);
    for (const meta of state.tokens_meta) {
      if (meta?.delimiters) process(meta.delimiters);
    }
  });
}
