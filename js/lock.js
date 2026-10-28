/* =========================================================
   门锁：一个公开的 lock.json + 两个账号，内容全部是密文
   口令不进任何文件，只在本地派生出解开包裹的钥匙
   ========================================================= */

import {
  deriveKEK, importContentKey, newContentKey, unwrapKey, wrapKey,
  encryptBytes, decryptBytes, encryptText, decryptText, toBase64, fromBase64,
  dataURLToBytes
} from './crypto.js';
import { getBlob, putBlob, clearBlobs } from './idb.js';

export const LOCK_PATH = 'lock.json';
export const CONTENT_ENC = 'data/content.enc';
export const SESSION_KEY = 'loveletter.session.v1';
export const SESSION_DAYS = 7;
const NAMES_KEY = 'loveletter.names.v1';

const MIME_BY_EXT = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif'
};

let lockDoc = null;
let contentKey = null;      // CryptoKey
let contentKeyRaw = null;   // Uint8Array
let currentAccount = null;

const blobURLs = new Map();   // 明文路径 → objectURL
const blobPending = new Map(); // 明文路径 → Promise

/* ---------------- lock.json ---------------- */

export async function loadLock() {
  const res = await fetch(`${LOCK_PATH}?t=${Date.now()}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`读不到 ${LOCK_PATH}（HTTP ${res.status}）`);
  lockDoc = await res.json();
  return lockDoc;
}

/** 登录页显示的名字：优先用界面上改过的，其次才用 lock.json 里存的 */
function nameOverrides() {
  try {
    const raw = JSON.parse(localStorage.getItem(NAMES_KEY) || 'null');
    return Array.isArray(raw) ? raw : null;
  } catch (err) {
    return null;
  }
}

export function accounts() {
  const over = nameOverrides();
  return (lockDoc && Array.isArray(lockDoc.accounts) ? lockDoc.accounts : []).map((a, i) => ({
    id: a.id,
    name: (over && over[i]) || a.name || a.id,
    hint: a.hint || ''
  }));
}

/** 界面上改了名字：先换掉登录页的显示名，发布时再写进 lock.json */
export function rememberNames(names) {
  const clean = (names || []).map((n) => String(n || '').trim());
  if (!clean.some(Boolean)) return;
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(clean));
  } catch (err) {
    /* 存不下也没关系，下次发布还会写一遍 */
  }
  if (currentAccount && lockDoc && Array.isArray(lockDoc.accounts)) {
    const idx = lockDoc.accounts.findIndex((a) => a.id === currentAccount.id);
    if (idx >= 0 && clean[idx]) currentAccount = { ...currentAccount, name: clean[idx] };
  }
}

/** 名字和 lock.json 里不一样时，返回改过名字的 lock.json 对象 */
export function lockJsonWithNames(names) {
  if (!lockDoc) return null;
  const next = JSON.parse(JSON.stringify(lockDoc));
  let changed = false;
  (next.accounts || []).forEach((a, i) => {
    const name = String((names || [])[i] || '').trim();
    if (name && name !== a.name) {
      a.name = name;
      changed = true;
    }
  });
  return changed ? next : null;
}

export function isUnlocked() {
  return !!contentKey;
}

export function currentUser() {
  if (!currentAccount) return null;
  /* 名字可能被改过（存在 localStorage），对外一律用最新的那个 */
  const list = accounts();
  const hit = list.find((a) => a.id === currentAccount.id);
  return { id: currentAccount.id, name: (hit && hit.name) || currentAccount.name };
}

/* ---------------- 解锁 / 记住设备 ---------------- */

export async function unlock(accountId, password) {
  if (!lockDoc) throw new Error('还没读到 lock.json');
  const account = (lockDoc.accounts || []).find((a) => a.id === accountId);
  if (!account) throw new Error('没有这个账号');

  const kdf = lockDoc.kdf || {};
  const kek = await deriveKEK(password, fromBase64(account.salt), kdf.iterations);
  let raw;
  try {
    raw = await unwrapKey(kek, account.wrappedKey);
  } catch (err) {
    throw new Error('口令不对');
  }

  contentKeyRaw = raw;
  contentKey = await importContentKey(raw);
  currentAccount = { id: account.id, name: account.name || account.id };
  blobURLs.forEach((url) => URL.revokeObjectURL(url));
  blobURLs.clear();
  blobPending.clear();
  return currentAccount;
}

export function rememberSession(days = SESSION_DAYS) {
  if (!contentKeyRaw) return;
  const payload = {
    account: currentAccount,
    k: toBase64(contentKeyRaw),
    exp: Date.now() + days * 24 * 3600 * 1000
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch (err) {
    /* 存不下就算了，下次再输口令 */
  }
}

export async function restoreSession() {
  let payload = null;
  try {
    payload = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch (err) {
    payload = null;
  }
  if (!payload || !payload.k || !payload.exp || Date.now() > payload.exp) {
    forgetSession();
    return null;
  }
  try {
    const raw = fromBase64(payload.k);
    contentKeyRaw = raw;
    contentKey = await importContentKey(raw);
    currentAccount = payload.account || null;
    return currentAccount;
  } catch (err) {
    forgetSession();
    return null;
  }
}

export function forgetSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (err) {
    /* 忽略 */
  }
  contentKey = null;
  contentKeyRaw = null;
  currentAccount = null;
  blobURLs.forEach((url) => URL.revokeObjectURL(url));
  blobURLs.clear();
  blobPending.clear();
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  // 钥匙没了，本地那份明文缓存也不该留着
  void clearBlobs();
}

/* ---------------- 内容 ---------------- */

export async function readContent() {
  const res = await fetch(`${CONTENT_ENC}?t=${Date.now()}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`读不到 ${CONTENT_ENC}（HTTP ${res.status}）`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const text = await decryptText(contentKey, buf);
  return JSON.parse(text);
}

export async function encryptJSON(obj) {
  return encryptBytes(contentKey, new TextEncoder().encode(JSON.stringify(obj)));
}

export async function encryptBinary(bytes) {
  if (!contentKey) throw new Error('还没有解锁');
  return encryptBytes(contentKey, bytes);
}

/* ---------------- 图片 ---------------- */

export function securePath(path) {
  return `${path}.enc`;
}

function mimeOf(path) {
  const clean = String(path).split('?')[0];
  const ext = clean.slice(clean.lastIndexOf('.') + 1).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

/** 1×1 透明像素：图还没解出来时先占住位置，避免破图标和 alt 文字 */
export const BLANK_PIXEL =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22/%3E';

/** 内存里已经解好的图，没有就返回 '' */
export function imageSrc(path) {
  if (!path) return '';
  if (/^(data:|blob:|https?:)/.test(path)) return path;
  return blobURLs.get(path) || '';
}

/** 内存 → 本地缓存 → 下载并解密；同一张图只会跑一次 */
function ensureUrl(path) {
  const hit = blobURLs.get(path);
  if (hit) return Promise.resolve(hit);
  const running = blobPending.get(path);
  if (running) return running;

  const job = (async () => {
    const cached = await getBlob(path);
    if (cached) {
      const url = URL.createObjectURL(cached);
      blobURLs.set(path, url);
      return url;
    }
    const res = await fetch(`${securePath(path)}?t=${Date.now()}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`读不到 ${securePath(path)}（HTTP ${res.status}）`);
    const plain = await decryptBytes(contentKey, new Uint8Array(await res.arrayBuffer()));
    const blob = new Blob([plain], { type: mimeOf(path) });
    const url = URL.createObjectURL(blob);
    blobURLs.set(path, url);
    void putBlob(path, blob);
    return url;
  })().finally(() => blobPending.delete(path));

  blobPending.set(path, job);
  return job;
}

/* ---------- 懒解密：滚到附近才开始下载、解密 ---------- */

const DEVELOP_HOST = 'figure, .thumb';
let observer = null;

function getObserver() {
  if (observer) return observer;
  if (typeof IntersectionObserver === 'undefined') return null;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        void reveal(entry.target);
      }
    },
    { rootMargin: '520px 0px', threshold: 0.01 }
  );
  return observer;
}

/** 把一张图解密并淡入 */
async function reveal(img) {
  if (!img.isConnected || !img.dataset.sec) return;
  const path = img.dataset.sec;
  delete img.dataset.sec;
  const host = img.closest(DEVELOP_HOST);

  const settle = (ok) => {
    img.classList.remove('is-pending');
    img.classList.add(ok ? 'is-loaded' : 'is-broken');
    if (host) setTimeout(() => host.classList.remove('is-developing'), ok ? 620 : 0);
  };

  try {
    const url = await ensureUrl(path);
    if (!img.isConnected) return;
    img.addEventListener('load', () => settle(true), { once: true });
    img.addEventListener('error', () => settle(false), { once: true });
    img.src = url;
    if (img.complete && img.naturalWidth > 0) settle(true);
  } catch (err) {
    settle(false);
    console.warn('图片解密失败：', path, err);
  }
}

/** 给 root 里还没解密的图挂上观察；真到视口附近才去下载和解密 */
export function hydrate(root) {
  if (!root || !contentKey) return;
  const imgs = root.querySelectorAll('img[data-sec]');
  if (!imgs.length) return;

  const io = getObserver();
  for (const img of imgs) {
    if (img.dataset.watch) continue;
    img.dataset.watch = '1';
    if (!img.classList.contains('is-loaded')) img.classList.add('is-pending');
    const host = img.closest(DEVELOP_HOST);
    if (host) host.classList.add('is-developing');
    if (io) io.observe(img);
    else void reveal(img);
  }
}

/** 已经解出来的图片，先塞进内存和本地缓存，省一次解密 */
export function putImage(path, dataURL) {
  if (!path || !dataURL) return;
  const old = blobURLs.get(path);
  if (old && old !== dataURL) URL.revokeObjectURL(old);
  blobURLs.set(path, dataURL);
  try {
    const { bytes, mime } = dataURLToBytes(dataURL);
    void putBlob(path, new Blob([bytes], { type: mime || mimeOf(path) }));
  } catch (err) {
    /* 格式认不出来就不缓存，不影响显示 */
  }
}

/* ---------------- 改口令（以后可能会用到） ---------------- */

/** 用当前的密钥 + 新口令，生成一条新的账号记录 */
export async function makeAccountRecord(id, name, password) {
  if (!contentKeyRaw) throw new Error('还没有解锁');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveKEK(password, salt);
  const wrapped = await wrapKey(kek, contentKeyRaw);
  return {
    id,
    name,
    salt: toBase64(salt),
    wrappedKey: wrapped
  };
}

export async function sealWithNewKey(text) {
  const raw = newContentKey();
  const key = await importContentKey(raw);
  const packed = await encryptText(key, text);
  return { raw, packed };
}
