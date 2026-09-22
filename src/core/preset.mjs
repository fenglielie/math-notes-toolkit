import { escape } from './math-syntax.mjs';

export const statementKinds = Object.freeze(['theorem', 'lemma', 'proposition', 'corollary', 'definition', 'example', 'problem', 'proof', 'solution', 'remark', 'note']);
export const texPackages = Object.freeze(['base', 'ams', 'newcommand', 'mathtools', 'boldsymbol', 'physics']);
export function renderStatementOpen(kind, title) {
  const label = kind[0].toUpperCase() + kind.slice(1);
  return '<section class="statement ' + kind + '"><p class="statement-title">' + label
    + (title ? ' (' + escape(title) + ')' : '') + '</p>\n';
}

export const texOptions = Object.freeze({ tags: 'ams', processEscapes: true });
