/* =========================================================
   发布：照片加密后写成 assets/photos/*.enc，
   内容加密成 data/content.enc，然后一次性提交到 GitHub
   （仓库里看不到任何明文，Pages 也只能拿到密文）
   ========================================================= */

import { normalize } from './content.js';
import { bytesToBase64, extOf } from './image.js';
import { commitFiles } from './github.js';
import { securePath, encryptBinary, encryptJSON, isUnlocked, CONTENT_ENC, lockJsonWithNames, rememberNames } from './lock.js';
import { dataURLToBytes } from './crypto.js';

const CFG_KEY = 'loveletter.publish.v1';
const PLAIN_CONTENT = 'data/content.json';
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

/** 还有几张图是刚选的、需要加密上传 */
export function pendingCount(content) {
  let n = 0;
  for (const ev of content.events || []) {
    for (const src of ev.images || []) if (isInline(src)) n++;
  }
  if (content.settings && isInline(content.settings.cover)) n++;
  return n;
}

/**
 * 加密照片 → 上传 → 内容加密成 content.enc → 一个 commit 提交上去
 * 返回 { content, commit, files, uploaded }
 */
export async function pushToGithub({ config, content, message, onProgress }) {
  if (!isUnlocked()) throw Object.assign(new Error('要先解锁才能提交'), { status: -1 });

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
    const sealed = await encryptBinary(bytes);
    files.push({ path: securePath(path), base64: bytesToBase64(sealed) });
    uploaded.push({ path, dataURL: src });

    done++;
    if (onProgress) onProgress(`正在加密上传照片 ${done}/${total}…`, done, total);
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

  if (onProgress) onProgress('正在加密内容…', done, total);

  const normalized = normalize(next);
  const sealed = await encryptJSON(normalized);
  files.push({ path: CONTENT_ENC, base64: bytesToBase64(sealed) });
  /* 早期版本留下的明文文件，顺手删掉 */
  files.push({ path: PLAIN_CONTENT, remove: true });

  /* 登录页显示的名字跟着「你们的名字」走 */
  const names = [normalized.couple.from, normalized.couple.to];
  const lockNext = lockJsonWithNames(names);
  if (lockNext) {
    const lockText = `${JSON.stringify(lockNext, null, 2)}\n`;
    files.push({ path: 'lock.json', base64: bytesToBase64(new TextEncoder().encode(lockText)) });
  }

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

  rememberNames(names);

  return {
    content: normalized,
    commit: commit.sha,
    files: commit.files,
    uploaded,
    jsonBytes: sealed.length
  };
}
