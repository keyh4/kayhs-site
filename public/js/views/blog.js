/**
 * views/blog.js — 博客列表、文章详情、编辑器
 *
 * 与旧版的根本区别：
 *   旧版把 3 篇文章硬编码在前端 JS 数组里，改一个字要动源码，
 *   且内容与实际部署矛盾（写着"部署在 GitHub Pages"，实际是 Worker）。
 *   现在文章以 Markdown 存在 R2，通过 /api/blog 读取，可在站内直接编辑发布。
 *   渲染走 marked + DOMPurify，正文里的 <script> 会被消毒掉。
 */

/* ================================================================== *
 * 博客列表
 * ================================================================== */

registerView('blog', async (ctx) => {
  const { setTitle, signal, navigate } = ctx;
  setTitle('博客', '');
  const root = el('div');

  root.appendChild(el('div.page-head', null,
    el('h1', { text: '博客' }),
    el('p.page-desc', { text: '文章以 Markdown 存在 Cloudflare R2，通过 API 读取。公开可读，订阅 RSS 获取更新。' })
  ));

  // 顶部：RSS 链接 + 写文章（登录后可见）
  const actions = el('div.row', { style: { gap: 'var(--s4)', marginBottom: 'var(--s6)' } },
    el('a.btn.btn-sm.btn-ghost', { href: '/feed.xml', target: '_blank', rel: 'noopener' }, icon('list'), 'RSS 订阅'),
    Auth.loggedIn ? el('button.btn.btn-sm.btn-primary', { type: 'button', onclick: () => navigate('/write') }, icon('edit'), '写文章') : null
  );
  root.appendChild(actions);

  const tagBar = el('div.chip-row', { style: { marginBottom: 'var(--s6)' } });
  const listBox = el('div');
  root.append(tagBar, listBox);

  let posts = [];
  let curTag = null;

  async function load() {
    clear(listBox);
    listBox.appendChild(loadingState('读取文章…'));
    try {
      const r = await api('/api/blog', { signal });
      posts = r.posts || [];
      renderTags();
      render();
    } catch (e) {
      if (e.name === 'AbortError') return;
      clear(listBox);
      listBox.appendChild(emptyState({
        icon: 'alert', title: '文章读取失败',
        text: e.message || '后端未响应',
        action: el('button.btn', { type: 'button', onclick: load }, icon('refresh'), '重试'),
      }));
    }
  }

  function renderTags() {
    const tags = new Map();
    for (const p of posts) for (const t of p.tags || []) tags.set(t, (tags.get(t) || 0) + 1);
    clear(tagBar);
    if (!tags.size) return;
    tagBar.appendChild(el('button.chip', {
      type: 'button', dataset: { active: !curTag ? 'true' : 'false' },
      onclick: () => { curTag = null; renderTags(); render(); },
    }, '全部 ' + posts.length));
    for (const [t, n] of [...tags.entries()].sort((a, b) => b[1] - a[1])) {
      tagBar.appendChild(el('button.chip', {
        type: 'button', dataset: { active: curTag === t ? 'true' : 'false' },
        onclick: () => { curTag = curTag === t ? null : t; renderTags(); render(); },
      }, t + ' ' + n));
    }
  }

  function render() {
    clear(listBox);
    const list = curTag ? posts.filter((p) => (p.tags || []).includes(curTag)) : posts;
    if (!posts.length) {
      listBox.appendChild(emptyState({
        icon: 'blog',
        title: '还没有文章',
        text: Auth.loggedIn ? '点上方「写文章」发布第一篇。' : '登录后可发布文章。',
      }));
      return;
    }
    if (!list.length) {
      listBox.appendChild(emptyState({ icon: 'search', title: '该标签下没有文章' }));
      return;
    }

    // 按年份分组
    const byYear = new Map();
    for (const p of list) {
      const y = (p.date || '').slice(0, 4) || '未标注';
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(p);
    }

    for (const [year, items] of [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
      listBox.appendChild(el('div.section', null,
        el('div.section-head', null,
          el('h2.num', { text: year }),
          el('div.spacer'),
          el('span.small.faint', { text: items.length + ' 篇' })
        ),
        el('div', null, ...items.map((p) => el('a.post-list-item', { href: '/blog/' + p.slug },
          el('div.post-list-title', { text: p.title }),
          el('div.post-list-meta', null,
            p.date ? el('span', { text: p.date }) : null,
            p.words ? el('span', { text: '·' }) : null,
            p.words ? el('span', { text: Math.max(1, Math.round(p.words / 400)) + ' 分钟' }) : null,
            ...(p.tags || []).map((t) => el('span.tag', { text: t }))
          ),
          p.summary ? el('div.post-list-excerpt', { text: p.summary }) : null
        )))
      ));
    }
  }

  await load();
  return { node: root };
});

/* ================================================================== *
 * 文章详情
 * ================================================================== */

registerView('post', async (ctx) => {
  const { params, setTitle, signal, navigate } = ctx;
  const root = el('div');

  root.appendChild(el('button.post-back', { type: 'button', onclick: () => navigate('/blog') }, icon('back', 13), '返回博客'));

  const body = el('div');
  root.appendChild(body);
  body.appendChild(loadingState('读取文章…'));

  try {
    const p = await api('/api/blog/' + encodeURIComponent(params.slug), { signal });
    setTitle(p.title, '博客');
    clear(body);

    body.appendChild(el('div.post-head', null,
      el('h1.post-title', { text: p.title }),
      el('div.post-meta-row', null,
        p.date ? el('time', { text: p.date, datetime: p.date }) : null,
        p.body ? el('span', { text: '·' }) : null,
        p.body ? el('span', { text: Math.max(1, Math.round(p.body.length / 400)) + ' 分钟读完' }) : null,
        ...(p.tags || []).map((t) => el('a.tag.tag-accent', { href: '/blog', text: t, onclick: (e) => { e.preventDefault(); navigate('/blog'); } }))
      ),
      Auth.loggedIn ? el('div.row', { style: { marginTop: 'var(--s5)', gap: 'var(--s3)' } },
        el('button.btn.btn-sm', { type: 'button', onclick: () => navigate('/write?edit=' + encodeURIComponent(p.slug)) }, icon('edit'), '编辑'),
        el('button.btn.btn-sm.btn-danger', { type: 'button', onclick: async () => {
          const ok = await confirmModal({ title: '删除文章', message: '确定删除《' + p.title + '》？', detail: '此操作不可撤销。', okLabel: '删除', danger: true });
          if (!ok) return;
          try {
            await api('/api/blog/' + encodeURIComponent(p.slug), { method: 'DELETE' });
            toast('已删除', 'ok');
            navigate('/blog');
          } catch (e) { toast(e.message || '删除失败', 'err'); }
        } }, icon('trash'), '删除')
      ) : null
    ));

    const content = el('article.prose');
    body.appendChild(content);

    // Markdown → 安全 HTML
    try {
      const html = await renderMarkdown(p.body || '', { breaks: false });
      setSafeHtml(content, html);
    } catch (e) {
      setText(content, '渲染失败：' + (e.message || ''));
    }

    // 代码高亮
    try {
      await ensureLib('hljs');
      if (typeof hljs !== 'undefined') content.querySelectorAll('pre code').forEach((b) => { try { hljs.highlightElement(b); } catch {} });
    } catch { /* 高亮失败不影响阅读 */ }

    // 外链自动加 target，代码块加复制按钮
    content.querySelectorAll('a[href^="http"]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    content.querySelectorAll('pre').forEach((pre) => {
      pre.style.position = 'relative';
      const btn = el('button.icon-btn', {
        type: 'button', title: '复制代码',
        style: { position: 'absolute', top: '6px', right: '6px', background: 'var(--surface)', border: '1px solid var(--line)', opacity: '0', transition: 'opacity .12s' },
        onclick: () => copyText(pre.querySelector('code')?.textContent || pre.textContent),
      }, icon('copy', 13));
      pre.appendChild(btn);
      pre.addEventListener('mouseenter', () => (btn.style.opacity = '1'));
      pre.addEventListener('mouseleave', () => (btn.style.opacity = '0'));
    });

    // 上一篇 / 下一篇
    try {
      const all = (await api('/api/blog', { signal })).posts || [];
      const idx = all.findIndex((x) => x.slug === p.slug);
      if (idx >= 0 && all.length > 1) {
        const prev = all[idx + 1], next = all[idx - 1];
        const nav = el('div.row-between', { style: { marginTop: 'var(--s11)', paddingTop: 'var(--s6)', borderTop: '1px solid var(--line)', gap: 'var(--s5)' } });
        nav.appendChild(prev
          ? el('a', { href: '/blog/' + prev.slug, style: { flex: '1' } },
              el('div.small.faint', { text: '← 上一篇' }),
              el('div', { text: prev.title, style: { fontSize: '13px', fontWeight: '550', marginTop: '2px' } }))
          : el('div', { style: { flex: '1' } }));
        nav.appendChild(next
          ? el('a', { href: '/blog/' + next.slug, style: { flex: '1', textAlign: 'right' } },
              el('div.small.faint', { text: '下一篇 →' }),
              el('div', { text: next.title, style: { fontSize: '13px', fontWeight: '550', marginTop: '2px' } }))
          : el('div', { style: { flex: '1' } }));
        body.appendChild(nav);
      }
    } catch { /* 导航失败不影响正文 */ }
  } catch (e) {
    if (e.name === 'AbortError') return;
    clear(body);
    body.appendChild(emptyState({
      icon: 'alert',
      title: e.status === 404 ? '文章不存在' : '读取失败',
      text: e.message || '',
      action: el('a.btn.btn-primary', { href: '/blog' }, icon('blog'), '返回博客'),
    }));
  }

  return { node: root };
});

/* ================================================================== *
 * 写文章 / 编辑
 * ================================================================== */

registerView('write', async (ctx) => {
  const { setTitle, signal, navigate } = ctx;

  if (!Auth.loggedIn) {
    setTitle('写文章', '');
    return { node: el('div', null,
      pageHeadLocal('写文章', '发布需要登录。'),
      needLoginState(() => openLoginModal(() => navigate('/write', { replace: true })))
    ) };
  }

  // 解析 ?edit=slug
  const editSlug = new URLSearchParams(location.search).get('edit');
  setTitle(editSlug ? '编辑文章' : '写文章', '');

  const root = el('div');
  root.appendChild(el('button.post-back', { type: 'button', onclick: () => navigate('/blog') }, icon('back', 13), '返回博客'));
  root.appendChild(el('div.page-head', null, el('h1', { text: editSlug ? '编辑文章' : '写文章' })));

  const titleIn = el('input.input', { type: 'text', placeholder: '文章标题', style: { fontSize: '16px', height: '38px' } });
  const slugIn = el('input.input.input-mono', { type: 'text', placeholder: 'url-slug（留空自动生成）' });
  const dateIn = el('input.input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const tagsIn = el('input.input', { type: 'text', placeholder: '标签，逗号分隔' });
  const summaryIn = el('input.input', { type: 'text', placeholder: '一句话摘要（列表页显示）' });
  const draftChk = el('input', { type: 'checkbox' });
  const contentIn = el('textarea.textarea.textarea-mono', { placeholder: '用 Markdown 写正文…', spellcheck: 'false', style: { minHeight: '420px', resize: 'vertical' } });
  const preview = el('div.md-preview.prose', null, el('p.muted', { text: '预览区' }));

  // 编辑模式：拉取现有内容
  if (editSlug) {
    try {
      const p = await api('/api/blog/' + encodeURIComponent(editSlug), { signal });
      titleIn.value = p.title || '';
      slugIn.value = p.slug || editSlug;
      slugIn.readOnly = true; // slug 不变，避免产生重复文章
      dateIn.value = p.date || '';
      tagsIn.value = (p.tags || []).join(', ');
      summaryIn.value = p.summary || '';
      contentIn.value = p.body || '';
    } catch (e) {
      toast('读取文章失败：' + (e.message || ''), 'err');
    }
  }

  // slug 自动生成
  titleIn.addEventListener('input', debounce(() => {
    if (slugIn.readOnly || slugIn.value.trim()) return;
    const s = titleIn.value.trim().toLowerCase()
      .replace(/[\s]+/g, '-')
      .replace(/[^a-z0-9\u4e00-\u9fff\-_]/g, '')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    slugIn.value = s || '';
  }, 400));

  // 实时预览
  let previewTimer = null;
  const doPreview = async () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      if (!contentIn.value.trim()) { clear(preview); preview.appendChild(el('p.muted', { text: '预览区' })); return; }
      try {
        const html = await renderMarkdown(contentIn.value, { breaks: false });
        setSafeHtml(preview, html);
        if (typeof hljs !== 'undefined') preview.querySelectorAll('pre code').forEach((b) => { try { hljs.highlightElement(b); } catch {} });
      } catch (e) { setText(preview, '渲染失败：' + e.message); }
    }, 300);
  };
  contentIn.addEventListener('input', doPreview);
  // 预加载高亮库，让预览里的代码块也有颜色
  ensureLib('hljs').catch(() => {});

  const wordCount = el('span.small.faint', { text: '0 字' });
  contentIn.addEventListener('input', debounce(() => setText(wordCount, contentIn.value.length + ' 字'), 300));

  const statusText = el('span.small.muted');

  async function save(andClose) {
    if (!titleIn.value.trim()) { toast('请填写标题', 'warn'); titleIn.focus(); return; }
    if (!contentIn.value.trim()) { toast('正文不能为空', 'warn'); contentIn.focus(); return; }
    const slug = slugIn.value.trim() || titleIn.value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u4e00-\u9fff\-_]/g, '').slice(0, 60);
    if (!slug) { toast('无法生成 slug，请手动填写', 'warn'); slugIn.focus(); return; }

    setText(statusText, '保存中…');
    try {
      const payload = {
        title: titleIn.value.trim(),
        slug,
        date: dateIn.value,
        tags: tagsIn.value.split(',').map((t) => t.trim()).filter(Boolean),
        summary: summaryIn.value.trim(),
        content: contentIn.value,
        draft: draftChk.checked,
      };
      await api('/api/blog/' + encodeURIComponent(slug), { method: 'POST', body: payload });
      toast(editSlug ? '已更新' : '已发布', 'ok');
      setText(statusText, '已保存 ' + new Date().toLocaleTimeString('zh-CN'));
      if (andClose) navigate('/blog/' + slug);
    } catch (e) {
      setText(statusText, '');
      toast(e.message || '保存失败', 'err');
    }
  }

  root.append(
    el('div.card', { style: { marginBottom: 'var(--s5)' } },
      el('div.card-body', null,
        el('div.field', null, el('label.field-label', { text: '标题 *' }), titleIn),
        el('div.row-wrap', { style: { gap: 'var(--s4)' } },
          el('div.field.grow', { style: { marginBottom: '0', minWidth: '180px' } }, el('label.field-label', { text: 'Slug' }), slugIn),
          el('div.field', { style: { marginBottom: '0', width: '160px' } }, el('label.field-label', { text: '日期' }), dateIn),
          el('div.field.grow', { style: { marginBottom: '0', minWidth: '180px' } }, el('label.field-label', { text: '标签' }), tagsIn)
        ),
        el('div.field', { style: { marginTop: 'var(--s5)' } }, el('label.field-label', { text: '摘要' }), summaryIn,
          el('span.field-hint', { text: '显示在列表页。留空则自动取正文前 120 字。' })),
        el('label.switch', { style: { marginTop: 'var(--s4)' } }, draftChk, el('span.switch-track'), el('span', { text: '存为草稿（不在列表公开显示）' }))
      )
    ),

    el('div.row-between', { style: { marginBottom: 'var(--s4)' } },
      el('span.label', { text: '正文' }),
      wordCount
    ),
    el('div.md-editor', null,
      contentIn,
      el('div', null, el('label.field-label', { text: '预览', style: { display: 'block', marginBottom: 'var(--s2)' } }), preview)
    ),

    el('div.row-between', { style: { marginTop: 'var(--s6)', flexWrap: 'wrap', gap: 'var(--s4)' } },
      statusText,
      el('div.row', null,
        el('button.btn', { type: 'button', onclick: () => save(false) }, icon('save'), '保存'),
        el('button.btn.btn-primary', { type: 'button', onclick: () => save(true) }, icon('check'), editSlug ? '更新并查看' : '发布')
      )
    )
  );

  // Ctrl/Cmd+S 保存
  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(false); }
  };
  document.addEventListener('keydown', onKey);
  ctx.setCleanup(() => { document.removeEventListener('keydown', onKey); clearTimeout(previewTimer); });

  return { node: root };
});

/** 局部用的 pageHead（避免依赖 app.js 的全局函数加载顺序） */
function pageHeadLocal(title, desc) {
  return el('div.page-head', null,
    el('h1', { text: title }),
    desc ? el('p.page-desc', { text: desc }) : null
  );
}
