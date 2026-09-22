// Let the Markdown block parser handle code fences and container indentation.
export function statements(md, { kinds, renderOpen }) {
  md.block.ruler.before('fence', 'statement', (state, start, end, silent) => {
    if (state.sCount[start] - state.blkIndent >= 4) return false;
    const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
    const match = line.match(/^\{%\s*(\w+)\s+(begin|end)(?:\s+(.+?))?\s*%\}\s*$/);
    if (!match || !kinds.includes(match[1])) return false;
    if (silent) return true;
    const opening = match[2] === 'begin';
    const token = state.push(opening ? 'statement_open' : 'statement_close', 'section', opening ? 1 : -1);
    token.block = true;
    token.meta = { kind: match[1], title: (match[3] || '').trim() };
    token.map = [start, start + 1];
    state.line = start + 1;
    return true;
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

  // Validate actual parsed blocks, so marker text inside code cannot close a statement.
  md.core.ruler.after('block', 'statement_boundaries', state => {
    const stack = [];
    const unclosed = token => {
      throw new Error('Unclosed ' + token.meta.kind + ' block at line ' + (token.map[0] + 1));
    };
    for (const token of state.tokens) {
      if (token.nesting === 1) stack.push(token);
      if (token.nesting !== -1) continue;
      const opening = stack.at(-1);
      if (token.type === 'statement_close') {
        if (!stack.some(item => item.type === 'statement_open')) {
          throw new Error('Unexpected ' + token.meta.kind + ' end marker at line ' + (token.map[0] + 1));
        }
        if (opening?.type !== 'statement_open' || opening.meta.kind !== token.meta.kind) {
          throw new Error('Mismatched statement end marker at line ' + (token.map[0] + 1));
        }
        opening.map[1] = token.map[1];
      } else if (opening?.type === 'statement_open') {
        // A statement opened in a list item or blockquote must also close there.
        unclosed(opening);
      }
      stack.pop();
    }
    const opening = stack.find(token => token.type === 'statement_open');
    if (opening) unclosed(opening);
  });
  md.renderer.rules.statement_open = (tokens, i) => renderOpen(tokens[i].meta.kind, tokens[i].meta.title);
  md.renderer.rules.statement_close = () => '</section>\n';
}
