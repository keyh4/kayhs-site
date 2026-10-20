/**
 * app.js — 应用外壳：路由、导航、命令面板、鉴权 UI、后端连通性
 *
 * 路由采用 History API 的路径式（/drive、/tools/json、/blog/xxx），
 * 由 wrangler.toml 的 not_found_handling = "single-page-application" 兜底。
 * 旧版用 hash 路由（#home），刷新与分享体验都差，且 URL 里带 # 很难看。
 */

/* ------------------------------------------------------------------ *
 * 路由表
 * ------------------------------------------------------------------ */

const ROUTES = [
  { path: '/',            view: 'home',      title: '首页',     icon: 'home' },
  { path: '/drive',       view: 'drive',     title: '云盘',     icon: 'drive',   needsAuth: true },
  { path: '/tools',       view: 'tools',     title: '工具箱',   icon: 'tools' },
  { path: '/tools/:id',   view: 'tool',      title: '工具',     icon: 'tools',   parent: '/tools' },
  { path: '/bookmarks',   view: 'bookmarks', title: '书签导航', icon: 'bookmark', needsAuth: true },
  { path: '/links',       view: 'links',     title: '短链接',   icon: 'link',    needsAuth: true },
  { path: '/snippets',    view: 'snippets',  title: '代码片段', icon: 'code',    needsAuth: true },
  { path: '/blog',        view: 'blog',      title: '博客',     icon: 'blog' },
  { path: '/blog/:slug',  view: 'post',      title: '文章',     icon: 'blog',    parent: '/blog' },
  { path: '/write',       view: 'write',     title: '写文章',   icon: 'edit',    needsAuth: true, hidden: true },
  { path: '/guestbook',   view: 'guestbook', title: '留言板',   icon: 'message' },
  { path: '/settings',    view: 'settings',  title: '设置',     icon: 'settings' },
];

const NAV_GROUPS = [
  {
    title: null,
    items: ['/', '/drive', '/tools'],
  },
  {
    title: '收藏',
    items: ['/bookmarks', '/links', '/snippets'],
  },
  {
    title: '内容',
    items: ['/blog', '/guestbook'],
  },
  {
    title: null,
    items: ['/settings'],
  },
];

const routeByPath = (p) => ROUTES.find((r) => r.path === p);
const routeByView = (v) => ROUTES.find((r) => r.view === v);

/**
 * 把 "/tools/:id" 这样的模式和 "/tools/json" 匹配，返回参数对象或 null。
 * 手写而非用正则库，逻辑只有十几行且完全可控。
 */
function matchRoute(pattern, pathname) {
  const pSeg = pattern.split('/').filter(Boolean);
  const uSeg = pathname.split('/').filter(Boolean);
  if (pSeg.length !== uSeg.length) return null;
  const params = {};
  for (let i = 0; i < pSeg.length; i++) {
    const p = pSeg[i];
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(uSeg[i]);
    else if (p !== uSeg[i]) return null;
  }
  return params;
}

function resolvePath(pathname) {
  const clean = '/' + pathname.split('/').filter(Boolean).join('/');
  const target = clean === '/' ? '/' : clean;
  for (const r of ROUTES) {
    const params = matchRoute(r.path, target);
    if (params) return { route: r, params };
  }
  return { route: null, params: {} };
}

/* ------------------------------------------------------------------ *
 * 视图注册：各 view 文件往这里挂
 * ------------------------------------------------------------------ */

const VIEWS = {};
function registerView(name, factory) { VIEWS[name] = factory; }

/* ------------------------------------------------------------------ *
 * 渲染与导航
 * ------------------------------------------------------------------ */

let currentAbort = null;   // 上一个视图的 AbortController，用于取消进行中的请求
let currentCleanup = null; // 上一个视图的清理函数（定时器、事件等）

function renderNav(activeRoute) {
  const nav = document.getElementById('nav');
  clear(nav);
  const activePath = activeRoute.parent || activeRoute.path;

  for (const group of NAV_GROUPS) {
    const wrap = el('div.nav-group');
    if (group.title) wrap.appendChild(el('div.nav-group-title', { text: group.title }));

    for (const p of group.items) {
      const r = routeByPath(p);
      if (!r || r.hidden) continue;
      const isActive = r.path === activePath || (r.parent && r.parent === activePath);

      const item = el('a.nav-item', {
        href: r.path,
        dataset: { active: isActive ? 'true' : 'false', path: r.path },
        'aria-current': isActive ? 'page' : null,
      },
        icon(r.icon),
        el('span.nav-text', { text: r.title }),
        r.needsAuth && !Auth.loggedIn ? el('span.nav-badge', { text: '需登录' }) : null
      );
      wrap.appendChild(item);
    }
    nav.appendChild(wrap);
  }
}

async function navigate(pathname, opts = {}) {
  const target = pathname.startsWith('/') ? pathname : '/' + pathname;
  if (!opts.replace && target === location.pathname + location.search) return;

  const { route, params } = resolvePath(target.split('?')[0]);

  if (!route) {
    if (!opts.replace) history.pushState({ path: target }, '', target);
    renderNotFound(target);
    return;
  }

  if (!opts.replace) history.pushState({ path: target }, '', target);
  else history.replaceState({ path: target }, '', target);

  await renderView(route, params, target);
}

async function renderView(route, params, fullPath) {
  // 取消上一个视图未完成的请求，避免结果写进已卸载的 DOM
  if (currentAbort) currentAbort.abort();
  if (typeof currentCleanup === 'function') { try { currentCleanup(); } catch {} }
  currentAbort = new AbortController();
  currentCleanup = null;

  const content = document.getElementById('content');
  clear(content);
  closeMobileNav();

  // 顶栏标题
  let title = route.title;
  const crumb = document.getElementById('pageCrumb');
  setText(document.getElementById('pageTitle'), title);
  setText(crumb, '');

  renderNav(route);

  // 未登录时给需要鉴权的视图一个明确的落地页，而不是渲染出空壳
  if (route.needsAuth && !Auth.loggedIn) {
    content.appendChild(pageHead(route.title, describeRoute(route)));
    content.appendChild(needLoginState(() => openLoginModal(() => navigate(fullPath, { replace: true }))));
    return;
  }

  const factory = VIEWS[route.view];
  if (!factory) {
    content.appendChild(emptyState({ icon: 'alert', title: '视图未加载', text: '缺少 ' + route.view + ' 模块，请检查静态资源是否部署完整。' }));
    return;
  }

  try {
    const handle = await factory({
      params,
      path: fullPath,
      container: content,     // 视图直接往这里塞节点
      signal: currentAbort.signal,
      setTitle: (t, c) => {
        if (t) { setText(document.getElementById('pageTitle'), t); title = t; }
        setText(crumb, c || '');
        document.title = (t ? t + ' · ' : '') + 'kayhs';
      },
      setCleanup: (fn) => { currentCleanup = fn; },
      navigate,
    });
    // 兼容两种写法：视图自己挂载，或返回 { node } / 节点由外壳挂载
    if (handle) {
      if (typeof handle.cleanup === 'function') currentCleanup = handle.cleanup;
      if (handle.node && !content.contains(handle.node)) content.appendChild(handle.node);
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    console.error('[view:' + route.view + ']', err);
    clear(content);
    content.appendChild(pageHead(route.title, ''));
    content.appendChild(emptyState({
      icon: 'alert',
      title: '页面加载失败',
      text: (err && err.message) || '未知错误',
      action: el('button.btn', { type: 'button', onclick: () => navigate(fullPath, { replace: true }) }, icon('refresh'), '重试'),
    }));
  }

  document.title = (route.view === 'home' ? '' : title + ' · ') + 'kayhs';
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function describeRoute(route) {
  const map = {
    home: '常用入口与站点概况。',
    drive: '文件存在 Cloudflare R2，支持文件夹、在线预览与限时分享链接。',
    tools: '纯前端运行的开发工具，数据不离开浏览器。',
    bookmarks: '常用网站收藏，按分类归组。',
    links: '长链接转短链，短链形如 /s/xxxxxx。',
    snippets: '随手存代码，带语法高亮。',
    blog: '文章以 Markdown 存在 R2，通过 API 读取。',
    guestbook: '留言公开可读，写入有频率限制。',
    settings: '账号、后端状态与本地偏好。',
  };
  return map[route.view] || '';
}

function pageHead(title, desc, actions) {
  return el('div.page-head', null,
    el('h1', { text: title }),
    desc ? el('p.page-desc', { text: desc }) : null,
    actions || null
  );
}

function renderNotFound(path) {
  const content = document.getElementById('content');
  clear(content);
  renderNav({ path: '/__404__' });
  setText(document.getElementById('pageTitle'), '页面不存在');
  setText(document.getElementById('pageCrumb'), '');
  document.title = '页面不存在 · kayhs';
  content.appendChild(emptyState({
    icon: 'search',
    title: '没有这个页面',
    text: '地址 ' + path + ' 不存在，可能已被移动或删除。',
    action: el('button.btn.btn-primary', { type: 'button', onclick: () => navigate('/') }, icon('home'), '回到首页'),
  }));
}

/* ------------------------------------------------------------------ *
 * 移动端抽屉
 * ------------------------------------------------------------------ */

function openMobileNav() {
  const sb = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  const btn = document.getElementById('menuToggle');
  sb.dataset.open = 'true';
  scrim.dataset.open = 'true';
  scrim.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
}

function closeMobileNav() {
  const sb = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  const btn = document.getElementById('menuToggle');
  if (!sb || sb.dataset.open !== 'true') return;
  sb.dataset.open = 'false';
  scrim.dataset.open = 'false';
  btn.setAttribute('aria-expanded', 'false');
  setTimeout(() => { if (scrim.dataset.open !== 'true') scrim.hidden = true; }, 220);
}

/* ------------------------------------------------------------------ *
 * 登录弹窗
 * ------------------------------------------------------------------ */

let loginCallback = null;

function openLoginModal(onSuccess) {
  loginCallback = onSuccess || null;
  const user = el('input.input', { type: 'text', autocomplete: 'username', placeholder: '账号', id: 'loginUser' });
  const pass = el('input.input', { type: 'password', autocomplete: 'current-password', placeholder: '密码', id: 'loginPass' });
  const errBox = el('div.field-error', { style: { display: 'none', marginTop: '4px' } });

  const submit = async (close) => {
    const u = user.value.trim(), p = pass.value;
    if (!u || !p) {
      setText(errBox, '账号和密码都要填');
      errBox.style.display = 'block';
      return false;
    }
    setText(errBox, '');
    errBox.style.display = 'none';
    const btns = errBox.closest('.modal').querySelectorAll('.modal-foot .btn');
    btns.forEach((b) => (b.disabled = true));
    try {
      const info = await Auth.login(u, p);
      pass.value = '';
      toast('已登录：' + info.username, 'ok');
      updateAuthUI();
      renderNav({ path: location.pathname });
      if (loginCallback) { const cb = loginCallback; loginCallback = null; cb(); }
      close();
      return false; // 手动关闭，避免重复触发
    } catch (e) {
      setText(errBox, e.message || '登录失败');
      errBox.style.display = 'block';
      btns.forEach((b) => (b.disabled = false));
      pass.select();
      return false;
    }
  };

  const body = el('div', null,
    el('div.field', null, el('label.field-label', { text: '账号', for: 'loginUser' }), user),
    el('div.field', null, el('label.field-label', { text: '密码', for: 'loginPass' }), pass, errBox),
    el('p.field-hint', { text: '凭据保存在 Cloudflare Worker 的加密变量里，本站不会记录明文密码。', style: { marginTop: '8px' } })
  );

  openModal({
    title: '登录',
    body,
    actions: [
      { label: '取消', kind: 'ghost', onClick: () => true },
      { label: '登录', kind: 'primary', closeOnClick: false, onClick: (b, close) => submit(close) },
    ],
  });

  pass.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const btn = body.closest('.modal').querySelector('.modal-foot .btn-primary');
      if (btn) btn.click();
    }
  });
  setTimeout(() => user.focus(), 40);
}

async function handleLogout() {
  const ok = await confirmModal({
    title: '退出登录',
    message: '退出后需要重新登录才能使用云盘、书签、短链、片段等云端功能。',
    okLabel: '退出',
  });
  if (!ok) return;
  await Auth.logout();
  toast('已退出登录', 'ok');
  updateAuthUI();
  navigate(location.pathname, { replace: true });
}

function updateAuthUI() {
  const btn = document.getElementById('authToggle');
  if (!btn) return;
  clear(btn);
  if (Auth.loggedIn) {
    btn.appendChild(icon('logout'));
    btn.title = '退出登录' + (Auth.user ? '（' + Auth.user.username + '）' : '');
    btn.dataset.active = 'true';
  } else {
    btn.appendChild(icon('user'));
    btn.title = '登录';
    btn.removeAttribute('data-active');
  }
  btn.setAttribute('aria-label', btn.title);
  const sub = document.getElementById('brandSub');
  if (sub) setText(sub, Auth.loggedIn && Auth.user ? Auth.user.username : '个人工具站');
}

/* ------------------------------------------------------------------ *
 * 后端连通性
 * ------------------------------------------------------------------ */

let connTimer = null;

async function checkConnection(silent) {
  const box = document.getElementById('connState');
  if (!box) return;
  const dot = box.querySelector('.conn-dot');
  const txt = box.querySelector('.conn-text');
  try {
    const r = await api('/api/ping');
    box.dataset.state = Auth.loggedIn ? 'ok' : 'guest';
    setText(txt, Auth.loggedIn ? '已连接' : '未登录');
    box.title = Auth.loggedIn
      ? '后端正常（v' + (r.version || '?') + '）'
      : '后端正常，但当前未登录，云端功能不可写';
  } catch (e) {
    box.dataset.state = 'err';
    setText(txt, '后端异常');
    box.title = '无法连接后端：' + (e.message || '未知错误');
    if (!silent) toast('后端连接异常', 'err');
  }
}

/* ------------------------------------------------------------------ *
 * 命令面板（⌘K / Ctrl+K）
 * ------------------------------------------------------------------ */

const PALETTE_STATIC = []; // 页面项，启动时填充
let paletteItems = [];     // 页面 + 工具

function buildPaletteIndex() {
  PALETTE_STATIC.length = 0;
  for (const r of ROUTES) {
    if (r.hidden) continue;
    PALETTE_STATIC.push({ group: '页面', name: r.title, hint: r.path, icon: r.icon, go: r.path, auth: r.needsAuth });
  }
  if (Auth.loggedIn) {
    PALETTE_STATIC.push({ group: '页面', name: '写文章', hint: '/write', icon: 'edit', go: '/write' });
  }
  paletteItems = PALETTE_STATIC.slice();
}

let fuseInstance = null;

async function openPalette() {
  buildPaletteIndex();

  // 工具项是动态的，等 tools 模块把清单准备好
  if (window.TOOL_INDEX && window.TOOL_INDEX.length) {
    paletteItems = PALETTE_STATIC.concat(window.TOOL_INDEX.map((t) => ({
      group: t.cat || '工具',
      name: t.name,
      hint: t.desc || '',
      icon: 'tools',
      go: '/tools/' + t.id,
      keywords: (t.keywords || []).join(' '),
    })));
  }

  // 模糊搜索需要 Fuse；加载失败就退回朴素 includes，功能不受影响
  try {
    const Fuse = await ensureLib('fuse');
    fuseInstance = new Fuse(paletteItems, {
      keys: [
        { name: 'name', weight: .6 },
        { name: 'keywords', weight: .2 },
        { name: 'hint', weight: .1 },
        { name: 'group', weight: .1 },
      ],
      threshold: .38,
      ignoreLocation: true,
      includeScore: true,
    });
  } catch { fuseInstance = null; }

  const input = el('input.palette-input', {
    type: 'text', placeholder: '搜索页面、工具…', autocomplete: 'off', spellcheck: 'false', id: 'paletteInput',
  });
  const results = el('div.palette-results', { role: 'listbox' });
  let cursor = 0;
  let shown = [];

  const draw = (q) => {
    const query = (q || '').trim();
    let list;
    if (!query) {
      list = paletteItems.slice();
    } else if (fuseInstance) {
      list = fuseInstance.search(query).map((r) => r.item);
    } else {
      const low = query.toLowerCase();
      list = paletteItems.filter((i) =>
        i.name.toLowerCase().includes(low) ||
        (i.keywords || '').toLowerCase().includes(low) ||
        (i.hint || '').toLowerCase().includes(low));
    }
    shown = list.slice(0, 24);
    cursor = Math.min(cursor, Math.max(0, shown.length - 1));

    clear(results);
    if (!shown.length) {
      results.appendChild(el('div.empty', { style: { padding: '32px 16px' } },
        el('div.empty-title', { text: '没有匹配项' }),
        el('div.empty-text', { text: '试试其他关键词，或直接输入页面名' })
      ));
      return;
    }

    let lastGroup = null;
    shown.forEach((item, i) => {
      if (item.group !== lastGroup) {
        results.appendChild(el('div.palette-group', { text: item.group }));
        lastGroup = item.group;
      }
      const row = el('button.palette-item', {
        type: 'button', role: 'option', 'aria-selected': i === cursor ? 'true' : 'false',
        dataset: { cursor: i === cursor ? 'true' : 'false', idx: String(i) },
        onmouseenter: () => { cursor = i; draw(input.value); },
        onclick: () => pick(i),
      },
        icon(item.icon || 'search'),
        el('span.pi-name', { text: item.name }),
        item.hint ? el('span.pi-hint', { text: item.hint }) : null
      );
      results.appendChild(row);
    });

    const active = results.querySelector('[data-cursor="true"]');
    if (active) active.scrollIntoView({ block: 'nearest' });
  };

  const pick = (i) => {
    const item = shown[i];
    if (!item) return;
    close();
    if (item.auth && !Auth.loggedIn) {
      openLoginModal(() => navigate(item.go));
    } else {
      navigate(item.go);
    }
  };

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, shown.length - 1); draw(input.value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); draw(input.value); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(cursor); }
    else if (e.key === 'Tab') { e.preventDefault(); }
  };

  const overlay = el('div.palette-root', { role: 'dialog', 'aria-modal': 'true' },
    el('div.palette', null,
      el('div.palette-input-wrap', null, icon('search'), input),
      results,
      el('div.palette-foot', null,
        el('span', null, el('kbd', { text: '↑↓' }), ' 选择'),
        el('span', null, el('kbd', { text: '↵' }), ' 打开'),
        el('span', null, el('kbd', { text: 'esc' }), ' 关闭')
      )
    )
  );

  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  input.addEventListener('input', () => { cursor = 0; draw(input.value); });
  input.addEventListener('keydown', onKey);
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(overlay);
  draw('');
  input.focus();
}

/* ------------------------------------------------------------------ *
 * 全局键盘
 * ------------------------------------------------------------------ */

function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') ||
      document.activeElement?.isContentEditable;

    // ⌘K / Ctrl+K：命令面板
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
      return;
    }
    // ⌘/Ctrl + B：切换主题
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && !inField) {
      e.preventDefault();
      toggleTheme();
      return;
    }
    // / 聚焦搜索（不在输入框时）
    if (e.key === '/' && !inField && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      openPalette();
      return;
    }
    // Alt+←/→ 前进后退
    if (e.altKey && e.key === 'ArrowLeft' && !inField) { e.preventDefault(); history.back(); }
    if (e.altKey && e.key === 'ArrowRight' && !inField) { e.preventDefault(); history.forward(); }
  });
}

/* ------------------------------------------------------------------ *
 * 链接拦截：站内 a 标签走 SPA 路由，不整页刷新
 * ------------------------------------------------------------------ */

function initLinkIntercept() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') && href !== '#/') return;      // 纯锚点交给浏览器
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    if (/^(https?:)?\/\//i.test(href) || /^(mailto|tel|javascript):/i.test(href)) return; // 外部链接
    if (!href.startsWith('/')) return;

    e.preventDefault();
    navigate(href);
  });
}

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

async function boot() {
  initTheme();

  // 图标注入
  const menuBtn = document.getElementById('menuToggle');
  if (menuBtn) menuBtn.appendChild(icon('menu'));
  const gh = document.getElementById('ghLink');
  if (gh) gh.appendChild(icon('external'));
  const st = document.querySelector('#searchTrigger .search-icon');
  if (st) st.appendChild(icon('search'));
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.appendChild(icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'));
    themeBtn.addEventListener('click', toggleTheme);
  }
  const authBtn = document.getElementById('authToggle');
  if (authBtn) authBtn.addEventListener('click', () => (Auth.loggedIn ? handleLogout() : openLoginModal(() => navigate(location.pathname, { replace: true }))));

  document.getElementById('menuToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').dataset.open === 'true' ? closeMobileNav() : openMobileNav();
  });
  document.getElementById('scrim')?.addEventListener('click', closeMobileNav);
  document.getElementById('searchTrigger')?.addEventListener('click', openPalette);

  onUnauthorized = () => { updateAuthUI(); renderNav({ path: location.pathname }); checkConnection(true); };

  initShortcuts();
  initLinkIntercept();

  window.addEventListener('popstate', () => {
    navigate(location.pathname + location.search, { replace: true });
  });

  // 恢复会话，再渲染首个视图（顺序不能反，否则需鉴权页会闪一下登录占位）
  await Auth.check();
  updateAuthUI();
  buildPaletteIndex();

  await navigate(location.pathname + location.search, { replace: true });

  checkConnection(true);
  connTimer = setInterval(() => checkConnection(true), 60000);
  // 标签页重新可见时立即复检，避免电脑休眠后状态过期
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkConnection(true);
  });
}

/*
 * 启动时机很关键：defer 脚本按文档顺序执行，但执行时 readyState 已经是
 * "interactive"（不是 "loading"），而 DOMContentLoaded 要等全部 defer 脚本
 * 跑完才触发。
 *
 * 所以这里必须判断 "complete" 而不是 "loading"——
 * 否则 boot() 会在各 view 脚本执行前就跑起来，那时 VIEWS 还是空的，
 * 任何路由都只会渲染「视图未加载」。
 */
if (document.readyState === 'complete') boot();
else document.addEventListener('DOMContentLoaded', boot, { once: true });
