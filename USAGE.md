# Usage

## Commands and directories

Run the CLI from your site directory. `math-notes-cli dev` watches source files and serves in-memory builds; `math-notes-cli build` writes `public/`; `math-notes-cli build:latex` compiles referenced LaTeX sources before building. All accept `--config path/to/config.mjs`, relative to the site directory. The development port defaults to 4321 and increases when occupied; set `PORT` to choose another starting port.

Only content, configuration, and personal resources belong in a site repository. Framework scripts, default assets, tests, and generic examples belong in this package. Installed code must not be edited directly.

## Configuration

Create `site.config.mjs`:

```js
export default {
  title: 'Your Notes',
  contentDirs: ['content', 'content-latex'],
  icon: 'assets/icon.svg',
  base: '/',
  url: 'https://example.com',
  pageSize: 10,
  styles: ['custom.css'],
  copyright: {
    author: 'Your Name',
    authorUrl: 'https://example.com',
    license: 'CC BY-NC-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/'
  },
  footer: { label: 'All notes', url: 'https://example.com' }
};
```

`contentDirs` defaults to `content` and accepts one path or a nonempty array. Relative paths resolve from the site; absolute content paths are supported. All configured directories must exist. Omit `icon` to use the bundled favicon. `pageSize` must be a positive integer. Set `base` to a deployment prefix such as `/notes/`; generated links include it. Set `url` to the public origin for canonical URLs, the sitemap, robots.txt, and CNAME.

Framework CSS and JavaScript are bundled automatically. Files in the site's optional `assets/` directory are copied as public assets and can override built-in files with the same name. Prefer the `styles` array to append project-local CSS after the default styles. URLs inside custom CSS resolve from the generated stylesheet under `assets/`; use appropriate relative paths or deployment-aware URLs.

## Notes and persistent URLs

Markdown files are discovered recursively and need YAML front matter with a nonempty title:

```markdown
---
title: Uniform convergence
lang: en
tags: [Analysis]
slug: a1b2c3d4e5f6
---

# Introduction

Write your note here.
```

Optional fields include `date` (YYYY-MM-DD), `tags`, `lang`, and `draft`. Omit `slug` for new notes; a successful build writes a persistent 12-character lowercase hexadecimal identifier. Keep existing slugs when editing or moving notes. When copying a note as a new article, remove its slug. Duplicate slugs fail the build.

Routes are `/<language>/<slug>/`. Chinese language variants use `/zh/`; English uses `/en/`. Directory structure does not determine URLs. Relative Markdown links, images, and attachments resolve from the source note and must stay inside configured content directories. Broken links and missing resources fail the build.

Drafts appear in local preview but are excluded from publication. Draft attachments and pages are not published unless also referenced by published content. Front matter without a title is invalid; ordinary Markdown without front matter is skipped.

## Markdown extensions

The syntax contract is maintained in `SYNTAX.md`. Supported features include `$...$`, `\(...\)`, `$$...$$`, `\[...\]`, AMS environments and equation references, eleven statement kinds, embedded BibTeX citations, yellow/green/pink highlights, footnotes, and restricted image attributes.

```markdown
{% theorem begin Example %}
For real $x$, $(x+1)^2=x^2+2x+1$.
{% theorem end %}

See [@sample].

{% bibtex begin %}
@book{sample, author={Doe, Jane}, title={Example Notes}, year={2026}}
{% bibtex end %}
```

The statement kinds are theorem, lemma, proposition, corollary, definition, example, problem, proof, solution, remark, and note. Their labels are English; content can use other languages. Unsupported HTML is escaped. Math is rendered during the build with strict validation; invalid TeX fails the build. Citations produce a References section with links and backlinks.

The separately installed Markdown Math Preview extension can preview the same syntax in VS Code, with native scroll synchronization. Use the website preview to check full site layout, PDFs, and encrypted articles.

## PDFs and LaTeX

A PDF needs a Markdown wrapper:

```markdown
---
title: Lecture notes
pdf: lecture.pdf
---
```

The PDF path is relative to the wrapper. Ordinary builds require an existing PDF and never invoke LaTeX. `build:latex` compiles PDFs with same-name `.tex` sources through `latexmk`; development previews also compile them and reuse successful outputs only while recorded dependencies remain unchanged. Compilation failures fail the build even if an older PDF exists.

Commit source files and generated PDFs beside one another. Put auxiliary files under a sibling `.aux/` directory. Select an engine with a first-line `% !TEX program = pdflatex`, `xelatex`, or `lualatex` directive; otherwise the framework defaults to XeLaTeX. Use XeLaTeX for Chinese or mixed CJK documents.

The search interface can optionally include extracted PDF text; this option is off by default. PDF text does not contribute to the Markdown word count. PDF-only attachments do not require a TeX installation.

## Encrypted articles

Set a nonempty string `password` in a note's front matter to encrypt its page and local resources. Each article has its own password. Encrypted body text and PDF contents are excluded from public search; public listing metadata remains available. Removing the field produces an ordinary article.

The password remains in the private source repository and is not copied into generated output. Avoid referencing protected attachments from public articles. Keep private source files out of deployment directories.

## Deployment and upgrades

Deploy only `public/`. Default builds require Node.js and existing PDFs but no LaTeX tools. Build output is replaced only after generation succeeds; temporary file locks are retried and a failed replacement restores the previous output.

Pin the framework release and commit `package-lock.json`. Use `npm ci` on a fresh checkout. To upgrade a local release, run the site's `sync:framework` command with the framework checkout path, review the dependency and lockfile changes, and run the site build. Future GitHub releases can be selected by tag or commit without publishing to npm.
