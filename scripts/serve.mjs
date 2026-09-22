import http from 'node:http';
import path from 'node:path';
import { createLiveSite } from './live.mjs';
import { configFileFromArgs } from './config.mjs';

const root = process.cwd();
const live = createLiveSite(root, { configFile: configFileFromArgs() });
let timer;
const reloadScript = version => '<script>const v=' + version + ';setInterval(async()=>{try{const n=await(await fetch("/__version",{cache:"no-store"})).json();if(v!==n.version)location.reload()}catch{}},700)</script>';
const escape = text => String(text).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.gif': 'image/gif', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  try {
    const url = new URL(req.url, 'http://localhost');
    const { snapshot, error, version } = await live.refresh();
    if (url.pathname === '/__version') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ version }));
      return;
    }
    if (error) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : '<!doctype html><html lang="en"><meta charset="utf-8"><title>Build failed</title><h1>Build failed</h1><pre>' + escape(error) + '</pre><p>Fix the source file; this page will reload automatically.</p>' + reloadScript(version) + '</html>');
      return;
    }
    const { config, output } = snapshot;
    if (!url.pathname.startsWith(config.base)) { res.writeHead(302, { Location: config.base }); res.end(); return; }
    const relative = decodeURIComponent(url.pathname.slice(config.base.length));
    let file = !relative || relative.endsWith('/') ? relative + 'index.html' : relative;
    let status = file === '404.html' ? 404 : 200;
    if (relative && !relative.endsWith('/') && output.has(relative + '/index.html')) {
      res.writeHead(302, { Location: url.pathname + '/' + url.search }); res.end(); return;
    }
    if (!output.has(file)) { file = '404.html'; status = 404; }
    let body = output.get(file);
    const ext = path.extname(file);
    if (ext === '.html') {
      body = Buffer.from(body.toString().replace('</body>', reloadScript(version) + '</body>'));
    }
    const headers = { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    // Native PDF viewers use byte-range requests for large documents.
    if (ext === '.pdf') {
      headers['Accept-Ranges'] = 'bytes';
      const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
      if (range) {
        const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
        if (start > end || start >= body.length) { res.writeHead(416, { 'Content-Range': 'bytes */' + body.length }); res.end(); return; }
        headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + body.length;
        body = body.subarray(start, end + 1); status = 206;
      }
    }
    headers['Content-Length'] = body.length;
    res.writeHead(status, headers); res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(400); res.end('Bad request'); }
});
let port = Number(process.env.PORT || 4321);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}
const lastPort = Math.min(port + 20, 65535);
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    if (port < lastPort) {
      console.log('Port ' + port + ' is in use; trying ' + (port + 1) + '...');
      port++;
      server.listen(port, '127.0.0.1');
      return;
    }
    console.error('All attempted ports are in use. Set PORT to a different starting port.');
  } else {
    console.error('Preview server failed: ' + error.message);
  }
  process.exitCode = 1;
});
server.on('listening', async () => {
  timer = setInterval(() => live.refresh().catch(error => console.error(error.message)), 500);
  try {
    const { snapshot } = await live.refresh();
    console.log('Preview: http://localhost:' + port + (snapshot?.config.base || '/') + ' (live build and auto-reload enabled)');
  } catch (error) { console.error('Preview initialization failed: ' + error.message); }
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  clearInterval(timer);
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
server.listen(port, '127.0.0.1');
