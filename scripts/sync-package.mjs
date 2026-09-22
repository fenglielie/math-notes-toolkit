import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const execute = promisify(execFile);

// Local release transport. Source remains in its own repository; consumers install snapshots.
export async function syncPackage(name, sourceArgument) {
  if (!sourceArgument) throw new Error('Supply the source repository directory.');
  const source = path.resolve(sourceArgument), destination = process.cwd();
  const sourceManifest = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
  if (sourceManifest.name !== name) throw new Error('Expected package ' + name + ', got ' + sourceManifest.name);
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run this command through npm run so npm_execpath is available.');
  const run = async (args, cwd) => {
    const result = await execute(process.execPath, [npm, ...args], { cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    if (result.stderr) process.stderr.write(result.stderr);
    return result.stdout;
  };
  process.stdout.write(await run(['run', 'check'], source));
  const cache = path.join(destination, '.cache');
  await fs.mkdir(cache, { recursive: true });
  const temporary = await fs.mkdtemp(path.join(cache, 'package-'));
  // The check above validates the source; pack without executing the same checks again.
  const packed = JSON.parse(await run(['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], source))[0];
  const data = await fs.readFile(path.join(temporary, packed.filename));
  const digest = createHash('sha256').update(data).digest('hex').slice(0, 12);
  const filename = name + '-' + sourceManifest.version + '-' + digest + '.tgz';
  const vendor = path.join(destination, 'vendor');
  await fs.mkdir(vendor, { recursive: true });
  await fs.writeFile(path.join(vendor, filename), data);
  const file = path.join(destination, 'package.json');
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
  const previous = manifest.dependencies?.[name];
  manifest.dependencies ??= {};
  manifest.dependencies[name] = 'file:vendor/' + filename;
  await fs.writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(await run(['install'], destination));
  // Remove only the superseded artifact previously referenced by this dependency.
  if (previous?.startsWith('file:vendor/') && previous !== manifest.dependencies[name]) {
    const old = path.resolve(destination, previous.slice(5));
    if (path.dirname(old) === vendor && old.endsWith('.tgz') && !Object.values(manifest.dependencies).includes(previous)) {
      await fs.unlink(old).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  console.log('Updated ' + name + '. Review package.json, package-lock.json, and vendor/.');
}
