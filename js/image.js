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
