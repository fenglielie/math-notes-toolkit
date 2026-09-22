# Supported Markdown syntax

This guide defines the syntax shared by the Math Notes Toolkit renderer, website framework, and VS Code extension. Host applications choose how to display errors and integrate the rendered content. Examples use backtick code fences. Special markers inside fenced code and inline code remain literal and are not parsed as math, citations, or statement blocks.

## 1. Mathematics

### Inline math

```markdown
Euler's identity $e^{i\pi}+1=0$, or \(a^2+b^2=c^2\).
```

Both `$...$` and `\(...\)` are supported. Inline math must stay on one source line. Do not put whitespace immediately inside dollar delimiters. Use display math for multiline formulas.

### Display math

```markdown
\[
\int_0^1 x^2\,\mathrm{d}x=\frac13
\]

$$
\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
$$
```

Both `\[...\]` and `$$...$$` are supported. The opening delimiter must start a content line, and no text may follow the closing delimiter on that line. Short formulas can use a single line, such as `\[x^2\]` or `$$x^2$$`. Do not indent by four spaces, which Markdown treats as code.

### AMS environments, numbering, and forward references

```markdown
A reference to a later equation: \(\eqref{eq:energy}\).

\begin{align}
E &= mc^2 \label{eq:energy} \\
p &= mv \notag
\end{align}

\begin{equation}
a^2+b^2=c^2 \tag{P}\label{eq:pythagoras}
\end{equation}
```

Supported environments may start directly with `\begin{...}` without an enclosing `$$` block. Common environments include `equation`, `align`, `gather`, `multline`, `aligned`, `split`, `alignat`, `matrix`, `pmatrix`, `bmatrix`, `cases`, and `array`, along with their supported starred forms. Opening and closing environments must match.

The document is typeset as a whole, supporting `\label`, `\ref`, `\eqref`, `\tag`, `\notag`, and forward references. Equation numbering restarts for each document. Do not define the same label twice in one document.

### TeX command support

Rendering uses MathJax 4 with the `base`, `ams`, `newcommand`, `mathtools`, `boldsymbol`, and `physics` packages and New Computer Modern SVG fonts. For example:

```markdown
\[
\newcommand{\RR}{\mathbb{R}}
x\in\RR,\qquad \boldsymbol{\alpha},\qquad \norm{x}
\]
```

Define macros inside math expressions for use during the same document render. Each edit resets the typesetting state. MathJax is not a full LaTeX compiler: document preambles, arbitrary `\usepackage` commands, TikZ, external `.tex` files, and arbitrary extension packages are not supported. Invalid TeX produces a visible error.

## 2. Theorems, proofs, and other statements

Opening and closing markers must each occupy their own line. An optional title is treated as plain text:

```markdown
{% theorem begin Pythagorean theorem %}
The side lengths of a right triangle satisfy $a^2+b^2=c^2$.

{% proof begin %}
Use **Markdown**, lists, blockquotes, and formulas here.
{% proof end %}
{% theorem end %}
```

| Kind | Label | Style |
| --- | --- | --- |
| `theorem` | Theorem | Colored border and background |
| `lemma` | Lemma | Colored border and background |
| `proposition` | Proposition | Colored border and background |
| `corollary` | Corollary | Colored border and background |
| `definition` | Definition | Colored border and background |
| `example` | Example | Colored border and background |
| `problem` | Problem | Colored border and background |
| `proof` | Proof | Thin left rule, no background, closing square |
| `solution` | Solution | Thin left rule, no background, closing square |
| `remark` | Remark | Thin left rule, no background |
| `note` | Note | Thin left rule, no background |

Replace `theorem` in the example with any kind in the table. Names are lowercase, opening and closing kinds must match, and blocks may be nested. Labels are always English; titles and body text may use other languages. HTML and Markdown in titles are not rendered as rich text.

Unclosed blocks or unmatched closing markers produce errors with source line numbers when available. Colon-fenced statement syntax is not supported.

## 3. Embedded BibTeX and citations

Place bibliography data directly in Markdown, before or after citations. Multiple bibliography blocks are allowed:

```markdown
A single citation [@sample2026].
A page locator [@sample2026, pp. 12–14].
A group of citations [@sample2026; @other2025].

{% bibtex begin %}
@book{sample2026,
  author = {Doe, Jane},
  title = {Sample Mathematical Notes},
  publisher = {Example Press},
  year = {2026},
  url = {https://example.com/notes}
}
@article{other2025,
  author = {Smith, Alex},
  title = {An Example Article},
  journal = {Example Journal},
  year = {2025}
}
{% bibtex end %}
```

- Citation keys are case-sensitive. Separate multiple citations with semicolons and introduce locators with a comma.
- Numbers follow the order of first citation in the rendered content. Repeated citations reuse the same number.
- BibTeX blocks are hidden. A **References** section is generated at the end of the document and includes only cited entries.
- References share the native preview's content container with the body, inheriting the theme and styles supplied by other extensions.
- Entries use Vancouver formatting, with available DOI, Article / PDF, and Google Scholar links, plus backlinks to citation locations.
- Citations can appear in footnotes. Citation markers inside code and math are not interpreted as citations.
- Bibliography processing is local and does not query external databases. Reference links open external pages only when clicked.

Common BibTeX entry types, Unicode text, and TeX accents are supported. Duplicate keys, missing keys, malformed entries, and unclosed blocks produce errors. Bare `@key` citations, loading external `.bib` files, custom CSL styles, and manual placement of the References section are not supported.

## 4. Highlights

```markdown
{% color yellow begin %}Yellow highlight{% color end %}

{% color green begin %}Green **emphasis** and $x^2${% color end %}

{% color pink begin %}Pink highlight{% color end %}
```

Supported colors are lowercase `yellow`, `green`, and `pink`. Highlights may contain inline Markdown, math, and nested highlights. Opening and closing markers must belong to the same Markdown inline parsing block; do not span multiple paragraphs separated by blank lines. Unknown colors and unmatched markers produce errors. The `==text==` syntax is not supported.

## 5. Images and restricted attributes

Use standard Markdown for images. To specify dimensions, use a restricted HTML image tag:

```markdown
![Diagram](figures/unit-square.svg)

<img src="figures/unit-square.svg" alt="Unit square" width="240" loading="lazy">
```

Allowed attributes are `src`, `alt`, `title`, `width`, `height`, and `loading`. Width and height must be positive integers; `loading` accepts only `lazy` or `eager`. Event handlers, `style`, and other attributes are ignored. Arbitrary HTML is not supported.

Host applications resolve relative paths from the current Markdown file. The Node.js renderer accepts a resolveLink callback; VS Code preview uses its native resource restrictions.

## 6. Footnotes and standard Markdown

```markdown
A statement that needs explanation[^detail].

[^detail]: A footnote may also contain a citation [@sample2026].
```

Headings, lists, tables, links, blockquotes, and backtick code fences use standard Markdown. Node.js rendering includes syntax highlighting; VS Code preview uses the editor and its installed extensions; the core does not execute code or implement diagram languages.

## 7. Host integration: front matter and errors

```yaml
---
title: Example note
tags: [Math, Example]
---
```

In Markdown Math Preview, a complete metadata block at the start of the document, opened with `---` and closed with `---` or `...`, is hidden while source line numbers are preserved. Front matter is optional, its fields do not control rendering, and the extension does not write metadata back to the file.

The core Node.js renderer accepts the Markdown body; hosts must handle metadata before calling it. Invalid syntax or TeX throws an error.

Markdown Math Preview uses the current editor buffer. Unclosed special blocks and invalid formulas produce visible errors while typing; correcting them restores the preview automatically. Source navigation uses the native synchronization mechanism, with nested statements and multiline formulas mapped to content blocks.
