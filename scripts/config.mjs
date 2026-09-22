import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export function configFileFromArgs(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { config: { type: 'string', default: 'site.config.mjs' } } });
  if (!values.config.trim()) throw new Error('--config must be a nonempty file path.');
  return values.config;
}

export async function loadConfig(root, configFile = 'site.config.mjs') {
  const file = path.resolve(root, configFile);
  const stat = await fs.stat(file, { bigint: true });
  return { ...(await import(pathToFileURL(file).href + '?v=' + stat.mtimeNs + '-' + stat.ctimeNs)).default };
}
