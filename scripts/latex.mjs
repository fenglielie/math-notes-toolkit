import fs from 'node:fs/promises';
import path from 'node:path';
import childProcess from 'node:child_process';

const engines = { xelatex: '-pdfxe', pdflatex: '-pdf', lualatex: '-pdflua' };
// Fix compiler-generated PDF dates and time-based IDs; explicit document dates stay intact.
const pdfEpoch = '946684800'; // 2000-01-01 UTC; independent of commits and file mtimes.

async function engineFor(source) {
  const firstLine = (await fs.readFile(source, 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
  const directive = firstLine.match(/^\s*%\s*!TEX\s+(?:TS-)?program\s*=\s*(.*?)\s*$/i);
  const engine = directive ? directive[1].toLowerCase() : 'xelatex';
  if (!Object.hasOwn(engines, engine)) throw new Error(source + ': Unsupported LaTeX engine "' + engine + '". Use xelatex, pdflatex, or lualatex.');
  return engine;
}

async function stamps(files) {
  return Promise.all(files.map(async file => {
    const stat = await fs.stat(file);
    return [file, stat.size, stat.mtimeMs, stat.ctimeMs];
  }));
}

async function dependencies(source) {
  const directory = path.dirname(source);
  const base = path.join(directory, '.aux', path.basename(source, path.extname(source)));
  const [fls, fdb] = await Promise.all([fs.readFile(base + '.fls', 'utf8'), fs.readFile(base + '.fdb_latexmk', 'utf8')]);
  const inputs = new Set([source]), outputs = new Set();
  for (const line of fls.split(/\r?\n/)) {
    const match = line.match(/^(INPUT|OUTPUT) (.+)$/);
    if (match) (match[1] === 'INPUT' ? inputs : outputs).add(path.resolve(directory, match[2]));
  }
  // latexmk also records BibTeX/Biber inputs that do not appear in TeX's recorder.
  for (const line of fdb.split(/\r?\n/)) {
    const match = line.match(/^  ("(?:[^"\\]|\\.)*") \d/);
    if (match) inputs.add(path.resolve(directory, JSON.parse(match[1])));
  }
  const aux = path.join(directory, '.aux') + path.sep;
  return {
    inputs: [...inputs].filter(file => !outputs.has(file) && !file.startsWith(aux)),
    records: [base + '.fls', base + '.fdb_latexmk']
  };
}

export async function compileLatex(source, pdf, { reuse = false } = {}) {
  const engine = await engineFor(source);
  const cacheFile = path.join(path.dirname(source), '.aux', path.basename(source) + '.preview-cache.json');
  let previous;
  try { previous = JSON.parse(await fs.readFile(cacheFile, 'utf8')); } catch { /* No usable cache. */ }
  const compatible = previous?.version === 3 && previous.engine === engine
    && previous.source === source && previous.pdf === pdf;
  if (reuse && compatible) {
    try {
      if (previous.stamps.length > 0
        && JSON.stringify(await stamps(previous.stamps.map(entry => entry[0]))) === JSON.stringify(previous.stamps)) return;
    } catch {
      // Missing or invalid cache entries always fall back to the compiler.
    }
  }
  // Never let a failed compilation leave a reusable success record behind.
  await fs.rm(cacheFile, { force: true });
  const directory = path.dirname(source), aux = path.join(directory, '.aux');
  await fs.mkdir(aux, { recursive: true });
  const portable = file => file.split(path.sep).join('/');
  // latexmk does not track environment changes: rebuild once when adopting this policy.
  const args = ['-cd', '-silent', '-file-line-error', '-halt-on-error', '-interaction=nonstopmode',
    '-synctex=1', ...(!compatible ? ['-g'] : []), engines[engine], '-auxdir=' + portable(aux), '-outdir=' + portable(directory), portable(source)];
  const started = performance.timeOrigin + performance.now();
  console.log('Compiling LaTeX (' + engine + '): ' + source);
  await new Promise((resolve, reject) => {
    childProcess.execFile('latexmk', args, {
      cwd: directory, windowsHide: true, timeout: 240_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, SOURCE_DATE_EPOCH: pdfEpoch, FORCE_SOURCE_DATE: '0' }
    }, (error, stdout, stderr) => {
      if (!error) return resolve();
      if (error.code === 'ENOENT') {
        return reject(new Error('latexmk was not found. Install a LaTeX distribution with latexmk and ' + engine + ', and ensure they are on PATH.', { cause: error }));
      }
      const details = [stderr, stdout].filter(Boolean).join('\n').trim().slice(-8000);
      reject(new Error('LaTeX compilation failed: ' + source + '\n' + error.message + (details ? '\n' + details : '')
        + '\nLog: ' + path.join(aux, path.basename(source, path.extname(source)) + '.log'), { cause: error }));
    });
  });
  let handle;
  try {
    handle = await fs.open(pdf, 'r');
    const header = Buffer.alloc(5);
    await handle.read(header, 0, header.length, 0);
    if (header.toString() !== '%PDF-') throw new Error('Invalid PDF header');
  } catch (error) {
    throw new Error('latexmk did not produce a valid PDF at ' + pdf + ': ' + error.message, { cause: error });
  } finally { await handle?.close(); }
  try {
    const { inputs, records } = await dependencies(source);
    const inputStamps = await stamps(inputs);
    // A source edited during compilation must be checked again on the next pass.
    if (inputStamps.some(entry => entry[2] > started)) return;
    const cache = { version: 3, engine, source, pdf, stamps: [...inputStamps, ...await stamps([pdf, ...records])] };
    await fs.writeFile(cacheFile, JSON.stringify(cache));
  } catch {
    // Dependency recording is an optimization; compilation remains authoritative.
  }
}
