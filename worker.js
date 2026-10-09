/**
 * kayhs 个人工具站后端 API v2.0
 * 部署平台：Cloudflare Workers
 * 存储：R2（文件）+ KV（元数据/短链/导航/片段/留言/token/限流）
 *
 * 新增功能：
 *   - 用户登录（token鉴权，写操作需登录）
 *   - 速率限制（基于IP，防刷）
 *   - 关键词过滤（留言/短链防滥用）
 */

// ========== 配置 ==========
const ADMIN_USER = 'kayhs';
const ADMIN_PASS_HASH = '93c3a3ad151da7504249818525c604e65c0bd21526d58c5da9f3e24e0da5e1ab';
const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7天
const RATE_WRITE_LIMIT = 20; // 每IP每分钟写操作次数
const RATE_LOGIN_LIMIT = 5;  // 每IP每分钟登录次数

// 敏感词列表（留言/短链过滤）
const BAD_WORDS = ['赌博', '博彩', '色情', '成人', '卖淫', '嫖娼', '毒品', '冰毒', '海洛因', '枪支', '弹药', '炸药', '假币', '洗钱', '诈骗', '钓鱼', '黑客', '木马', '病毒', '代开', '代考', '发票', '走私', '违禁', '法轮', '反动', '颠覆'];

// ========== 工具函数 ==========
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
  });

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
});

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const genCode = () => Math.random().toString(36).slice(2, 8);
const genToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0] || 'unknown';
}

// ========== KV 操作封装 ==========
async function kvGet(KV, key, def = []) {
  try {
    const val = await KV.get(key);
    return val ? JSON.parse(val) : def;
  } catch (e) { return def; }
}
async function kvPut(KV, key, val, ttl) {
  if (ttl) await KV.put(key, JSON.stringify(val), { expirationTtl: ttl });
  else await KV.put(key, JSON.stringify(val));
}

// ========== 速率限制 ==========
async function checkRateLimit(KV, ip, type) {
  const limit = type === 'login' ? RATE_LOGIN_LIMIT : RATE_WRITE_LIMIT;
  const minute = Math.floor(Date.now() / 60000);
  const key = `ratelimit_${type}_${ip}_${minute}`;
  const count = await KV.get(key) || 0;
  const current = parseInt(count) || 0;
  if (current >= limit) return false;
  await KV.put(key, (current + 1).toString(), { expirationTtl: 120 });
  return true;
}

// ========== 关键词过滤 ==========
function containsBadWord(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return BAD_WORDS.some(w => lower.includes(w.toLowerCase()));
}

// ========== 鉴权（token） ==========
async function getTokenUser(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const data = await env.KV.get(`token_${token}`);
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    if (parsed.expiresAt < Date.now()) {
      await env.KV.delete(`token_${token}`);
      return null;
    }
    return parsed;
  } catch (e) { return null; }
}

async function requireAuth(request, env) {
  // 兼容旧的API_KEY方式
  if (env.API_KEY) {
    const key = request.headers.get('X-API-Key');
    if (key === env.API_KEY) return null;
  }
  const user = await getTokenUser(request, env);
  if (!user) return json({ error: '未登录或登录已过期', code: 401 }, 401);
  return null;
}

// ========== 登录 API ==========
async function handleLogin(request, env) {
  const ip = getClientIP(request);
  if (!await checkRateLimit(env.KV, ip, 'login')) {
    return json({ error: '尝试次数过多，请稍后再试' }, 429);
  }

  const { username, password } = await request.json();
  if (!username || !password) return json({ error: '账号和密码必填' }, 400);

  const passHash = await sha256(password);
  if (username !== ADMIN_USER || passHash !== ADMIN_PASS_HASH) {
    return json({ error: '账号或密码错误' }, 401);
  }

  const token = genToken();
  const session = { username, token, createdAt: Date.now(), expiresAt: Date.now() + TOKEN_TTL };
  await kvPut(env.KV, `token_${token}`, session, Math.floor(TOKEN_TTL / 1000));

  return json({ token, username, expiresAt: session.expiresAt });
}

async function handleLogout(request, env) {
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    await env.KV.delete(`token_${auth.slice(7)}`);
  }
  return json({ success: true });
}

async function handleAuthCheck(request, env) {
  const user = await getTokenUser(request, env);
  if (!user) return json({ loggedIn: false }, 401);
  return json({ loggedIn: true, username: user.username, expiresAt: user.expiresAt });
}

// ========== 云盘 API ==========
async function handleDriveUpload(request, env) {
  const ip = getClientIP(request);
  if (!await checkRateLimit(env.KV, ip, 'write')) return json({ error: '操作过于频繁' }, 429);
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return json({ error: '未找到文件' }, 400);

  const id = genId();
  const fileName = file.name || 'unnamed';
  const fileType = file.type || 'application/octet-stream';
  const fileSize = file.size;

  await env.R2.put(id, file.stream(), {
    httpMetadata: { contentType: fileType },
    customMetadata: { name: fileName },
  });

  const files = await kvGet(env.KV, 'drive_files', []);
  files.unshift({ id, name: fileName, size: fileSize, type: fileType, createdAt: Date.now() });
  await kvPut(env.KV, 'drive_files', files);

  return json({ id, name: fileName, size: fileSize });
}

async function handleDriveList(env) {
  const files = await kvGet(env.KV, 'drive_files', []);
  const totalSize = files.reduce((s, f) => s + (f.size || 0), 0);
  return json({ files, totalSize, quota: 10 * 1024 * 1024 * 1024 });
}

async function handleDriveDownload(env, id) {
  const obj = await env.R2.get(id);
  if (!obj) return json({ error: '文件不存在' }, 404);
  const fileName = obj.customMetadata?.name || id;
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      ...corsHeaders(),
    },
  });
}

async function handleDriveDelete(request, env, id) {
  const ip = getClientIP(request);
  if (!await checkRateLimit(env.KV, ip, 'write')) return json({ error: '操作过于频繁' }, 429);
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;
  await env.R2.delete(id);
  const files = await kvGet(env.KV, 'drive_files', []);
  await kvPut(env.KV, 'drive_files', files.filter((f) => f.id !== id));
  return json({ success: true });
}

// ========== 短链接 API ==========
async function handleShortCreate(request, env) {
  const ip = getClientIP(request);
  if (!await checkRateLimit(env.KV, ip, 'write')) return json({ error: '操作过于频繁' }, 429);
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;

  const { url } = await request.json();
  if (!url || !/^https?:\/\//.test(url)) return json({ error: '无效的URL' }, 400);
  if (containsBadWord(url)) return json({ error: 'URL包含违规内容' }, 400);

  const code = genCode();
  const list = await kvGet(env.KV, 'short_links', []);
  list.unshift({ code, url, views: 0, createdAt: Date.now() });
  await kvPut(env.KV, 'short_links', list);
  return json({ code, url });
}

async function handleShortList(env) {
  const list = await kvGet(env.KV, 'short_links', []);
  return json({ items: list });
}

async function handleShortDelete(request, env, code) {
  const ip = getClientIP(request);
  if (!await checkRateLimit(env.KV, ip, 'write')) return json({ error: '操作过于频繁' }, 429);
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;
  const list = await kvGet(env.KV, 'short_links', []);
  await kvPut(env.KV, 'short_links', list.filter((s) => s.code !== code));
  return json({ success: true });
}

async function handleShortRedirect(env, code) {
  const list = await kvGet(env.KV, 'short_links', []);
  const item = list.find((s) => s.code === code);
  if (!item) return json({ error: '短链接不存在' }, 404);
  item.views = (item.views || 0) + 1;
  await kvPut(env.KV, 'short_links', list);
  return Response.redirect(item.url, 302);
}

// ========== 网址导航 API ==========
async function handleNavGet(env) {
  const items = await kvGet(env.KV, 'bookmarks', []);
  return json({ items });
}

async function handleNavAdd(request, env) {
  const ip = getClientIP(request);
  if (!await checkRateLimit(env.KV, ip, 'write')) return json({ error: '操作过于频繁' }, 429);
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;
  const { name, url, cat, icon } = await request.json();
  if (!name || !url) return json({ error: '名称和网址必填' }, 400);
  const items = await kvGet(env.KV, 'bookmarks', []);
  items.push({ id: genId(), name, url, cat: cat || '其他', icon: icon || '🔗' });
  await kvPut(env.KV, 'bookmarks', items);
  return json({ success: true });
}

async function handleNavDelete(request, env, id) {
  const ip = getClientIP(request);
  if (!await checkRateLimit(env.KV, ip, 'write')) return json({ error: '操作过于频繁' }, 429);
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;
  const items = await kvGet(env.KV, 'bookmarks', []);
  await kvPut(env.KV, 'bookmarks', items.filter((b) => b.id !== id));
  return json({ success: true });
}

// ========== 代码片段 API ==========
async function handleSnippetsGet(env) {
  const items = await kvGet(env.KV, 'snippets', []);
  return json({ items });
}

async function handleSnippetsAdd(request, env) {
  const ip = getClientIP(request);
  if (!await checkRateLimit(env.KV, ip, 'write')) return json({ error: '操作过于频繁' }, 429);
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;
  const { title, lang, code } = await request.json();
  if (!title || !code) return json({ error: '标题和代码必填' }, 400);
  const items = await kvGet(env.KV, 'snippets', []);
  items.unshift({ id: genId(), title, lang: lang || 'text', code, createdAt: Date.now() });
  await kvPut(env.KV, 'snippets', items);
  return json({ success: true });
}

async function handleSnippetsDelete(request, env, id) {
  const ip = getClientIP(request);
  if (!await checkRateLimit(env.KV, ip, 'write')) return json({ error: '操作过于频繁' }, 429);
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;
  const items = await kvGet(env.KV, 'snippets', []);
  await kvPut(env.KV, 'snippets', items.filter((s) => s.id !== id));
  return json({ success: true });
}

// ========== 留言板 API ==========
async function handleGuestbookGet(env) {
  const items = await kvGet(env.KV, 'guestbook', []);
  return json({ items });
}

async function handleGuestbookAdd(request, env) {
  const ip = getClientIP(request);
  if (!await checkRateLimit(env.KV, ip, 'write')) return json({ error: '操作过于频繁' }, 429);
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;

  const { name, msg } = await request.json();
  if (!msg) return json({ error: '留言内容必填' }, 400);
  if (msg.length > 500) return json({ error: '留言不能超过500字' }, 400);
  if (containsBadWord(msg) || containsBadWord(name)) return json({ error: '留言包含违规内容' }, 400);

  const items = await kvGet(env.KV, 'guestbook', []);
  items.unshift({ id: genId(), name: name || '匿名', msg: msg.slice(0, 500), createdAt: Date.now() });
  await kvPut(env.KV, 'guestbook', items.slice(0, 100));
  return json({ success: true });
}

async function handleGuestbookDelete(request, env, id) {
  const ip = getClientIP(request);
  if (!await checkRateLimit(env.KV, ip, 'write')) return json({ error: '操作过于频繁' }, 429);
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;
  const items = await kvGet(env.KV, 'guestbook', []);
  await kvPut(env.KV, 'guestbook', items.filter((g) => g.id !== id));
  return json({ success: true });
}

// ========== 主入口 ==========
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (path === '/api/ping' && request.method === 'GET') {
      return json({ message: 'pong', time: Date.now() });
    }

    // ===== 登录/鉴权 =====
    if (path === '/api/login' && request.method === 'POST') return handleLogin(request, env);
    if (path === '/api/logout' && request.method === 'POST') return handleLogout(request, env);
    if (path === '/api/auth/check' && request.method === 'GET') return handleAuthCheck(request, env);

    // ===== 云盘 =====
    if (path === '/api/drive/upload' && request.method === 'POST') return handleDriveUpload(request, env);
    if (path === '/api/drive/list' && request.method === 'GET') return handleDriveList(env);
    if (path.startsWith('/api/drive/download/') && request.method === 'GET') {
      return handleDriveDownload(env, path.split('/').pop());
    }
    if (path.startsWith('/api/drive/') && request.method === 'DELETE') {
      return handleDriveDelete(request, env, path.split('/').pop());
    }

    // ===== 短链接 =====
    if (path === '/api/short' && request.method === 'POST') return handleShortCreate(request, env);
    if (path === '/api/short/list' && request.method === 'GET') return handleShortList(env);
    if (path.startsWith('/api/short/') && request.method === 'DELETE') {
      return handleShortDelete(request, env, path.split('/').pop());
    }
    if (path.startsWith('/s/') && request.method === 'GET') {
      return handleShortRedirect(env, path.split('/').pop());
    }

    // ===== 网址导航 =====
    if (path === '/api/nav' && request.method === 'GET') return handleNavGet(env);
    if (path === '/api/nav' && request.method === 'POST') return handleNavAdd(request, env);
    if (path.startsWith('/api/nav/') && request.method === 'DELETE') {
      return handleNavDelete(request, env, path.split('/').pop());
    }

    // ===== 代码片段 =====
    if (path === '/api/snippets' && request.method === 'GET') return handleSnippetsGet(env);
    if (path === '/api/snippets' && request.method === 'POST') return handleSnippetsAdd(request, env);
    if (path.startsWith('/api/snippets/') && request.method === 'DELETE') {
      return handleSnippetsDelete(request, env, path.split('/').pop());
    }

    // ===== 留言板 =====
    if (path === '/api/guestbook' && request.method === 'GET') return handleGuestbookGet(env);
    if (path === '/api/guestbook' && request.method === 'POST') return handleGuestbookAdd(request, env);
    if (path.startsWith('/api/guestbook/') && request.method === 'DELETE') {
      return handleGuestbookDelete(request, env, path.split('/').pop());
    }

    if (path === '/' || path === '') {
      return json({
        name: 'kayhs API v2.0',
        auth: '写操作需登录（POST /api/login）',
        endpoints: {
          auth: ['POST /api/login', 'POST /api/logout', 'GET /api/auth/check'],
          drive: ['POST /api/drive/upload', 'GET /api/drive/list', 'GET /api/drive/download/:id', 'DELETE /api/drive/:id'],
          short: ['POST /api/short', 'GET /api/short/list', 'DELETE /api/short/:code', 'GET /s/:code'],
          nav: ['GET /api/nav', 'POST /api/nav', 'DELETE /api/nav/:id'],
          snippets: ['GET /api/snippets', 'POST /api/snippets', 'DELETE /api/snippets/:id'],
          guestbook: ['GET /api/guestbook', 'POST /api/guestbook', 'DELETE /api/guestbook/:id'],
        },
      });
    }

    return json({ error: 'Not Found' }, 404);
  },
};
