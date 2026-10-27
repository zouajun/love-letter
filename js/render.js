/* =========================================================
   渲染：左栏情书 / 右侧时间轴
   ========================================================= */

import { fmtCN, fmtMD, fmtDot, weekdayCN, diffDays, countdown, pad } from './date.js';
import { findCover, findNext } from './content.js';
import { esc, HEART_SVG } from './ui.js';
import { resolveImage } from './imgcache.js';
import { isUnlocked, BLANK_PIXEL } from './lock.js';

/**
 * 图片的 src 属性。
 * 解锁状态下先占一个透明像素 + data-sec，滚到视口附近再由 hydrate() 解密填入；
 * 没上锁时（比如本地第一次打开还没生成 lock.json）就直接用原地址。
 */
function imgAttrs(src, eager = false) {
  const loading = eager ? 'eager' : 'lazy';
  if (isUnlocked()) {
    return `src="${BLANK_PIXEL}" data-sec="${esc(src)}" class="is-pending" loading="${loading}" decoding="async"`;
  }
  return `src="${esc(resolveImage(src))}" loading="${loading}" decoding="async"`;
}

const MAX_PHOTOS = 4;

function uptimeText(start, now) {
  const c = countdown(start, now);
  return `${c.days + 1}d ${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`;
}

/* ------------------------------------------------------------------ */
/* 左栏                                                                */
/* ------------------------------------------------------------------ */

export function renderLeft(el, content, tl) {
  const cover = findCover(content);
  const next = findNext(tl.items, tl.today);
  const { couple, vows } = content;
  const now = new Date();

  const headSub = [couple.place, `${fmtCN(tl.start)} 开始`].filter(Boolean).join(' · ');

  const nextHTML = next
    ? `<div class="next-top">
         <span class="next-name">${esc(next.item.title)}</span>
         <span>${next.daysLeft} 天</span>
       </div>
       <div class="next-bar"><i style="width:${next.percent}%"></i></div>
       <p class="next-cd">${fmtDot(next.item.date)} · 还有 <b>${next.daysLeft}</b> 天</p>`
    : `<div class="next-top"><span class="next-name">把接下来的日子慢慢写上</span></div>
       <div class="next-bar"><i style="width:0%"></i></div>
       <p class="next-cd">还没有安排下一个纪念日</p>`;

  const paragraphs = vows.paragraphs
    .map((p, i) => `<p style="--i:${i}">${esc(p)}</p>`)
    .join('');

  el.innerHTML = `
    <div class="letter-head">
      <p class="eyebrow">${esc(vows.eyebrow)}</p>
      <h1 class="names">${esc(couple.from)} ${HEART_SVG} ${esc(couple.to)}</h1>
      <p class="head-sub">${esc(headSub)}</p>
    </div>

    <div class="stats">
      <div>
        <div class="stat-num"><span class="js-days">${tl.days}</span><em>天</em></div>
        <div class="stat-label">在一起</div>
      </div>
      <div class="next">${nextHTML}</div>
    </div>

    ${cover ? `<figure class="polaroid">
      <img ${imgAttrs(cover, true)} alt="我们的照片">
      <figcaption>${esc(content.settings.coverCaption || '按下快门的那一刻，刚好你在笑')}</figcaption>
    </figure>` : ''}

    <article class="letter">
      <h2 class="letter-title">${esc(vows.title)}</h2>
      ${vows.subtitle ? `<p class="letter-sub">${esc(vows.subtitle)}</p>` : ''}
      <div class="letter-body">${paragraphs}</div>
      ${vows.signature ? `<p class="letter-sign">—— ${esc(vows.signature)}<span class="caret"></span></p>` : ''}
      <div class="letter-foot">
        <code>uptime ${esc(uptimeText(tl.start, now))}</code>
        <span>·</span>
        <span>每一行都是真的</span>
      </div>
    </article>
  `;
}

/* ------------------------------------------------------------------ */
/* 右栏                                                                */
/* ------------------------------------------------------------------ */

function photoHTML(images, title) {
  if (!images.length) return '';
  const count = Math.min(MAX_PHOTOS, images.length);
  const figures = images.slice(0, MAX_PHOTOS).map((src, i) => `
      <figure>
        <img ${imgAttrs(src)} alt="${esc(title)} · 照片 ${i + 1}">
      </figure>`).join('');
  return `<div class="tl-photos" data-count="${count}">${figures}</div>`;
}

function itemHTML(it, tl) {
  const tags = [];
  if (it.auto) tags.push('<span class="tag tag--gold">自动纪念日</span>');
  else if (it.kind === 'milestone') tags.push('<span class="tag">纪念日</span>');
  if (it.future) tags.push(`<span class="tag tag--future">${diffDays(tl.today, it.date)} 天后</span>`);
  tags.push(`<span class="tl-day">DAY ${it.day}</span>`);

  return `
    <article class="tl-item${it.future ? ' is-future' : ''}" data-kind="${esc(it.kind)}" data-auto="${it.auto ? 1 : 0}" id="d${esc(it.iso)}">
      <div class="tl-date"><b>${fmtMD(it.date)}</b><i>${weekdayCN(it.date)}</i></div>
      <span class="tl-dot"></span>
      <div class="tl-card">
        <div class="tl-meta">${tags.join('')}</div>
        <h3>${esc(it.title)}</h3>
        ${it.text ? `<p class="tl-text">${esc(it.text)}</p>` : ''}
        ${photoHTML(it.images, it.title)}
      </div>
    </article>`;
}

function yearHTML(year) {
  return `<div class="tl-year" id="y${year}" data-year="${year}"><span>${year}</span><i></i></div>`;
}

function nowHTML(tl) {
  return `<div class="tl-now" id="tlNow"><span class="pill">今天 · 第 ${tl.days} 天</span><i></i></div>`;
}

export function renderRight(el, content, tl) {
  const items = tl.items;
  const years = [...new Set(items.map((it) => it.date.getFullYear()))];

  const chips = years
    .map((y) => `<button type="button" class="year-chip" data-year="${y}">${y}</button>`)
    .join('');

  let body = '';
  let lastYear = null;
  let nowPlaced = false;

  for (const it of items) {
    if (!nowPlaced && it.future) {
      body += nowHTML(tl);
      nowPlaced = true;
    }
    const y = it.date.getFullYear();
    if (y !== lastYear) {
      body += yearHTML(y);
      lastYear = y;
    }
    body += itemHTML(it, tl);
  }
  if (!nowPlaced) body += nowHTML(tl);

  const empty = items.length === 0
    ? `<div class="tl-empty">还没有写下任何一天。<br>点右下角的按钮，从「我们在一起」开始吧。</div>`
    : '';

  el.innerHTML = `
    <header class="tl-head">
      <div>
        <h2 class="tl-title">我们一起走过</h2>
        <p class="tl-sub">从第一次说「好」开始，一直写到现在</p>
      </div>
      <div class="tl-count"><b>${items.length}</b><span>MEMORIES</span></div>
    </header>

    ${years.length ? `<nav class="year-chips" aria-label="按年份跳转">
      <button type="button" class="year-chip year-chip--now" data-jump="now">今天</button>
      ${chips}
    </nav>` : ''}

    <div class="tl">
      ${empty}
      ${body}
      ${items.length ? `<div class="tl-end">${HEART_SVG}<p>未完待续</p><code>// to be continued</code></div>` : ''}
    </div>
  `;
}
