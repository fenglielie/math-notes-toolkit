// Accept HTML image syntax while keeping other raw HTML escaped.
export function htmlImages(md) {
  md.inline.ruler.before('html_inline', 'html_image', (state, silent) => {
    if (state.src[state.pos] !== '<') return false;
    const match = state.src.slice(state.pos).match(/^<img(?=[\s/>])(?:[^"'<>]|"[^"]*"|'[^']*')*>/i);
    if (!match) return false;
    const attributes = new Map();
    const source = match[0].slice(4, -1).replace(/\/$/, '');
    const pattern = /\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gy;
    let position = 0;
    while (position < source.trimEnd().length) {
      pattern.lastIndex = position;
      const attribute = pattern.exec(source);
      if (!attribute) return false;
      const name = attribute[1].toLowerCase();
      if (!attributes.has(name)) attributes.set(name, md.utils.unescapeAll(attribute[2] ?? attribute[3] ?? attribute[4] ?? ''));
      position = pattern.lastIndex;
    }
    const src = md.normalizeLink(attributes.get('src') || '');
    if (!src || !md.validateLink(src)) return false;
    if (!silent) {
      const token = state.push('image', 'img', 0);
      token.attrSet('src', src);
      token.attrSet('alt', attributes.get('alt') || '');
      token.content = attributes.get('alt') || '';
      const text = new state.Token('text', '', 0);
      text.content = token.content;
      token.children = [text];
      if (attributes.has('title')) token.attrSet('title', attributes.get('title'));
      for (const dimension of ['width', 'height']) {
        if (/^[1-9]\d*$/.test(attributes.get(dimension) || '')) token.attrSet(dimension, attributes.get(dimension));
      }
      if (['lazy', 'eager'].includes(attributes.get('loading'))) token.attrSet('loading', attributes.get('loading'));
    }
    state.pos += match[0].length;
    return true;
  });
}
