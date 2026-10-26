/* =========================================================
   加密小工具：PBKDF2 派生密钥 + AES-GCM 加解密
   只依赖浏览器自带的 WebCrypto，不引第三方库
   ========================================================= */

export const KDF_HASH = 'SHA-256';
export const KDF_ITERATIONS = 600000;
export const IV_BYTES = 12;
export const SALT_BYTES = 16;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function toBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode.apply(null, view.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromBase64(str) {
  const binary = atob(String(str || ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function randomBytes(n) {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

/** 口令 + 盐 → 用来包裹内容密钥的 KEK */
export async function deriveKEK(password, salt, iterations = KDF_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: KDF_HASH },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** 生成一把新的内容密钥（32 字节） */
export function newContentKey() {
  return randomBytes(32);
}

export async function importContentKey(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** 加密：返回 iv || 密文 */
export async function encryptBytes(key, bytes) {
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}

/** 解密：输入 iv || 密文 */
export async function decryptBytes(key, packed) {
  const view = packed instanceof Uint8Array ? packed : new Uint8Array(packed);
  if (view.length <= IV_BYTES) throw new Error('文件是空的或者坏了');
  const iv = view.subarray(0, IV_BYTES);
  const ct = view.subarray(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new Uint8Array(plain);
}

export async function encryptText(key, text) {
  return encryptBytes(key, textEncoder.encode(text));
}

export async function decryptText(key, packed) {
  return textDecoder.decode(await decryptBytes(key, packed));
}

/** 用 KEK 包住内容密钥，返回 base64(iv || 密文) */
export async function wrapKey(kek, rawContentKey) {
  return toBase64(await encryptBytes(kek, rawContentKey));
}

/** 解开包裹，拿回内容密钥的原始字节 */
export async function unwrapKey(kek, packedBase64) {
  return decryptBytes(kek, fromBase64(packedBase64));
}

/** data:image/...;base64,xxx → { bytes, mime } */
export function dataURLToBytes(dataURL) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataURL));
  if (!match) throw new Error('图片格式认不出来');
  const mime = match[1] || 'application/octet-stream';
  const isBase64 = !!match[2];
  const body = match[3];
  if (!isBase64) return { bytes: textEncoder.encode(decodeURIComponent(body)), mime };
  return { bytes: fromBase64(body), mime };
}
