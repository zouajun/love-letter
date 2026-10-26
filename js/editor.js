/* =========================================================
   编辑器：侧边抽屉，改完存本地草稿，可导出 JSON 后提交上线
   ========================================================= */

import { normalize, uid, PALETTES, PALETTE_LABELS, listAutoMilestones, findCover } from './content.js';
import { toJSON, writeDraft, clearDraft } from './store.js';
import { esc, toast, toastAction, download, applyPalette } from './ui.js';
import { fileToCompactDataURL } from './image.js';
import { toISO, startOfToday, fmtDot } from './date.js';
import { loadConfig, saveConfig, pendingCount, pushToGithub } from './publish.js';
import { describeError } from './github.js';
import { pruneImages, allPaths, resolveImage } from './imgcache.js';
import { hydrate, isUnlocked, putImage as putPlainImage } from './lock.js';

const TABS = [
  { id: 'story', label: '情书' },
  { id: 'timeline', label: '时间轴' },
  { id: 'publish', label: '发布' }
];

const MAX_IMAGES = 4;

/** 编辑器里的缩略图：解锁状态下先留 data-sec，renderPane 之后统一解密 */
function edImg(src, alt = '') {
  if (!src) return '';
  if (isUnlocked()) return `<img data-sec="${esc(src)}" alt="${esc(alt)}">`;
  return `<img src="${esc(resolveImage(src))}" alt="${esc(alt)}">`;
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let cur = obj;
  for (const k of keys) {
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[last] = value;
}

function clockText() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function createEditor({ root, onApply }) {
  let model = null;
  let tab = 'story';
  let openId = null;
  let saveTimer = 0;
  let dirty = false;
  let nodes = null;
  let lastSavedAt = '';
  let pendingDelete = null;
  let confirmDiscard = false;
  let lastDeleted = null;
  let pushCfg = loadConfig();
  let pushState = null;
  let pushing = false;

  function scheduleSave() {
    dirty = true;
    setState('正在保存…', false);
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      flush();
    }, 420);
  }

  function flush() {
    if (!model) return;
    window.clearTimeout(saveTimer);
    dirty = true;
    try {
      const payload = writeDraft(model);
      lastSavedAt = payload.savedAt;
      setState(`草稿已保存 · ${clockText()}`, true);
    } catch (err) {
      setState(err.message || '保存失败', false);
      toast(err.message || '保存失败');
    }
  }

  function setState(text, ok) {
    if (!nodes) return;
    const el = nodes.panel.querySelector('.ed-foot .state');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-clean', !!ok);
  }

  /* ---------------- 面板骨架 ---------------- */

  function shell() {
    root.innerHTML = `
      <div class="ed-backdrop" data-act="backdrop"></div>
      <aside class="ed-panel" role="dialog" aria-modal="true" aria-label="编辑情书">
        <header class="ed-head">
          <h2 class="ed-title">编辑内容</h2>
          <button type="button" class="ed-close" data-act="close" aria-label="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </header>
        <nav class="ed-tabs" role="tablist">
          ${TABS.map((t) => `<button type="button" role="tab" class="ed-tab${t.id === tab ? ' is-active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
        </nav>
        <div class="ed-body"></div>
        <footer class="ed-foot">
          <span class="state">未保存</span>
          <div class="actions">
            <button type="button" class="btn btn--ghost btn--sm" data-act="export">导出</button>
            <button type="button" class="btn btn--primary btn--sm" data-act="done">完成</button>
          </div>
        </footer>
      </aside>`;

    nodes = {
      backdrop: root.querySelector('.ed-backdrop'),
      panel: root.querySelector('.ed-panel'),
      body: root.querySelector('.ed-body')
    };
  }

  /* ---------------- 各页 ---------------- */

  function storyPane() {
    const m = model;
    const coverSrc = findCover(m);
    return `
      <div class="field">
        <label class="field-label">你们的名字</label>
        <div class="row">
          <input class="input" data-k="couple.from" value="${esc(m.couple.from)}" placeholder="我">
          <input class="input" data-k="couple.to" value="${esc(m.couple.to)}" placeholder="你">
        </div>
      </div>
      <div class="field">
        <label class="field-label">在一起的日期</label>
        <div class="row">
          <input class="input" type="date" data-k="couple.startDate" value="${esc(m.couple.startDate)}">
          <input class="input" data-k="couple.place" value="${esc(m.couple.place)}" placeholder="城市（可留空）">
        </div>
        <p class="field-note">所有「第 N 天」和自动纪念日都从这一天开始算。</p>
      </div>

      <div class="field">
        <label class="field-label">配色</label>
        <select class="select" data-k="settings.palette">
          ${PALETTES.map((p) => `<option value="${p}"${m.settings.palette === p ? ' selected' : ''}>${PALETTE_LABELS[p]}</option>`).join('')}
        </select>
      </div>

      <div class="divider">誓言</div>

      <div class="field">
        <label class="field-label">顶部小字</label>
        <input class="input" data-k="vows.eyebrow" value="${esc(m.vows.eyebrow)}">
      </div>
      <div class="field">
        <label class="field-label">标题</label>
        <input class="input" data-k="vows.title" value="${esc(m.vows.title)}">
      </div>
      <div class="field">
        <label class="field-label">副标题</label>
        <input class="input" data-k="vows.subtitle" value="${esc(m.vows.subtitle)}" placeholder="可留空">
      </div>
      <div class="field">
        <label class="field-label">正文</label>
        <textarea class="textarea textarea--tall" data-k="vows.paragraphs" placeholder="空一行 = 新的一段">${esc(m.vows.paragraphs.join('\n\n'))}</textarea>
        <p class="field-note">空一行分段，每一段都会单独淡入。</p>
      </div>
      <div class="field">
        <label class="field-label">署名</label>
        <input class="input" data-k="vows.signature" value="${esc(m.vows.signature)}" placeholder="比如：阿远">
      </div>
      <div class="field">
        <label class="field-label">封面图</label>
        <div class="cover-row">
          <div class="cover-thumb${coverSrc ? '' : ' is-auto'}">
            ${coverSrc ? edImg(coverSrc) : '<span>自动</span>'}
          </div>
          <div class="cover-side">
            <div class="row">
              <button type="button" class="btn btn--sm" data-act="cover">换一张</button>
              ${m.settings.cover ? '<button type="button" class="btn btn--ghost btn--sm" data-act="cover-auto">跟随时间轴</button>' : ''}
            </div>
            <p class="field-note">${m.settings.cover ? '当前是自定义封面。' : '现在用的是时间轴上最早的一张照片。'}</p>
          </div>
        </div>
        <input id="edImportCover" type="file" accept="image/*" hidden data-k="cover">
      </div>
      <div class="field">
        <label class="field-label">封面图说明</label>
        <input class="input" data-k="settings.coverCaption" value="${esc(m.settings.coverCaption)}" placeholder="可留空">
        <p class="field-note">显示在照片下面那行小字。</p>
      </div>`;
  }

  function eventRow(ev, open) {
    const thumb = ev.images.length ? edImg(ev.images[0]) : '无图';
    return `
      <div class="ev-row${open ? ' is-open' : ''}" data-id="${esc(ev.id)}" role="button" tabindex="0">
        <div class="ev-thumb">${thumb}</div>
        <div class="ev-main">
          <b>${esc(ev.title || '未命名')}</b>
          <span>${esc(ev.date)}${ev.kind === 'milestone' ? ' <em>· 纪念日</em>' : ''}</span>
        </div>
        <span class="chevs">${open ? '⌃' : '⌄'}</span>
      </div>
      ${open ? eventForm(ev) : ''}`;
  }

  function eventForm(ev) {
    return `
      <div class="ev-edit" data-id="${esc(ev.id)}">
        <div class="row">
          <div class="field">
            <label class="field-label">日期</label>
            <input class="input" type="date" data-k="date" value="${esc(ev.date)}">
          </div>
          <div class="field">
            <label class="field-label">类型</label>
            <select class="select" data-k="kind">
              <option value="moment"${ev.kind === 'moment' ? ' selected' : ''}>日常</option>
              <option value="milestone"${ev.kind === 'milestone' ? ' selected' : ''}>纪念日</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field-label">标题</label>
          <input class="input" data-k="title" value="${esc(ev.title)}" placeholder="今天发生了什么">
        </div>
        <div class="field">
          <label class="field-label">描述</label>
          <textarea class="textarea" data-k="text" placeholder="想留住的细节">${esc(ev.text)}</textarea>
        </div>
        <div class="field">
          <label class="field-label">照片 · ${ev.images.length}/${MAX_IMAGES}</label>
          <div class="thumbs">
            ${ev.images.map((src, i) => `<div class="thumb">${edImg(src)}<button type="button" data-act="rmimg" data-i="${i}" aria-label="删除照片">×</button></div>`).join('')}
          </div>
          ${ev.images.length < MAX_IMAGES ? `<label class="upload">＋ 添加照片<input type="file" accept="image/*" multiple hidden data-k="upload"></label>` : ''}
        </div>
        <div class="ev-actions">
          ${pendingDelete === ev.id
            ? `<span class="ev-ask">真的删掉？</span>
               <button type="button" class="btn btn--sm btn--danger" data-act="delete-yes">删除</button>
               <button type="button" class="btn btn--sm" data-act="delete-no">取消</button>`
            : `<button type="button" class="btn btn--sm btn--danger" data-act="delete">删除这一条</button>`}
          <button type="button" class="btn btn--sm" data-act="collapse">收起</button>
        </div>
      </div>`;
  }

  function timelinePane() {
    const evs = [...model.events].sort((a, b) => a.date.localeCompare(b.date));
    return `
      <div class="ev-toolbar">
        <p>共 ${model.events.length} 条 · 按日期排序</p>
        <button type="button" class="btn btn--sm btn--primary" data-act="add">＋ 添加记录</button>
      </div>
      <div class="ev-list">
        ${evs.map((ev) => eventRow(ev, ev.id === openId)).join('') || '<p class="field-note">还没有记录，先加第一条吧。</p>'}
      </div>
      <div class="divider">自动纪念日</div>
      <label class="switch">
        <span class="switch-txt">自动生成纪念日
          <small>按上面的天数与周年，自动排在时间轴上</small>
        </span>
        <input type="checkbox" data-k="settings.autoMilestones"${model.settings.autoMilestones ? ' checked' : ''}>
      </label>
      <div class="field">
        <label class="field-label">里程碑天数（逗号分隔）</label>
        <input class="input" data-k="settings.milestoneDays" value="${esc(model.settings.milestoneDays.join(', '))}">
      </div>
      <div class="field">
        <label class="field-label">周年数量</label>
        <input class="input" type="number" min="0" max="30" data-k="settings.milestoneYears" value="${model.settings.milestoneYears}">
      </div>
      <p class="field-note">同一日期只会留一条；如果自己在当天写过记录，就用自己的。</p>
      ${autoListHTML()}`;
  }

  function autoListHTML() {
    if (!model.settings.autoMilestones) return '';
    const autos = listAutoMilestones(model);
    if (!autos.length) return '';
    const taken = new Set(model.events.map((e) => e.date));
    return `
      <div class="auto-list">
        ${autos
          .map(
            (a) => `<div class="auto-row${a.hidden ? ' is-off' : ''}">
              <span class="auto-date">${fmtDot(a.date)}</span>
              <span class="auto-title">${esc(a.title)}</span>
              ${
                taken.has(a.iso)
                  ? '<span class="auto-note">当天已有手写记录</span>'
                  : `<button type="button" class="btn btn--sm" data-act="auto-toggle" data-key="${esc(a.key)}">${a.hidden ? '恢复' : '隐藏'}</button>`
              }
            </div>`
          )
          .join('')}
      </div>
      <p class="field-note">不想要的自动纪念日点「隐藏」就行，随时能恢复。</p>`;
  }

  function publishPane() {
    const json = toJSON(model);
    const kb = Math.max(1, Math.round(json.length / 1024));
    const pending = pendingCount(model);
    const stateKind = pushState ? pushState.kind : '';
    const stateText = pushState
      ? pushState.text
      : pending
        ? `还有 ${pending} 张照片没加密上传，提交时自动处理`
        : '照片都已经加密上传了';

    return `
      <div class="sync-status${dirty ? '' : ' is-ok'}">
        ${lastSavedAt ? `草稿已保存 · ${clockText()}` : '还没有本地改动'} · ${model.events.length} 条记录 · 约 ${kb} KB
      </div>

      <div class="divider">一键发布</div>
      <div class="field">
        <label class="field-label">仓库</label>
        <input class="input" data-k="push.repo" value="${esc(pushCfg.repo)}" placeholder="用户名/仓库名" spellcheck="false" autocomplete="off">
      </div>
      <div class="field">
        <label class="field-label">分支</label>
        <input class="input" data-k="push.branch" value="${esc(pushCfg.branch)}" placeholder="main" spellcheck="false" autocomplete="off">
      </div>
      <div class="field">
        <label class="field-label">Token</label>
        <input class="input" type="password" data-k="push.token" value="" placeholder="${pushCfg.token ? '已保存，留空则沿用' : 'github_pat_…'}" spellcheck="false" autocomplete="off">
        <p class="field-note">只存在这台设备的浏览器里，不会写进仓库，也不会上传。</p>
      </div>
      <div class="push-state${stateKind ? ` is-${stateKind}` : ''}">${esc(stateText)}</div>
      <div class="row">
        <button type="button" class="btn btn--primary" data-act="push">提交到 GitHub</button>
        <button type="button" class="btn btn--ghost" data-act="forget">清除 Token</button>
      </div>

      <div class="divider">其他</div>
      <div class="row">
        <button type="button" class="btn" data-act="export">导出 content.json</button>
        <label class="btn" for="edImport" style="cursor:pointer">导入 JSON</label>
      </div>
      <input id="edImport" type="file" accept="application/json,.json" hidden data-k="import">
      <p class="field-note">不联网时的备用出口，导出的文件和仓库里的格式完全一样。</p>

      <div class="divider">谨慎操作</div>
      ${confirmDiscard
        ? `<p class="ev-ask">丢掉本地改动，回到仓库里的版本？</p>
           <div class="row">
             <button type="button" class="btn btn--danger" data-act="discard-yes">确认丢弃</button>
             <button type="button" class="btn" data-act="discard-no">再想想</button>
           </div>`
        : `<button type="button" class="btn btn--danger" data-act="discard">丢弃草稿，恢复仓库版本</button>`}
      <p class="field-note">浏览器会清掉本地改动并重新载入页面，已经提交上去的内容不受影响。</p>`;
  }

  function renderPane() {
    if (tab === 'story') nodes.body.innerHTML = storyPane();
    else if (tab === 'timeline') nodes.body.innerHTML = timelinePane();
    else nodes.body.innerHTML = publishPane();

    nodes.panel.querySelectorAll('.ed-tab').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.tab === tab);
    });

    hydrate(nodes.body);
  }

  /* ---------------- 事件处理 ---------------- */

  function findEvent(id) {
    return model.events.find((ev) => ev.id === id);
  }

  function rerenderKeepScroll() {
    const top = nodes.body.scrollTop;
    renderPane();
    nodes.body.scrollTop = top;
  }

  function undoDelete() {
    if (!lastDeleted) return;
    const { ev, index } = lastDeleted;
    lastDeleted = null;
    const at = Math.max(0, Math.min(index, model.events.length));
    model.events.splice(at, 0, ev);

    if (nodes) {
      openId = ev.id;
      flush();
      rerenderKeepScroll();
      const box = nodes.body.querySelector(`.ev-edit[data-id="${ev.id}"]`);
      if (box) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      toast('已经放回去了');
    } else {
      try { writeDraft(model); } catch (err) {}
      if (onApply) onApply(normalize(model), true);
      toast('已经放回去了');
    }
  }

  function setPushState(text, kind) {
    pushState = { text, kind };
    const box = nodes && nodes.body.querySelector('.push-state');
    if (box) {
      box.textContent = text;
      box.className = `push-state${kind ? ` is-${kind}` : ''}`;
    }
  }

  async function doPush() {
    if (pushing) return;
    pushing = true;
    const btn = () => nodes && nodes.body.querySelector('[data-act="push"]');
    if (btn()) btn().disabled = true;
    setPushState('正在提交…', 'busy');

    try {
      flush();
      pushCfg = loadConfig();
      const res = await pushToGithub({
        config: pushCfg,
        content: model,
        onProgress: (text) => setPushState(text, 'busy')
      });

      for (const item of res.uploaded) putPlainImage(item.path, item.dataURL);
      model = res.content;
      pruneImages(allPaths(model));
      dirty = true;
      flush();

      rerenderKeepScroll();
      setPushState(`已提交 ${res.files} 个文件 · ${res.commit.slice(0, 7)} · 约 1 分钟后线上更新`, 'ok');
      toast('已提交到 GitHub');
      if (onApply) onApply(normalize(model), true);
    } catch (err) {
      const text = describeError(err);
      rerenderKeepScroll();
      setPushState(text, 'err');
      toast(text, 6000);
    } finally {
      pushing = false;
      const again = btn();
      if (again) again.disabled = false;
    }
  }

  function onInput(e) {
    const el = e.target;
    if (!(el instanceof HTMLElement) || !el.dataset || !el.dataset.k) return;
    if (el.dataset.k === 'upload' || el.dataset.k === 'import' || el.dataset.k === 'cover') return;

    const key = el.dataset.k;
    let value = el.value;

    if (key.startsWith('push.')) {
      const field = key.slice(5);
      if (field === 'token' && !value) return; // 留空表示沿用已保存的
      pushCfg = saveConfig({ [field]: value.trim() });
      return;
    }

    if (el.type === 'date' && !value) {
      const evBox = el.closest('.ev-edit');
      if (evBox) {
        const ev = findEvent(evBox.dataset.id);
        if (ev) el.value = ev.date;
      } else {
        el.value = model.couple.startDate;
      }
      return;
    }

    if (el.type === 'number') value = Number(value) || 0;
    else if (el.type === 'checkbox') value = el.checked;

    if (key === 'vows.paragraphs') {
      value = value.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    } else if (key === 'settings.milestoneDays') {
      value = value.split(/[,，\s]+/).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 2 && n < 100000);
    }

    const evBox = el.closest('.ev-edit');
    if (evBox) {
      const ev = findEvent(evBox.dataset.id);
      if (!ev) return;
      ev[key] = value;
    } else {
      setPath(model, key, value);
      if (key === 'settings.palette') applyPalette(value);
    }
    scheduleSave();
  }

  async function onFiles(inputEl) {
    const kind = inputEl.dataset.k;
    const files = [...inputEl.files];
    inputEl.value = '';
    if (!files.length) return;

    if (kind === 'import') {
      const file = files[0];
      try {
        const text = await file.text();
        const parsed = normalize(JSON.parse(text));
        model = parsed;
        openId = null;
        flush();
        rerenderKeepScroll();
        toast('已导入，检查一下内容再导出吧');
      } catch (err) {
        toast('这个文件读不出来，好像不是 content.json');
      }
      return;
    }

    try {
      if (kind === 'cover') {
        if (!files.length) return;
        toast('正在处理封面…');
        const { src, bytes } = await fileToCompactDataURL(files[0], { maxEdge: 1200 });
        model.settings.cover = src;
        flush();
        rerenderKeepScroll();
        toast(`封面已更新（${Math.round(bytes / 1024)} KB）`);
        return;
      }

      const evBox = inputEl.closest('.ev-edit');
      const ev = evBox ? findEvent(evBox.dataset.id) : null;
      if (!ev) return;

      const room = MAX_IMAGES - ev.images.length;
      if (room <= 0) {
        toast(`每条最多 ${MAX_IMAGES} 张照片`);
        return;
      }
      const picked = files.slice(0, room);
      toast(picked.length > 1 ? `正在处理 ${picked.length} 张图片…` : '正在处理图片…');

      for (const f of picked) {
        const { src } = await fileToCompactDataURL(f);
        ev.images.push(src);
      }
      flush();
      rerenderKeepScroll();
    } catch (err) {
      toast(err.message || '图片处理失败');
    }
  }

  function onClick(e) {
    const actEl = e.target.closest('[data-act]');
    const tabEl = e.target.closest('.ed-tab');
    if (tabEl) {
      tab = tabEl.dataset.tab;
      openId = null;
      pendingDelete = null;
      confirmDiscard = false;
      renderPane();
      return;
    }
    if (!actEl) {
      const row = e.target.closest('.ev-row');
      if (row) {
        openId = openId === row.dataset.id ? null : row.dataset.id;
        pendingDelete = null;
        rerenderKeepScroll();
      }
      return;
    }

    const act = actEl.dataset.act;
    if (act === 'backdrop' || act === 'close' || act === 'done') {
      close();
      return;
    }
    if (act === 'export') {
      flush();
      download('content.json', toJSON(model));
      toast('已导出 content.json');
      return;
    }
    if (act === 'push') {
      doPush();
      return;
    }
    if (act === 'forget') {
      pushCfg = saveConfig({ token: '' });
      rerenderKeepScroll();
      setPushState('已清除 Token，下次要用再填一次', 'ok');
      toast('已清除 Token');
      return;
    }
    if (act === 'add') {
      const ev = {
        id: uid('e'),
        date: toISO(startOfToday()),
        title: '新的日子',
        text: '',
        images: [],
        kind: 'moment'
      };
      model.events.push(ev);
      openId = ev.id;
      pendingDelete = null;
      flush();
      rerenderKeepScroll();
      window.setTimeout(() => {
        const box = nodes.body.querySelector(`.ev-edit[data-id="${ev.id}"]`);
        if (box) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const titleInput = box && box.querySelector('input[data-k="title"]');
        if (titleInput) {
          titleInput.focus();
          titleInput.select();
        }
      }, 60);
      return;
    }
    if (act === 'collapse') {
      openId = null;
      pendingDelete = null;
      rerenderKeepScroll();
      return;
    }
    if (act === 'delete') {
      const box = actEl.closest('.ev-edit');
      const ev = box ? findEvent(box.dataset.id) : null;
      if (!ev) return;
      pendingDelete = ev.id;
      rerenderKeepScroll();
      window.setTimeout(() => {
        const yes = nodes && nodes.body.querySelector('[data-act="delete-yes"]');
        if (yes) yes.focus({ preventScroll: true });
      }, 30);
      return;
    }
    if (act === 'delete-no') {
      pendingDelete = null;
      rerenderKeepScroll();
      return;
    }
    if (act === 'delete-yes') {
      const box = actEl.closest('.ev-edit');
      const ev = box ? findEvent(box.dataset.id) : null;
      if (!ev) return;
      const index = model.events.indexOf(ev);
      lastDeleted = { ev, index };
      model.events = model.events.filter((x) => x.id !== ev.id);
      openId = null;
      pendingDelete = null;
      flush();
      rerenderKeepScroll();
      toastAction(`已删除「${ev.title || '这条记录'}」`, '撤销', undoDelete);
      return;
    }
    if (act === 'auto-toggle') {
      const key = actEl.dataset.key;
      if (!key) return;
      if (!Array.isArray(model.settings.hiddenAuto)) model.settings.hiddenAuto = [];
      const list = model.settings.hiddenAuto;
      const at = list.indexOf(key);
      if (at >= 0) list.splice(at, 1);
      else list.push(key);
      flush();
      rerenderKeepScroll();
      toast(at >= 0 ? '已恢复这个纪念日' : '已隐藏这个纪念日');
      return;
    }
    if (act === 'rmimg') {
      const box = actEl.closest('.ev-edit');
      const ev = box ? findEvent(box.dataset.id) : null;
      if (!ev) return;
      ev.images.splice(Number(actEl.dataset.i), 1);
      flush();
      rerenderKeepScroll();
      return;
    }
    if (act === 'cover') {
      const input = nodes.body.querySelector('#edImportCover');
      if (input) input.click();
      return;
    }
    if (act === 'cover-auto') {
      delete model.settings.cover;
      flush();
      rerenderKeepScroll();
      toast('封面改回跟随时间轴');
      return;
    }
    if (act === 'discard') {
      confirmDiscard = true;
      rerenderKeepScroll();
      return;
    }
    if (act === 'discard-no') {
      confirmDiscard = false;
      rerenderKeepScroll();
      return;
    }
    if (act === 'discard-yes') {
      clearDraft();
      window.location.reload();
      return;
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' || e.key === ' ') {
      const row = e.target.closest && e.target.closest('.ev-row');
      if (row && e.target === row) {
        e.preventDefault();
        openId = openId === row.dataset.id ? null : row.dataset.id;
        rerenderKeepScroll();
      }
    }
  }

  function onChange(e) {
    const el = e.target;
    if (el.dataset && el.dataset.k === 'upload') onFiles(el);
    else if (el.dataset && el.dataset.k === 'import') onFiles(el);
    else if (el.dataset && el.dataset.k === 'cover') onFiles(el);
    else onInput(e);
  }

  /* ---------------- 开关 ---------------- */

  function open(content) {
    model = normalize(content);
    tab = 'story';
    openId = null;
    pendingDelete = null;
    confirmDiscard = false;
    lastDeleted = null;
    pushCfg = loadConfig();
    pushState = null;
    pushing = false;
    dirty = false;
    root.innerHTML = '';
    shell();
    renderPane();
    setState('改动会先存到本地', true);

    document.body.classList.add('ed-open');
    requestAnimationFrame(() => {
      nodes.backdrop.classList.add('is-in');
      nodes.panel.classList.add('is-in');
    });

    nodes.panel.addEventListener('input', onChange);
    nodes.panel.addEventListener('change', onChange);
    nodes.panel.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeydown);

    const first = nodes.panel.querySelector('.ed-body .input, .ed-body .textarea');
    if (first) window.setTimeout(() => first.focus({ preventScroll: true }), 380);
  }

  function close() {
    if (!nodes) return;
    document.removeEventListener('keydown', onKeydown);
    window.clearTimeout(saveTimer);
    const changed = dirty;
    if (dirty) flush();

    nodes.backdrop.classList.remove('is-in');
    nodes.panel.classList.remove('is-in');
    document.body.classList.remove('ed-open');

    const snapshot = normalize(model);
    window.setTimeout(() => {
      root.innerHTML = '';
      nodes = null;
    }, 420);

    if (onApply) onApply(snapshot, changed);
  }

  return { open, close };
}
