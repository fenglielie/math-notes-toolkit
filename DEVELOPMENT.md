# 🛠️ Development and releases

For installation and authoring, see [README.md](README.md).

Keep actual notes and site configuration in a separate repository. This toolkit has one root npm package, math-notes-cli, and one shared version defined by the root `package.json`. Node.js 22.13+ is required. Run all development commands from this repository root:

```sh
npm ci
npm run check
npm run dev:demo
```

## 🗂️ Layout

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

Edit shared syntax in `src/core/`, `SYNTAX.md`, and `examples/`; edit VS Code integration in `extension/src/`. Both hosts import the shared renderer source directly.

The extension is built from the root package; dependencies and the lockfile live only there. Its build synchronizes the version and copies examples, the shared `SYNTAX.md`, highlight CSS, and offline resources into the VSIX. Keep the source syntax reference at the repository root and a self-contained user guide in `extension/README.md`.

## 🧪 Build and test

`VERSION` in output filenames represents the root `package.json` version; the packaging commands insert it automatically.

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
| npm pack | Create math-notes-cli-VERSION.tgz at the repository root |
| npm run package | Check and pack the Node package |
| npm run package:extension | Build and create markdown-math-preview-VERSION.vsix at the repository root |

Browser tests use installed Edge on Windows; elsewhere install a Playwright browser or set BROWSER_CHANNEL. F5 launches the extension development window from the root workspace. The separate integration-test launch configuration runs inside VS Code and is not part of npm run check.

Generated output under public/, .cache/, extension/dist/, and extension/media/vendor/ must not be edited. The root .gitignore also identifies generated extension scripts, styles, examples, and package archives.

## 🔄 Update a local site

After making changes here, run the site's update command:

```sh
npm run sync:framework -- /path/to/math-notes-toolkit
npm run build
```

The update command validates this repository, packs math-notes-cli, installs a content-addressed snapshot into the site's vendor/, and updates the dependency and lockfile. Commit those three together. There is no separate renderer synchronization step. Installing the Node package does not install VS Code tooling; ordinary runtime dependencies are resolved by npm without an internal bundled dependency tree.

## 📦 Package and publish a GitHub Release

Run the following commands from the repository root. Replace `VERSION` in filenames and Git commands with the version from the root `package.json`; the tag must be `v` followed by that same version. After setting the release version, you can read it with:

```sh
node -p "require('./package.json').version"
```

1. Set the version in the root `package.json` and update `package-lock.json` if it changes. The extension build copies that version into `extension/package.json`.
2. Install dependencies, run checks, and generate both release files. Continue only when each command succeeds:

   ```sh
   npm ci
   npm run check
   npm run test:package
   npm pack
   npm run package:extension
   ```

   | Generated file (repository root) | Purpose |
   | --- | --- |
   | `math-notes-cli-VERSION.tgz` | Install the CLI, renderer, and website framework with npm |
   | `markdown-math-preview-VERSION.vsix` | Install the VS Code extension |

   `npm pack` creates only the npm archive. `npm run package:extension` builds and packages the extension separately. Both files are ignored by Git; upload them as release attachments instead of committing them.

3. Check the website by running `npm run dev:demo` in one terminal and `npm run test:browser` in another. If the preview uses a different port, set `PREVIEW_URL` to the address printed by the server.
4. Review, commit, and push the release changes, including the root manifest, lockfile, and synchronized extension manifest when their versions change. Tag the tested commit:

   ```sh
   git tag -a vVERSION -m "Release vVERSION"
   git push origin vVERSION
   ```

5. Open the repository's **Releases** page on GitHub and create a new release using tag `vVERSION`. Add release notes describing changes, requirements, and known limitations. Upload both files from step 2, then publish the release. GitHub's automatically generated source archives do not replace these installation files. For a trial release, select **Set as a pre-release**.

These steps publish a GitHub Release; npm registry and VS Code Marketplace publication are separate processes. The project currently uses `UNLICENSED`; no open-source license has been selected.
