import { build } from './build.mjs';
import { configFileFromArgs } from './config.mjs';

Promise.resolve().then(() => build({ configFile: configFileFromArgs(), latex: true }))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
