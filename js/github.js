/* =========================================================
   GitHub API：把一次发布的所有改动合成一个 commit
   ========================================================= */

const API = 'https://api.github.com';

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function req(token, path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: headers(token),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (err) {
    const e = new Error('连不上 GitHub，检查一下网络？');
    e.status = 0;
    e.cause = err;
    throw e;
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    data = null;
  }

  if (!res.ok) {
    const e = new Error((data && data.message) || `HTTP ${res.status}`);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data;
}

/** 把 API 的报错翻译成能看懂的话 */
export function describeError(err) {
  const status = err && err.status;
  const raw = (err && err.message) || '';
  if (status === 401) return 'Token 无效或已过期，重新生成一个吧';
  if (status === 403) {
    if (/rate limit/i.test(raw)) return '请求太频繁，GitHub 限流了，等几分钟再试';
    return 'Token 没有写入权限：仓库设置里把 Contents 改成 Read and write';
  }
  if (status === 404) return '找不到仓库或分支，检查一下「用户名/仓库名」和分支名';
  if (status === 409) return '远端刚刚有更新，刷新页面重新编辑一次';
  if (status === 422) return raw ? `提交被 GitHub 拒绝了：${raw}` : '提交被 GitHub 拒绝了，稍后再试';
  if (status === 0) return raw || '连不上 GitHub';
  return raw ? `提交失败：${raw}` : '提交失败，稍后再试';
}

export function getRepo(token, owner, repo) {
  return req(token, `/repos/${owner}/${repo}`);
}

export function getBranchHead(token, owner, repo, branch) {
  return req(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
}

export function getTree(token, owner, repo, sha) {
  return req(token, `/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`);
}

export function getLatestCommitMessage(token, owner, repo, branch) {
  return req(token, `/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`).then(
    (c) => (c && c.commit && c.commit.message) || ''
  );
}

/**
 * 原子提交：所有文件合成一个 commit，中途失败不会留下半套内容。
 * files: [{ path, base64 }]，`{ path, remove: true }` 表示删掉这个文件
 */
export async function commitFiles(token, { owner, repo, branch, message, files }) {
  const ref = await getBranchHead(token, owner, repo, branch);
  const parentSha = ref.object.sha;
  const parent = await req(token, `/repos/${owner}/${repo}/git/commits/${parentSha}`);

  /* 删一个已经不存在的文件，GitHub 会回 422 GitRPC::BadObjectState，
     所以先看清楚远端到底有哪些路径，只删真在的 */
  let existing = null;
  if (files.some((f) => f.remove)) {
    const tree = await getTree(token, owner, repo, parent.tree.sha);
    existing = new Set((tree.tree || []).filter((t) => t.type === 'blob').map((t) => t.path));
  }

  const entries = [];
  for (const f of files) {
    if (f.remove) {
      if (existing && !existing.has(f.path)) continue;
      entries.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    const blob = await req(token, `/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      body: { content: f.base64, encoding: 'base64' }
    });
    entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  if (!entries.length) {
    const e = new Error('这次没有需要提交的改动');
    e.status = -1;
    throw e;
  }

  const tree = await req(token, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: { base_tree: parent.tree.sha, tree: entries }
  });

  const commit = await req(token, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: { message, tree: tree.sha, parents: [parentSha] }
  });

  await req(token, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: { sha: commit.sha, force: false }
  });

  return { sha: commit.sha, files: entries.length };
}
