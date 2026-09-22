const encoder = new TextEncoder();
export const encryptionIterations = 600000;

export function decodeBase64(value) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

export async function passwordKey(password, salt, usage) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: encryptionIterations },
    material, { name: 'AES-GCM', length: 256 }, false, [usage]
  );
}

export function encryptionParameters(iv, context) {
  return { name: 'AES-GCM', iv, tagLength: 128, additionalData: encoder.encode('math-notes:v1:' + context) };
}

export async function decryptArticle(envelope, password, context) {
  if (envelope.version !== 1 || envelope.iterations !== encryptionIterations) throw new Error('Unsupported encryption format');
  const salt = decodeBase64(envelope.salt), iv = decodeBase64(envelope.iv);
  if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid encryption parameters');
  const key = await passwordKey(password, salt, 'decrypt');
  const plaintext = await crypto.subtle.decrypt(encryptionParameters(iv, context), key, decodeBase64(envelope.ciphertext));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
}
