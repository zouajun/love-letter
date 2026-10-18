/* =========================================================
   图片缓存：content.json 只存路径，本地用这份缓存直接显示
   （推送到 GitHub 之后、还没 git pull 的那段时间也不会裂图）
   ========================================================= */

const KEY = 'loveletter.imgcache.v1';

let mem = null;

function read() {
  if (mem) return mem;
  try {
    mem = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch (err) {
    mem = {};
  }
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
  return map[src] || src;
}

export function putImage(path, dataURL) {
  if (!path || !dataURL) return;
  const map = read();
  map[path] = dataURL;
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
