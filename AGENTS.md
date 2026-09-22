# AGENTS.md

- This repository owns the shared Markdown renderer, static notes framework, CLI, and companion VS Code extension.
- The root npm package and executable are math-notes-cli. Keep one dependency installation and lockfile at the root; do not add workspace packages or bundled internal dependencies.
- Keep src/core/ portable and independent of VS Code APIs, site configuration, and content filesystem access. Both hosts import this source directly.
- Framework code lives in scripts/, bin/, and assets/. VS Code integration lives in extension/. Resolve site content from the caller's directory and toolkit resources from the package location.
- Maintain SYNTAX.md, examples/, styles/, and core tests here. Extension copies of syntax docs, examples, and highlight CSS are generated.
- Use English documentation, messages, and comments, UTF-8, LF, spaces, ES modules, and local dependencies. Generic fixtures must not contain private notes or branding.
- Preserve slugs, language routes, escaping, restricted images, strict math validation, per-document state, source synchronization, encryption, and safe publication.
- npm run check builds the demo and extension, runs Node tests, and checks the browser extension. Run npm run test:browser against the demo server for website changes.
- npm run test:package checks an independently installed package. npm run package:extension produces the VSIX.
- The root version is authoritative; build:extension copies it into the extension manifest. Commit both manifests when changing versions.
- Do not publish or choose a license without authorization. Preserve the existing CODE_REVIEW.md report; migrating structure does not resolve its findings.
