import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import childProcess from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { copyTestAssets, samplePdf } from './support/fixtures.mjs';
import { build, generate } from '../scripts/build.mjs';
import { decryptArticle } from '../assets/crypto.js';
import { compileLatex } from '../scripts/latex.mjs';

async function fixture(t) {
  await fs.mkdir('.cache', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.cache/latex-test-'));
  t.after(async () => {
    t.mock.restoreAll();
    assert.ok(root.startsWith(path.resolve('.cache') + path.sep));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const write = async (name, data) => {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  };
  await copyTestAssets(root);
  await write('site.config.mjs', "export default { title: 'Test', base: '/sub/' }");
  await write('content/note.md', '---\ntitle: Lecture\nslug: aaaaaaaaaaaa\npdf: lecture.pdf\n---\n[Download](lecture.pdf)');
  await write('content/lecture.tex', '\\documentclass{article}\n\\begin{document}Lecture\\end{document}');
  return { root, write };
}

test('LaTeX-enabled build compiles missing and existing PDFs once per source before indexing and copying', async t => {
  const { root, write } = await fixture(t);
  await write('site.config.mjs', "export default { title: 'Test', base: '/sub/', contentDirs: ['content', 'other'] }");
  await write('other/lecture.tex', 'Other lecture');
  await write('other/lecture.pdf', samplePdf({ text: 'Stale content' }));
  await write('other/讲义 & notes.tex', 'Unicode path');
  await write('content/links.md', '---\ntitle: Attachments\nslug: bbbbbbbbbbbb\n---\n[Other](../other/lecture.pdf)\n[Unicode](../other/%E8%AE%B2%E4%B9%89%20%26%20notes.pdf)');
  await write('content/unreferenced.tex', 'Do not compile');
  await write('content/draft.md', '---\ntitle: Draft\nslug: cccccccccccc\ndraft: true\npdf: draft.pdf\n---\n');
  await write('content/draft.tex', 'Do not compile');
  const calls = [];
  t.mock.method(childProcess, 'execFile', (command, args, options, callback) => {
    calls.push(args.at(-1));
    assert.equal(command, 'latexmk');
    assert.equal(options.cwd, path.dirname(path.resolve(args.at(-1))));
    assert.equal(options.windowsHide, true);
    assert.equal(options.env.SOURCE_DATE_EPOCH, '946684800');
    assert.equal(options.env.FORCE_SOURCE_DATE, '0');
    assert.ok(!options.shell);
    fs.writeFile(args.at(-1).replace(/\.tex$/, '.pdf'), samplePdf({ text: 'Fresh lecture' }))
      .then(() => callback(null, '', ''), callback);
  });
  const result = await build({ root, latex: true });
  assert.equal(calls.length, 3);
  assert.equal(new Set(calls).size, 3);
  for (const name of ['1/lecture.pdf', '2/lecture.pdf', '2/讲义 & notes.pdf']) {
    assert.equal((await fs.readFile(path.join(root, 'public/files', name))).toString(), samplePdf({ text: 'Fresh lecture' }));
  }
  assert.match(result.output.get('en/bbbbbbbbbbbb/index.html').toString(), /\/sub\/files\/2\/%E8%AE%B2%E4%B9%89%20%26%20notes.pdf/);
  assert.match(JSON.parse(result.output.get('search-index.json')).find(note => note.title === 'Lecture').pdfText, /Fresh lecture/);
  assert.ok(!result.output.has('files/1/draft.pdf'));
  assert.ok(!result.output.has('files/1/unreferenced.pdf'));
});

test('PDF-only attachments and Markdown-only notes do not require latexmk', async t => {
  const { root, write } = await fixture(t);
  await fs.unlink(path.join(root, 'content/lecture.tex'));
  await write('content/lecture.pdf', samplePdf());
  t.mock.method(childProcess, 'execFile', () => assert.fail('No LaTeX compilation expected'));
  assert.ok((await generate({ root })).output.has('files/lecture.pdf'));
  await write('content/note.md', '---\ntitle: Plain note\nslug: aaaaaaaaaaaa\n---\nText');
  await generate({ root });
});

test('default builds publish existing PDFs without invoking or inspecting the LaTeX compiler', async t => {
  const { root, write } = await fixture(t);
  const pdf = samplePdf({ text: 'Committed PDF content' });
  await write('content/lecture.pdf', pdf);
  await write('content/lecture.tex', '% !TEX program = unavailable-engine\nInvalid source');
  t.mock.method(childProcess, 'execFile', () => assert.fail('Default builds must not compile LaTeX'));
  const result = await build({ root });
  assert.equal(result.output.get('files/lecture.pdf').toString(), pdf);
  assert.match(JSON.parse(result.output.get('search-index.json'))[0].pdfText, /Committed PDF content/);
  await assert.rejects(fs.access(path.join(root, 'content/.aux')), { code: 'ENOENT' });
});

test('default builds require existing PDFs for wrappers, links and encrypted attachments and preserve publication', async t => {
  t.mock.method(childProcess, 'execFile', () => assert.fail('Missing PDFs must not trigger compilation'));
  for (const mode of ['wrapper', 'link', 'encrypted']) {
    const { root, write } = await fixture(t);
    const metadata = mode === 'wrapper' ? 'pdf: lecture.pdf\n' : mode === 'encrypted' ? 'password: test-password\n' : '';
    await write('content/note.md', '---\ntitle: Lecture\nslug: aaaaaaaaaaaa\n' + metadata + '---\n[Download](lecture.pdf)');
    await write('content/lecture.pdf', samplePdf());
    const result = await build({ root });
    const published = await fs.readFile(path.join(root, 'public/index.html'));
    if (mode === 'encrypted') {
      const html = result.output.get('en/aaaaaaaaaaaa/index.html').toString();
      const envelope = JSON.parse(html.match(/<script id="encrypted-article"[^>]*>([^<]+)<\/script>/)[1]);
      const payload = await decryptArticle(envelope, 'test-password', '/sub/en/aaaaaaaaaaaa/');
      assert.equal(Buffer.from(payload.attachments[0].data, 'base64').toString(), samplePdf());
    }
    await fs.unlink(path.join(root, 'content/lecture.pdf'));
    await assert.rejects(build({ root }), /PDF not found:.*lecture\.pdf.*npm run build:latex locally or in CI/);
    assert.deepEqual(await fs.readFile(path.join(root, 'public/index.html')), published);
  }
});

test('direct latexmk invocation selects supported engines and preserves paths as separate arguments', async t => {
  const { root, write } = await fixture(t);
  const directory = path.join(root, 'content', '中文 & space');
  const source = path.join(directory, '-lecture.tex'), pdf = path.join(directory, '-lecture.pdf');
  const portable = file => file.split(path.sep).join('/');
  let lastArgs, calls = 0;
  t.mock.method(childProcess, 'execFile', (command, args, options, callback) => {
    assert.equal(command, 'latexmk');
    assert.equal(options.cwd, directory);
    assert.ok(!options.shell);
    assert.equal(options.windowsHide, true);
    assert.equal(options.env.SOURCE_DATE_EPOCH, '946684800');
    assert.equal(options.env.FORCE_SOURCE_DATE, '0');
    lastArgs = args;
    calls++;
    fs.writeFile(pdf, samplePdf()).then(() => callback(null, '', ''), callback);
  });
  for (const [header, flag] of [
    ['', '-pdfxe'], ['% !TEX program = pdflatex\n', '-pdf'],
    ['\uFEFF% !TeX TS-program = LuaLaTeX\r\n', '-pdflua'], ['% !TEX program = xelatex\n', '-pdfxe']
  ]) {
    await write('content/中文 & space/-lecture.tex', header + '\\documentclass{article}\n\\begin{document}Test\\end{document}');
    await compileLatex(source, pdf);
    assert.deepEqual(lastArgs, ['-cd', '-silent', '-file-line-error', '-halt-on-error', '-interaction=nonstopmode',
      '-synctex=1', '-g', flag, '-auxdir=' + portable(path.join(directory, '.aux')), '-outdir=' + portable(directory), portable(source)]);
    assert.ok((await fs.stat(path.join(directory, '.aux'))).isDirectory());
  }
  await write('content/中文 & space/-lecture.tex', '% !TEX program = pdflatex -shell-escape\n');
  await assert.rejects(compileLatex(source, pdf), /Unsupported LaTeX engine/);
  assert.equal(calls, 4, 'Unknown engines must fail before invoking a command');
});

test('generated PDFs are compiled before encryption and remain out of public files and search', async t => {
  const { root, write } = await fixture(t);
  await write('content/note.md', '---\ntitle: Private lecture\nslug: aaaaaaaaaaaa\npassword: test-password\npdf: lecture.pdf\n---\n[Download](lecture.pdf)');
  const pdf = samplePdf({ text: 'Private compiled text' });
  t.mock.method(childProcess, 'execFile', (command, args, options, callback) => {
    fs.writeFile(path.join(root, 'content/lecture.pdf'), pdf).then(() => callback(null, '', ''), callback);
  });
  const { output } = await generate({ root, latex: true });
  const html = output.get('en/aaaaaaaaaaaa/index.html').toString();
  const envelope = JSON.parse(html.match(/<script id="encrypted-article"[^>]*>([^<]+)<\/script>/)[1]);
  const payload = await decryptArticle(envelope, 'test-password', '/sub/en/aaaaaaaaaaaa/');
  assert.equal(payload.attachments.length, 1);
  assert.equal(Buffer.from(payload.attachments[0].data, 'base64').toString(), pdf);
  assert.ok(!output.has('files/lecture.pdf'));
  assert.doesNotMatch(output.get('search-index.json').toString(), /Private compiled text/);
});

test('compiler failures and a missing command fail LaTeX-enabled builds despite a stale PDF and preserve publication', async t => {
  const { root, write } = await fixture(t);
  let failure;
  t.mock.method(childProcess, 'execFile', (command, args, options, callback) => {
    if (failure) return callback(failure, '', 'Compiler diagnostic');
    fs.writeFile(path.join(root, 'content/lecture.pdf'), samplePdf())
      .then(() => callback(null, '', ''), callback);
  });
  await build({ root, latex: true });
  const published = await fs.readFile(path.join(root, 'public/index.html'));
  await write('content/lecture.tex', 'Invalid source');
  failure = Object.assign(new Error('Exit code 1'), { code: 1 });
  await assert.rejects(build({ root, latex: true }), /LaTeX compilation failed:[\s\S]*Compiler diagnostic/);
  assert.deepEqual(await fs.readFile(path.join(root, 'public/index.html')), published);
  failure = Object.assign(new Error('Command not found'), { code: 'ENOENT' });
  await assert.rejects(build({ root, latex: true }), /latexmk was not found.*LaTeX distribution.*PATH/);
  assert.deepEqual(await fs.readFile(path.join(root, 'public/index.html')), published);
});

test('a successful command must produce a PDF at the referenced path', async t => {
  const { root, write } = await fixture(t);
  t.mock.method(childProcess, 'execFile', (command, args, options, callback) => callback(null, '', ''));
  await assert.rejects(generate({ root, latex: true }), /did not produce a valid PDF/);
  await write('content/lecture.pdf', 'Not a PDF');
  await assert.rejects(generate({ root, latex: true }), /Invalid PDF header/);
});

test('preview reuses successful PDFs across calls and invalidates actual TeX, template, image and bibliography dependencies', async t => {
  const { root, write } = await fixture(t);
  const source = path.join(root, 'content/lecture.tex'), pdf = path.join(root, 'content/lecture.pdf');
  const cache = path.join(root, 'content/.aux/lecture.tex.preview-cache.json');
  await write('shared/setup.tex', 'Shared template');
  await write('content/chapter.tex', 'Chapter');
  await write('content/plot.png', 'Image');
  await write('shared/refs.bib', 'Bibliography');
  let calls = 0, fail = false;
  const forced = [];
  t.mock.method(childProcess, 'execFile', (command, args, options, callback) => {
    calls++;
    forced.push(args.includes('-g'));
    if (fail) return callback(new Error('Compilation failed'), '', '');
    Promise.all([
      write('content/lecture.pdf', samplePdf()),
      write('content/.aux/lecture.fls', 'INPUT ./lecture.tex\nINPUT ./chapter.tex\nINPUT ../shared/setup.tex\nINPUT ./plot.png\nINPUT .aux/lecture.aux\nOUTPUT .aux/lecture.aux\n'),
      write('content/.aux/lecture.fdb_latexmk', '# Fdb version 4\n  "../shared/refs.bib" 1 1 abc ""\n')
    ]).then(() => callback(null, '', ''), callback);
  });
  await compileLatex(source, pdf, { reuse: true });
  assert.equal(calls, 1);
  await fs.access(cache);
  await write('content/note.md', 'Changed Markdown only');
  await write('assets/style.css', 'Changed stylesheet only');
  await compileLatex(source, pdf, { reuse: true });
  assert.equal(calls, 1);
  for (const file of ['shared/setup.tex', 'content/chapter.tex', 'content/plot.png', 'shared/refs.bib', 'content/lecture.tex']) {
    await fs.appendFile(path.join(root, file), '\nUpdated');
    const before = calls;
    await compileLatex(source, pdf, { reuse: true });
    assert.equal(calls, before + 1, file + ' must invalidate the cache');
    await compileLatex(source, pdf, { reuse: true });
    assert.equal(calls, before + 1);
  }
  await fs.unlink(pdf);
  await compileLatex(source, pdf, { reuse: true });
  assert.equal(calls, 7);
  await compileLatex(source, pdf);
  assert.equal(calls, 8, 'Explicit LaTeX builds always invoke latexmk');
  assert.deepEqual(forced, [true, false, false, false, false, false, false, false],
    'Only adoption of the PDF policy forces typesetting; later calls remain incremental');
  const legacy = JSON.parse(await fs.readFile(cache, 'utf8'));
  legacy.version = 2;
  await fs.writeFile(cache, JSON.stringify(legacy));
  await compileLatex(source, pdf, { reuse: true });
  assert.equal(calls, 9, 'Unchanged PDFs from the old policy must be rebuilt');
  assert.equal(forced.at(-1), true);
  await compileLatex(source, pdf, { reuse: true });
  assert.equal(calls, 9, 'The rebuilt PDF becomes reusable');
  await fs.writeFile(cache, '{invalid JSON');
  await compileLatex(source, pdf, { reuse: true });
  assert.equal(calls, 10);
  fail = true;
  await fs.appendFile(source, '\nInvalid source');
  await assert.rejects(compileLatex(source, pdf, { reuse: true }), /LaTeX compilation failed/);
  await assert.rejects(fs.access(cache), { code: 'ENOENT' });
  await assert.rejects(compileLatex(source, pdf, { reuse: true }), /LaTeX compilation failed/);
  assert.equal(calls, 12, 'A failed compilation must not reuse the previous success');
});

test('preview does not reuse PDFs without complete dependency records', async t => {
  const { root, write } = await fixture(t);
  let calls = 0;
  t.mock.method(childProcess, 'execFile', (command, args, options, callback) => {
    calls++;
    write('content/lecture.pdf', samplePdf()).then(() => callback(null, '', ''), callback);
  });
  const source = path.join(root, 'content/lecture.tex'), pdf = path.join(root, 'content/lecture.pdf');
  await compileLatex(source, pdf, { reuse: true });
  await compileLatex(source, pdf, { reuse: true });
  assert.equal(calls, 2);
});

test('live LaTeX builds ignore generated outputs while watching source, bibliography and PDF-only changes', { timeout: 30_000 }, async t => {
  const { root, write } = await fixture(t);
  for (const directory of ['scripts', 'src/core', 'styles']) {
    await fs.cp(directory, path.join(root, directory), { recursive: true });
  }
  // Stub the compiler in the worker, writing fresh outputs on every invocation.
  await write('scripts/latex.mjs', `import fs from 'node:fs/promises';
export async function compileLatex(source, pdf, options) {
  if (!options?.reuse) throw new Error('Preview must enable LaTeX reuse');
  const counter = ${JSON.stringify(path.join(root, '.compile-count'))};
  const count = Number(await fs.readFile(counter, 'utf8').catch(() => '0')) + 1;
  await fs.writeFile(counter, String(count));
  await fs.writeFile(pdf, ${JSON.stringify(samplePdf())});
  await fs.writeFile(source.replace(/\\.tex$/, '.synctex.gz'), 'Generated synchronization data');
}
`);
  await write('content/refs.bib', 'Bibliography');
  await write('content/manual.pdf', samplePdf());
  const { createLiveSite } = await import(pathToFileURL(path.join(root, 'scripts/live.mjs')));
  const live = createLiveSite(root);
  let state = await live.refresh();
  assert.equal(state.error, '');
  assert.ok(state.snapshot.output.has('files/lecture.pdf'));
  assert.equal(await fs.readFile(path.join(root, '.compile-count'), 'utf8'), '1');
  const version = state.version;
  assert.equal((await live.refresh()).version, version);
  await write('content/refs.bib', 'Updated bibliography');
  state = await live.refresh();
  assert.equal(state.error, '');
  assert.equal(await fs.readFile(path.join(root, '.compile-count'), 'utf8'), '2');
  await write('content/lecture.tex', 'Updated source');
  await live.refresh();
  assert.equal(await fs.readFile(path.join(root, '.compile-count'), 'utf8'), '3');
  await write('content/manual.pdf', samplePdf({ text: 'Updated standalone PDF' }));
  await live.refresh();
  assert.equal(await fs.readFile(path.join(root, '.compile-count'), 'utf8'), '4');
  await assert.rejects(fs.access(path.join(root, 'public')));
});
