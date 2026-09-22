import { getDocument, GlobalWorkerOptions } from './pdfjs/pdf.js';
import { EventBus, PDFLinkService, PDFViewer } from './pdfjs/viewer.js';

const container = document.querySelector('#pdf-container');
const status = document.querySelector('#pdf-status');
const resources = document.body.dataset.resources;
GlobalWorkerOptions.workerSrc = document.body.dataset.worker;
let passwordRequired = false;

function pdfSource() {
  if (document.body.dataset.file) return Promise.resolve(document.body.dataset.file);
  status.textContent = 'Unlock the article to view this PDF.';
  return new Promise(resolve => {
    const receive = event => {
      if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'math-notes-pdf') return;
      if (typeof event.data.url !== 'string' || !event.data.url.startsWith('blob:' + location.origin + '/')) return;
      window.removeEventListener('message', receive);
      resolve(event.data.url);
    };
    window.addEventListener('message', receive);
    if (parent !== window) parent.postMessage({ type: 'math-notes-pdf-ready' }, location.origin);
  });
}

try {
  const eventBus = new EventBus();
  const linkService = new PDFLinkService({ eventBus, externalLinkTarget: 2 });
  const viewer = new PDFViewer({
    container, eventBus, linkService, removePageBorders: true,
    imageResourcesPath: document.body.dataset.images,
    annotationMode: 1,
  });
  linkService.setViewer(viewer);
  const fitWidth = () => {
    if (!viewer.pagesCount) return;
    viewer.currentScaleValue = 'page-width';
    viewer.update();
  };
  eventBus.on('pagesinit', fitWidth);
  eventBus.on('pagerendered', ({ error }) => {
    status.hidden = !error;
    if (error) status.textContent = 'Could not render this page. Open or download the PDF to read it.';
  });
  // Measure the actual scroll area, including changes in window size and zoom.
  new ResizeObserver(fitWidth).observe(container);
  window.addEventListener('resize', fitWidth);
  const task = getDocument({
    url: await pdfSource(),
    cMapUrl: resources + 'cmaps/', cMapPacked: true,
    standardFontDataUrl: resources + 'standard_fonts/',
    wasmUrl: resources + 'wasm/',
    iccUrl: resources + 'iccs/',
    isEvalSupported: false,
  });
  task.onPassword = () => {
    passwordRequired = true;
    status.hidden = false;
    status.textContent = 'This PDF requires a password. Open or download it to continue.';
    task.destroy().catch(() => {});
  };
  const pdf = await task.promise;
  linkService.setDocument(pdf);
  viewer.setDocument(pdf);
} catch {
  status.hidden = false;
  if (!passwordRequired) status.textContent = 'Could not load the preview. Open or download the PDF to read it.';
}
