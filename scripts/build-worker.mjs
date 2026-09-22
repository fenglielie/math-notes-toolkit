import { parentPort, workerData } from 'node:worker_threads';
import { generate } from './build.mjs';

try {
  const { config, output, posts } = await generate(workerData);
  parentPort.postMessage({ config, output, count: posts.length });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
