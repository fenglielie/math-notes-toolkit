# Math Notes Toolkit

A toolkit for mathematical Markdown: a shared renderer, a static notes website framework, and a companion VS Code extension. All three use the same source and version, with one root dependency installation and lockfile.

| Use | Entry point |
| --- | --- |
| Build or preview a notes website | math-notes-cli |
| Render Markdown from Node.js | math-notes-cli/render |
| Extend a markdown-it parser | math-notes-cli/core |
| Preview Markdown in VS Code | Markdown Math Preview VSIX |

Supports offline MathJax formulas, AMS numbering and references, theorem and proof blocks, embedded BibTeX citations, highlights, footnotes, and restricted images. Read [SYNTAX.md](SYNTAX.md) and [examples/syntax-guide.md](examples/syntax-guide.md).

## Build a website

Install a local release in a site directory:

```sh
npm install /path/to/math-notes-cli-0.1.0.tgz
npx --no-install math-notes-cli dev
npx --no-install math-notes-cli build
```

From a directory where the CLI is installed, use `npx --no-install math-notes-cli init path/to/site` to create an empty site, then install the package in that site. Keep content, attachments, configuration, and branding in the site repository. See [USAGE.md](USAGE.md) for authoring, PDFs, encryption, deployment, and configuration.

## Render from Node.js

```js
import { renderMarkdown } from 'math-notes-cli/render';

const { html, css, toc, wordCount } = await renderMarkdown('Inline math: $x^2$.');
```

Pass the Markdown body after processing front matter. The optional synchronous resolveLink callback rewrites parsed link and image URLs. Invalid syntax or TeX rejects rendering. The returned CSS contains MathJax rules; the host supplies page, statement, and bibliography styles. Shared highlight styles are exported at math-notes-cli/styles/highlights.css.

The /core export provides syntax plugins and word-count utilities; /preset provides shared mathematical settings and statement presets. Host adapters share src/core/ directly.

## VS Code preview

Install markdown-math-preview-0.1.0.vsix through **Extensions: Install from VSIX...**, then enable markdownMathPreview.enabled in your workspace. The extension adds offline formulas and extended syntax to the native preview with source navigation. See [extension/README.md](extension/README.md) for settings and limitations.

## Development

Node.js 22.13+ is required; Node.js 24 is recommended. Run all development commands from this repository root:

```sh
npm ci
npm run check
npm run dev:demo
```

Use npm run package to create the Node package and npm run package:extension to create the VSIX. Only the extension needs bundling. Website builds use existing PDFs unless LaTeX compilation is requested.

See [DEVELOPMENT.md](DEVELOPMENT.md) for validation and distribution. No remote publication has been performed and no open-source license has been selected.
