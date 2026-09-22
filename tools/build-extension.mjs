import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const project = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(project, 'extension');
const packageRequire = createRequire(import.meta.url);
const dependency = name => path.dirname(packageRequire.resolve(name + '/package.json'));
await fs.copyFile(path.join(project, 'styles/highlights.css'), path.join(directory, 'media/highlights.css'));
await build({
  entryPoints: [path.join(directory, 'src/extension.mjs')],
  outfile: path.join(directory, 'dist/extension.cjs'),
  bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'],
  legalComments: 'linked'
});
await build({
  entryPoints: [path.join(directory, 'src/preview.mjs')],
  outfile: path.join(directory, 'media/preview.js'),
  bundle: true, platform: 'browser', format: 'iife', target: 'es2022',
  legalComments: 'linked'
});
await fs.rm(path.join(directory, 'SYNTAX.md'), { force: true });
await fs.cp(path.join(project, 'examples'), path.join(directory, 'examples'), { recursive: true });
const manifest = JSON.parse(await fs.readFile(path.join(project, 'package.json'), 'utf8'));
const extensionFile = path.join(directory, 'package.json');
const extensionManifest = JSON.parse(await fs.readFile(extensionFile, 'utf8'));
if (extensionManifest.version !== manifest.version) {
  extensionManifest.version = manifest.version;
  await fs.writeFile(extensionFile, JSON.stringify(extensionManifest, null, 2) + '\n');
}
const vendor = path.join(directory, 'media/vendor');
await fs.mkdir(vendor, { recursive: true });
await fs.cp(path.join(dependency('@mathjax/src'), 'bundle'), path.join(vendor, 'mathjax'), { recursive: true });
const fonts = dependency('@mathjax/mathjax-newcm-font');
await fs.mkdir(path.join(vendor, 'mathjax-newcm-font'), { recursive: true });
await fs.copyFile(path.join(fonts, 'svg.js'), path.join(vendor, 'mathjax-newcm-font/svg.js'));
await fs.cp(path.join(fonts, 'svg'), path.join(vendor, 'mathjax-newcm-font/svg'), { recursive: true });
await fs.copyFile(path.join(dependency('@mathjax/src'), 'LICENSE'), path.join(vendor, 'MATHJAX-LICENSE'));
console.log('Built Markdown Math Preview with local MathJax and SVG fonts.');
