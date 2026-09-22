import { texPackages, texOptions } from '../../src/core/preset.mjs';

(() => {
  if (window.markdownMathPreview) return;
  window.markdownMathPreview = true;
  const entry = document.currentScript;
  const vendor = new URL('./vendor/', entry.src);
  const nonce = entry.nonce;
  let errors = [];
  const loadScript = url => new Promise((resolve, reject) => {
    if (!url.startsWith(vendor.href)) return reject(new Error('Only bundled MathJax resources are allowed.'));
    const script = document.createElement('script');
    script.src = url;
    script.nonce = nonce;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load local MathJax resource: ' + url));
    document.head.append(script);
  });
  let ready;
  function ensureMathJax() {
    if (ready) return ready;
    window.MathJax = {
      loader: {
        paths: { mathjax: new URL('mathjax/', vendor).href.replace(/\/$/, ''), fonts: vendor.href.replace(/\/$/, '') },
        load: ['input/tex-base', 'output/svg', ...texPackages.filter(name => name !== 'base').map(name => '[tex]/' + name)],
        require: loadScript
      },
      tex: {
        packages: [...texPackages],
        ...texOptions,
        formatError(jax, error) { errors.push(error.message); return jax.formatError(error); }
      },
      svg: { fontCache: 'local' },
      startup: { typeset: false }
    };
    ready = loadScript(new URL('mathjax/startup.js', vendor).href).then(() => MathJax.startup.promise);
    return ready;
  }
  let generation = 0;
  let queue = Promise.resolve();
  function schedule() {
    const version = ++generation;
    queue = queue.then(async () => {
      if (version !== generation) return;
      const root = document.querySelector('.markdown-body') || document.body;
      root.querySelectorAll('.markdown-math-typeset-error').forEach(node => node.remove());
      const targets = [...root.querySelectorAll('.markdown-math-tex')];
      if (!targets.length) return;
      let staging;
      try {
        await ensureMathJax();
        if (version !== generation) return;
        // A fresh TeX input processor prevents macros and labels leaking between notes.
        MathJax.typesetClear();
        MathJax.startup.getComponents();
        errors = [];
        staging = document.createElement('div');
        for (const target of targets) {
          const node = document.createElement(target.dataset.display ? 'div' : 'span');
          node.textContent = target.dataset.display ? '\\[' + target.dataset.tex + '\\]' : '\\(' + target.dataset.tex + '\\)';
          staging.append(node);
        }
        // Render off the live DOM so older edits cannot overwrite a newer preview.
        await MathJax.typesetPromise([staging]);
        if (version !== generation || targets.some(node => !node.isConnected)) return;
        const anchor = [...root.querySelectorAll('.code-line[data-line]')]
          .find(node => node.getBoundingClientRect().bottom >= 0 && node.getBoundingClientRect().height > 0);
        const top = anchor?.getBoundingClientRect().top;
        targets.forEach((target, index) => {
          target.replaceChildren(...staging.children[index].childNodes);
          for (const math of target.querySelectorAll('mjx-container')) {
            math.setAttribute('role', 'img');
            math.setAttribute('aria-label', target.dataset.tex);
          }
          target.dataset.typeset = 'true';
        });
        if (anchor) window.scrollBy(0, anchor.getBoundingClientRect().top - top);
        window.dispatchEvent(new Event('resize'));
        if (errors.length) throw new Error('LaTeX: ' + [...new Set(errors)].join('; '));
      } catch (error) {
        if (version !== generation) return;
        const notice = document.createElement('pre');
        notice.className = 'markdown-math-error markdown-math-typeset-error';
        notice.setAttribute('role', 'alert');
        notice.textContent = error.message;
        root.prepend(notice);
      } finally {
        if (staging && MathJax.typesetClear) MathJax.typesetClear([staging]);
      }
    });
  }
  window.addEventListener('vscode.markdown.updateContent', schedule);
  function start() {
    if (document.querySelector('.markdown-body')) return schedule();
    // VS Code's own async script inserts the first article without an update event.
    // Observe only until that root exists, avoiding reactions to our own typesetting.
    const initialContent = new MutationObserver(() => {
      if (!document.querySelector('.markdown-body')) return;
      initialContent.disconnect();
      schedule();
    });
    initialContent.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('pagehide', () => initialContent.disconnect(), { once: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
