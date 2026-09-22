import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../../src/core/node.mjs';

test('align numbering, labels, explicit tags and nested formulas inside proof blocks', async () => {
  const source = [
    '{% proof begin %}',
    String.raw`\begin{align}
a&=b+c \label{eq:first}\\
 &=d \notag\\
x&=y \tag{A}\label{eq:custom}
\end{align}`,
    String.raw`See $\eqref{eq:first}$ and $\eqref{eq:custom}$.`,
    '{% proof end %}',
    String.raw`\begin{equation}
\begin{split}
f(x)&=\int_0^x \frac{\sin t}{1+t^2}\,\mathrm{d}t\\
&=\sum_{n=0}^{\infty}a_n x^n
\end{split}
\end{equation}`
  ].join('\n');
  const { html } = await renderMarkdown(source);
  assert.match(html, /class="statement proof"/);
  assert.match(html, /href="#mjx-eqn%3Aeq%3Afirst"/);
  assert.match(html, /href="#mjx-eqn%3Aeq%3Acustom"/);
  assert.equal((html.match(/id="mjx-eqn:/g) || []).length, 3);
  assert.doesNotMatch(html, /data-mjx-error|data-mml-node="merror"/);
});

test('complex display layouts render directly and retain nested environment boundaries', async () => {
  const examples = [
    String.raw`\begin{align*} a&=b\\c&=d \end{align*}`,
    String.raw`\begin{aligned} a&=b\\c&=d \end{aligned}`,
    String.raw`\begin{alignat}{2} a&=b&\quad c&=d\\e&=f&g&=h \end{alignat}`,
    String.raw`\begin{alignedat}{2} a&=b&\quad c&=d \end{alignedat}`,
    String.raw`\begin{gather} a=b\\c=d \end{gather}`,
    String.raw`\begin{gathered} a=b\\c=d \end{gathered}`,
    String.raw`\begin{multline} a+b+c\\+d+e=f \end{multline}`,
    String.raw`\begin{multlined} a+b+c\\+d+e=f \end{multlined}`,
    String.raw`\begin{bmatrix} 1 & \begin{bmatrix}a\\b\end{bmatrix}\\0&1\end{bmatrix}`,
    String.raw`\begin{dcases} \frac{1}{x},&x>0\\0,&x\le0\end{dcases}`,
    String.raw`\begin{array}{cc|c}1&0&a\\0&1&b\end{array}`
  ];
  for (const source of examples) {
    const { html } = await renderMarkdown(source);
    assert.match(html, /<svg/, source);
    assert.equal((html.match(/class="math-block"/g) || []).length, 1, source);
    assert.doesNotMatch(html, /data-mjx-error|data-mml-node="merror"/, source);
  }
});

test('TeX comments do not prematurely close an environment', async () => {
  const source = String.raw`\begin{align}
% \end{align} is only a comment
p&=50\%\\
q&=1
\end{align}`;
  const { html } = await renderMarkdown(source);
  assert.match(html, /<svg/);
  assert.equal((html.match(/class="math-block"/g) || []).length, 1);
});
