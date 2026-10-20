/**
 * core.js — 基础设施：API 客户端、会话、路由、主题、反馈、弹窗、图标
 *
 * 设计约定（与旧版的根本区别）：
 *   1. 所有 DOM 写入统一走 el() / setText() / esc()，
 *      不再用字符串拼 innerHTML 插值用户数据（旧版的 XSS 与文件名炸页都源于此）。
 *   2. API 地址用同源相对路径，不再有硬编码的 workers.dev 默认值
 *      （旧版那个地址在中国大陆访问不了，导致所有云端功能失效）。
 *   3. 库全部自托管 + 按需加载，失败有明确提示，不静默降级成"假功能"。
 */

/* ------------------------------------------------------------------ *
 * 图标：内联 SVG，不用 emoji（emoji 跨平台渲染不一致，且无法着色）
 * ------------------------------------------------------------------ */

const ICON_PATHS = {
  home:      'M3 10.5L12 3l9 7.5M5 9.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9.5',
  drive:     'M3 7.5A1.5 1.5 0 014.5 6h4.2a1.5 1.5 0 011.25.67l.8 1.16a1.5 1.5 0 001.25.67h5.5A1.5 1.5 0 0119 10v7.5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 013 17.5z',
  tools:     'M14.5 6.5a3.5 3.5 0 014.9 4.6l-8 8a3.5 3.5 0 01-4.9-4.9zM12 12l-2.5 2.5M6.5 4.5L4 7l3 3 2.5-2.5z',
  link:      'M10.5 13.5a4 4 0 005.7 0l2.3-2.3a4 4 0 00-5.7-5.7l-1 1M13.5 10.5a4 4 0 00-5.7 0l-2.3 2.3a4 4 0 005.7 5.7l1-1',
  bookmark:  'M6 4.5A1.5 1.5 0 017.5 3h9A1.5 1.5 0 0118 4.5V21l-6-4-6 4z',
  code:      'M9 7l-5 5 5 5M15 7l5 5-5 5',
  blog:      'M5 4.5A1.5 1.5 0 016.5 3h11A1.5 1.5 0 0119 4.5v15A1.5 1.5 0 0117.5 21h-11A1.5 1.5 0 015 19.5zM8.5 8h7M8.5 12h7M8.5 16h4',
  message:   'M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v9a1.5 1.5 0 01-1.5 1.5H9l-5 4z',
  settings:  'M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5M19.4 15a1.6 1.6 0 00.32 1.77l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.6 1.6 0 00-1.77-.32 1.6 1.6 0 00-.97 1.47V21a2 2 0 11-4 0v-.1A1.6 1.6 0 008.6 19.4a1.6 1.6 0 00-1.77.32l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.6 1.6 0 004.32 15a1.6 1.6 0 00-1.47-.97H3a2 2 0 110-4h.1A1.6 1.6 0 004.6 8.6a1.6 1.6 0 00-.32-1.77l-.06-.06a2 2 0 112.83-2.83l.06.06A1.6 1.6 0 009 4.32h.08A1.6 1.6 0 0010 2.85V3a2 2 0 114 0v.1a1.6 1.6 0 00.97 1.47 1.6 1.6 0 001.77-.32l.06-.06a2 2 0 112.83 2.83l-.06.06A1.6 1.6 0 0019.4 9v.08a1.6 1.6 0 001.47.92H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5.97z',
  search:    'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  sun:       'M12 17a5 5 0 100-10 5 5 0 000 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon:      'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
  upload:    'M12 16V4M8 8l4-4 4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2',
  download:  'M12 4v12M8 12l4 4 4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2',
  trash:     'M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13M10 11v6M14 11v6',
  plus:      'M12 5v14M5 12h14',
  copy:      'M9 9h10a1 1 0 011 1v10a1 1 0 01-1 1H9a1 1 0 01-1-1V10a1 1 0 011-1zM5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1',
  check:     'M4 12.5l5 5L20 6.5',
  close:     'M6 6l12 12M18 6L6 18',
  folder:    'M3 7.5A1.5 1.5 0 014.5 6h4.2a1.5 1.5 0 011.25.67l.8 1.16a1.5 1.5 0 001.25.67h5.5A1.5 1.5 0 0119 10v7.5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 013 17.5z',
  file:      'M14 3H7a1 1 0 00-1 1v16a1 1 0 001 1h10a1 1 0 001-1V7zM14 3v4h4',
  image:     'M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM8.5 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM3 17l5-4 4 3 3-2 6 5',
  video:     'M4 6h11a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1zM16 10l5-3v10l-5-3z',
  audio:     'M9 18V6l10-2v12M9 18a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM19 16a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z',
  archive:   'M3 7h18v3H3zM5 10v10a1 1 0 001 1h12a1 1 0 001-1V10M10 14h4',
  doc:       'M14 3H7a1 1 0 00-1 1v16a1 1 0 001 1h10a1 1 0 001-1V7zM14 3v4h4M9 13h6M9 17h4',
  edit:      'M4 20h4L19.5 8.5a2.1 2.1 0 00-3-3L5 17v3z',
  refresh:   'M20 12a8 8 0 11-2.3-5.7M20 4v4h-4',
  external:  'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  back:      'M15 5l-7 7 7 7',
  menu:      'M4 7h16M4 12h16M4 17h16',
  lock:      'M6 11h12a1 1 0 011 1v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7a1 1 0 011-1zM8 11V7a4 4 0 018 0v4',
  user:      'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8',
  logout:    'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  alert:     'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  info:      'M12 21a9 9 0 100-18 9 9 0 000 18M12 11v5M12 8h.01',
  clock:     'M12 21a9 9 0 100-18 9 9 0 000 18M12 7v5l3 2',
  qr:        'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  hash:      'M5 9h14M5 15h14M10 3L8 21M16 3l-2 18',
  palette:   'M12 21a9 9 0 110-18c4.5 0 8 2.9 8 6.5 0 2.2-1.9 3.5-4 3.5h-1.5a1.8 1.8 0 00-1.3 3c.3.4.5.8.5 1.2A1.8 1.8 0 0112 21zM7.5 11.5h.01M11 8h.01M15.5 9h.01',
  grid:      'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list:      'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  move:      'M5 12h14M12 5v14M5 12l3-3M5 12l3 3M19 12l-3-3M19 12l-3 3M12 5l-3 3M12 5l3 3M12 19l-3-3M12 19l3-3',
  share:     'M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M12 15V3M8 7l4-4 4 4',
  eye:       'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7zM12 15a3 3 0 100-6 3 3 0 000 6z',
  play:      'M7 4.5v15l13-7.5z',
  pause:     'M8 5v14M16 5v14',
  reset:     'M3.5 12a8.5 8.5 0 108.5-8.5 8.4 8.4 0 00-6 2.5L3 9M3 4v5h5',
  flag:      'M5 21V4M5 4h11l-2 4 2 4H5',
  save:      'M5 3h11l3 3v13a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM8 3v6h7V3M8 14h8v7H8z',
  terminal:  'M5 7l5 5-5 5M12 17h7M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z',
};

/** 返回一个 SVG 元素（非字符串，避免拼接注入） */
function icon(name, size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (size) { svg.style.width = size + 'px'; svg.style.height = size + 'px'; }
  const d = ICON_PATHS[name];
  if (d) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

/* ------------------------------------------------------------------ *
 * DOM 构造：全部走 DOM API，不用 innerHTML 插值
 * ------------------------------------------------------------------ */

/**
 * el('div.card', { onclick, title, dataset:{k:v}, text }, ...children)
 * 选择器支持 tag.class#id
 */
function el(spec, props, ...children) {
  let tag = 'div', id = null;
  const classes = [];
  if (typeof spec === 'string') {
    const re = /([.#]?)([A-Za-z0-9_-]+)/g;
    let m, first = true;
    while ((m = re.exec(spec)) !== null) {
      if (first && m[1] === '') { tag = m[2]; first = false; continue; }
      first = false;
      if (m[1] === '.') classes.push(m[2]);
      else if (m[1] === '#') id = m[2];
    }
    if (first) tag = spec;
  } else if (spec) {
    return spec; // 已经是节点
  }

  const node = document.createElement(tag);
  if (id) node.id = id;
  if (classes.length) node.className = classes.join(' ');

  if (props) {
    for (const key in props) {
      const val = props[key];
      if (val === null || val === undefined || val === false) continue;
      if (key === 'class') node.className = (node.className ? node.className + ' ' : '') + val;
      else if (key === 'text') node.textContent = val;
      // 刻意不提供 html 属性：一旦开放，迟早有人把未净化的用户数据塞进来。
      // 需要渲染富文本时显式调用 setSafeHtml()，它内部强制走 DOMPurify。
      else if (key === 'dataset') Object.assign(node.dataset, val);
      else if (key === 'style' && typeof val === 'object') Object.assign(node.style, val);
      else if (key.startsWith('on') && typeof val === 'function') node.addEventListener(key.slice(2).toLowerCase(), val);
      else if (key === 'disabled' || key === 'checked' || key === 'selected' || key === 'readOnly') node[key] = !!val;
      else node.setAttribute(key, val === true ? '' : val);
    }
  }

  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    node.appendChild(typeof c === 'object' && c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** 清空容器 */
function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }

/** 安全设置文本 */
function setText(node, text) { if (node) node.textContent = text == null ? '' : String(text); return node; }

/** 供少数确需 HTML 的场景使用（内容必须已经过 DOMPurify） */
function setSafeHtml(node, html) {
  if (!node) return node;
  node.innerHTML = typeof DOMPurify !== 'undefined'
    ? DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
    : '';
  return node;
}

/* ------------------------------------------------------------------ *
 * 格式化
 * ------------------------------------------------------------------ */

function fmtBytes(n) {
  n = Number(n) || 0;
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return (i === 0 ? v : v.toFixed(v < 10 ? 1 : 0)) + ' ' + units[i];
}

function fmtDate(ts) {
  const d = new Date(typeof ts === 'string' ? ts : Number(ts));
  if (isNaN(d.getTime())) return '—';
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function fmtDateTime(ts) {
  const d = new Date(typeof ts === 'string' ? ts : Number(ts));
  if (isNaN(d.getTime())) return '—';
  return fmtDate(d) + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0');
}

/** 相对时间：用于列表，绝对时间放 title 里 */
function fmtAgo(ts) {
  const t = new Date(typeof ts === 'string' ? ts : Number(ts)).getTime();
  if (isNaN(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 0) return fmtDate(t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + ' 分钟前';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + ' 小时前';
  const day = Math.floor(hr / 24);
  if (day < 30) return day + ' 天前';
  return fmtDate(t);
}

function fmtDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  const cs = Math.floor(ms / 10) % 100;
  const pad = (v) => String(v).padStart(2, '0');
  return (h > 0 ? pad(h) + ':' : '') + pad(m) + ':' + pad(s) + '.' + pad(cs);
}

/* ------------------------------------------------------------------ *
 * 主题
 * ------------------------------------------------------------------ */

const THEME_KEY = 'kayhs.theme';

function getStoredTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch { return null; }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#16171a' : '#fdfdfc';
  const btn = document.getElementById('themeToggle');
  if (btn) {
    clear(btn);
    btn.appendChild(icon(theme === 'dark' ? 'sun' : 'moon'));
    btn.title = theme === 'dark' ? '切换到浅色' : '切换到深色';
    btn.setAttribute('aria-label', btn.title);
  }
}

function initTheme() {
  const stored = getStoredTheme();
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(stored || (prefersDark ? 'dark' : 'light'));
  if (!stored && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!getStoredTheme()) applyTheme(e.matches ? 'dark' : 'light');
    });
  }
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch { /* 隐私模式下忽略 */ }
}

/* ------------------------------------------------------------------ *
 * 会话与 API
 * ------------------------------------------------------------------ */

const TOKEN_KEY = 'kayhs.token';

const Store = {
  get token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
  set token(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch {} },
  getPref(key, fallback) {
    try {
      const raw = localStorage.getItem('kayhs.pref.' + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  setPref(key, val) { try { localStorage.setItem('kayhs.pref.' + key, JSON.stringify(val)); } catch {} },
};

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

/** 同源相对路径。站点前后端同一个 Worker，无需配置地址。 */
const API_BASE = '';

let onUnauthorized = null;

async function api(path, opts = {}) {
  const headers = Object.assign({}, opts.headers);
  if (!opts.noJson && opts.body !== undefined && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (Store.token) headers['Authorization'] = 'Bearer ' + Store.token;

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined
        ? (opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body))
        : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('网络连接失败：' + (e.message || '无法访问服务器'), 0, null);
  }

  if (res.status === 401) {
    const hadToken = !!Store.token;
    Store.token = '';
    if (hadToken) {
      toast('登录已过期，请重新登录', 'warn');
      if (onUnauthorized) onUnauthorized();
    }
    throw new ApiError('未登录或登录已过期', 401, null);
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || ('请求失败（HTTP ' + res.status + '）');
    throw new ApiError(msg, res.status, data);
  }
  return data;
}

/** 带进度的上传。XHR 才有 upload.onprogress，fetch 没有 */
function apiUpload(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + path);
    if (Store.token) xhr.setRequestHeader('Authorization', 'Bearer ' + Store.token);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { data = { error: xhr.responseText }; }
      if (xhr.status === 401) {
        Store.token = '';
        if (onUnauthorized) onUnauthorized();
        reject(new ApiError('未登录或登录已过期', 401, data));
      } else if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new ApiError((data && data.error) || '上传失败（HTTP ' + xhr.status + '）', xhr.status, data));
      }
    };
    xhr.onerror = () => reject(new ApiError('上传失败：网络错误', 0, null));
    xhr.onabort = () => reject(new ApiError('已取消', 0, null));
    xhr.send(formData);
  });
}

const Auth = {
  get loggedIn() { return !!Store.token; },
  user: null,
  async check() {
    if (!Store.token) { this.user = null; return false; }
    try {
      const r = await api('/api/auth/check');
      this.user = r && r.loggedIn ? r : null;
      return !!this.user;
    } catch { this.user = null; return false; }
  },
  async login(username, password) {
    const r = await api('/api/login', { method: 'POST', body: { username, password } });
    Store.token = r.token;
    this.user = { username: r.username, expiresAt: r.expiresAt, loggedIn: true };
    return this.user;
  },
  async logout() {
    try { await api('/api/logout', { method: 'POST' }); } catch { /* 本地清理即可 */ }
    Store.token = '';
    this.user = null;
  },
};

/* ------------------------------------------------------------------ *
 * 按需加载第三方库（自托管，不走外部 CDN）
 * ------------------------------------------------------------------ */

const LIB_SPECS = {
  qrcode:   { src: '/vendor/qrcode.min.js',    global: 'QRCode' },
  jsqr:     { src: '/vendor/jsqr.js',          global: 'jsQR' },
  md5:      { src: '/vendor/md5.min.js',       global: 'md5' },
  diff:     { src: '/vendor/diff.min.js',      global: 'Diff' },
  croner:   { src: '/vendor/croner.umd.min.js',global: 'Cron' },
  marked:   { src: '/vendor/marked.min.js',    global: 'marked' },
  purify:   { src: '/vendor/purify.min.js',    global: 'DOMPurify' },
  sqlfmt:   { src: '/vendor/sql-formatter.min.js', global: 'sqlFormatter' },
  hljs:     { src: '/vendor/highlight.min.js', global: 'hljs' },
  fuse:     { src: '/vendor/fuse.min.js',      global: 'Fuse' },
};

const LIB_PROMISES = {};
const LIB_STATUS = {}; // idle | loading | ok | error

function ensureLibs(names) {
  return Promise.all((Array.isArray(names) ? names : [names]).map(ensureLib));
}

function ensureLib(name) {
  if (LIB_PROMISES[name]) return LIB_PROMISES[name];
  const spec = LIB_SPECS[name];
  if (!spec) return Promise.reject(new Error('未知依赖：' + name));
  if (typeof window[spec.global] !== 'undefined') {
    LIB_STATUS[name] = 'ok';
    LIB_PROMISES[name] = Promise.resolve(window[spec.global]);
    return LIB_PROMISES[name];
  }
  LIB_STATUS[name] = 'loading';
  LIB_PROMISES[name] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = spec.src;
    s.async = false;
    s.onload = () => {
      if (typeof window[spec.global] !== 'undefined') {
        LIB_STATUS[name] = 'ok';
        resolve(window[spec.global]);
      } else {
        LIB_STATUS[name] = 'error';
        reject(new Error('依赖 ' + name + ' 加载后未提供预期接口'));
      }
    };
    s.onerror = () => {
      LIB_STATUS[name] = 'error';
      s.remove();
      delete LIB_PROMISES[name]; // 允许重试
      reject(new Error('依赖 ' + name + ' 加载失败（' + spec.src + '）'));
    };
    document.head.appendChild(s);
  });
  return LIB_PROMISES[name];
}

/** Markdown → 安全 HTML。marked 解析 + DOMPurify 消毒，绝不用正则拼 innerHTML */
async function renderMarkdown(md, opts = {}) {
  const [markedLib] = await ensureLibs(['marked']);
  try { await ensureLib('purify'); } catch { /* 无消毒器时退回纯文本，绝不输出未净化 HTML */ }

  if (typeof DOMPurify === 'undefined') {
    const pre = document.createElement('pre');
    pre.textContent = md || '';
    return pre.outerHTML;
  }

  markedLib.setOptions({ gfm: true, breaks: !!opts.breaks });
  const raw = markedLib.parse(md || '');
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
  });
}

/* ------------------------------------------------------------------ *
 * 反馈：Toast
 * ------------------------------------------------------------------ */

function toastHost() {
  let h = document.getElementById('toastHost');
  if (!h) { h = el('div#toastHost.toast-host'); document.body.appendChild(h); }
  return h;
}

const TOAST_ICONS = { ok: 'check', err: 'alert', warn: 'alert', info: 'info' };

function toast(message, tone = 'info', ms = 2600) {
  const host = toastHost();
  const node = el('div.toast', { dataset: { tone }, role: 'status' },
    icon(TOAST_ICONS[tone] || 'info'),
    el('span', { text: message })
  );
  host.appendChild(node);
  setTimeout(() => {
    node.dataset.leaving = 'true';
    node.addEventListener('animationend', () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 400);
  }, ms);
  return node;
}

/* ------------------------------------------------------------------ *
 * 弹窗
 * ------------------------------------------------------------------ */

let modalStack = [];

/**
 * openModal({ title, body(node|fn), size, actions:[{label,kind,onClick,close}] })
 * 返回 close 函数
 */
function openModal(cfg) {
  const overlay = el('div.modal-root', { role: 'dialog', 'aria-modal': 'true' });
  const box = el('div.modal', { dataset: cfg.size ? { size: cfg.size } : null });

  const close = () => {
    if (!overlay.isConnected) return;
    overlay.remove();
    modalStack = modalStack.filter((m) => m !== close);
    if (modalStack.length) return;
    document.removeEventListener('keydown', onKey);
  };

  const onKey = (e) => {
    if (e.key === 'Escape' && modalStack[modalStack.length - 1] === close) {
      e.preventDefault();
      close();
    }
  };

  if (cfg.title) {
    box.appendChild(el('div.modal-head', null,
      el('h3', { text: cfg.title }),
      el('button.icon-btn', {
        type: 'button', title: '关闭', 'aria-label': '关闭',
        onclick: () => { if (cfg.onClose) cfg.onClose(); close(); },
      }, icon('close'))
    ));
  }

  const body = el('div.modal-body');
  if (typeof cfg.body === 'function') cfg.body(body, close);
  else if (cfg.body) body.appendChild(cfg.body);
  box.appendChild(body);

  if (cfg.actions && cfg.actions.length) {
    const foot = el('div.modal-foot', { dataset: cfg.spread ? { spread: 'true' } : null });
    for (const a of cfg.actions) {
      foot.appendChild(el('button.btn' + (a.kind === 'primary' ? '.btn-primary' : a.kind === 'danger' ? '.btn-danger' : a.kind === 'ghost' ? '.btn-ghost' : ''), {
        type: 'button',
        text: a.label,
        disabled: a.disabled,
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const result = await a.onClick(body, close);
            // 返回 false 表示保持打开
            if (result !== false && a.closeOnClick !== false) close();
          } catch (err) {
            toast(err.message || '操作失败', 'err');
          } finally {
            btn.disabled = false;
          }
        },
      }));
    }
    box.appendChild(foot);
  }

  overlay.appendChild(box);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) { if (cfg.onClose) cfg.onClose(); close(); }
  });

  document.body.appendChild(overlay);
  modalStack.push(close);
  document.addEventListener('keydown', onKey);

  const first = box.querySelector('input:not([type=hidden]),textarea,select,button');
  if (first && !cfg.noAutofocus) setTimeout(() => first.focus(), 30);

  return close;
}

/** 确认框。返回 Promise<boolean> */
function confirmModal(cfg) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    openModal({
      title: cfg.title || '确认操作',
      body: el('div', null,
        el('p', { text: cfg.message || '', style: { fontSize: '13px', lineHeight: '1.6' } }),
        cfg.detail ? el('p', { text: cfg.detail, style: { fontSize: '12px', color: 'var(--muted)', marginTop: '8px', lineHeight: '1.6' } }) : null
      ),
      onClose: () => finish(false),
      actions: [
        { label: cfg.cancelLabel || '取消', kind: 'ghost', onClick: () => finish(false) },
        { label: cfg.okLabel || '确定', kind: cfg.danger ? 'danger' : 'primary', onClick: () => { finish(true); return true; } },
      ],
    });
  });
}

/** 单输入框弹窗。返回 Promise<string|null> */
function promptModal(cfg) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const input = el('input.input' + (cfg.mono ? '.input-mono' : ''), {
      type: cfg.type || 'text',
      value: cfg.value || '',
      placeholder: cfg.placeholder || '',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    const wrap = el('div', null,
      cfg.label ? el('label.field-label', { text: cfg.label, style: { display: 'block', marginBottom: '6px' } }) : null,
      input,
      cfg.hint ? el('div.field-hint', { text: cfg.hint, style: { marginTop: '6px' } }) : null
    );
    openModal({
      title: cfg.title || '输入',
      body: wrap,
      onClose: () => finish(null),
      actions: [
        { label: '取消', kind: 'ghost', onClick: () => finish(null) },
        {
          label: cfg.okLabel || '确定', kind: 'primary',
          onClick: () => {
            const v = input.value;
            if (cfg.required && !v.trim()) { toast('不能为空', 'warn'); return false; }
            if (cfg.validate) {
              const err = cfg.validate(v);
              if (err) { toast(err, 'warn'); return false; }
            }
            finish(v);
            return true;
          },
        },
      ],
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const b = wrap.closest('.modal').querySelector('.modal-foot .btn-primary'); if (b) b.click(); }
    });
  });
}

/* ------------------------------------------------------------------ *
 * 剪贴板：clipboard API 在非 HTTPS / 旧浏览器会失败，需要降级
 * ------------------------------------------------------------------ */

async function copyText(text) {
  if (!text) { toast('没有可复制的内容', 'warn'); return false; }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      toast('已复制', 'ok', 1400);
      return true;
    }
  } catch { /* 落到降级方案 */ }
  try {
    const ta = el('textarea', {
      style: { position: 'fixed', left: '-9999px', top: '0', opacity: '0' },
    });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok) { toast('已复制', 'ok', 1400); return true; }
    toast('复制失败，请手动选择', 'err');
    return false;
  } catch {
    toast('当前浏览器不支持自动复制', 'err');
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * 文件类型
 * ------------------------------------------------------------------ */

const EXT_GROUPS = {
  image: ['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif','heic'],
  video: ['mp4','webm','mov','avi','mkv','m4v','flv'],
  audio: ['mp3','wav','ogg','flac','m4a','aac'],
  archive: ['zip','rar','7z','tar','gz','bz2','xz'],
  doc: ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md','csv','rtf'],
  code: ['js','ts','jsx','tsx','json','html','css','scss','py','java','c','cpp','h','go','rs','php','rb','sh','sql','yml','yaml','xml','vue','svelte'],
};

const extOf = (name) => String(name || '').split('.').pop().toLowerCase();

function fileIconName(name) {
  const e = extOf(name);
  for (const g in EXT_GROUPS) if (EXT_GROUPS[g].includes(e)) {
    return g === 'image' ? 'image' : g === 'video' ? 'video' : g === 'audio' ? 'audio'
      : g === 'archive' ? 'archive' : g === 'doc' ? 'doc' : 'code';
  }
  return 'file';
}

/** 可在浏览器内直接预览的类型 */
function previewable(name, type) {
  const e = extOf(name);
  if (EXT_GROUPS.image.includes(e)) return 'image';
  if (EXT_GROUPS.video.includes(e)) return 'video';
  if (EXT_GROUPS.audio.includes(e)) return 'audio';
  if (e === 'pdf' || (type || '').startsWith('application/pdf')) return 'pdf';
  if (EXT_GROUPS.code.includes(e) || EXT_GROUPS.doc.includes(e) || (type || '').startsWith('text/')) return 'text';
  return null;
}

/* ------------------------------------------------------------------ *
 * 杂项
 * ------------------------------------------------------------------ */

function debounce(fn, wait = 220) {
  let t;
  const wrapped = function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
  wrapped.cancel = () => clearTimeout(t);
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  return wrapped;
}

function throttle(fn, wait = 100) {
  let last = 0, timer = null;
  return function (...args) {
    const now = Date.now();
    const remain = wait - (now - last);
    if (remain <= 0) { last = now; fn.apply(this, args); }
    else if (!timer) {
      timer = setTimeout(() => { last = Date.now(); timer = null; fn.apply(this, args); }, remain);
    }
  };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/** 下载文本/Blob */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
}

function downloadText(text, filename, mime) {
  downloadBlob(new Blob([text], { type: mime || 'text/plain;charset=utf-8' }), filename);
}

/** 读取文件为文本 / DataURL / ArrayBuffer */
function readFileAs(file, kind = 'text') {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('读取文件失败'));
    if (kind === 'dataurl') r.readAsDataURL(file);
    else if (kind === 'arraybuffer') r.readAsArrayBuffer(file);
    else r.readAsText(file);
  });
}

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** 空状态视图 */
function emptyState(cfg) {
  return el('div.empty', null,
    cfg.icon ? el('div.empty-icon', null, icon(cfg.icon)) : null,
    cfg.title ? el('div.empty-title', { text: cfg.title }) : null,
    cfg.text ? el('div.empty-text', { text: cfg.text }) : null,
    cfg.action || null
  );
}

/** 加载占位 */
function loadingState(text = '加载中…') {
  return el('div.empty', null, el('div.spinner'), el('div.empty-text', { text }));
}

/** 需要登录时的占位，带一个登录按钮 */
function needLoginState(onLogin) {
  return emptyState({
    icon: 'lock',
    title: '需要登录',
    text: '这个模块的数据存在云端，登录后即可读写。',
    action: el('button.btn.btn-primary', { type: 'button', onclick: onLogin }, icon('user'), '登录'),
  });
}

/** 后端不可用时的占位。与「未登录」区分开，避免误导 */
function backendDownState(detail) {
  return emptyState({
    icon: 'alert',
    title: '后端服务未响应',
    text: detail || '无法连接 API。请稍后重试，或到「设置」里查看服务状态。',
  });
}
