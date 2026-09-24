import { decodeBase64, decryptArticle } from './crypto.js';

export function initializeEncryption(initializeArticle) {
  const form = document.querySelector('.unlock-form');
  const encoded = document.querySelector('#encrypted-article');
  if (!form || !encoded) return;
  const input = form.querySelector('input'), button = form.querySelector('button');
  const status = form.querySelector('[role="alert"]');
  if (!globalThis.crypto?.subtle) {
    status.textContent = 'Unlocking requires HTTPS or localhost and a browser with Web Crypto support.';
    return;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    input.disabled = true;
    button.textContent = 'Unlocking…';
    status.textContent = '';
    const urls = [];
    try {
      const payload = await decryptArticle(JSON.parse(encoded.textContent), input.value, encoded.dataset.context);
      const assets = new Map(payload.attachments.map(file => {
        const url = URL.createObjectURL(new Blob([decodeBase64(file.data)], { type: file.type }));
        urls.push(url);
        return [file.id, { ...file, url }];
      }));
      const template = document.createElement('template');
      template.innerHTML = payload.html;
      for (const element of template.content.querySelectorAll('[href], [src], [data-pdf-source]')) {
        for (const attribute of ['href', 'src', 'data-pdf-source']) {
          const value = element.getAttribute(attribute);
          const match = value?.match(/^(urn:math-notes:asset:\d+)(?:\?[^#]*)?(#.*)?$/);
          if (!match) continue;
          const file = assets.get(match[1]);
          if (!file) throw new Error('Missing encrypted attachment');
          element.setAttribute(attribute, file.url + (match[2] || ''));
          if (attribute === 'href' && (element.hasAttribute('download') || file.type === 'application/octet-stream')) element.setAttribute('download', file.name);
        }
      }
      window.addEventListener('message', event => {
        if (event.origin !== location.origin || event.data?.type !== 'math-notes-pdf-ready') return;
        const frame = [...document.querySelectorAll('iframe[data-pdf-source]')].find(frame => frame.contentWindow === event.source);
        if (frame) event.source.postMessage({ type: 'math-notes-pdf', url: frame.dataset.pdfSource }, location.origin);
      });
      const style = document.createElement('style');
      style.textContent = payload.css;
      document.head.append(style);
      input.value = '';
      document.querySelector('.encrypted-note').replaceWith(template.content);
      initializeArticle();
      const heading = document.querySelector('.article-header h1');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      try {
        const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        target?.scrollIntoView({ block: 'start' });
      } catch { /* Ignore malformed fragment identifiers. */ }
      window.addEventListener('pagehide', event => {
        if (!event.persisted) urls.forEach(url => URL.revokeObjectURL(url));
      });
    } catch {
      urls.forEach(url => URL.revokeObjectURL(url));
      status.textContent = 'Incorrect password or damaged content. Please try again.';
      input.disabled = false;
      input.focus();
    } finally {
      button.disabled = false;
      button.textContent = 'Unlock';
    }
  });
  input.disabled = false;
  button.disabled = false;
}
