/* =========================================================
   内容存取：远程 content.json + 本地草稿（localStorage）
   ========================================================= */

import { normalize } from './content.js';

export const DRAFT_KEY = 'loveletter.draft.v1';
export const CONTENT_PATH = 'data/content.json';

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
    return {
      content: normalize(draft.content),
      base,
      source: 'draft',
      savedAt: typeof draft.savedAt === 'string' ? draft.savedAt : ''
    };
  }
  return { content: base, base, source: 'remote', savedAt: '' };
}

export function toJSON(content) {
  return `${JSON.stringify(normalize(content), null, 2)}\n`;
}
