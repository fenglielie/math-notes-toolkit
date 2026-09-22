# Code review report

Date: 2026-09-22

## Scope and result

Reviewed the shared Markdown renderer, VS Code adapter, browser preview, package configuration, and existing tests. Three reproducible functional defects were found. All are priority P2 (medium): they affect specific supported inputs and should be addressed in a normal maintenance cycle.

The initial review recorded findings only and made no source changes. All three findings are now fixed; see Resolution below for changes and validation. This was a targeted review, not an exhaustive security audit.

## 1. Escaped text is reinterpreted as mathematics by the Node renderer

**Priority:** P2  
**Location:** [src/core/node.mjs](src/core/node.mjs), line 69

The Node renderer passes the entire rendered HTML document to MathJax. Markdown escape processing can produce literal math delimiters in ordinary text, which MathJax then interprets as formulas even though the Markdown parser did not create a math token.

Reproduction input:

```markdown
Show literal \\(x\\).
```

Expected: display the literal text `\(x\)`.

Actual: the Node renderer typesets `x` as a formula. The editor adapter preserves the literal text, so the two adapters disagree.

The following input also reproduces a rendering failure:

```markdown
Show literal \\(\notacommand\\).
```

The Node rendering promise rejects with `LaTeX: Undefined control sequence \notacommand`, despite the delimiters being escaped in the Markdown source.

**Impact:** ordinary escaped text can change appearance or prevent an entire document from rendering.

**Suggested fix:** restrict MathJax processing to nodes emitted for parsed math tokens, while preserving document-wide equation numbering, macro definitions, and forward references.

**Regression coverage:** verify that escaped delimiters remain literal, unknown commands inside those literal delimiters do not reject rendering, and supported formulas still render correctly.

## 2. A fenced code block inside a list can prematurely close a statement

**Priority:** P2  
**Location:** [src/core/statements.mjs](src/core/statements.mjs), lines 27-29

Statement boundary scanning recognizes code fences only when the scanned content starts directly with backticks or tildes. It misses a fence introduced on the same line as a list marker. A statement end marker inside that code block is consequently interpreted as a real boundary.

Reproduction input:

````markdown
{% theorem begin %}
- ```markdown
  {% theorem end %}
  ```
{% theorem end %}
````

Expected: one theorem containing a list item whose code block displays the literal `{% theorem end %}` marker.

Actual: the theorem closes at the marker inside the code block. The first code block is empty, and the actual closing statement marker is rendered in a separate code block outside the theorem. Both the Node renderer and editor adapter reproduce this behavior.

**Impact:** valid nested Markdown silently loses code content and produces the wrong document structure.

**Suggested fix:** make statement boundary scanning respect Markdown container and fence parsing, including list markers and indentation, instead of recognizing only standalone fence lines.

**Regression coverage:** include fences introduced on list-item opening lines, with statement markers inside them; verify both the literal code content and the surrounding statement structure.

## 3. Heading ID generation can produce duplicate anchors

**Priority:** P2  
**Location:** [src/core/node.mjs](src/core/node.mjs), lines 40-42

The heading counter tracks each original slug but does not check whether a generated suffixed ID has already been used by another heading.

Reproduction input:

```markdown
# Foo

# Foo

# Foo-2
```

Expected: three distinct heading IDs and table-of-contents targets.

Actual: both the rendered HTML and returned table of contents contain the IDs `foo`, `foo-2`, and `foo-2`. Following the third heading's anchor targets the earlier heading with the same ID.

**Impact:** directory navigation and direct section links can point to the wrong section.

**Suggested fix:** track all emitted IDs and keep incrementing the suffix until the candidate ID is unused.

**Regression coverage:** combine repeated titles with titles that already contain numeric suffixes, and verify uniqueness in both HTML and the returned table of contents.

## Validation and limitations

- `npm test` passed all 33 existing tests.
- `npm run check` passed the extension build, all 33 tests, and the Edge browser preview checks.
- Each finding above was reproduced separately with local Node scripts. The relevant editor adapter outputs were also compared for findings 1 and 2.
- The independent integration tests inside a real VS Code instance were not run.
- The successful existing suite does not cover the failing inputs documented above. No regression tests or fixes were added during this review.
- Build and browser checks generated ignored resources and screenshots; application source files were not changed.

## Resolution

All three findings above have been fixed in Math Notes Toolkit. The original findings and review-time validation remain above as a record of the inputs that failed.

1. The Node adapter now opts only parsed math token containers into MathJax processing. Escaped delimiters remain literal, including text containing unknown TeX commands; real formulas still share macros, numbering, and forward references, and invalid real formulas still fail.
2. Statement markers now participate directly in Markdown block parsing. A post-parse pass validates matching boundaries and source ranges, so native fence, list, blockquote, and indentation handling determines which markers are active. Statements cannot cross Markdown container boundaries.
3. Heading generation tracks all emitted IDs and skips occupied suffixes. Rendered headings and table-of-contents entries use the same unique IDs.

Regression coverage is in [test/core/review-regressions.test.mjs](test/core/review-regressions.test.mjs): 13 additional tests cover both renderer adapters, list-opening fences with and without blank lines, ordered/nested/quoted lists, fence lengths and characters, indented code, source maps, error locations, and heading collisions.

Validation after the fixes:

- `npm run check`: demo and extension builds, all 81 Node tests, and extension browser checks passed.
- Website browser checks passed against the demo server, including desktop/mobile, light/dark, navigation, math, search, PDFs, and encrypted articles.
- The consumer site was updated to the new local package and built successfully: 63 notes. All 150 source/attachment files and 81 normalized generated pages/indexes matched the migration baseline.
- Real VS Code extension-host integration tests were not rerun; the adapter tests and browser preview checks passed.
