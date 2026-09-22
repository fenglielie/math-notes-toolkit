// Explicit begin/end blocks preserve Markdown parsing and leave code samples untouched.
export function statements(md, { kinds, renderOpen }) {
  const parse = line => {
    const match = line.match(/^\{%\s*(\w+)\s+(begin|end)(?:\s+(.+?))?\s*%\}\s*$/);
    if (!match) return null;
    const kind = match[1];
    if (!kinds.includes(kind)) return null;
    return { kind, action: match[2], title: (match[3] || '').trim() };
  };
  md.block.ruler.before('fence', 'statement', (state, start, end, silent) => {
    if (state.sCount[start] - state.blkIndent >= 4) return false;
    const lineText = line => state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
    const opening = parse(lineText(start));
    if (!opening) return false;
    if (silent) return true;
    if (opening.action !== 'begin') throw new Error('Unexpected ' + opening.kind + ' end marker at line ' + (start + 1));
    const stack = [opening.kind];
    let closing = start, fence = null;
    while (++closing < end) {
      if (state.sCount[closing] - state.blkIndent >= 4) continue;
      const text = lineText(closing);
      if (fence) {
        const marker = text.match(/^(\x60+|~+)\s*$/)?.[1];
        if (marker?.[0] === fence[0] && marker.length >= fence.length) fence = null;
        continue;
      }
      const marker = text.match(/^(\x60{3,}|~{3,})/)?.[1];
      if (marker) { fence = marker; continue; }
      const directive = parse(text);
      if (!directive) continue;
      if (directive.action === 'begin') stack.push(directive.kind);
      else {
        if (directive.kind !== stack.pop()) throw new Error('Mismatched statement end marker at line ' + (closing + 1));
        if (!stack.length) break;
      }
    }
    if (closing === end) throw new Error('Unclosed ' + opening.kind + ' block at line ' + (start + 1));
    const token = state.push('statement_open', 'section', 1);
    token.block = true;
    token.meta = opening;
    token.map = [start, closing + 1];
    const oldMax = state.lineMax, oldParent = state.parentType;
    state.lineMax = closing;
    state.parentType = 'container';
    state.md.block.tokenize(state, start + 1, closing);
    state.lineMax = oldMax;
    state.parentType = oldParent;
    state.push('statement_close', 'section', -1).block = true;
    state.line = closing + 1;
    return true;
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.renderer.rules.statement_open = (tokens, i) => renderOpen(tokens[i].meta.kind, tokens[i].meta.title);
  md.renderer.rules.statement_close = () => '</section>\n';
}
