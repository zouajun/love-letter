/* =========================================================
   图片：读入 → 等比缩放 → 压缩成 dataURL（方便内联存储）
   ========================================================= */

const MAX_EDGE = 1400;
const TARGET_BYTES = 260 * 1024;
const HARD_LIMIT = 4 * 1024 * 1024;

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('这张图片打不开，换一张试试？'));
    img.src = dataUrl;
  });
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

/** 按最长边缩放后的尺寸 */
function fitSize(w, h, maxEdge) {
  if (w <= maxEdge && h <= maxEdge) return { w, h };
  const scale = maxEdge / Math.max(w, h);
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

const EXT_BY_MIME = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/avif': 'avif'
};

export function extOf(mime) {
  return EXT_BY_MIME[mime] || 'webp';
}

/** dataURL → 二进制 */
export function dataURLToBytes(dataURL) {
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(String(dataURL));
  if (!m) throw new Error('图片数据格式不对');
  const mime = m[1] || 'image/webp';
  if (m[2]) {
    const bin = atob(m[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime };
  }
  return { bytes: new TextEncoder().encode(decodeURIComponent(m[3])), mime };
}

/** 二进制 → base64（分块，避免栈溢出） */
export function bytesToBase64(bytes) {
  const CHUNK = 0x8000;
  let out = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

/** 文本 → base64（UTF-8） */
export function textToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}

export async function fileToCompactDataURL(file, { maxEdge = MAX_EDGE } = {}) {
  if (!file || !file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > 25 * 1024 * 1024) throw new Error('图片太大了（超过 25MB）');

  const raw = await readAsDataURL(file);
  const img = await loadImage(raw);
  const { w, h } = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height, maxEdge);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  let quality = 0.84;
  let src = canvas.toDataURL('image/webp', quality);

  while (src.length > TARGET_BYTES && quality > 0.5) {
    quality -= 0.09;
    src = canvas.toDataURL('image/webp', quality);
  }

  if (src.length > HARD_LIMIT) {
    const small = fitSize(w, h, 900);
    canvas.width = small.w;
    canvas.height = small.h;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, small.w, small.h);
    src = canvas.toDataURL('image/webp', 0.72);
  }

  return { src, width: canvas.width, height: canvas.height, bytes: src.length };
}
