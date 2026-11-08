/* =========================================================
   小本本：只有她能看见的记仇本
   —— 数据放在 content.grudge，和别的内容一起加密、一起发布
   —— 界面上只对 GRUDGE_OWNER 这个账号开口
   ========================================================= */

import { normalize, uid, grudgeStats, angerDays, ANGER_LABELS, GRUDGE_OWNER } from './content.js';
import { esc, toastAction, toast } from './ui.js';
import { toISO, fmtMD, weekdayCN, startOfToday, parseDate } from './date.js';

export function canUseGrudge(user) {
  return !!user && user.id === GRUDGE_OWNER;
}

function dots(anger) {
  let out = '';
  for (let i = 1; i <= 3; i += 1) out += `<i class="g-dot${i <= anger ? ' is-on' : ''}"></i>`;
  return out;
}

function statsLine(stats) {
  const parts = [
    `在一起 <b>${stats.days}</b> 天`,
    `记了 <b>${stats.total}</b> 笔`,
    `已消气 <b>${stats.resolved}</b> 笔`
  ];
  if (stats.longest > 0) parts.push(`最长气过 <b>${stats.longest}</b> 天`);
  return parts.join(' · ');
}

export function createGrudge({ root, onApply }) {
  let model = null;
  let nodes = null;
  let form = null;
  let changed = false;
  let onKey = null;

  /* ---------- 骨架 ---------- */

  function shell() {
    root.innerHTML = `
      <div class="g-backdrop" data-act="backdrop"></div>
      <section class="g-panel" role="dialog" aria-modal="true" aria-label="小本本">
        <span class="g-tape" aria-hidden="true"></span>
        <button type="button" class="g-close" data-act="close" aria-label="关闭">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <div class="g-body"></div>
        <p class="g-foot">和其他内容一起加密保存 · 只有你的账号会打开这本书</p>
      </section>`;
    nodes = {
      backdrop: root.querySelector('.g-backdrop'),
      panel: root.querySelector('.g-panel'),
      body: root.querySelector('.g-body')
    };
    nodes.panel.addEventListener('click', onClick);
    nodes.panel.addEventListener('input', onInput);
    nodes.panel.addEventListener('submit', onSubmit);
  }

  /* ---------- 渲染 ---------- */

  function render() {
    if (!nodes) return;
    const scroll = nodes.body.scrollTop;
    const entries = model.grudge.entries;
    const stats = grudgeStats(entries, model.couple.startDate);

    const head = `
      <header class="g-head">
        <p class="g-eyebrow">Grudge Book · 只有你看得见</p>
        <div class="g-title-row">
          <h2>小本本</h2>
          ${stats.pending ? `<span class="g-badge">${stats.pending} 笔还没消气</span>` : ''}
        </div>
        <p class="g-stats">${statsLine(stats)}</p>
      </header>`;

    const top = form
      ? formHTML()
      : `<button type="button" class="g-add" data-act="add"><span aria-hidden="true">＋</span> 记一笔</button>`;

    /* 正在写的时候不要把「本子还是空的」杵在下面 */
    const list = entries.length
      ? `<div class="g-list">${entries.map(entryHTML).join('')}</div>`
      : form
        ? ''
        : `<div class="g-empty">
           <div class="g-mark" aria-hidden="true">✿</div>
           <h3>本子还是空的</h3>
           <p>他惹你不高兴的时候，就来写一笔。<br>不一定要给他看，先记着。</p>
         </div>`;

    nodes.body.innerHTML = head + top + list;
    nodes.body.scrollTop = scroll;
  }

  function entryHTML(e) {
    const gone = e.resolved;
    const days = gone ? angerDays(e) : 0;
    const day = parseDate(e.date);
    const state = gone
      ? `<span class="g-state">消气了 · ${days ? `气了 ${days} 天` : '当天就消气'}</span>`
      : '<span class="g-state is-open">还记着</span>';

    return `
      <article class="g-entry${gone ? ' is-done' : ''}" data-id="${esc(e.id)}">
        <div class="g-entry-top">
          <span class="g-date">${day ? `${fmtMD(day)} · ${weekdayCN(day)}` : esc(e.date)}</span>
          <span class="g-title">${esc(e.title)}</span>
        </div>
        ${e.text ? `<p class="g-note">${esc(e.text)}</p>` : ''}
        <div class="g-entry-foot">
          <span class="g-anger">${dots(e.anger)} ${ANGER_LABELS[e.anger - 1]}</span>
          ${state}
          <span class="g-acts">
            ${gone ? '' : `<button type="button" class="g-act" data-act="resolve" data-id="${esc(e.id)}">已消气</button>`}
            <button type="button" class="g-act is-quiet" data-act="rip" data-id="${esc(e.id)}">撕掉</button>
          </span>
        </div>
      </article>`;
  }

  function formHTML() {
    const tags = ANGER_LABELS.map(
      (label, i) => `<button type="button" class="g-tag${form.anger === i + 1 ? ' is-on' : ''}" data-anger="${i + 1}">${label}</button>`
    ).join('');
    return `
      <form class="g-form" autocomplete="off">
        <div class="g-row">
          <label class="g-field g-field--date"><span>日期</span>
            <input class="g-input" type="date" data-f="date" value="${esc(form.date)}">
          </label>
          <label class="g-field"><span>他又怎么了</span>
            <input class="g-input" type="text" data-f="title" maxlength="60" placeholder="他说「五分钟到」" value="${esc(form.title)}">
          </label>
        </div>
        <label class="g-field"><span>发生了什么（可以不写）</span>
          <textarea class="g-input g-textarea" data-f="text" maxlength="300" placeholder="我在楼下等，数了三辆外卖车">${esc(form.text)}</textarea>
        </label>
        <div class="g-field"><span>气度</span><div class="g-anger-pick">${tags}</div></div>
        <div class="g-form-acts">
          <button type="button" class="g-btn is-ghost" data-act="cancel">算了</button>
          <button type="submit" class="g-btn is-primary">记下</button>
        </div>
      </form>`;
  }

  /* ---------- 交互 ---------- */

  function onInput(e) {
    const key = e.target.dataset ? e.target.dataset.f : '';
    if (!key || !form) return;
    form[key] = e.target.value;
  }

  function onClick(e) {
    const el = e.target.closest('[data-act], [data-anger]');
    if (!el) return;
    const act = el.dataset.act;

    if (el.dataset.anger) {
      if (!form) return;
      form.anger = Number(el.dataset.anger);
      nodes.body.querySelectorAll('[data-anger]').forEach((b) => b.classList.toggle('is-on', b === el));
      return;
    }

    if (act === 'backdrop' || act === 'close') { close(); return; }
    if (act === 'add') { startForm(); return; }
    if (act === 'cancel') { form = null; render(); return; }
    if (act === 'resolve') { resolveItem(el.dataset.id); return; }
    if (act === 'rip') { ripItem(el.dataset.id); return; }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!form) return;
    saveForm();
  }

  function startForm() {
    form = { date: toISO(startOfToday()), title: '', text: '', anger: 2 };
    render();
    const input = nodes.body.querySelector('[data-f="title"]');
    if (input) input.focus({ preventScroll: true });
  }

  function saveForm() {
    const title = String(form.title || '').trim();
    const text = String(form.text || '').trim();
    if (!title && !text) {
      toast('写一句也好');
      return;
    }
    const date = form.date || toISO(startOfToday());
    model.grudge.entries.push({
      id: uid('g'),
      date,
      title: title || text.slice(0, 14),
      text: title ? text : '',
      anger: form.anger,
      resolved: false,
      resolvedAt: ''
    });
    form = null;
    commit();
    render();
  }

  function resolveItem(id) {
    const hit = model.grudge.entries.find((x) => x.id === id);
    if (!hit) return;
    hit.resolved = true;
    hit.resolvedAt = toISO(startOfToday());
    commit();
    render();
  }

  function ripItem(id) {
    const idx = model.grudge.entries.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [gone] = model.grudge.entries.splice(idx, 1);
    commit();
    render();
    toastAction(`已撕掉「${gone.title}」`, '撤销', () => {
      if (!model) return;
      model.grudge.entries.splice(idx, 0, gone);
      commit();
      render();
    });
  }

  /** 每次改动都归一化一次，交给外面存草稿 + 重绘 */
  function commit() {
    changed = true;
    const next = normalize(model);
    model = next;
    if (onApply) onApply(next, true);
  }

  /* ---------- 打开 / 关闭 ---------- */

  function open(content) {
    model = normalize(content);
    form = null;
    changed = false;
    root.innerHTML = '';
    shell();
    render();

    document.body.classList.add('grudge-open');
    requestAnimationFrame(() => {
      nodes.backdrop.classList.add('is-in');
      nodes.panel.classList.add('is-in');
    });

    onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    document.addEventListener('keydown', onKey, true);
  }

  function close() {
    if (!nodes) return;
    document.removeEventListener('keydown', onKey, true);
    nodes.backdrop.classList.remove('is-in');
    nodes.panel.classList.remove('is-in');
    document.body.classList.remove('grudge-open');

    const snapshot = normalize(model);
    const dirty = changed;
    model = null;
    const dying = nodes;
    nodes = null;
    window.setTimeout(() => {
      dying.panel.removeEventListener('click', onClick);
      dying.panel.removeEventListener('input', onInput);
      dying.panel.removeEventListener('submit', onSubmit);
      /* 这 440ms 里又打开了新的册子，就别把新的擦掉 */
      if (!nodes) root.innerHTML = '';
    }, 440);

    if (onApply && dirty) onApply(snapshot, true);
  }

  return { open, close };
}
