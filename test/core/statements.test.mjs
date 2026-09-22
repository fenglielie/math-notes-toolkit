import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../../src/core/node.mjs';

test('begin/end statements support nested Markdown, math and escaped titles', async () => {
  const { html } = await renderMarkdown([
    '{% remark begin <Title> %}',
    '**Remark** with $x^2$.', '',
    '{% theorem begin Nested %}', '- First item', '- Second item',
    '{% theorem end %}', '{% remark end %}'
  ].join('\n'), { lang: 'zh-CN' });
  assert.match(html, /class="statement remark"/);
  assert.match(html, /Remark \(&lt;Title&gt;\)/);
  assert.match(html, /class="statement theorem"/);
  assert.match(html, /<strong>Remark<\/strong>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<svg/);
  assert.doesNotMatch(html, /{%/);
  assert.equal((html.match(/<\/section>/g) || []).length, 2);
});

test('statement markers remain literal in code blocks', async () => {
  const { html } = await renderMarkdown([
    '{% remark begin %}', '~~~markdown', '{% remark end %}', '~~~',
    'After the code.', '{% remark end %}', '',
    '~~~markdown', '{% theorem begin %}', '~~~'
  ].join('\n'));
  assert.match(html, /<code class="language-markdown">{% remark end %}/);
  assert.match(html, /<code class="language-markdown">{% theorem begin %}/);
  assert.equal((html.match(/class="statement /g) || []).length, 1);
});

test('statement markers report unmatched endings and unclosed blocks', async () => {
  await assert.rejects(renderMarkdown('{% remark begin %}\nText'), /Unclosed remark/);
  await assert.rejects(renderMarkdown('{% remark begin %}\n{% proof end %}'), /Mismatched/);
  await assert.rejects(renderMarkdown('{% remark end %}'), /Unexpected/);
});

test('solution labels stay English with a Chinese custom title and mathematical content', async () => {
  const { html } = await renderMarkdown('{% solution begin 方程 %}\n$x=2$\n{% solution end %}', { lang: 'zh-CN' });
  assert.match(html, /class="statement solution"/);
  assert.match(html, /Solution \(方程\)/);
  assert.match(html, /mjx-container/);
});

test('examples, problems, corollaries and notes preserve nested content, equations and English labels', async () => {
  const source = [
    '{% example begin 示例 <one> %}', '**Continuous:** $f(x)=|x|$.',
    '{% note begin 阅读提示 %}', '- First item', '- 中文说明', '{% note end %}', '{% example end %}',
    '{% problem begin %}', String.raw`See $\eqref{eq:sum}$.`,
    '{% solution begin %}', String.raw`\begin{equation}S_n=\frac{n(n+1)}2\label{eq:sum}\end{equation}`,
    '{% solution end %}', '{% problem end %}',
    '{% corollary begin 推论 %}', '$S_1=1$.', '{% corollary end %}'
  ].join('\n');
  const { html } = await renderMarkdown(source);
  for (const kind of ['example', 'problem', 'corollary', 'note', 'solution']) assert.ok(html.includes('class="statement ' + kind + '"'));
  assert.match(html, /Example \(示例 &lt;one&gt;\)/);
  assert.match(html, /Note \(阅读提示\)/);
  assert.match(html, /statement-title">Problem<\/p>/);
  assert.match(html, /Corollary \(推论\)/);
  assert.match(html, /<strong>Continuous:<\/strong>/);
  assert.match(html, /<li>中文说明<\/li>/);
  assert.match(html, /href="#mjx-eqn%3Aeq%3Asum"/);
  assert.equal((html.match(/<\/section>/g) || []).length, 5);
  assert.doesNotMatch(html, /\{%/);
});

test('new statement kinds validate boundaries while fenced examples remain literal', async () => {
  for (const kind of ['example', 'problem', 'corollary', 'note']) {
    await assert.rejects(renderMarkdown(`{% ${kind} begin %}\nText`), new RegExp('Unclosed ' + kind));
    await assert.rejects(renderMarkdown(`{% ${kind} end %}`), new RegExp('Unexpected ' + kind));
    await assert.rejects(renderMarkdown(`{% ${kind} begin %}\n{% proof end %}`), /Mismatched/);
    const { html } = await renderMarkdown([
      `{% ${kind} begin %}`, '```markdown', `{% ${kind} end %}`, '```', 'Still inside.', `{% ${kind} end %}`
    ].join('\n'));
    assert.equal((html.match(/class="statement /g) || []).length, 1);
    assert.ok(html.includes('<code class="language-markdown">{% ' + kind + ' end %}'));
  }
});
