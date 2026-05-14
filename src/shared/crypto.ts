// Web Crypto helpers for AES-GCM with PBKDF2-derived keys.
// No third-party deps — all primitives via window.crypto.subtle.

const PBKDF2_ITERATIONS = 600_000;
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface EncryptedBlob {
  iterations: number;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
}

export async function encryptJson(passphrase: string, payload: unknown): Promise<EncryptedBlob> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt);
  const plaintext = enc.encode(JSON.stringify(payload));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext)
  );
  return {
    iterations: PBKDF2_ITERATIONS,
    saltB64: bytesToB64(salt),
    ivB64: bytesToB64(iv),
    ciphertextB64: bytesToB64(ct)
  };
}

export async function decryptJson<T>(passphrase: string, blob: EncryptedBlob): Promise<T> {
  const salt = b64ToBytes(blob.saltB64);
  const iv = b64ToBytes(blob.ivB64);
  const ct = b64ToBytes(blob.ciphertextB64);
  const key = await deriveKey(passphrase, salt);
  const ptBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource
  );
  return JSON.parse(dec.decode(ptBuf)) as T;
}
