import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assetRoot = fileURLToPath(new URL('../../assets/', import.meta.url));

export async function copyTestAssets(root) {
  const destination = path.join(root, 'assets');
  await fs.mkdir(destination, { recursive: true });
  // Test real framework code, but supply our own icon instead of user branding.
  for (const entry of await fs.readdir(assetRoot, { withFileTypes: true })) {
    if (entry.isFile() && /\.(css|js)$/.test(entry.name)) {
      await fs.copyFile(path.join(assetRoot, entry.name), path.join(destination, entry.name));
    }
  }
  await fs.writeFile(path.join(destination, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>');
}

// Generate valid, searchable PDF bytes without demo attachments or a TeX installation.
export function samplePdf({ text = 'Searchable eigenvalue lecture', pages = 1 } = {}) {
  const content = 'BT /F1 12 Tf 50 750 Td (' + text.replace(/[\\()]/g, '\\$&') + ') Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [' + Array.from({ length: pages }, (_, i) => (4 + i * 2) + ' 0 R').join(' ') + '] /Count ' + pages + ' >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  for (let i = 0; i < pages; i++) objects.push(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + (5 + i * 2) + ' 0 R >>',
    '<< /Length ' + Buffer.byteLength(content) + ' >>\nstream\n' + content + '\nendstream'
  );
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
  }
  const xref = Buffer.byteLength(pdf), size = objects.length + 1;
  pdf += 'xref\n0 ' + size + '\n0000000000 65535 f \n' + offsets.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  return pdf + 'trailer\n<< /Size ' + size + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
}
