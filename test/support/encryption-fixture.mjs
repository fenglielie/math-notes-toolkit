import fs from 'node:fs/promises';
import path from 'node:path';
import { copyTestAssets, samplePdf } from './fixtures.mjs';

export const testPassword = 'test-only-long-password-加密';
export const privateSlug = 'bbbbbbbbbbbb';
export const secretText = 'Confidential-body-9d8140';
export const secretHeading = 'Confidential-heading-9d8140';
export const secretPdfText = 'Confidential-PDF-9d8140';
export const secretImage = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><title>Confidential-image-9d8140</title><rect width="120" height="80" fill="teal"/></svg>';

export async function createEncryptionFixture(root) {
  await copyTestAssets(root);
  await fs.mkdir(path.join(root, 'content'), { recursive: true });
  await fs.writeFile(path.join(root, 'site.config.mjs'), "export default { title:'Test', base:'/sub/', url:'https://example.com' }");
  await fs.writeFile(path.join(root, 'content/public.md'), '---\ntitle: Public note\nslug: aaaaaaaaaaaa\n---\nPublic text. [Private article](private.md)');
  await fs.writeFile(path.join(root, 'content/private.md'), [
    '---', 'title: Encrypted example', 'lang: en', 'slug: ' + privateSlug,
    'password: ' + JSON.stringify(testPassword), 'tags: [Private]', 'pdf: private-document.pdf', '---',
    '## ' + secretHeading, secretText, '', '### Details',
    '$x^2 + y^2 = 1$', '', '$$\na^2+b^2=c^2\n$$', '',
    '```js\nconst secret = "Confidential-code-9d8140";\n```', '',
    '![Private figure](private-image.svg)', '', '[Attachment](private-file.txt)', '',
    'A footnote[^private].', '', '[^private]: Confidential-footnote-9d8140.'
  ].join('\n'));
  await fs.writeFile(path.join(root, 'content/private-image.svg'), secretImage);
  await fs.writeFile(path.join(root, 'content/private-file.txt'), 'Confidential-attachment-9d8140');
  await fs.writeFile(path.join(root, 'content/private-document.pdf'), samplePdf({ text: secretPdfText }));
}
