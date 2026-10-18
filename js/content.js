/* =========================================================
   内容模型：校验、规范化、时间轴生成
   ========================================================= */

import { parseDate, addDays, addYears, diffDays, startOfToday, toISO } from './date.js';

export const PALETTES = ['rose', 'sunset', 'dusk'];
export const PALETTE_LABELS = { rose: '玫瑰', sunset: '落日', dusk: '星河' };
export const DEFAULT_MILESTONE_DAYS = [100, 200, 300, 520, 1000];

const MILESTONE_TEXT = {
  100: '一百天。刚好把喜欢，过成了习惯。',
  200: '两百天。日子开始有了形状。',
  300: '三百天。我们学会了很多只有彼此才懂的小事。',
  365: '三百六十五天。绕了一圈，还是想回到你身边。',
  520: '五百二十天。这个数字本身，就挺像一句情话。',
  1000: '一千天。原来「很久」是可以被一天天数出来的。'
};

export function uid(prefix = 'e') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function str(v, fallback = '') {
  if (v === null || v === undefined) return fallback;
  return typeof v === 'string' ? v : String(v);
}

export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** 把任意外部数据整理成安全、完整的结构 */
export function normalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const couple = src.couple && typeof src.couple === 'object' ? src.couple : {};
  const vows = src.vows && typeof src.vows === 'object' ? src.vows : {};
  const settings = src.settings && typeof src.settings === 'object' ? src.settings : {};

  const start = parseDate(couple.startDate) || startOfToday();

  let paragraphs = [];
  if (Array.isArray(vows.paragraphs)) {
    paragraphs = vows.paragraphs.map((p) => str(p).trim()).filter(Boolean);
  } else if (typeof vows.text === 'string') {
    paragraphs = vows.text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  }

  const rawEvents = Array.isArray(src.events) ? src.events : [];
  const events = [];
  const usedIds = new Set();
  rawEvents.forEach((ev) => {
    if (!ev || typeof ev !== 'object') return;
    const d = parseDate(ev.date);
    if (!d) return;
    let id = str(ev.id).trim() || uid('e');
    while (usedIds.has(id)) id = uid('e');
    usedIds.add(id);
    events.push({
      id,
      date: toISO(d),
      title: str(ev.title).trim() || '一个值得记住的日子',
      text: str(ev.text),
      images: Array.isArray(ev.images) ? ev.images.map((x) => str(x).trim()).filter(Boolean) : [],
      kind: ev.kind === 'milestone' ? 'milestone' : 'moment',
      pinned: !!ev.pinned
    });
  });

  let days = Array.isArray(settings.milestoneDays)
    ? settings.milestoneDays.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 2 && n < 100000)
    : DEFAULT_MILESTONE_DAYS.slice();
  days = [...new Set(days)].sort((a, b) => a - b).slice(0, 12);

  const years = Math.min(10, Math.max(0, Math.round(
    settings.milestoneYears === undefined ? 3 : Number(settings.milestoneYears) || 0
  )));

  return {
    version: 1,
    couple: {
      from: str(couple.from).trim() || '我',
      to: str(couple.to).trim() || '你',
      startDate: toISO(start),
      place: str(couple.place).trim()
    },
    vows: {
      eyebrow: str(vows.eyebrow).trim() || 'A LOVE LETTER, WRITTEN IN CODE',
      title: str(vows.title).trim() || '写给你的情书',
      subtitle: str(vows.subtitle).trim(),
      paragraphs,
      signature: str(vows.signature).trim(),
      footer: str(vows.footer).trim()
    },
    settings: {
      palette: PALETTES.includes(settings.palette) ? settings.palette : 'rose',
      autoMilestones: settings.autoMilestones !== false,
      milestoneDays: days,
      milestoneYears: years,
      hiddenAuto: Array.isArray(settings.hiddenAuto)
        ? settings.hiddenAuto.map((k) => str(k).trim()).filter(Boolean)
        : [],
      cover: str(settings.cover).trim(),
      coverCaption: str(settings.coverCaption).trim(),
      music: str(settings.music).trim()
    },
    events
  };
}

function anniversaryText(y) {
  if (y === 1) return '一年。三百六十五天，每一天都算数。';
  if (y === 2) return '两年。回头看，最难的那几件事，都是我们一起扛过来的。';
  if (y === 3) return '三年。喜欢变成了习惯，习惯里还是喜欢。';
  return `${y} 年。第 ${y} 次，把「明年也一起」说出口。`;
}

/**
 * 列出所有（含被隐藏的）自动纪念日，给编辑器做「隐藏 / 恢复」用
 */
export function listAutoMilestones(content, now = new Date()) {
  const start = parseDate(content.couple.startDate) || startOfToday(now);
  const hidden = new Set(content.settings.hiddenAuto || []);
  const byDate = new Map();
  const all = autoMilestones(start, content.settings).sort((a, b) => a.priority - b.priority);
  for (const m of all) byDate.set(toISO(m.date), m);
  return [...byDate.values()]
    .sort((a, b) => a.date - b.date)
    .map((m) => ({ key: m.key, date: m.date, iso: toISO(m.date), title: m.title, hidden: hidden.has(m.key) }));
}

function autoMilestones(start, settings) {
  const out = [];
  for (let y = 1; y <= settings.milestoneYears; y += 1) {
    out.push({
      key: `auto:y${y}`,
      date: addYears(start, y),
      title: `${y} 周年`,
      text: anniversaryText(y),
      images: [],
      kind: 'milestone',
      auto: true,
      priority: 2
    });
  }
  for (const n of settings.milestoneDays) {
    out.push({
      key: `auto:d${n}`,
      date: addDays(start, n - 1),
      title: `在一起 ${n} 天`,
      text: MILESTONE_TEXT[n] || `第 ${n} 天。又一起走过了一段不短的路。`,
      images: [],
      kind: 'milestone',
      auto: true,
      priority: 1
    });
  }
  const byDate = new Map();
  out.sort((a, b) => a.priority - b.priority);
  for (const m of out) byDate.set(toISO(m.date), m);
  return [...byDate.values()];
}

/**
 * 生成按日期升序排列的时间轴
 * @returns {{start: Date, today: Date, days: number, items: Array}}
 */
export function buildTimeline(content, now = new Date()) {
  const start = parseDate(content.couple.startDate) || startOfToday(now);
  const today = startOfToday(now);
  const items = [];

  for (const ev of content.events) {
    const d = parseDate(ev.date);
    if (!d) continue;
    items.push({
      key: `ev:${ev.id}`,
      date: d,
      title: ev.title,
      text: ev.text,
      images: ev.images,
      kind: ev.kind,
      auto: false
    });
  }

  if (content.settings.autoMilestones) {
    const taken = new Set(items.map((i) => toISO(i.date)));
    const hidden = new Set(content.settings.hiddenAuto || []);
    for (const m of autoMilestones(start, content.settings)) {
      if (hidden.has(m.key)) continue;
      if (taken.has(toISO(m.date))) continue;
      items.push(m);
    }
  }

  items.sort((a, b) => a.date - b.date || (a.auto ? 1 : 0) - (b.auto ? 1 : 0));

  for (const it of items) {
    it.iso = toISO(it.date);
    it.day = Math.max(1, diffDays(start, it.date) + 1);
    it.future = diffDays(today, it.date) > 0;
    it.isToday = diffDays(today, it.date) === 0;
  }

  return { start, today, days: diffDays(start, today) + 1, items };
}

/** 下一个即将到来的纪念日 + 进度 */
export function findNext(items, today) {
  const next = items.find((it) => diffDays(today, it.date) > 0);
  if (!next) return null;
  const idx = items.indexOf(next);
  const prev = items[Math.max(0, idx - 1)];
  const total = Math.max(1, diffDays(prev.date, next.date));
  const passed = Math.min(total, Math.max(0, diffDays(prev.date, today)));
  return {
    item: next,
    percent: Math.round((passed / total) * 100),
    daysLeft: diffDays(today, next.date)
  };
}

/** 第一张图片，用作左栏封面 */
export function findCover(content) {
  if (content.settings.cover) return content.settings.cover;
  const sorted = [...content.events].sort((a, b) => a.date.localeCompare(b.date));
  for (const ev of sorted) {
    if (ev.images && ev.images.length) return ev.images[0];
  }
  return '';
}
