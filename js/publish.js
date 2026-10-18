/* =========================================================
   发布：把内联图片写成 assets/photos/*.webp，
   content.json 里只留路径，然后一次性提交到 GitHub
   ========================================================= */

import { normalize } from './content.js';
import { toJSON } from './store.js';
import { dataURLToBytes, bytesToBase64, textToBase64, extOf } from './image.js';
import { commitFiles } from './github.js';

const CFG_KEY = 'loveletter.publish.v1';
const CONTENT_PATH = 'data/content.json';
const PHOTO_DIR = 'assets/photos';
const MAX_TOTAL = 40 * 1024 * 1024;

export function loadConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
    return {
      repo: typeof raw.repo === 'string' && raw.repo ? raw.repo : 'zouajun/love-letter',
      branch: typeof raw.branch === 'string' && raw.branch ? raw.branch : 'main',
      token: typeof raw.token === 'string' ? raw.token : ''
    };
  } catch (err) {
    return { repo: 'zouajun/love-letter', branch: 'main', token: '' };
  }
}

export function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(next));
  } catch (err) {
    /* 存不下就只在内存里用 */
  }
  return next;
}

export function clearToken() {
  return saveConfig({ token: '' });
}

/** "zouajun/love-letter" 或整条 URL 都认 */
export function parseRepo(input) {
  const text = String(input || '').trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const fromUrl = /github\.com\/([^/\s]+)\/([^/\s]+)/.exec(text);
  if (fromUrl) return { owner: fromUrl[1], repo: fromUrl[2] };
  const plain = /^([\w.-]+)\/([\w.-]+)$/.exec(text);
  if (plain) return { owner: plain[1], repo: plain[2] };
  return null;
}

function shortId(n = 5) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  for (let i = 0; i < n; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

function slug(text) {
  const cleaned = String(text || '').replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 24);
  return cleaned || 'photo';
}

function isInline(src) {
  return typeof src === 'string' && src.startsWith('data:');
}

/** 还有几张图是内联的、需要上传 */
export function pendingCount(content) {
  let n = 0;
  for (const ev of content.events || []) {
    for (const src of ev.images || []) if (isInline(src)) n++;
  }
  if (content.settings && isInline(content.settings.cover)) n++;
  return n;
}

/**
 * 上传内联图片 → 改写 content.json → 一个 commit 提交上去
 * 返回 { content, commit, files, uploaded }
 */
export async function pushToGithub({ config, content, message, onProgress }) {
  const target = parseRepo(config.repo);
  if (!target) throw Object.assign(new Error('仓库要写成「用户名/仓库名」'), { status: -1 });
  if (!config.token) throw Object.assign(new Error('还没填 Token'), { status: -1 });
  if (!config.branch) throw Object.assign(new Error('还没填分支'), { status: -1 });

  const next = JSON.parse(JSON.stringify(content));
  const files = [];
  const uploaded = [];
  let totalBytes = 0;
  let done = 0;
  const total = pendingCount(content);

  async function handle(src, idHint, index) {
    const { bytes, mime } = dataURLToBytes(src);
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL) throw new Error('这次要传的图片太多了（超过 40MB），少选几张再试');

    const suffix = index === undefined ? '' : `${index + 1}-`;
    const path = `${PHOTO_DIR}/${slug(idHint)}-${suffix}${shortId()}.${extOf(mime)}`;
    files.push({ path, base64: bytesToBase64(bytes) });
    uploaded.push({ path, dataURL: src });

    done++;
    if (onProgress) onProgress(`正在上传照片 ${done}/${total}…`, done, total);
    return path;
  }

  for (const ev of next.events || []) {
    const list = Array.isArray(ev.images) ? ev.images : [];
    for (let i = 0; i < list.length; i++) {
      if (!isInline(list[i])) continue;
      list[i] = await handle(list[i], ev.id || ev.title, i);
    }
  }

  if (next.settings && isInline(next.settings.cover)) {
    next.settings.cover = await handle(next.settings.cover, 'cover');
  }

  if (onProgress) onProgress('正在写入 content.json…', done, total);

  const normalized = normalize(next);
  const json = toJSON(normalized);
  files.push({ path: CONTENT_PATH, base64: textToBase64(json) });

  const commitMessage =
    (message && String(message).trim()) ||
    `更新内容 · ${new Date().toLocaleString('zh-CN', { hour12: false })}`;

  const commit = await commitFiles(config.token, {
    owner: target.owner,
    repo: target.repo,
    branch: config.branch,
    message: commitMessage,
    files
  });

  return {
    content: normalized,
    commit: commit.sha,
    files: commit.files,
    uploaded,
    jsonBytes: json.length
  };
}