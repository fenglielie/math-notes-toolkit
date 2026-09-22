# Markdown Math Preview

Math and style enhancements for VS Code's native Markdown preview, built as part of Math Notes Toolkit. Supports offline MathJax, theorem and proof blocks, embedded BibTeX citations, highlights, and restricted images. The extension and website use the same syntax implementation.

## 🚀 Install and use

Run **Extensions: Install from VSIX...**, select the `.vsix` file downloaded from [GitHub Releases](https://github.com/fenglielie/math-notes-toolkit/releases), and reload the window. Configure your workspace:

```json
{
  "markdownMathPreview.enabled": true,
  "markdown.math.enabled": false,
  "markdown.extension.math.enabled": false
}
```

The last two settings disable competing math rendering in VS Code and Markdown All in One. Open a Markdown document and press **Ctrl+K V**, or run **Markdown Math Preview: Open Preview to the Side**.

See [SYNTAX.md](SYNTAX.md) for supported syntax and [examples/syntax-guide.md](examples/syntax-guide.md) for a complete example. These files are included in the VSIX and generated from the toolkit's canonical sources during development.

## 📋 Behavior and limitations

- Supported math includes `$...$`, `\(...\)`, `$$...$$`, `\[...\]`, AMS environments, labels, and forward references.
- Native source synchronization operates at the block level, not through TeX SyncTeX. VS Code controls scrolling and double-click navigation through its markdown.preview settings.
- Complete YAML front matter is hidden. Invalid math and custom syntax produce visible errors.
- Arbitrary raw HTML, full LaTeX documents, arbitrary usepackage commands, TikZ, and Mermaid rendering are not provided.
- Standard code highlighting comes from VS Code and installed extensions. Rendering resources are bundled locally without a CDN.

For toolkit development, testing, and VSIX packaging, see the [🛠️ Developer guide](https://github.com/fenglielie/math-notes-toolkit/blob/main/DEVELOPMENT.md).
