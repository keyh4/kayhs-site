/**
 * kayhs 个人工具站后端 API
 * 部署平台：Cloudflare Workers
 * 存储：R2（文件）+ KV（元数据/短链/导航/片段/留言）
 *
 * 环境变量：
 *   API_KEY  - 可选，设置后所有写操作需要 X-API-Key 请求头
 *   KV       - KV 命名空间绑定（变量名 KV）
 *   R2       - R2 存储桶绑定（变量名 R2）
 */

// ========== 工具函数 ==========
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
  });

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
});

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const genCode = () => Math.random().toString(36).slice(2, 8);

// ========== KV 操作封装 ==========
async function kvGet(KV, key, def = []) {
  try {
    const val = await KV.get(key);
    return val ? JSON.parse(val) : def;
  } catch (e) {
    return def;
  }
}

async function kvPut(KV, key, val) {
  await KV.put(key, JSON.stringify(val));
}

// ========== 鉴权 ==========
function checkAuth(request, env) {
  if (!env.API_KEY) return true; // 未设置密钥则公开访问
  const key = request.headers.get('X-API-Key');
  return key === env.API_KEY;
}

function requireAuth(request, env) {
  if (!checkAuth(request, env)) {
    return json({ error: '未授权' }, 401);
  }
  return null;
}

// ========== 云盘 API ==========
async function handleDriveUpload(request, env) {
  const authErr = requireAuth(request, env);
  if (authErr) return authErr;

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return json({ error: '未找到文件' }, 400);

  const id = genId();
  const fileName = file.name || 'unnamed';
  const fileType = file.type || 'application/octet-stream';
  const fileSize = file.size;

  // 上传到 R2
  await env.R2.put(id, file.stream(), {
    httpMetadata: { contentType: fileType },
    customMetadata: { name: fileName },
  });

  // 保存元数据到 KV
  const files = await kvGet(env.KV, 'drive_files', []);
  files.unshift({ id, name: fileName, size: fileSize, type: fileType, createdAt: Date.now() });
  await kvPut(env.KV, 'drive_files', files);

  return json({ id, name: fileName, size: fileSize });
}

async function handleDriveList(env) {
  const files = await kvGet(env.KV, 'drive_files', []);
  const totalSize = files.reduce((s, f) => s + (f.size || 0), 0);
  return json({ files, totalSize, quota: 10 * 1024 * 1024 * 1024 }); // 10GB
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
  const authErr = requireAuth(request, env);
  if (authErr) return authErr;

  await env.R2.delete(id);
  const files = await kvGet(env.KV, 'drive_files', []);
  await kvPut(env.KV, 'drive_files', files.filter((f) => f.id !== id));
  return json({ success: true });
}

// ========== 短链接 API ==========
async function handleShortCreate(request, env) {
  const authErr = requireAuth(request, env);
  if (authErr) return authErr;

  const { url } = await request.json();
  if (!url || !/^https?:\/\//.test(url)) return json({ error: '无效的URL' }, 400);

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
  const authErr = requireAuth(request, env);
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
  const authErr = requireAuth(request, env);
  if (authErr) return authErr;

  const { name, url, cat, icon } = await request.json();
  if (!name || !url) return json({ error: '名称和网址必填' }, 400);

  const items = await kvGet(env.KV, 'bookmarks', []);
  items.push({ id: genId(), name, url, cat: cat || '其他', icon: icon || '🔗' });
  await kvPut(env.KV, 'bookmarks', items);
  return json({ success: true });
}

async function handleNavDelete(request, env, id) {
  const authErr = requireAuth(request, env);
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
  const authErr = requireAuth(request, env);
  if (authErr) return authErr;

  const { title, lang, code } = await request.json();
  if (!title || !code) return json({ error: '标题和代码必填' }, 400);

  const items = await kvGet(env.KV, 'snippets', []);
  items.unshift({ id: genId(), title, lang: lang || 'text', code, createdAt: Date.now() });
  await kvPut(env.KV, 'snippets', items);
  return json({ success: true });
}

async function handleSnippetsDelete(request, env, id) {
  const authErr = requireAuth(request, env);
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
  // 留言不需要鉴权，公开可写
  const { name, msg } = await request.json();
  if (!msg) return json({ error: '留言内容必填' }, 400);
  if (msg.length > 500) return json({ error: '留言不能超过500字' }, 400);

  const items = await kvGet(env.KV, 'guestbook', []);
  items.unshift({ id: genId(), name: name || '匿名', msg: msg.slice(0, 500), createdAt: Date.now() });
  // 只保留最近100条
  await kvPut(env.KV, 'guestbook', items.slice(0, 100));
  return json({ success: true });
}

// ========== 主入口 ==========
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // OPTIONS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // 健康检查
    if (path === '/api/ping' && request.method === 'GET') {
      return json({ message: 'pong', time: Date.now() });
    }

    // ===== 云盘 =====
    if (path === '/api/drive/upload' && request.method === 'POST') {
      return handleDriveUpload(request, env);
    }
    if (path === '/api/drive/list' && request.method === 'GET') {
      return handleDriveList(env);
    }
    if (path.startsWith('/api/drive/download/') && request.method === 'GET') {
      const id = path.split('/').pop();
      return handleDriveDownload(env, id);
    }
    if (path.startsWith('/api/drive/') && request.method === 'DELETE') {
      const id = path.split('/').pop();
      return handleDriveDelete(request, env, id);
    }

    // ===== 短链接 =====
    if (path === '/api/short' && request.method === 'POST') {
      return handleShortCreate(request, env);
    }
    if (path === '/api/short/list' && request.method === 'GET') {
      return handleShortList(env);
    }
    if (path.startsWith('/api/short/') && request.method === 'DELETE') {
      const code = path.split('/').pop();
      return handleShortDelete(request, env, code);
    }
    // 短链重定向入口 /s/xxx
    if (path.startsWith('/s/') && request.method === 'GET') {
      const code = path.split('/').pop();
      return handleShortRedirect(env, code);
    }

    // ===== 网址导航 =====
    if (path === '/api/nav' && request.method === 'GET') {
      return handleNavGet(env);
    }
    if (path === '/api/nav' && request.method === 'POST') {
      return handleNavAdd(request, env);
    }
    if (path.startsWith('/api/nav/') && request.method === 'DELETE') {
      const id = path.split('/').pop();
      return handleNavDelete(request, env, id);
    }

    // ===== 代码片段 =====
    if (path === '/api/snippets' && request.method === 'GET') {
      return handleSnippetsGet(env);
    }
    if (path === '/api/snippets' && request.method === 'POST') {
      return handleSnippetsAdd(request, env);
    }
    if (path.startsWith('/api/snippets/') && request.method === 'DELETE') {
      const id = path.split('/').pop();
      return handleSnippetsDelete(request, env, id);
    }

    // ===== 留言板 =====
    if (path === '/api/guestbook' && request.method === 'GET') {
      return handleGuestbookGet(env);
    }
    if (path === '/api/guestbook' && request.method === 'POST') {
      return handleGuestbookAdd(request, env);
    }

    // 根路径返回说明
    if (path === '/' || path === '') {
      return json({
        name: 'kayhs API',
        version: '1.0',
        endpoints: {
          drive: ['POST /api/drive/upload', 'GET /api/drive/list', 'GET /api/drive/download/:id', 'DELETE /api/drive/:id'],
          short: ['POST /api/short', 'GET /api/short/list', 'DELETE /api/short/:code', 'GET /s/:code'],
          nav: ['GET /api/nav', 'POST /api/nav', 'DELETE /api/nav/:id'],
          snippets: ['GET /api/snippets', 'POST /api/snippets', 'DELETE /api/snippets/:id'],
          guestbook: ['GET /api/guestbook', 'POST /api/guestbook'],
        },
      });
    }

    return json({ error: 'Not Found' }, 404);
  },
};
