import { randomBytes } from 'node:crypto';
import { encryptionIterations, passwordKey, encryptionParameters } from '../assets/crypto.js';

export async function encryptArticle(payload, password, context) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = await passwordKey(password, salt, 'encrypt');
  const ciphertext = await crypto.subtle.encrypt(encryptionParameters(iv, context), key, Buffer.from(JSON.stringify(payload)));
  return { version: 1, iterations: encryptionIterations, salt: salt.toString('base64'), iv: iv.toString('base64'), ciphertext: Buffer.from(ciphertext).toString('base64') };
}
