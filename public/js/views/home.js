/**
 * views/home.js — 首页：站点概况 + 功能入口
 *
 * 刻意不做的：标语式大标题、噪点纹理装饰、"随手可用"这类空话。
 * 首页的信息价值应该是「我现在有什么、能用哪个」，统计数字直接来自后端。
 */

registerView('home', async (ctx) => {
  const { setTitle, signal } = ctx;
  setTitle('首页', '');

  const root = el('div');

  /* ---------- 头部 ---------- */
  root.appendChild(el('div.page-head', null,
    el('h1', { text: '概览' }),
    el('p.page-desc', {
      text: Auth.loggedIn
        ? '云盘文件与各项数据都存在 Cloudflare（R2 / KV），跨设备可用。'
        : '工具与博客无需登录即可使用。云盘、书签、短链、片段需要登录后读写。',
    })
  ));

  /* ---------- 统计 ---------- */
  const statGrid = el('div.stat-grid');
  const statNodes = {};
  const STAT_DEFS = [
    ['files', '云盘文件'],
    ['bytes', '已用空间'],
    ['posts', '博客文章'],
    ['shortLinks', '短链接'],
    ['bookmarks', '书签'],
    ['snippets', '代码片段'],
  ];
  for (const [key, label] of STAT_DEFS) {
    statNodes[key] = el('div.stat-value', { text: '—' });
    statGrid.appendChild(el('div.stat', null,
      statNodes[key],
      el('div.stat-key', { text: label })
    ));
  }
  const statsSection = el('div.section', null,
    el('div.section-head', null,
      el('h2', { text: '存储与内容' }),
      el('div.spacer'),
      el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => loadStats() }, icon('refresh'), '刷新')
    ),
    statGrid,
    el('div.quota-row', { style: { marginTop: 'var(--s5)' } })
  );
  root.appendChild(statsSection);

  /* ---------- 空间配额条 ---------- */
  const quotaWrap = statsSection.querySelector('.quota-row');
  const quotaBar = el('div.progress-fill', { style: { width: '0%' } });
  const quotaText = el('span.small.muted', { text: '空间用量统计中…' });
  quotaWrap.append(
    el('div.row-between', { style: { marginBottom: 'var(--s2)' } },
      el('span.label', { text: 'R2 空间' }),
      quotaText
    ),
    el('div.progress', null, quotaBar)
  );

  async function loadStats() {
    for (const k in statNodes) setText(statNodes[k], '…');
    try {
      const s = await api('/api/stats', { signal });
      setText(statNodes.files, String(s.drive.files));
      setText(statNodes.bytes, fmtBytes(s.drive.bytes));
      setText(statNodes.posts, String(s.posts));
      setText(statNodes.shortLinks, String(s.shortLinks));
      setText(statNodes.bookmarks, String(s.bookmarks));
      setText(statNodes.snippets, String(s.snippets));

      const pct = s.drive.quota ? (s.drive.bytes / s.drive.quota) * 100 : 0;
      quotaBar.style.width = Math.max(pct > 0 ? 1 : 0, Math.min(100, pct)).toFixed(2) + '%';
      const tone = pct > 90 ? 'err' : pct > 70 ? 'warn' : null;
      if (tone) quotaBar.parentElement.dataset.tone = tone;
      else delete quotaBar.parentElement.dataset.tone;
      setText(quotaText, fmtBytes(s.drive.bytes) + ' / ' + fmtBytes(s.drive.quota) + '（' + pct.toFixed(1) + '%）');
    } catch (e) {
      if (e.name === 'AbortError') return;
      for (const k in statNodes) setText(statNodes[k], '—');
      setText(quotaText, '统计不可用：' + (e.message || '后端未响应'));
      // 未登录时 /api/stats 需要鉴权，这里给一句明确说明而不是红字报错
      if (e.status === 401) {
        setText(quotaText, '登录后查看云盘用量与各项统计');
        quotaBar.style.width = '0%';
      }
    }
  }
  loadStats();

  /* ---------- 功能入口 ---------- */
  const ENTRIES = [
    {
      icon: 'drive', name: '云盘', desc: '文件夹层级、在线预览、批量操作与限时分享链接',
      path: '/drive', auth: true,
      stat: async (s) => s ? s.drive.files + ' 个文件 · ' + fmtBytes(s.drive.bytes) : null,
    },
    {
      icon: 'tools', name: '工具箱', desc: '编码、哈希、图片、正则、Cron 等纯前端工具',
      path: '/tools',
      stat: () => (window.TOOL_INDEX ? window.TOOL_INDEX.length + ' 个工具' : null),
    },
    {
      icon: 'bookmark', name: '书签导航', desc: '常用网站按分类归组，支持搜索',
      path: '/bookmarks', auth: true,
      stat: async (s) => s ? s.bookmarks + ' 个书签' : null,
    },
    {
      icon: 'link', name: '短链接', desc: '长链接转短码，附带访问计数',
      path: '/links', auth: true,
      stat: async (s) => s ? s.shortLinks + ' 条短链' : null,
    },
    {
      icon: 'code', name: '代码片段', desc: '随手存代码，带语言标注与高亮',
      path: '/snippets', auth: true,
      stat: async (s) => s ? s.snippets + ' 个片段' : null,
    },
    {
      icon: 'blog', name: '博客', desc: 'Markdown 文章，存在 R2，公开可读',
      path: '/blog',
      stat: async (s) => s ? s.posts + ' 篇文章' : null,
    },
    {
      icon: 'message', name: '留言板', desc: '公开留言，写入有频率限制',
      path: '/guestbook',
      stat: async (s) => s ? s.guestbook + ' 条留言' : null,
    },
    {
      icon: 'settings', name: '设置', desc: '账号、后端状态、主题与本地偏好',
      path: '/settings',
      stat: () => null,
    },
  ];

  let statsCache = null;
  try { statsCache = await api('/api/stats', { signal }); } catch { /* 未登录则无统计，入口仍可用 */ }

  const grid = el('div.entry-grid');
  for (const e of ENTRIES) {
    const statNode = el('div.entry-stat', { text: '' });
    const card = el('a.entry', { href: e.path },
      el('div.entry-icon', null, icon(e.icon)),
      el('div.entry-name', null, e.name, e.auth && !Auth.loggedIn ? el('span.tag', { text: '需登录', style: { marginLeft: '6px' } }) : null),
      el('div.entry-desc', { text: e.desc }),
      statNode
    );
    grid.appendChild(card);

    // 统计异步填充，不阻塞首屏
    Promise.resolve(e.stat(statsCache)).then((txt) => {
      if (txt) setText(statNode, txt);
      else statNode.remove();
    }).catch(() => statNode.remove());
  }

  root.appendChild(el('div.section', null,
    el('div.section-head', null, el('h2', { text: '功能' })),
    grid
  ));

  /* ---------- 最近文章 ---------- */
  const postWrap = el('div');
  postWrap.appendChild(el('div.section-head', null,
    el('h2', { text: '最近文章' }),
    el('div.spacer'),
    el('a.btn.btn-sm.btn-ghost', { href: '/blog' }, '全部', icon('back', 13))
  ));
  const postList = el('div');
  postWrap.appendChild(postList);
  root.appendChild(el('div.section', null, postWrap));

  setText(postList, '');
  postList.appendChild(loadingState('读取文章…'));
  try {
    const r = await api('/api/blog', { signal });
    const posts = (r.posts || []).slice(0, 4);
    clear(postList);
    if (!posts.length) {
      postList.appendChild(emptyState({
        icon: 'blog',
        title: '还没有文章',
        text: Auth.loggedIn ? '从「写文章」开始记录。' : '登录后可以发布文章。',
      }));
    } else {
      for (const p of posts) {
        postList.appendChild(el('a.post-list-item', { href: '/blog/' + p.slug },
          el('div.post-list-title', { text: p.title }),
          el('div.post-list-meta', null,
            p.date ? el('span', { text: p.date }) : null,
            p.words ? el('span', { text: '·' }) : null,
            p.words ? el('span', { text: Math.round(p.words / 300) + ' 分钟读完' }) : null,
            ...(p.tags || []).slice(0, 2).map((t) => el('span.tag', { text: t }))
          ),
          p.summary ? el('div.post-list-excerpt', { text: p.summary }) : null
        ));
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    clear(postList);
    postList.appendChild(emptyState({ icon: 'alert', title: '文章读取失败', text: e.message || '后端未响应' }));
  }

  /* ---------- 页脚 ---------- */
  root.appendChild(el('footer', {
    style: { marginTop: 'var(--s11)', paddingTop: 'var(--s6)', borderTop: '1px solid var(--line)', fontSize: '12px', color: 'var(--faint)' },
  },
    el('div.row-between.row-wrap', null,
      el('span', { text: '© ' + new Date().getFullYear() + ' kayhs · Cloudflare Workers + R2 + KV' }),
      el('div.row', { style: { gap: 'var(--s5)' } },
        el('a', { href: 'https://github.com/keyh4/kayhs-site', target: '_blank', rel: 'noopener noreferrer', text: '源码', style: { color: 'var(--muted)' } }),
        el('a', { href: '/feed.xml', text: 'RSS', style: { color: 'var(--muted)' } }),
        el('a', { href: '/api/health', target: '_blank', rel: 'noopener', text: 'API', style: { color: 'var(--muted)' } })
      )
    )
  ));

  return { node: root };
});
