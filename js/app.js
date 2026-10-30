/* =========================================================
   程序员的情书 · 主逻辑
   ========================================================= */

import { loadInitial, writeDraft, readDraft, clearDraft } from './store.js';
import { buildTimeline, letterFor } from './content.js';
import { renderLeft, renderRight } from './render.js';
import { applyPalette, toast, openLightbox, esc } from './ui.js';
import { createEditor } from './editor.js';
import { countdown, pad } from './date.js';
import { loadLock, accounts, unlock, restoreSession, rememberSession, hydrate, rememberNames, currentUser, forgetSession } from './lock.js';

const $ = (id) => document.getElementById(id);

let content = null;
let tl = null;
let editor = null;
let started = false;

/* ------------------------------------------------------------------ */
/* 我是谁：登录的账号在 accounts() 里的序号                             */
/* ------------------------------------------------------------------ */

function myIndex() {
  const list = accounts();
  const me = currentUser();
  const i = list.findIndex((a) => me && a.id === me.id);
  return i < 0 ? 0 : i;
}

/** 左栏要显示的是「对方写的那封」 */
function letterView() {
  if (!content) return { letter: null, author: '' };
  const my = myIndex();
  const other = my === 0 ? 1 : 0;
  const names = [content.couple.from, content.couple.to];
  const list = accounts();
  return {
    letter: letterFor(content.letters, my),
    author: names[other] || (list[other] && list[other].name) || ''
  };
}

/* ------------------------------------------------------------------ */
/* 左上角：当前登录的人                                                */
/* ------------------------------------------------------------------ */

/** 取名字里最后一个字做头像，两个人的头像才不会都是「小」 */
function avatarChar(name) {
  const chars = [...String(name || '').trim()];
  return chars.length ? chars[chars.length - 1] : '❤';
}

function closeUserMenu() {
  const menu = $('userMenu');
  const chip = $('userChip');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  if (chip) chip.setAttribute('aria-expanded', 'false');
}

function closeRefreshPop() {
  const pop = $('refreshPop');
  const btn = $('userRefresh');
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function closePops() {
  closeUserMenu();
  closeRefreshPop();
}

function renderUserDock() {
  const dock = $('userDock');
  const me = currentUser();
  if (!dock) return;
  if (!me) {
    dock.hidden = true;
    return;
  }
  const idx = myIndex();
  dock.innerHTML = `
    <button type="button" class="user-chip" id="userChip" aria-haspopup="true" aria-expanded="false" title="账号">
      <span class="user-avatar${idx === 1 ? ' is-alt' : ''}" aria-hidden="true">${esc(avatarChar(me.name))}</span>
      <span class="user-name">${esc(me.name)}</span>
      <svg class="user-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <button type="button" class="user-refresh" id="userRefresh" aria-haspopup="true" aria-expanded="false" title="刷新（放弃本地改动，载入线上版本）">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4.5V11h-6.4"/></svg>
      <span class="sr-only">刷新</span>
    </button>
    <div class="dock-pop user-menu" id="userMenu" hidden>
      <p class="user-menu-head">当前登录 · <b>${esc(me.name)}</b></p>
      <button type="button" class="user-menu-item" data-act="logout" role="menuitem">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M15 17l5-5-5-5"/><path d="M20 12H9"/><path d="M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/></svg>
        退出登录
      </button>
    </div>
    <div class="dock-pop refresh-pop" id="refreshPop" hidden>
      <p>放弃这台设备上还没发布的改动，重新载入线上版本？</p>
      <div class="refresh-actions">
        <button type="button" class="btn btn--danger btn--sm" data-act="refresh-yes">刷新</button>
        <button type="button" class="btn btn--sm" data-act="refresh-no">取消</button>
      </div>
    </div>`;
  dock.hidden = false;

  const chip = $('userChip');
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = $('userMenu');
    if (!menu) return;
    closeRefreshPop();
    const open = menu.hidden;
    menu.hidden = !open;
    chip.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  $('userMenu').addEventListener('click', (e) => {
    if (!e.target.closest('[data-act="logout"]')) return;
    logout();
  });

  const refresh = $('userRefresh');
  refresh.addEventListener('click', (e) => {
    e.stopPropagation();
    closeUserMenu();
    /* 没有本地改动就没必要吓人，直接刷新 */
    if (!readDraft()) {
      location.reload();
      return;
    }
    const pop = $('refreshPop');
    const open = pop.hidden;
    pop.hidden = !open;
    refresh.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  $('refreshPop').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'refresh-no') {
      closeRefreshPop();
      return;
    }
    if (act.dataset.act === 'refresh-yes') {
      clearDraft();
      location.reload();
    }
  });
}

function logout() {
  closePops();
  forgetSession();
  location.reload();
}

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
  const view = letterView();
  renderLeft(lp, content, tl, view.letter, view.author);
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
  const view = letterView();
  renderLeft(lp, content, tl, view.letter, view.author);
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

function openEditor(tab = 'story') {
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
  editor.open(content, tab);
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
  document.body.classList.add('is-locked');
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

  /* 解锁了：把「上锁」时藏起来的编辑按钮和提示条放出来 */
  document.body.classList.remove('is-locked');
  document.documentElement.classList.add('js-reveal');
  renderUserDock();

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#userDock')) closePops();

    const writemine = e.target.closest('[data-act="write-mine"]');
    if (writemine) {
      openEditor('story');
      return;
    }

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
    if (e.key === 'Escape') closePops();
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
      /* 草稿里的名字也要反映到下次打开的登录页 */
      rememberNames([content.couple.from, content.couple.to]);
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
