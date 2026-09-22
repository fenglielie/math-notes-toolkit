import footnote from 'markdown-it-footnote';
import { mathPlugin, statements, citations, highlights, htmlImages, statementKinds, renderStatementOpen } from '../../src/core/index.mjs';

export function extendMarkdownIt(md) {
  const escape = md.utils.escapeHtml;
  const references = citations();
  md.set({ html: false });
  if (!md.renderer.rules.footnote_ref) md.use(footnote);
  md.use(mathPlugin).use(htmlImages).use(highlights).use(references.plugin);
  md.use(statements, { kinds: statementKinds, renderOpen: renderStatementOpen });

  // VS Code fills these attributes after parsing; custom renderers must retain them.
  const attributes = token => ' class="code-line" data-line="' + token.map[0] + '" dir="auto"';
  const statement = md.renderer.rules.statement_open;
  md.renderer.rules.statement_open = (tokens, index) => {
    const token = tokens[index];
    return statement(tokens, index).replace('<section class="', '<section data-line="' + token.map[0] + '" class="code-line ');
  };
  md.renderer.rules.math_inline = (tokens, index) => '<span class="markdown-math-tex" data-tex="'
    + escape(tokens[index].content) + '">' + escape('\\(' + tokens[index].content + '\\)') + '</span>';
  md.renderer.rules.math_block = (tokens, index) => '<div' + attributes(tokens[index])
    + '><div class="markdown-math-tex markdown-math-display" data-display="true" data-tex="'
    + escape(tokens[index].content) + '">' + escape('\\[' + tokens[index].content + '\\]') + '</div></div>\n';
  md.renderer.rules.bibtex = (tokens, index) => '<div' + attributes(tokens[index]) + '></div>\n';
  // Render the bibliography inside the token stream so other plugins' wrappers
  // contain both the article and its references, regardless of registration order.
  md.core.ruler.push('markdown_math_bibliography', state => {
    const token = new state.Token('markdown_math_bibliography', 'section', 0);
    token.block = true;
    state.tokens.push(token);
  });
  md.renderer.rules.markdown_math_bibliography = () => references.bibliography();

  const parse = md.parse.bind(md);
  md.parse = (source, env = {}) => {
    try {
      // Leave blank lines in place so front matter never shifts source positions.
      const body = source.replace(/^\uFEFF?---\s*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[^\S\r\n]*(?:\r?\n|$)/,
        match => match.replace(/[^\r\n]/g, ''));
      return parse(body, env);
    } catch (error) {
      // Incomplete syntax during typing remains visible and never reports success.
      const tokens = parse('', env);
      const { Token } = new md.core.State('', md, env);
      const token = new Token('markdown_math_error', 'pre', 0);
      token.content = error.message;
      const line = Math.max(0, Number(error.message.match(/at line (\d+)/)?.[1] || 1) - 1);
      token.map = [line, line + 1];
      tokens.push(token);
      return tokens;
    }
  };
  md.renderer.rules.markdown_math_error = (tokens, index) => '<pre role="alert" class="markdown-math-error code-line" data-line="'
    + tokens[index].map[0] + '">' + escape(tokens[index].content) + '</pre>';
  const render = md.renderer.render.bind(md.renderer);
  md.renderer.render = (tokens, options, env) => {
    references.prepareRender(tokens);
    try {
      return render(tokens, options, env);
    } catch (error) {
      return '<pre role="alert" class="markdown-math-error">' + escape(error.message) + '</pre>';
    }
  };
  return md;
}
