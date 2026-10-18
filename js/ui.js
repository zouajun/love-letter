/* =========================================================
   小工具：转义、提示、配色、下载
   ========================================================= */

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

export const HEART_SVG =
  '<svg class="amp" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8.5-5.4-8.5-11A4.9 4.9 0 0 1 12 6.3 4.9 4.9 0 0 1 20.5 10c0 5.6-8.5 11-8.5 11z" fill="currentColor"/></svg>';

export function toast(message, duration = 2400) {
  const root = document.getElementById('toastRoot');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  root.appendChild(el);
  window.setTimeout(() => {
    el.classList.add('is-out');
    window.setTimeout(() => el.remove(), 420);
  }, duration);
}

/** 带一个操作按钮的提示，比如「已删除 · 撤销」 */
export function toastAction(message, label, onAction, duration = 7000) {
  const root = document.getElementById('toastRoot');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast toast--act';

  const text = document.createElement('span');
  text.textContent = message;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toast-act';
  btn.textContent = label;

  const dismiss = () => {
    window.clearTimeout(timer);
    if (!el.isConnected) return;
    el.classList.add('is-out');
    window.setTimeout(() => el.remove(), 420);
  };

  btn.addEventListener('click', () => {
    dismiss();
    onAction();
  });

  el.append(text, btn);
  root.appendChild(el);
  const timer = window.setTimeout(dismiss, duration);
}

export function applyPalette(name) {
  document.body.dataset.palette = name || 'rose';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', name === 'dusk' ? '#f7f4f8' : '#fbf4ef');
}

export function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 简易图片灯箱 */
export function openLightbox(src, alt = '') {
  const wrap = document.createElement('div');
  wrap.className = 'lightbox';
  wrap.innerHTML = `<figure><img src="${esc(src)}" alt="${esc(alt)}"></figure><button type="button" aria-label="关闭">×</button>`;
  document.body.appendChild(wrap);
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  wrap.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => wrap.classList.add('is-in'));
}
