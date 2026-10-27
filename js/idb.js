/* =========================================================
   解密后的照片放本地（IndexedDB）
   目的：同一张图第二次打开不再下载密文、不再解密
   存的是 Blob 本身，比 base64 小三分之一，读出来直接 createObjectURL
   ========================================================= */

const DB_NAME = 'loveletter.media';
const STORE = 'images';
const DB_VERSION = 1;
const MAX_ENTRIES = 400;    // 超过就删最旧的
const PRUNE_EVERY = 15;     // 每写这么多次检查一次

let dbPromise = null;
let disabled = false;
let writes = 0;

function open() {
  if (disabled) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      disabled = true;
      resolve(null);
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      disabled = true;
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'path' });
        store.createIndex('at', 'at');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      // 隐私模式、配额被禁等等，静默降级：就当没有缓存
      disabled = true;
      console.warn('本地图片缓存不可用：', req.error);
      resolve(null);
    };
  });

  return dbPromise;
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 读一张缓存的图，没有就返回 null */
export async function getBlob(path) {
  const db = await open();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE, 'readonly');
    const row = await request(tx.objectStore(STORE).get(path));
    if (!row || !row.blob) return null;
    return row.blob;
  } catch (err) {
    return null;
  }
}

/** 写一张缓存，失败就算了 */
export async function putBlob(path, blob) {
  const db = await open();
  if (!db || !blob) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ path, blob, at: Date.now() });
    writes += 1;
    if (writes % PRUNE_EVERY === 0) void prune();
  } catch (err) {
    /* 配额满了不影响浏览 */
  }
}

/** 只保留最新的 MAX_ENTRIES 张 */
export async function prune() {
  const db = await open();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const total = await request(store.count());
    if (total <= MAX_ENTRIES) return;
    let toDelete = total - MAX_ENTRIES;
    const cursorReq = store.index('at').openCursor();
    await new Promise((resolve) => {
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || toDelete <= 0) return resolve();
        cursor.delete();
        toDelete -= 1;
        cursor.continue();
      };
      cursorReq.onerror = () => resolve();
    });
  } catch (err) {
    /* 忽略 */
  }
}

/** 退出登录／丢弃草稿时清空 */
export async function clearBlobs() {
  const db = await open();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
  } catch (err) {
    /* 忽略 */
  }
}

/** 给调试用：缓存了多少张、占多少字节 */
export async function stats() {
  const db = await open();
  if (!db) return { count: 0, bytes: 0 };
  try {
    const tx = db.transaction(STORE, 'readonly');
    const rows = await request(tx.objectStore(STORE).getAll());
    return {
      count: rows.length,
      bytes: rows.reduce((n, r) => n + (r.blob ? r.blob.size : 0), 0)
    };
  } catch (err) {
    return { count: 0, bytes: 0 };
  }
}
