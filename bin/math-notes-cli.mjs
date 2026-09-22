#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/build.mjs';
import { configFileFromArgs } from '../scripts/config.mjs';

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'build' || command === 'build:latex') {
    await build({ root: process.cwd(), configFile: configFileFromArgs(args), latex: command === 'build:latex' });
  } else if (command === 'dev') {
    // The preview entry uses the caller's directory and the same configuration flags.
    process.argv = [process.argv[0], process.argv[1], ...args];
    await import('../scripts/serve.mjs');
  } else if (command === 'init') {
    if (args.length > 1) throw new Error('Usage: math-notes-cli init [directory]');
    const destination = path.resolve(args[0] || '.');
    const entries = await fs.readdir(destination).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    if (entries.some(entry => entry !== '.git')) throw new Error('The destination must be empty (an existing .git directory is allowed).');
    await fs.mkdir(destination, { recursive: true });
    await fs.cp(fileURLToPath(new URL('../starter/', import.meta.url)), destination, { recursive: true });
    await fs.rename(path.join(destination, 'gitignore'), path.join(destination, '.gitignore'));
    // Keep initialization usable with both local tarballs and future GitHub installs.
    const manifestPath = path.join(destination, 'package.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    console.log('Created site in ' + destination + '. Install your framework package here, then run npm run dev.');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  } else if (command === 'update') {
    if (args.length !== 1) throw new Error('Usage: math-notes-cli update <framework-source-directory>');
    const { syncPackage } = await import('../scripts/sync-package.mjs');
    await syncPackage('math-notes-cli', args[0]);
  } else if (!command || command === '--help' || command === '-h') {
    console.log('Usage: math-notes-cli <init [directory] | dev | build | build:latex | update <source-directory>> [--config path]');
  } else throw new Error('Unknown command: ' + command);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
