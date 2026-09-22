# Development and distribution

Math Notes Toolkit is the reusable repository. A separate private repository contains the actual notes and configuration. The toolkit has one root npm package, math-notes-cli, and one version (0.1.0).

## Layout

| Path | Responsibility |
| --- | --- |
| src/core/, styles/ | Shared parsing, Node rendering, math presets, and highlight styles |
| scripts/, bin/, assets/ | Website generation, CLI, local server, search, PDF, encryption, and site UI |
| extension/ | VS Code manifest, editor adapter, browser runtime, and extension-specific styles |
| SYNTAX.md, examples/ | Canonical syntax rules and examples |
| content-demo/, site.demo.config.mjs | Generic demonstration website |
| starter/ | New site template |
| test/, extension/test/ | Framework, rendering, and editor tests |
| tools/ | Extension build and VSIX packaging |

The extension manifest describes a VS Code product, not another installed npm package. Dependencies and the lockfile live only at the root. Build commands synchronize its version from the root manifest and generate its syntax docs, examples, highlight CSS, and offline resources. No internal tarballs, Git dependencies, or bundleDependencies connect the components.

## Commands

| Command | Purpose |
| --- | --- |
| npm test | Framework, shared rendering, and editor adapter tests |
| npm run build:demo | Build the generic website |
| npm run dev:demo | Serve the website with live updates |
| npm run build:extension | Bundle VS Code and browser entries with local MathJax resources |
| npm run test:extension | Test the built browser extension |
| npm run test:browser | Test the running demo website; set PREVIEW_URL if needed |
| npm run check | Demo build, extension build, Node tests, and extension browser tests |
| npm run test:package | Install the actual Node archive in an independent site and test init/build/dev |
| npm run package | Check and pack the Node package |
| npm run package:extension | Build and create the VSIX at the repository root |

Browser tests use installed Edge on Windows; elsewhere install a Playwright browser or set BROWSER_CHANNEL. F5 launches the extension development window from the root workspace. The separate integration-test launch configuration runs inside VS Code and is not part of npm run check.

Generated output under public/, .cache/, extension/dist/, and extension/media/vendor/ must not be edited. The root .gitignore also identifies generated extension scripts, styles, examples, docs, and package archives.

## Update a local site

After making changes here, run the site's update command:

```sh
npm run sync:framework -- /path/to/math-notes-toolkit
npm run build
```

The update command validates this repository, packs math-notes-cli, installs a content-addressed snapshot into the site's vendor/, and updates the dependency and lockfile. Commit those three together. There is no separate renderer synchronization step. Installing the Node package does not install VS Code tooling; ordinary runtime dependencies are resolved by npm without an internal bundled dependency tree.

## Future GitHub distribution

After the repository and version tag exist, a site can install the package directly from source:

```sh
npm install "git+https://github.com/OWNER/math-notes-toolkit.git#v0.1.0"
```

Replace OWNER with the actual account. The repository name is math-notes-toolkit; its npm package and executable are math-notes-cli. Pin a tag or commit and keep the lockfile. No npm registry publication or Node package build is required. Keep extension builds out of install lifecycle hooks.

For a release, update the root version, build the extension to synchronize its manifest, run checks, commit, and create a tag. Attach the VSIX to the GitHub Release for editor users; a Node tarball is optional. No remote publication has been performed and no open-source license has been selected.
