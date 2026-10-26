/* =========================================================
   程序员的情书 · 主逻辑
   ========================================================= */

import { loadInitial, writeDraft } from './store.js';
import { buildTimeline } from './content.js';
import { renderLeft, renderRight } from './render.js';
import { applyPalette, toast, openLightbox, esc } from './ui.js';
import { createEditor } from './editor.js';
import { countdown, pad } from './date.js';
import { loadLock, accounts, unlock, restoreSession, rememberSession, hydrate } from './lock.js';

const $ = (id) => document.getElementById(id);

let content = null;
let tl = null;
let editor = null;
let started = false;

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
  hydrate(lp);
  hydrate(rp);

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
  hydrate(lp);
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

/* ------------------------------------------------------------------ */
/* 登录墙                                                              */
/* ------------------------------------------------------------------ */

let gateBound = false;

function showGate() {
  const gate = $('gate');
  if (!gate) return;
  const app = $('app');
  if (app) app.hidden = true;
  gate.hidden = false;

  const list = $('gateAccounts');
  if (list && !list.dataset.ready) {
    list.innerHTML = accounts()
      .map((a, i) => `
        <button type="button" class="gate-account${i === 0 ? ' is-active' : ''}" data-id="${esc(a.id)}">
          <span class="gate-account-name">${esc(a.name)}</span>
          ${a.hint ? `<span class="gate-account-hint">${esc(a.hint)}</span>` : ''}
        </button>`)
      .join('');
    list.dataset.ready = '1';
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.gate-account');
      if (!btn) return;
      [...list.querySelectorAll('.gate-account')].forEach((b) => b.classList.toggle('is-active', b === btn));
      const pass = $('gatePass');
      if (pass) pass.focus();
    });
  }

  if (!gateBound) {
    gateBound = true;
    $('gateForm').addEventListener('submit', onUnlock);
  }

  const pass = $('gatePass');
  if (pass) window.setTimeout(() => pass.focus(), 150);
}

async function onUnlock(e) {
  e.preventDefault();
  const btn = $('gateSubmit');
  const errBox = $('gateError');
  const passEl = $('gatePass');
  const active = $('gateAccounts').querySelector('.gate-account.is-active');
  const id = active ? active.dataset.id : '';
  const password = passEl.value;

  if (!id) {
    errBox.textContent = '先选一下你是谁';
    return;
  }
  if (!password) {
    errBox.textContent = '口令还没填';
    return;
  }

  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = '正在开锁…';
  errBox.textContent = '';

  try {
    const who = await unlock(id, password);
    if ($('gateRemember') && $('gateRemember').checked) rememberSession();
    passEl.value = '';
    const gate = $('gate');
    const app = $('app');
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;
    toast(`欢迎回来，${who.name}`, 2600);
    await startApp();
  } catch (err) {
    errBox.textContent = err && err.message ? err.message : '打不开，再试一次';
    passEl.value = '';
    passEl.focus();
    const card = document.querySelector('.gate-card');
    if (card) {
      card.classList.remove('is-shake');
      void card.offsetWidth;
      card.classList.add('is-shake');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

/* ------------------------------------------------------------------ */
/* 载入                                                                */
/* ------------------------------------------------------------------ */

async function startApp() {
  if (started) return;
  started = true;

  document.documentElement.classList.add('js-reveal');

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
    } else if (state.expired) {
      toast('本地草稿超过 1 天，已经丢掉，显示的是线上版本', 4200);
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

async function main() {
  spawnPetals();

  try {
    await loadLock();
  } catch (err) {
    console.error(err);
    const gate = $('gate');
    if (gate) {
      gate.hidden = false;
      const box = $('gateError');
      if (box) box.textContent = '读不到 lock.json，检查一下文件是不是都在。';
    }
    return;
  }

  const session = await restoreSession();
  if (session) {
    const app = $('app');
    if (app) app.hidden = false;
    await startApp();
    return;
  }

  showGate();
}

main();
