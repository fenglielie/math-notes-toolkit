import fs from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { loadConfig } from './config.mjs';
import { contentRoots } from './content.mjs';

async function fingerprint(root, configFile) {
  const entries = [];
  async function scan(relative) {
    const file = path.resolve(root, relative);
    let stat;
    try { stat = await fs.lstat(file, { bigint: true }); }
    catch (error) { if (error.code === 'ENOENT') { entries.push(relative + ':missing'); return; } throw error; }
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(file)).sort()) {
        if (!name.startsWith('.') && !(relative === '' && ['node_modules', 'public'].includes(name))) await scan(path.join(relative, name));
      }
    } else {
      if (/\.synctex\.gz$/i.test(file)) return;
      if (/\.pdf$/i.test(file)) {
        try {
          if ((await fs.lstat(file.replace(/\.pdf$/i, '.tex'))).isFile()) return;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      entries.push(relative + ':' + stat.size + ':' + stat.mtimeNs + ':' + stat.ctimeNs);
    }
  }
  // Icons may live anywhere in the project; ignore generated output and dependencies.
  await scan('');
  await scan(path.relative(root, path.resolve(root, configFile)));
  // Configured content may also live outside the project or in hidden folders.
  let roots = [];
  try {
    const config = await loadConfig(root, configFile);
    roots = contentRoots(root, config);
  } catch {
    // Compilation reports invalid configuration; project scanning detects repairs.
  }
  for (const directory of roots) await scan(path.relative(root, directory));
  return entries.join('\n');
}

function compile(root, configFile) {
  // A fresh worker loads current templates and dependencies without module caching.
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./build-worker.mjs', import.meta.url), { workerData: { root, configFile, includeDrafts: true, latex: true, reuseLatex: true } });
    let settled = false;
    worker.once('message', result => {
      settled = true;
      worker.terminate();
      if (result.error) reject(new Error(result.error));
      else resolve({ ...result, output: new Map([...result.output].map(([key, value]) => [key, Buffer.from(value)])) });
    });
    worker.once('error', reject);
    worker.once('exit', code => { if (!settled) reject(new Error('Build worker exited before producing output (code ' + code + ')')); });
  });
}

export function createLiveSite(root, { configFile = 'site.config.mjs' } = {}) {
  let signature, flight, snapshot, error = '', version = Date.now();
  async function update() {
    // Changes during a build trigger another pass before readers see the result.
    for (;;) {
      const current = await fingerprint(root, configFile);
      if (current === signature) return { snapshot, error, version };
      try {
        snapshot = await compile(root, configFile);
        error = '';
        console.log('Built ' + snapshot.count + ' notes in memory.');
      } catch (failure) {
        error = failure.message;
        console.error('Build failed: ' + error);
      }
      signature = current;
      version++;
    }
  }
  return {
    refresh() {
      if (!flight) flight = update().finally(() => { flight = null; });
      return flight;
    }
  };
}
