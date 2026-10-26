/* =========================================================
   图片缓存：content.json 只存路径，本地用这份缓存直接显示
   （推送到 GitHub 之后、还没 git pull 的那段时间也不会裂图）
   缓存只保留 1 天，过期后自动回落到真实路径
   ========================================================= */

const KEY = 'loveletter.imgcache.v1';
const TTL_MS = 24 * 60 * 60 * 1000;

let mem = null;

function read() {
  if (mem) return mem;
  let raw = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch (err) {
    raw = {};
  }
  const now = Date.now();
  const alive = {};
  for (const path of Object.keys(raw)) {
    const item = raw[path];
    if (item && typeof item === 'object' && typeof item.src === 'string' && now - (item.at || 0) < TTL_MS) {
      alive[path] = item;
    }
  }
  mem = alive;
  return mem;
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(mem || {}));
  } catch (err) {
    // 存不下就算了，页面回落到真实路径
  }
}

export function resolveImage(src) {
  if (!src || src.startsWith('data:') || /^(https?:)?\/\//.test(src)) return src;
  const map = read();
  const hit = map[src];
  return hit && hit.src ? hit.src : src;
}

export function putImage(path, dataURL) {
  if (!path || !dataURL) return;
  const map = read();
  map[path] = { src: dataURL, at: Date.now() };
  write();
}

export function dropImage(path) {
  const map = read();
  if (path in map) {
    delete map[path];
    write();
  }
}

/** 只保留还在用的路径，避免缓存无限长大 */
export function pruneImages(usedPaths) {
  const keep = new Set(usedPaths);
  const map = read();
  let changed = false;
  for (const p of Object.keys(map)) {
    if (!keep.has(p)) {
      delete map[p];
      changed = true;
    }
  }
  if (changed) write();
}

export function allPaths(content) {
  const paths = [];
  if (!content) return paths;
  for (const ev of content.events || []) {
    for (const src of ev.images || []) paths.push(src);
  }
  if (content.settings && content.settings.cover) paths.push(content.settings.cover);
  return paths;
}
