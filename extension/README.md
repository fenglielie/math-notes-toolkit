# Markdown Math Preview

Preview mathematical Markdown in VS Code with offline MathJax, theorem and proof blocks, BibTeX citations, highlights, and restricted images. This extension adds these features to VS Code's native Markdown preview.

## 🚀 Install and use

Download `markdown-math-preview-VERSION.vsix` from [GitHub Releases](https://github.com/fenglielie/math-notes-toolkit/releases), replacing `VERSION` with the release version. Run **Extensions: Install from VSIX...**, select the file, and reload VS Code. Add this to your workspace settings:

```json
{
  "markdownMathPreview.enabled": true,
  "markdown.math.enabled": false
}
```

The first setting enables this extension; the second disables VS Code's built-in KaTeX rendering so formulas do not appear twice. If you also use Markdown All in One, set `"markdown.extension.math.enabled": false`. Open a `.md` file and run **Markdown Math Preview: Open Preview to the Side**. That command also enables the extension in the current workspace.

## ✍️ Write a note

Use `$...$` or `\(...\)` for inline math and `$$...$$` or `\[...\]` for display math. MathJax also supports AMS environments, equation labels, and references. For example:

````markdown
# A short example

For real $x$, $(x+1)^2=x^2+2x+1$.

{% theorem begin Identity %}
The equality follows by expansion.
{% theorem end %}

\[
\int_0^1 x^2\,\mathrm{d}x=\frac13
\]
````

Statements use `{% kind begin Optional title %}` and `{% kind end %}` on separate lines. Supported kinds are theorem, lemma, proposition, corollary, definition, example, problem, proof, solution, remark, and note. Add citations with `[@key]` and a `{% bibtex begin %}` / `{% bibtex end %}` block containing BibTeX entries. See the bundled [complete example](examples/syntax-guide.md) and [syntax reference](SYNTAX.md) for details.

## 📋 Behavior and limitations

- Supported math includes `$...$`, `\(...\)`, `$$...$$`, `\[...\]`, AMS environments, labels, and forward references.
- Native source synchronization operates at the block level, not through TeX SyncTeX. VS Code controls scrolling and double-click navigation through its markdown.preview settings.
- Complete YAML front matter is hidden. Invalid math and custom syntax produce visible errors.
- Arbitrary raw HTML, full LaTeX documents, arbitrary `\usepackage` commands, and TikZ are not supported.
- Standard code highlighting comes from VS Code and installed extensions. Rendering resources are bundled locally without a CDN.
