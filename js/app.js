/* =========================================================
   程序员的情书 · 主逻辑
   ========================================================= */

import { loadInitial, writeDraft } from './store.js';
import { buildTimeline } from './content.js';
import { renderLeft, renderRight } from './render.js';
import { applyPalette, toast, openLightbox } from './ui.js';
import { createEditor } from './editor.js';
import { countdown, pad } from './date.js';

const $ = (id) => document.getElementById(id);

let content = null;
let tl = null;
let editor = null;

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

function reveal(animate) {
  const root = $('rightPane');
  const els = [...root.querySelectorAll('.tl-item, .tl-year, .tl-now')];
  if (!animate || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    },
    { root, rootMargin: '0px 0px -5% 0px', threshold: 0.04 }
  );
  els.forEach((el) => io.observe(el));
}

function paint({ animate = true } = {}) {
  if (!content) return;
  const lp = $('leftPane');
  const rp = $('rightPane');
  const ls = lp.scrollTop;
  const rs = rp.scrollTop;

  tl = buildTimeline(content);
  applyPalette(content.settings.palette);
  renderLeft(lp, content, tl);
  renderRight(rp, content, tl);

  lp.scrollTop = ls;
  rp.scrollTop = rs;

  reveal(animate);
  syncChips();
}

function paintLeftOnly() {
  if (!content) return;
  const lp = $('leftPane');
  const ls = lp.scrollTop;
  renderLeft(lp, content, tl);
  lp.scrollTop = ls;
}

/* ------------------------------------------------------------------ */
/* 年份快捷条                                                          */
/* ------------------------------------------------------------------ */

function syncChips() {
  const rp = $('rightPane');
  const years = [...rp.querySelectorAll('.tl-year')];
  const chips = [...rp.querySelectorAll('.year-chip[data-year]')];
  if (!years.length || !chips.length) return;

  const edge = rp.getBoundingClientRect().top + 110;
  let active = null;
  for (const y of years) {
    if (y.getBoundingClientRect().top <= edge) active = y.dataset.year;
  }
  chips.forEach((c) => c.classList.toggle('is-active', c.dataset.year === active));

  const nowChip = rp.querySelector('.year-chip--now');
  const nowEl = $('tlNow');
  if (nowChip && nowEl) {
    const r = nowEl.getBoundingClientRect();
    const pr = rp.getBoundingClientRect();
    nowChip.classList.toggle('is-active', r.top > pr.top && r.top < pr.bottom);
  }
}

function scrollToEl(el) {
  const pane = $('rightPane');
  if (!pane || !el) return;
  const top = el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 26;
  pane.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

/* ------------------------------------------------------------------ */
/* 飘落的心                                                            */
/* ------------------------------------------------------------------ */

function spawnPetals() {
  const host = $('petals');
  if (!host) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const count = window.innerWidth < 880 ? 7 : 12;
  const heart =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8.5-5.4-8.5-11A4.9 4.9 0 0 1 12 6.3 4.9 4.9 0 0 1 20.5 10c0 5.6-8.5 11-8.5 11z"/></svg>';
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement('span');
    el.className = 'petal';
    const size = 7 + Math.random() * 12;
    el.style.cssText = [
      `left:${(Math.random() * 100).toFixed(2)}%`,
      `width:${size.toFixed(1)}px`,
      `height:${size.toFixed(1)}px`,
      `--dur:${(17 + Math.random() * 15).toFixed(1)}s`,
      `--delay:${(-Math.random() * 26).toFixed(1)}s`,
      `--o:${(0.1 + Math.random() * 0.2).toFixed(2)}`,
      `--dx:${(Math.random() * 180 - 70).toFixed(0)}px`,
      `--rot:${(Math.random() * 720 - 360).toFixed(0)}deg`
    ].join(';');
    el.innerHTML = heart;
    host.appendChild(el);
  }
}

/* ------------------------------------------------------------------ */
/* 编辑器                                                              */
/* ------------------------------------------------------------------ */

function openEditor() {
  if (!content) {
    toast('内容还在路上，稍等一下');
    return;
  }
  if (!editor) {
    editor = createEditor({
      root: $('editorRoot'),
      onApply(next, changed) {
        content = next;
        if (changed) writeDraft(content);
        paint({ animate: false });
      }
    });
  }
  editor.open(content);
}

/* ------------------------------------------------------------------ */
/* 载入                                                                */
/* ------------------------------------------------------------------ */

function loadingHTML(text) {
  return `<div class="loading"><span class="loading-heart" aria-hidden="true"></span><p>${text}</p></div>`;
}

function errorHTML(message) {
  return `
    <div class="loading">
      <span class="loading-heart" aria-hidden="true"></span>
      <p>信纸没找到……</p>
      <p style="max-width:26em;line-height:1.9;letter-spacing:.02em;text-align:center">
        ${message}<br><br>
        如果你是把 index.html 直接双击打开的，浏览器会禁止读取本地 JSON。<br>
        请用本地服务器预览：在项目目录运行 <code>python -m http.server 8000</code>，再访问 <code>http://localhost:8000</code>。
      </p>
    </div>`;
}

async function boot() {
  document.documentElement.classList.add('js-reveal');
  spawnPetals();

  document.addEventListener('click', (e) => {
    const fab = e.target.closest('#editFab');
    if (fab) {
      openEditor();
      return;
    }

    const chip = e.target.closest('.year-chip');
    if (chip) {
      if (chip.dataset.jump === 'now') scrollToEl($('tlNow'));
      else scrollToEl(document.getElementById(`y${chip.dataset.year}`));
      return;
    }

    const img = e.target.closest('.tl-photos img, .polaroid img');
    if (img) openLightbox(img.src, img.alt);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      openEditor();
    }
  });

  $('rightPane').addEventListener(
    'scroll',
    () => {
      window.requestAnimationFrame(syncChips);
    },
    { passive: true }
  );

  try {
    const state = await loadInitial();
    content = state.content;
    paint({ animate: true });
    if (state.source === 'draft') {
      toast('已载入这台设备上的草稿 · 点右下角继续编辑', 3600);
    }
  } catch (err) {
    console.error(err);
    $('leftPane').innerHTML = errorHTML(err && err.message ? err.message : '未知错误');
    $('rightPane').innerHTML = '';
    return;
  }

  /* 计时：每秒更新 uptime，跨天后重算天数 */
  let lastDay = tl.days;
  window.setInterval(() => {
    if (!content || !tl) return;
    const c = countdown(tl.start, new Date());
    const box = $('leftPane').querySelector('.letter-foot code');
    if (box) box.textContent = `uptime ${c.days + 1}d ${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`;

    const days = c.days + 1;
    if (days !== lastDay) {
      lastDay = days;
      tl = buildTimeline(content);
      paintLeftOnly();
    }
  }, 1000);
}

boot();
