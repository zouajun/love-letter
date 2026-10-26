/* =========================================================
   内容存取：远程 content.json + 本地草稿（localStorage）
   ========================================================= */

import { normalize } from './content.js';
import { isUnlocked, readContent } from './lock.js';

export const DRAFT_KEY = 'loveletter.draft.v1';
export const CONTENT_PATH = 'data/content.json';

/* 草稿只留 1 天：放太久容易和线上版本对不上，反而让人以为改动丢了 */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export function isDraftExpired(savedAt) {
  const t = Date.parse(savedAt || '');
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > DRAFT_TTL_MS;
}

export function readDraft() {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.content) return null;
    return parsed;
  } catch (err) {
    return null;
  }
}

export function writeDraft(content, extra = {}) {
  const payload = Object.assign({ savedAt: new Date().toISOString(), content }, extra);
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch (err) {
    throw new Error('浏览器本地存储满了（图片太多）。可以先导出备份，再删掉一些图片。');
  }
  return payload;
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch (err) {
    /* 忽略 */
  }
}

export async function fetchContent() {
  /* 上了锁的版本：内容在 data/content.enc 里，用刚解开的密钥在内存里解 */
  if (isUnlocked()) return readContent();
  const res = await fetch(`${CONTENT_PATH}?t=${Date.now()}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`无法读取 ${CONTENT_PATH}（HTTP ${res.status}）`);
  return res.json();
}

/**
 * 载入：远程数据为底，若有草稿则优先显示草稿
 * @returns {Promise<{content, base, source: 'draft'|'remote', savedAt: string}>}
 */
export async function loadInitial() {
  const remote = await fetchContent();
  const base = normalize(remote);
  const draft = readDraft();
  if (draft && draft.content) {
    if (isDraftExpired(draft.savedAt)) {
      clearDraft();
      return { content: base, base, source: 'remote', savedAt: '', expired: true };
    }
    return {
      content: normalize(draft.content),
      base,
      source: 'draft',
      savedAt: typeof draft.savedAt === 'string' ? draft.savedAt : '',
      expired: false
    };
  }
  return { content: base, base, source: 'remote', savedAt: '', expired: false };
}

export function toJSON(content) {
  return `${JSON.stringify(normalize(content), null, 2)}\n`;
}
