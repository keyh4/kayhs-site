/**
 * kayhs 站点后端 v3
 * 平台：Cloudflare Workers + Workers Assets + R2 + KV
 *
 * 与 v2 的关键差异：
 *   1. 前端不再内联在 Worker 里，改由 Workers Assets 托管（public/ 目录）。
 *      这样重新部署 Worker 不会导致前端消失。
 *   2. 云盘读取接口全部加上鉴权。v2 的 /api/drive/list 与 /api/drive/download/:id
 *      任何人都能访问，等于云盘全公开。
 *   3. 管理员口令哈希不再硬编码在源码里（仓库是公开的，等于把哈希泄露给全世界，
 *      且 v2 用的是无盐 SHA-256，可离线爆破）。改为读取加密 Secret。
 *   4. CORS 不再返回 *，收敛到本站源。
 *   5. 云盘改为以 R2 的 key 作为路径，支持文件夹、重命名、移动、批量删除、分享链接。
 *      元数据直接存在 R2 customMetadata，不再用 KV 存一个大数组
 *      （KV 是最终一致的，刚上传的文件可能查不到；单 key 数组也会随文件数无限增长）。
 *   6. 博客文章存在 R2，通过 API 读取，不再硬编码在前端。
 */

const TOKEN_TTL_SEC = 7 * 24 * 60 * 60; // 7 天
const DRIVE_PREFIX = 'd/';
const BLOG_PREFIX = '_blog/';
const QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // R2 免费额度

const RATE_LOGIN_PER_MIN = 5;
const RATE_PUBLIC_WRITE_PER_MIN = 3;

// 允许跨域的来源。前后端同源后其实用不到跨域，保留是为了本地开发调试。
const ALLOWED_ORIGINS = ['https://kayhs.qzz.io', 'http://localhost:8787', 'http://127.0.0.1:8787'];

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */

function siteOrigin(env) {
  return (env.SITE_ORIGIN || 'https://kayhs.qzz.io').replace(/\/$/, '');
}

function corsHeaders(request, env) {
  const origin = request?.headers?.get('Origin');
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  // 只回显白名单内的来源，不再无脑返回 *
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
  } else {
    h['Access-Control-Allow-Origin'] = siteOrigin(env);
  }
  return h;
}

const json = (data, status, request, env) =>
  new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request, env) },
  });

const fail = (message, status, request, env) => json({ error: message }, status || 400, request, env);

function clientIP(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
}

/** 定长时间比较，避免通过响应耗时推测 token 前缀 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 密码存储格式：salt$sha256(salt + password)。用 wrangler secret put ADMIN_CREDENTIAL 设置。 */
async function verifyPassword(raw, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes('$')) return false;
  const [salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const candidate = await sha256Hex(salt + raw);
  return safeEqual(candidate, hash);
}

function randomToken(bytes = 24) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function genId() {
  return Date.now().toString(36) + randomToken(4);
}

/** 短码：去掉易混淆字符，用加密随机数而非 Math.random */
const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
function genCode(len = 6) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[arr[i] % CODE_ALPHABET.length];
  return out;
}

/* ------------------------------------------------------------------ *
 * 路径与输入净化
 * ------------------------------------------------------------------ */

/**
 * 把用户给的路径规范化成 R2 key 片段。
 * 关键：丢弃所有 .. 段，防止穿越到 _blog/ 等其他前缀。
 */
function normalizePath(input) {
  if (input === null || input === undefined) return '';
  let s = String(input).replace(/\\/g, '/');
  s = s.replace(/[\x00-\x1f]/g, ''); // 控制字符
  const segs = s.split('/').filter((seg) => seg !== '' && seg !== '.' && seg !== '..');
  const joined = segs.join('/');
  if (joined.length > 900) return null; // R2 key 上限 1024，留出前缀余量
  if (segs.some((seg) => seg.length > 200)) return null;
  return joined;
}

const toKey = (path) => DRIVE_PREFIX + (path || '');

/** 从 key 还原用户可见路径 */
const fromKey = (key) => (key || '').startsWith(DRIVE_PREFIX) ? key.slice(DRIVE_PREFIX.length) : key;

/**
 * 只接受 http/https 链接。
 * v2 直接存前端传来的 url，可以塞 javascript: 造成点击即执行。
 */
function sanitizeUrl(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length > 2048) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname || u.hostname.includes(' ')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** 纯文本净化：去掉换行与控制字符，限长。用于名称、标题等短字段。 */
function cleanText(raw, maxLen = 200) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\x00-\x1f]/g, ' ').trim().slice(0, maxLen);
}

/* ------------------------------------------------------------------ *
 * KV 辅助 + 限流
 * ------------------------------------------------------------------ */

async function kvReadJSON(env, key, fallback) {
  try {
    const raw = await env.KV.get(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function kvWriteJSON(env, key, value, ttlSec) {
  await env.KV.put(key, JSON.stringify(value), ttlSec ? { expirationTtl: ttlSec } : undefined);
}

/**
 * 限流。只对「登录」和「未登录的公开写入」计数——
 * 已登录的写操作没必要再刷 KV（免费额度每天只有 1000 次写）。
 */
async function rateLimit(env, request, bucket, limitPerMin) {
  const ip = clientIP(request);
  const minute = Math.floor(Date.now() / 60000);
  const key = `rl:${bucket}:${ip}:${minute}`;
  const current = parseInt((await env.KV.get(key)) || '0', 10) || 0;
  if (current >= limitPerMin) return false;
  await env.KV.put(key, String(current + 1), { expirationTtl: 180 });
  return true;
}

/* ------------------------------------------------------------------ *
 * 鉴权
 * ------------------------------------------------------------------ */

async function sessionOf(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token || token.length < 16) return null;
  const raw = await env.KV.get(`sess:${token}`);
  if (!raw) return null;
  try {
    const sess = JSON.parse(raw);
    if (!sess.expiresAt || sess.expiresAt < Date.now()) {
      await env.KV.delete(`sess:${token}`);
      return null;
    }
    return { ...sess, token };
  } catch {
    return null;
  }
}

function authHeaders(request) {
  return { Authorization: request.headers.get('Authorization') || '' };
}

/** 需要登录的接口统一走这里，返回 null 表示通过 */
async function requireSession(request, env) {
  const sess = await sessionOf(request, env);
  if (!sess) return { error: '未登录或登录已过期', status: 401 };
  return { session: sess };
}

async function handleLogin(request, env) {
  if (!await rateLimit(env, request, 'login', RATE_LOGIN_PER_MIN)) {
    return fail('尝试过于频繁，请 1 分钟后再试', 429, request, env);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return fail('请求体不是合法 JSON', 400, request, env);
  }

  const username = cleanText(body?.username, 64);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username || !password) return fail('账号和密码必填', 400, request, env);

  const expectUser = env.ADMIN_USER || 'kayhs';
  const credential = env.ADMIN_CREDENTIAL;
  if (!credential) {
    // 不要静默放行，也不要泄露细节
    return fail('服务端未配置登录凭据', 503, request, env);
  }

  const userOk = safeEqual(username, expectUser);
  const passOk = await verifyPassword(password, credential);
  if (!userOk || !passOk) return fail('账号或密码错误', 401, request, env);

  const token = randomToken(32);
  const expiresAt = Date.now() + TOKEN_TTL_SEC * 1000;
  await env.KV.put(`sess:${token}`, JSON.stringify({ username, createdAt: Date.now(), expiresAt }), {
    expirationTtl: TOKEN_TTL_SEC,
  });

  return json({ token, username, expiresAt }, 200, request, env);
}

async function handleLogout(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (header.startsWith('Bearer ')) await env.KV.delete(`sess:${header.slice(7).trim()}`);
  return json({ ok: true }, 200, request, env);
}

async function handleSessionCheck(request, env) {
  const sess = await sessionOf(request, env);
  if (!sess) return json({ loggedIn: false }, 401, request, env);
  return json({ loggedIn: true, username: sess.username, expiresAt: sess.expiresAt }, 200, request, env);
}

/* ------------------------------------------------------------------ *
 * 云盘（R2）
 * ------------------------------------------------------------------ */

/** 分页取完某个前缀下的对象，返回 { objects, folders } */
async function listPrefix(env, prefix, delimiter) {
  const objects = [];
  const folders = new Set();
  let cursor;
  let guard = 0;
  do {
    const page = await env.R2.list({ prefix, delimiter, cursor, limit: 1000 });
    for (const o of page.objects || []) objects.push(o);
    for (const p of page.delimitedPrefixes || []) folders.add(p);
    cursor = page.truncated ? page.cursor : undefined;
    guard++;
  } while (cursor && guard < 20); // 最多 2 万个对象，个人站点足够
  return { objects, folders: [...folders] };
}

function metaOf(obj) {
  const m = obj.customMetadata || {};
  return {
    path: fromKey(obj.key),
    name: m.name || fromKey(obj.key).split('/').pop(),
    size: obj.size,
    type: obj.httpMetadata?.contentType || m.type || 'application/octet-stream',
    createdAt: Number(m.createdAt) || obj.uploaded?.getTime() || Date.now(),
    modifiedAt: obj.uploaded?.getTime() || Date.now(),
  };
}

async function driveList(request, env) {
  const url = new URL(request.url);
  const dirPath = normalizePath(url.searchParams.get('path') || '');
  if (dirPath === null) return fail('路径不合法', 400, request, env);

  const prefix = toKey(dirPath ? dirPath + '/' : '');
  const { objects, folders } = await listPrefix(env, prefix, '/');

  // .keep 只是用来让空文件夹在 R2 里存在的占位对象，不展示给用户
  const files = objects.filter((o) => !o.key.endsWith('/.keep')).map(metaOf);
  const dirs = folders
    .map((f) => f.slice(prefix.length).replace(/\/$/, ''))
    .filter(Boolean)
    .map((name) => ({ name, path: (dirPath ? dirPath + '/' : '') + name }));

  // 总用量需要扫全量（不受当前目录限制）
  const all = await listPrefix(env, DRIVE_PREFIX);
  const totalSize = all.objects.reduce((sum, o) => sum + o.size, 0);

  return json(
    {
      path: dirPath,
      folders: dirs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
      files,
      totalSize,
      quota: QUOTA_BYTES,
      count: all.objects.length,
    },
    200,
    request,
    env
  );
}

async function driveUpload(request, env) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return fail('请按 multipart/form-data 上传', 400, request, env);
  }

  const dirPath = normalizePath(form.get('path') || '');
  if (dirPath === null) return fail('路径不合法', 400, request, env);

  const uploaded = [];
  const entries = form.getAll('file');
  if (!entries.length) return fail('未找到文件', 400, request, env);

  for (const file of entries) {
    if (!file || typeof file === 'string') continue;
    const name = normalizePath(file.name || 'unnamed');
    if (!name) continue; // 名字里带 .. 之类的直接跳过
    const key = toKey((dirPath ? dirPath + '/' : '') + name);

    await env.R2.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
      customMetadata: {
        name: name.split('/').pop(),
        createdAt: String(Date.now()),
        type: file.type || 'application/octet-stream',
      },
    });
    uploaded.push({ path: fromKey(key), name, size: file.size });
  }

  if (!uploaded.length) return fail('没有可保存的文件', 400, request, env);
  return json({ ok: true, files: uploaded }, 200, request, env);
}

async function driveMkdir(request, env, session) {
  const body = await readJSON(request);
  const raw = normalizePath(body?.path);
  if (!raw) return fail('目录名不合法', 400, request, env);

  const markerKey = toKey(raw + '/.keep');
  const exists = await env.R2.head(markerKey);
  if (exists) return fail('目录已存在', 409, request, env);

  await env.R2.put(markerKey, new Uint8Array(0), {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: { name: '.keep', createdAt: String(Date.now()), hidden: '1' },
  });
  return json({ ok: true, path: raw }, 200, request, env);
}

/**
 * 移动 / 重命名。R2 没有原生 rename，只能 copy + delete。
 * 同时支持两种目标：单个文件，或整个文件夹（按前缀逐个搬）。
 * copy 是 R2 服务端行为，不占 Worker 的 CPU 时间。
 */
async function driveMove(request, env) {
  const body = await readJSON(request);
  const destDir = normalizePath(body?.dest ?? '');
  if (destDir === null) return fail('目标目录不合法', 400, request, env);

  // rename：仅在移动单个条目时生效，作为新的名字
  const renameTo = body?.rename ? normalizePath(body.rename) : null;
  if (body?.rename && !renameTo) return fail('新名称不合法', 400, request, env);

  const items = Array.isArray(body?.paths) ? body.paths : [body?.from];
  const moved = [];
  const skipped = [];

  for (const item of items) {
    if (typeof item !== 'string') continue;
    const src = normalizePath(item);
    if (!src) { skipped.push(String(item)); continue; }

    const baseName = src.split('/').pop();
    // 目标名：显式 rename 优先，否则沿用原名（仅对单条目允许 rename）
    const targetName = renameTo && items.length === 1 ? renameTo.split('/').pop() : baseName;
    const destPath = destDir ? destDir + '/' + targetName : targetName;

    const srcKey = toKey(src);
    const destKey = toKey(destPath);
    if (destKey === srcKey) { skipped.push(src); continue; }

    const head = await env.R2.head(srcKey);
    if (head) {
      /* ---- 单个文件 ---- */
      const obj = await env.R2.get(srcKey);
      if (!obj) { skipped.push(src); continue; }
      await env.R2.put(destKey, obj.body, {
        httpMetadata: obj.httpMetadata,
        customMetadata: { ...obj.customMetadata, movedAt: String(Date.now()) },
      });
      await env.R2.delete(srcKey);
      moved.push({ from: src, to: destPath });
      continue;
    }

    /* ---- 文件夹：搬走该前缀下所有对象 ---- */
    const srcPrefix = toKey(src + '/');
    const { objects } = await listPrefix(env, srcPrefix);
    if (!objects.length) { skipped.push(src); continue; }

    const destPrefix = toKey(destPath + '/');
    let count = 0;
    for (const o of objects) {
      const rel = o.key.slice(srcPrefix.length);
      if (!rel) continue;
      const obj = await env.R2.get(o.key);
      if (!obj) continue;
      await env.R2.put(destPrefix + rel, obj.body, {
        httpMetadata: obj.httpMetadata,
        customMetadata: { ...obj.customMetadata, movedAt: String(Date.now()) },
      });
      await env.R2.delete(o.key);
      count++;
    }
    if (count) moved.push({ from: src + '/', to: destPath + '/', count });
    else skipped.push(src);
  }

  if (!moved.length) return fail('没有可移动的项' + (skipped.length ? '（跳过：' + skipped.join(', ') + '）' : ''), 400, request, env);
  return json({ ok: true, moved, skipped }, 200, request, env);
}

async function driveDelete(request, env) {
  const url = new URL(request.url);
  const body = request.method === 'POST' ? await readJSON(request) : {};
  const targets = Array.isArray(body?.paths) && body.paths.length
    ? body.paths
    : [body?.path || url.searchParams.get('path')];

  const removed = [];
  for (const t of targets) {
    const p = normalizePath(t);
    if (!p) continue;
    const key = toKey(p);
    const obj = await env.R2.head(key);
    if (obj) {
      await env.R2.delete(key);
      removed.push(p);
      continue;
    }
    // 不是文件就当目录处理：删掉该前缀下所有对象
    const { objects } = await listPrefix(env, toKey(p + '/'));
    if (objects.length) {
      await env.R2.delete(objects.map((o) => o.key));
      removed.push(p + '/ (' + objects.length + ' 项)');
    }
  }

  if (!removed.length) return fail('没有可删除的项', 404, request, env);
  return json({ ok: true, removed }, 200, request, env);
}

/**
 * 读取文件内容。inline=1 时用于浏览器内预览（文本/图片/PDF），
 * 否则按附件下载。
 * 文件名用 RFC 5987 编码，中文名才不会变成乱码。
 */
async function driveRaw(request, env) {
  const url = new URL(request.url);
  const p = normalizePath(url.searchParams.get('path'));
  if (!p) return fail('路径不合法', 400, request, env);

  const obj = await env.R2.get(toKey(p));
  if (!obj) return fail('文件不存在', 404, request, env);

  const name = obj.customMetadata?.name || p.split('/').pop();
  const inline = url.searchParams.get('inline') === '1';
  const type = obj.httpMetadata?.contentType || 'application/octet-stream';

  return new Response(obj.body, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(obj.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, max-age=60',
      ...corsHeaders(request, env),
    },
  });
}

/* ---------- 分享链接：公开只读，不需要登录 ---------- */

async function driveShareCreate(request, env) {
  const body = await readJSON(request);
  const p = normalizePath(body?.path);
  if (!p) return fail('路径不合法', 400, request, env);

  const obj = await env.R2.head(toKey(p));
  if (!obj) return fail('文件不存在', 404, request, env);

  const days = Math.min(Math.max(parseInt(body?.days, 10) || 7, 1), 365);
  const token = randomToken(16);
  await env.KV.put(`share:${token}`, JSON.stringify({ path: p, createdAt: Date.now(), days }), {
    expirationTtl: days * 86400,
  });

  const link = `${siteOrigin(env)}/f/${token}`;
  return json({ token, url: link, expiresInDays: days }, 200, request, env);
}

async function driveShareList(env, request) {
  const { keys } = await env.KV.list({ prefix: 'share:', limit: 200 });
  const items = [];
  for (const k of keys) {
    const raw = await env.KV.get(k.name);
    if (!raw) continue;
    try {
      const v = JSON.parse(raw);
      items.push({ token: k.name.slice(6), path: v.path, createdAt: v.createdAt, expiresAt: k.expiration });
    } catch { /* 跳过坏数据 */ }
  }
  return json({ items }, 200, request, env);
}

async function driveShareRevoke(request, env, token) {
  if (!/^[a-f0-9]{16,64}$/.test(token || '')) return fail('无效的分享标识', 400, request, env);
  await env.KV.delete(`share:${token}`);
  return json({ ok: true }, 200, request, env);
}

/** 公开下载入口：/f/:token */
async function publicFile(request, env, token) {
  if (!/^[a-f0-9]{16,64}$/.test(token || '')) return fail('链接无效', 400, request, env);
  const raw = await env.KV.get(`share:${token}`);
  if (!raw) return fail('链接不存在或已过期', 404, request, env);

  let info;
  try { info = JSON.parse(raw); } catch { return fail('链接数据损坏', 500, request, env); }

  const obj = await env.R2.get(toKey(info.path));
  if (!obj) return fail('文件已被删除', 404, request, env);

  const name = obj.customMetadata?.name || String(info.path).split('/').pop();
  const inline = new URL(request.url).searchParams.get('inline') === '1';
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, max-age=60',
    },
  });
}

/* ------------------------------------------------------------------ *
 * 短链接
 * ------------------------------------------------------------------ */

async function shortCreate(request, env) {
  const body = await readJSON(request);
  const target = sanitizeUrl(body?.url);
  if (!target) return fail('请提供以 http:// 或 https:// 开头的有效链接', 400, request, env);

  const custom = cleanText(body?.code, 32).toLowerCase();
  let code = custom || genCode();
  if (custom && !/^[a-z0-9_-]{3,32}$/.test(custom)) return fail('自定义短码只能用小写字母、数字、- 和 _', 400, request, env);

  const existing = await env.KV.get(`short:${code}`);
  if (existing) return fail('该短码已被占用', 409, request, env);

  const note = cleanText(body?.note, 120);
  await env.KV.put(`short:${code}`, JSON.stringify({ url: target, note, views: 0, createdAt: Date.now() }));
  return json({ code, url: target, link: `${siteOrigin(env)}/s/${code}` }, 200, request, env);
}

async function shortList(request, env) {
  const { keys } = await env.KV.list({ prefix: 'short:', limit: 500 });
  const items = [];
  for (const k of keys) {
    const raw = await env.KV.get(k.name);
    if (!raw) continue;
    try {
      const v = JSON.parse(raw);
      items.push({ code: k.name.slice(6), url: v.url, note: v.note || '', views: v.views || 0, createdAt: v.createdAt });
    } catch { /* 跳过 */ }
  }
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return json({ items }, 200, request, env);
}

async function shortDelete(request, env, code) {
  if (!/^[a-z0-9_-]{3,32}$/.test(code || '')) return fail('无效的短码', 400, request, env);
  await env.KV.delete(`short:${code}`);
  return json({ ok: true }, 200, request, env);
}

async function shortRedirect(request, env, code) {
  if (!/^[a-z0-9_-]{3,32}$/.test(code || '')) return new Response('Not Found', { status: 404 });
  const raw = await env.KV.get(`short:${code}`);
  if (!raw) return new Response('短链接不存在或已删除', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  let item;
  try { item = JSON.parse(raw); } catch { return new Response('Bad Gateway', { status: 502 }); }

  // 访问计数是尽力而为，失败不影响跳转
  try {
    item.views = (item.views || 0) + 1;
    await env.KV.put(`short:${code}`, JSON.stringify(item));
  } catch { /* 忽略 */ }

  return Response.redirect(item.url, 302);
}

/* ------------------------------------------------------------------ *
 * 书签导航 / 代码片段 / 留言板（KV，按条目分 key 存储）
 * ------------------------------------------------------------------ */

async function listCollection(env, prefix, request) {
  const { keys } = await env.KV.list({ prefix, limit: 1000 });
  const items = [];
  for (const k of keys) {
    const raw = await env.KV.get(k.name);
    if (!raw) continue;
    try { items.push({ id: k.name.slice(prefix.length), ...JSON.parse(raw) }); } catch { /* 跳过 */ }
  }
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return json({ items }, 200, request, env);
}

async function bookmarkAdd(request, env) {
  if (!await rateLimit(env, request, 'bm', 30)) return fail('操作过于频繁', 429, request, env);
  const body = await readJSON(request);

  const name = cleanText(body?.name, 80);
  const url = sanitizeUrl(body?.url);
  if (!name) return fail('名称必填', 400, request, env);
  if (!url) return fail('请提供以 http:// 或 https:// 开头的有效链接', 400, request, env);

  const id = genId();
  await env.KV.put(`bm:${id}`, JSON.stringify({
    name,
    url,
    cat: cleanText(body?.cat, 40) || '未分类',
    note: cleanText(body?.note, 200),
    createdAt: Date.now(),
  }));
  return json({ ok: true, id }, 200, request, env);
}

async function snippetAdd(request, env) {
  const body = await readJSON(request);
  const title = cleanText(body?.title, 120);
  const code = typeof body?.code === 'string' ? body.code : '';
  if (!title) return fail('标题必填', 400, request, env);
  if (!code.trim()) return fail('代码不能为空', 400, request, env);
  if (code.length > 200000) return fail('单个片段不能超过 200KB', 413, request, env);

  const id = genId();
  await env.KV.put(`snip:${id}`, JSON.stringify({
    title,
    lang: cleanText(body?.lang, 30) || 'text',
    note: cleanText(body?.note, 300),
    code,
    createdAt: Date.now(),
  }));
  return json({ ok: true, id }, 200, request, env);
}

/*
 * 留言板写入。校验顺序：内容 → 鉴权 → 限流 → 写入。
 *
 * 限流放最后是有意的：rateLimit 每次都要读写 KV，而 KV 免费额度每天只有
 * 1000 次写入。若先限流再校验，空内容/超长/含违规词的无效请求也会白白吃掉
 * 配额，等于给别人一个刷爆 KV 的入口。先做零成本的内容校验，能挡掉绝大多数。
 *
 * 要求登录：前端界面写的就是「留言需要登录」，后端必须与之一致
 * （旧版前端要登录、后端却放行匿名，属于文案与实现矛盾）。读取仍公开。
 */
async function guestbookAdd(request, env) {
  const body = await readJSON(request);
  const name = cleanText(body?.name, 40) || '匿名';
  const msg = typeof body?.msg === 'string' ? body.msg.replace(/[\x00-\x08\x0b-\x1f]/g, '').trim() : '';

  // 1. 内容校验（纯计算，不碰 KV）
  if (!msg) return fail('留言内容不能为空', 400, request, env);
  if (msg.length > 500) return fail('留言不能超过 500 字', 400, request, env);
  if (/<\s*script|javascript:|on\w+\s*=/i.test(msg) || /<\s*script|javascript:/i.test(name)) {
    return fail('留言包含不允许的内容', 400, request, env);
  }

  // 2. 鉴权
  const auth = await requireSession(request, env);
  if (auth.error) return fail(auth.error, auth.status, request, env);

  // 3. 限流（校验与鉴权都通过后才计数）
  if (!await rateLimit(env, request, 'gb', RATE_PUBLIC_WRITE_PER_MIN)) {
    return fail('留言太频繁了，请稍后再试', 429, request, env);
  }

  const id = genId();
  await env.KV.put(`gb:${id}`, JSON.stringify({ name, msg, ip: clientIP(request), createdAt: Date.now() }));
  return json({ ok: true, id }, 200, request, env);
}

/** 对外返回时剥掉 IP，避免把访客信息暴露出去 */
async function guestbookList(request, env) {
  const { keys } = await env.KV.list({ prefix: 'gb:', limit: 300 });
  const items = [];
  for (const k of keys) {
    const raw = await env.KV.get(k.name);
    if (!raw) continue;
    try {
      const v = JSON.parse(raw);
      items.push({ id: k.name.slice(3), name: v.name, msg: v.msg, createdAt: v.createdAt });
    } catch { /* 跳过 */ }
  }
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return json({ items }, 200, request, env);
}

async function deleteEntry(request, env, prefix, id) {
  if (!id || !/^[a-z0-9]{6,40}$/i.test(id)) return fail('无效标识', 400, request, env);
  await env.KV.delete(prefix + id);
  return json({ ok: true }, 200, request, env);
}

/* ------------------------------------------------------------------ *
 * 博客（Markdown 存 R2）
 * ------------------------------------------------------------------ */

/** 极简 front matter 解析。内容是自己写的，不是外部输入。 */
function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (/^\[.*\]$/.test(val)) {
      meta[key] = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      meta[key] = val.replace(/^["']|["']$/g, '');
    }
  }
  return { meta, body: text.slice(m[0].length) };
}

async function blogList(request, env) {
  const { objects } = await listPrefix(env, BLOG_PREFIX);
  const posts = [];
  for (const o of objects) {
    if (!o.key.endsWith('.md')) continue;
    const obj = await env.R2.get(o.key);
    if (!obj) continue;
    const text = await obj.text();
    const { meta, body } = parseFrontMatter(text);
    const slug = o.key.slice(BLOG_PREFIX.length).replace(/\.md$/, '');
    posts.push({
      slug,
      title: meta.title || slug,
      date: meta.date || '',
      tags: Array.isArray(meta.tags) ? meta.tags : (meta.tags ? [meta.tags] : []),
      summary: meta.summary || body.replace(/[#>*`\-]/g, '').trim().slice(0, 120),
      words: body.length,
      draft: meta.draft === 'true',
    });
  }
  const published = posts.filter((p) => !p.draft).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return json({ posts: published }, 200, request, env);
}

async function blogGet(request, env, slug) {
  if (!/^[a-z0-9\-_]{1,80}$/i.test(slug || '')) return fail('文章不存在', 404, request, env);
  const obj = await env.R2.get(BLOG_PREFIX + slug + '.md');
  if (!obj) return fail('文章不存在', 404, request, env);
  const text = await obj.text();
  const { meta, body } = parseFrontMatter(text);
  return json({
    slug,
    title: meta.title || slug,
    date: meta.date || '',
    tags: Array.isArray(meta.tags) ? meta.tags : (meta.tags ? [meta.tags] : []),
    summary: meta.summary || '',
    body,
    updatedAt: obj.uploaded?.toISOString() || '',
  }, 200, request, env);
}

/** 新建/更新文章。body 是 Markdown 原文，meta 单独传，由服务端拼 front matter */
async function blogSave(request, env, slug) {
  const body = await readJSON(request);
  const target = slug && slug !== 'new' ? slug : cleanText(body?.slug, 80).toLowerCase().replace(/[^a-z0-9\-_]/g, '-');
  if (!/^[a-z0-9\-_]{1,80}$/i.test(target)) return fail('slug 只能用小写字母、数字、- 和 _', 400, request, env);

  const title = cleanText(body?.title, 160);
  const content = typeof body?.content === 'string' ? body?.content : '';
  if (!title) return fail('标题必填', 400, request, env);
  if (!content.trim()) return fail('正文不能为空', 400, request, env);
  if (content.length > 400000) return fail('正文过长', 413, request, env);

  const tags = Array.isArray(body?.tags) ? body.tags.map((t) => cleanText(t, 30)).filter(Boolean).slice(0, 8) : [];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body?.date || '') ? body.date : new Date().toISOString().slice(0, 10);

  const fm = [
    '---',
    `title: ${title.replace(/\n/g, ' ')}`,
    `date: ${date}`,
    `tags: [${tags.join(', ')}]`,
    `summary: ${cleanText(body?.summary, 200)}`,
    body?.draft ? 'draft: true' : null,
    '---',
    '',
  ].filter((l) => l !== null).join('\n');

  await env.R2.put(BLOG_PREFIX + target + '.md', fm + content, {
    httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
    customMetadata: { updatedAt: String(Date.now()) },
  });
  return json({ ok: true, slug: target }, 200, request, env);
}

async function blogDelete(request, env, slug) {
  if (!/^[a-z0-9\-_]{1,80}$/i.test(slug || '')) return fail('文章不存在', 404, request, env);
  await env.R2.delete(BLOG_PREFIX + slug + '.md');
  return json({ ok: true }, 200, request, env);
}

/** RSS 2.0 输出。XML 里所有用户内容都要转义，否则一篇文章就能破坏整个源。 */
function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function blogFeed(request, env) {
  const origin = siteOrigin(env);
  const { objects } = await listPrefix(env, BLOG_PREFIX);
  const posts = [];
  for (const o of objects) {
    if (!o.key.endsWith('.md')) continue;
    const obj = await env.R2.get(o.key);
    if (!obj) continue;
    const { meta, body } = parseFrontMatter(await obj.text());
    if (meta.draft === 'true') continue;
    const slug = o.key.slice(BLOG_PREFIX.length).replace(/\.md$/, '');
    posts.push({
      slug,
      title: meta.title || slug,
      date: meta.date || '',
      summary: meta.summary || body.replace(/[#>*`\-]/g, '').trim().slice(0, 160),
      updated: o.uploaded?.toISOString() || '',
    });
  }
  posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const items = posts.slice(0, 20).map((p) => {
    const link = origin + '/blog/' + p.slug;
    const pubDate = p.date ? new Date(p.date + 'T00:00:00Z').toUTCString() : (p.updated || new Date().toUTCString());
    return `    <item>
      <title>${xmlEscape(p.title)}</title>
      <link>${xmlEscape(link)}</link>
      <guid isPermaLink="true">${xmlEscape(link)}</guid>
      <pubDate>${xmlEscape(pubDate)}</pubDate>
      <description>${xmlEscape(p.summary)}</description>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>kayhs 博客</title>
    <link>${xmlEscape(origin)}/blog</link>
    <description>kayhs 的技术与思考记录</description>
    <language>zh-CN</language>
    <atom:link href="${xmlEscape(origin)}/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      ...corsHeaders(request, env),
    },
  });
}

/* ------------------------------------------------------------------ *
 * 杂项
 * ------------------------------------------------------------------ */

async function readJSON(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function handleStats(request, env) {
  const drive = await listPrefix(env, DRIVE_PREFIX);
  const [shorts, bms, snips, gbs] = await Promise.all([
    env.KV.list({ prefix: 'short:', limit: 1000 }),
    env.KV.list({ prefix: 'bm:', limit: 1000 }),
    env.KV.list({ prefix: 'snip:', limit: 1000 }),
    env.KV.list({ prefix: 'gb:', limit: 1000 }),
  ]);
  const blog = await listPrefix(env, BLOG_PREFIX);

  return json({
    drive: {
      files: drive.objects.length,
      bytes: drive.objects.reduce((s, o) => s + o.size, 0),
      quota: QUOTA_BYTES,
    },
    shortLinks: shorts.keys.length,
    bookmarks: bms.keys.length,
    snippets: snips.keys.length,
    guestbook: gbs.keys.length,
    posts: blog.objects.filter((o) => o.key.endsWith('.md')).length,
    serverTime: Date.now(),
  }, 200, request, env);
}

/* ------------------------------------------------------------------ *
 * 路由
 * ------------------------------------------------------------------ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    /* ---- 公开接口：不需要登录 ---- */
    if (path === '/api/ping' || path === '/api/health') {
      return json({ status: 'ok', time: Date.now(), version: 3 }, 200, request, env);
    }
    if (path === '/api/login' && request.method === 'POST') return handleLogin(request, env);
    if (path === '/api/logout' && request.method === 'POST') return handleLogout(request, env);
    if (path === '/api/auth/check' && request.method === 'GET') return handleSessionCheck(request, env);

    if (path.startsWith('/s/') && request.method === 'GET') {
      return shortRedirect(request, env, decodeURIComponent(path.slice(3)));
    }
    if (path.startsWith('/f/') && request.method === 'GET') {
      return publicFile(request, env, decodeURIComponent(path.slice(3)));
    }
    if ((path === '/feed.xml' || path === '/rss.xml') && request.method === 'GET') {
      return blogFeed(request, env);
    }

    if (path === '/api/guestbook' && request.method === 'GET') return guestbookList(request, env);
    // POST 放在公开区是刻意的：它内部按「内容校验 → 鉴权 → 限流」的顺序处理，
    // 让无效内容在不消耗 KV 配额的情况下就被挡掉。不要把它挪到下面的鉴权区，
    // 那样会变成「先鉴权再校验内容」，无效请求同样能刷限流计数。
    if (path === '/api/guestbook' && request.method === 'POST') return guestbookAdd(request, env);
    if (path === '/api/blog' && request.method === 'GET') return blogList(request, env);
    if (path === '/api/blog/' && request.method === 'GET') return blogList(request, env);
    if (path.startsWith('/api/blog/') && request.method === 'GET') {
      return blogGet(request, env, decodeURIComponent(path.slice('/api/blog/'.length)));
    }

    /* ---- 以下全部需要登录 ---- */
    if (path.startsWith('/api/')) {
      const auth = await requireSession(request, env);
      if (auth.error) return fail(auth.error, auth.status, request, env);
      const method = request.method;

      /* 云盘 */
      if (path === '/api/drive/list' && method === 'GET') return driveList(request, env);
      if (path === '/api/drive/upload' && method === 'POST') return driveUpload(request, env);
      if (path === '/api/drive/mkdir' && method === 'POST') return driveMkdir(request, env, auth.session);
      if (path === '/api/drive/move' && method === 'POST') return driveMove(request, env);
      if (path === '/api/drive/delete' && method === 'POST') return driveDelete(request, env);
      if (path === '/api/drive' && method === 'DELETE') return driveDelete(request, env);
      if (path === '/api/drive/raw' && method === 'GET') return driveRaw(request, env);
      if (path === '/api/drive/share' && method === 'POST') return driveShareCreate(request, env);
      if (path === '/api/drive/share' && method === 'GET') return driveShareList(env, request);
      if (path.startsWith('/api/drive/share/') && method === 'DELETE') {
        return driveShareRevoke(request, env, decodeURIComponent(path.slice('/api/drive/share/'.length)));
      }

      /* 短链 */
      if (path === '/api/short' && method === 'POST') return shortCreate(request, env);
      if (path === '/api/short/list' && method === 'GET') return shortList(request, env);
      if (path.startsWith('/api/short/') && method === 'DELETE') {
        return shortDelete(request, env, decodeURIComponent(path.slice('/api/short/'.length)));
      }

      /* 书签 */
      if (path === '/api/nav' && method === 'GET') return listCollection(env, 'bm:', request);
      if (path === '/api/nav' && method === 'POST') return bookmarkAdd(request, env);
      if (path.startsWith('/api/nav/') && method === 'DELETE') {
        return deleteEntry(request, env, 'bm:', decodeURIComponent(path.slice('/api/nav/'.length)));
      }

      /* 代码片段 */
      if (path === '/api/snippets' && method === 'GET') return listCollection(env, 'snip:', request);
      if (path === '/api/snippets' && method === 'POST') return snippetAdd(request, env);
      if (path.startsWith('/api/snippets/') && method === 'DELETE') {
        return deleteEntry(request, env, 'snip:', decodeURIComponent(path.slice('/api/snippets/'.length)));
      }

      /* 留言板管理（删除需要登录，读取是公开的） */
      if (path.startsWith('/api/guestbook/') && method === 'DELETE') {
        return deleteEntry(request, env, 'gb:', decodeURIComponent(path.slice('/api/guestbook/'.length)));
      }

      /* 博客写入 */
      if (path === '/api/blog' && method === 'POST') return blogSave(request, env, null);
      if (path.startsWith('/api/blog/') && method === 'POST') {
        return blogSave(request, env, decodeURIComponent(path.slice('/api/blog/'.length)));
      }
      if (path.startsWith('/api/blog/') && method === 'DELETE') {
        return blogDelete(request, env, decodeURIComponent(path.slice('/api/blog/'.length)));
      }

      /* 统计 */
      if (path === '/api/stats' && method === 'GET') return handleStats(request, env);

      return fail('接口不存在', 404, request, env);
    }

    /* ---- 其余请求交给静态资源层 ---- */
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not Found', { status: 404 });
  },
};
