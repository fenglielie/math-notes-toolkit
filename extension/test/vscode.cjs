const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

exports.run = async () => {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const output = path.join(root, '.cache/extension-preview/vscode-result.json');
  await fs.mkdir(path.dirname(output), { recursive: true });
  try {
    const extension = vscode.extensions.getExtension('markdown-math-local.markdown-math-preview');
    assert.ok(extension);
    await extension.activate();
    assert.equal(vscode.workspace.getConfiguration('markdownMathPreview').get('enabled'), true);
    await vscode.extensions.getExtension('vscode.markdown-language-features').activate();
    const companions = ['yzhang.markdown-all-in-one', 'bierner.markdown-preview-github-styles', 'bierner.markdown-mermaid'];
    for (const id of companions) {
      const companion = vscode.extensions.getExtension(id);
      if (companion) await companion.activate();
    }
    const source = ['---', 'title: Integration test', '---', '', '{% theorem begin Test %}',
      'Text with $x^2$ and \\(\\frac{4}{3}\\pi R^3\\).', '', '\\[',
      '\\begin{pmatrix}x \\\\ y\\end{pmatrix}', '\\]', '', '$$S=4\\pi R^2$$',
      '{% theorem end %}', ''].join('\n');
    const result = await vscode.commands.executeCommand('markdown.api.render', source);
    const html = typeof result === 'string' ? result : result.html;
    assert.match(html, /data-line="4" class="code-line statement theorem"/);
    assert.match(html, /markdown-math-tex/);
    assert.equal((html.match(/class="markdown-math-tex/g) || []).length, 4);
    assert.doesNotMatch(html, /katex|title: Integration test/);
    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: source });
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('markdownMathPreview.open');
    let tabs;
    for (let attempt = 0; attempt < 30; attempt++) {
      tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs.map(tab => ({ label: tab.label, viewType: tab.input?.viewType })));
      if (tabs.some(tab => tab.viewType?.includes('markdown.preview'))) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(tabs.some(tab => tab.viewType?.includes('markdown.preview')), JSON.stringify(tabs));
    const checks = ['activation', 'native Markdown renderer', 'source lines', 'all math delimiters', 'preview command'];
    if (process.env.MARKDOWN_MATH_CDP_PORT) {
      const { chromium } = require('@playwright/test');
      const browser = await chromium.connectOverCDP('http://127.0.0.1:' + process.env.MARKDOWN_MATH_CDP_PORT);
      try {
        let preview;
        for (let attempt = 0; attempt < 100 && !preview; attempt++) {
          for (const context of browser.contexts()) for (const page of context.pages()) for (const frame of page.frames()) {
            try { if (await frame.locator('.markdown-math-tex').count() === 4) preview = frame; } catch { /* A webview may be navigating. */ }
          }
          if (!preview) await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.ok(preview, 'The real Markdown webview must contain the formulas.');
        await preview.waitForFunction(() => document.querySelectorAll('.markdown-math-tex svg').length === 4, null, { timeout: 15000 });
        assert.equal(await preview.locator('.markdown-math-error').count(), 0);
        assert.equal(await preview.locator('.markdown-math-display mjx-container[display="true"]').count(), 2);
        await preview.locator('body').screenshot({ path: path.join(root, '.cache/extension-preview/vscode-math.png') });
        checks.push('MathJax SVG rendering in the actual VS Code webview');
      } finally { await browser.close(); }
    }
    await fs.writeFile(output, JSON.stringify({ passed: true, checks, companions: companions.filter(id => vscode.extensions.getExtension(id)?.isActive) }, null, 2));
  } catch (error) {
    await fs.writeFile(output, JSON.stringify({ passed: false, error: error.stack }, null, 2));
    throw error;
  }
};
