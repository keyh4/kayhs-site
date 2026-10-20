/**
 * views/collections.js — 书签导航、短链接、代码片段、留言板
 *
 * 四个模块结构相似（列表 + 增删），但数据来源与鉴权要求不同：
 *   - 留言板：读取公开，写入需登录（后端限流 3 次/分钟/IP）
 *   - 其余三个：读写都需登录
 * 旧版把这些统一说成「数据存在本地」，实际全在云端。这里文案与实现严格一致。
 */

/* ================================================================== *
 * 书签导航
 * ================================================================== */

registerView('bookmarks', async (ctx) => {
  const { setTitle, signal, navigate } = ctx;
  setTitle('书签导航', '');
  const root = el('div');

  root.appendChild(el('div.page-head', null,
    el('h1', { text: '书签导航' }),
    el('p.page-desc', { text: '常用网站按分类归组，存在云端 KV，登录后可增删。' })
  ));

  const searchBox = el('input.input', { type: 'search', placeholder: '搜索名称、网址或分类…', style: { maxWidth: '340px', marginBottom: 'var(--s5)' } });
  const listBox = el('div');
  const addBtn = el('button.btn.btn-primary', { type: 'button' }, icon('plus'), '添加书签');

  root.append(
    el('div.row-between', { style: { marginBottom: 'var(--s5)', flexWrap: 'wrap', gap: 'var(--s4)' } }, searchBox, addBtn),
    listBox
  );

  let items = [];
  let query = '';

  addBtn.addEventListener('click', () => openAddModal());

  function openAddModal(prefill) {
    const name = el('input.input', { type: 'text', placeholder: '例如 Cloudflare 控制台', value: prefill?.name || '' });
    const url = el('input.input.input-mono', { type: 'url', placeholder: 'https://', value: prefill?.url || '' });
    const cat = el('input.input', { type: 'text', placeholder: '例如 开发工具', value: prefill?.cat || '' });
    const note = el('input.input', { type: 'text', placeholder: '备注（可选）', value: prefill?.note || '' });

    openModal({
      title: prefill ? '编辑书签' : '添加书签',
      body: el('div', null,
        el('div.field', null, el('label.field-label', { text: '名称 *' }), name),
        el('div.field', null, el('label.field-label', { text: '网址 *' }), url),
        el('div.field', null, el('label.field-label', { text: '分类' }), cat, el('span.field-hint', { text: '留空归入「未分类」' })),
        el('div.field', null, el('label.field-label', { text: '备注' }), note)
      ),
      actions: [
        { label: '取消', kind: 'ghost' },
        {
          label: prefill ? '保存' : '添加', kind: 'primary',
          onClick: async () => {
            if (!name.value.trim()) { toast('请填写名称', 'warn'); return false; }
            if (!/^https?:\/\//i.test(url.value.trim())) { toast('网址需以 http:// 或 https:// 开头', 'warn'); return false; }
            try {
              await api('/api/nav', { method: 'POST', body: {
                name: name.value.trim(), url: url.value.trim(),
                cat: cat.value.trim() || '未分类', note: note.value.trim(),
              } });
              toast('已添加', 'ok');
              await load();
              return true;
            } catch (e) { toast(e.message || '添加失败', 'err'); return false; }
          },
        },
      ],
    });
  }

  async function load() {
    if (!Auth.loggedIn) {
      clear(listBox);
      listBox.appendChild(needLoginState(() => openLoginModal(() => navigate('/bookmarks', { replace: true }))));
      return;
    }
    clear(listBox);
    listBox.appendChild(loadingState('读取书签…'));
    try {
      const r = await api('/api/nav', { signal });
      items = r.items || [];
      render();
    } catch (e) {
      if (e.name === 'AbortError') return;
      clear(listBox);
      listBox.appendChild(emptyState({ icon: 'alert', title: '读取失败', text: e.message || '后端未响应' }));
    }
  }

  function render() {
    clear(listBox);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((i) => i.name.toLowerCase().includes(q) || i.url.toLowerCase().includes(q) || (i.cat || '').toLowerCase().includes(q))
      : items;

    if (!items.length) {
      listBox.appendChild(emptyState({
        icon: 'bookmark', title: '还没有书签',
        text: '点右上角「添加书签」收藏常用网站。',
      }));
      return;
    }
    if (!filtered.length) {
      listBox.appendChild(emptyState({ icon: 'search', title: '没有匹配的书签', text: '换个关键词试试。' }));
      return;
    }

    // 按分类分组
    const groups = new Map();
    for (const it of filtered) {
      const cat = it.cat || '未分类';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(it);
    }

    for (const [cat, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))) {
      listBox.appendChild(el('div.section', null,
        el('div.section-head', null,
          el('h2', { text: cat }),
          el('span.tag', { text: String(list.length) })
        ),
        el('div.grid', null, ...list.map((it) => renderCard(it)))
      ));
    }
  }

  function renderCard(it) {
    let host = '';
    try { host = new URL(it.url).hostname.replace(/^www\./, ''); } catch { host = it.url; }
    return el('div.grid-tile', { style: { cursor: 'default', position: 'relative' } },
      el('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer', style: { display: 'flex', flexDirection: 'column', gap: 'var(--s2)', flex: '1' } },
        el('div.grid-tile-title', null,
          el('span.grid-tile-icon', null, icon('external')),
          it.name
        ),
        el('div.grid-tile-desc', { text: it.note || host })
      ),
      el('div', { style: { position: 'absolute', top: '6px', right: '6px', display: 'flex', gap: '2px' } },
        el('button.icon-btn', { type: 'button', title: '复制链接', style: { width: '24px', height: '24px' }, onclick: () => copyText(it.url) }, icon('copy', 13)),
        el('button.icon-btn', { type: 'button', title: '删除', style: { width: '24px', height: '24px' }, onclick: () => removeItem(it) }, icon('trash', 13))
      )
    );
  }

  async function removeItem(it) {
    const ok = await confirmModal({ title: '删除书签', message: '确定删除「' + it.name + '」？', okLabel: '删除', danger: true });
    if (!ok) return;
    try {
      await api('/api/nav/' + encodeURIComponent(it.id), { method: 'DELETE' });
      toast('已删除', 'ok');
      items = items.filter((x) => x.id !== it.id);
      render();
    } catch (e) { toast(e.message || '删除失败', 'err'); }
  }

  searchBox.addEventListener('input', debounce((e) => { query = e.target.value; render(); }, 150));
  await load();
  return { node: root };
});

/* ================================================================== *
 * 短链接
 * ================================================================== */

registerView('links', async (ctx) => {
  const { setTitle, signal, navigate } = ctx;
  setTitle('短链接', '');
  const root = el('div');

  root.appendChild(el('div.page-head', null,
    el('h1', { text: '短链接' }),
    el('p.page-desc', { text: '长链接转成 ' + location.origin + '/s/xxxxxx 形式，访问自动 302 跳转，附带访问计数。' })
  ));

  const urlInput = el('input.input.input-mono', { type: 'url', placeholder: 'https://要缩短的长链接…' });
  const noteInput = el('input.input', { type: 'text', placeholder: '备注（可选，仅自己可见）', style: { maxWidth: '240px' } });
  const createBtn = el('button.btn.btn-primary', { type: 'button' }, icon('plus'), '生成短链');
  const listBox = el('div');

  root.append(
    el('div.card', { style: { marginBottom: 'var(--s6)' } },
      el('div.card-body', null,
        el('div.row-wrap', { style: { gap: 'var(--s4)' } },
          el('div.grow', null, urlInput),
          noteInput,
          createBtn
        )
      )
    ),
    listBox
  );

  let items = [];

  async function create() {
    const url = urlInput.value.trim();
    if (!url) { toast('请输入链接', 'warn'); return; }
    if (!/^https?:\/\//i.test(url)) { toast('链接需以 http:// 或 https:// 开头', 'warn'); return; }
    createBtn.disabled = true;
    try {
      const r = await api('/api/short', { method: 'POST', body: { url, note: noteInput.value.trim() } });
      urlInput.value = ''; noteInput.value = '';
      openModal({
        title: '短链已生成',
        body: el('div', null,
          el('p.field-hint', { text: '任何人都能通过这个短链访问目标地址。', style: { marginBottom: 'var(--s4)' } }),
          el('div.row', null,
            el('input.input.input-mono', { value: r.link, readonly: true, onclick: (e) => e.target.select() }),
            el('button.btn', { type: 'button', onclick: () => copyText(r.link) }, icon('copy'), '复制')
          )
        ),
        actions: [{ label: '完成', kind: 'primary' }],
      });
      await load();
    } catch (e) {
      toast(e.message || '生成失败', 'err');
    } finally {
      createBtn.disabled = false;
    }
  }

  createBtn.addEventListener('click', create);
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });

  async function load() {
    if (!Auth.loggedIn) {
      clear(listBox);
      listBox.appendChild(needLoginState(() => openLoginModal(() => navigate('/links', { replace: true }))));
      return;
    }
    clear(listBox);
    listBox.appendChild(loadingState('读取短链…'));
    try {
      const r = await api('/api/short/list', { signal });
      items = r.items || [];
      render();
    } catch (e) {
      if (e.name === 'AbortError') return;
      clear(listBox);
      listBox.appendChild(emptyState({ icon: 'alert', title: '读取失败', text: e.message || '后端未响应' }));
    }
  }

  function render() {
    clear(listBox);
    if (!items.length) {
      listBox.appendChild(emptyState({ icon: 'link', title: '还没有短链', text: '在上方输入长链接生成第一个短链。' }));
      return;
    }
    const wrap = el('div.table-wrap', null,
      el('table.table', null,
        el('thead', null, el('tr', null,
          el('th', { text: '短码' }),
          el('th', { text: '目标地址' }),
          el('th', { text: '备注' }),
          el('th.num', { text: '访问' }),
          el('th', { text: '创建' }),
          el('th', { text: '' })
        )),
        el('tbody', null, ...items.map((it) => {
          const link = location.origin + '/s/' + it.code;
          return el('tr', null,
            el('td', null, el('a.mono', { href: link, target: '_blank', rel: 'noopener noreferrer', text: it.code, style: { color: 'var(--accent)' } })),
            el('td.truncate', { style: { maxWidth: '320px' } },
              el('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer', text: it.url, title: it.url, style: { color: 'var(--muted)' } })
            ),
            el('td.muted', { text: it.note || '—' }),
            el('td.num', { text: String(it.views || 0) }),
            el('td.num.muted', { text: fmtDate(it.createdAt), title: fmtDateTime(it.createdAt) }),
            el('td', null, el('div.row', { style: { gap: '2px', justifyContent: 'flex-end' } },
              el('button.icon-btn', { type: 'button', title: '复制短链', onclick: () => copyText(link) }, icon('copy')),
              el('button.icon-btn', { type: 'button', title: '删除', onclick: () => removeItem(it) }, icon('trash'))
            ))
          );
        }))
      )
    );
    listBox.appendChild(wrap);
  }

  async function removeItem(it) {
    const ok = await confirmModal({ title: '删除短链', message: '删除后 /s/' + it.code + ' 将立即失效。', okLabel: '删除', danger: true });
    if (!ok) return;
    try {
      await api('/api/short/' + encodeURIComponent(it.code), { method: 'DELETE' });
      toast('已删除', 'ok');
      items = items.filter((x) => x.code !== it.code);
      render();
    } catch (e) { toast(e.message || '删除失败', 'err'); }
  }

  await load();
  return { node: root };
});

/* ================================================================== *
 * 代码片段
 * ================================================================== */

registerView('snippets', async (ctx) => {
  const { setTitle, signal, navigate } = ctx;
  setTitle('代码片段', '');
  const root = el('div');

  root.appendChild(el('div.page-head', null,
    el('h1', { text: '代码片段' }),
    el('p.page-desc', { text: '随手存代码，带语言标注与语法高亮，存在云端 KV。' })
  ));

  const searchBox = el('input.input', { type: 'search', placeholder: '搜索标题或内容…', style: { maxWidth: '320px' } });
  const addBtn = el('button.btn.btn-primary', { type: 'button' }, icon('plus'), '新建片段');
  const listBox = el('div');
  const detailBox = el('div', { style: { display: 'none' } });

  root.append(
    el('div.row-between', { style: { marginBottom: 'var(--s5)', flexWrap: 'wrap', gap: 'var(--s4)' } }, searchBox, addBtn),
    listBox, detailBox
  );

  let items = [];
  let query = '';

  const LANGS = ['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c', 'cpp', 'csharp', 'php', 'ruby', 'sql', 'bash', 'powershell', 'json', 'yaml', 'html', 'css', 'markdown', 'text'];

  function openEditor(existing) {
    const title = el('input.input', { type: 'text', placeholder: '片段标题', value: existing?.title || '' });
    const lang = el('select.select');
    for (const l of LANGS) lang.appendChild(el('option', { value: l, text: l, selected: (existing?.lang || 'text') === l }));
    lang.value = existing?.lang || 'text';
    const note = el('input.input', { type: 'text', placeholder: '备注（可选）', value: existing?.note || '' });
    const code = el('textarea.textarea.textarea-mono', { placeholder: '粘贴代码…', rows: 14, spellcheck: 'false' });
    code.value = existing?.code || '';

    openModal({
      title: existing ? '编辑片段' : '新建片段',
      size: 'lg',
      body: el('div', null,
        el('div.row', { style: { gap: 'var(--s4)', marginBottom: 'var(--s5)' } },
          el('div.grow', null, el('label.field-label', { text: '标题 *' }), title),
          el('div', { style: { width: '150px' } }, el('label.field-label', { text: '语言' }), lang)
        ),
        el('div.field', null, el('label.field-label', { text: '备注' }), note),
        el('div.field', null, el('label.field-label', { text: '代码 *' }), code)
      ),
      actions: [
        { label: '取消', kind: 'ghost' },
        {
          label: '保存', kind: 'primary',
          onClick: async () => {
            if (!title.value.trim()) { toast('请填写标题', 'warn'); return false; }
            if (!code.value.trim()) { toast('代码不能为空', 'warn'); return false; }
            try {
              if (existing) {
                // 后端只有新增接口，编辑 = 删旧 + 建新
                await api('/api/snippets', { method: 'POST', body: { title: title.value.trim(), lang: lang.value, note: note.value.trim(), code: code.value } });
                await api('/api/snippets/' + encodeURIComponent(existing.id), { method: 'DELETE' });
              } else {
                await api('/api/snippets', { method: 'POST', body: { title: title.value.trim(), lang: lang.value, note: note.value.trim(), code: code.value } });
              }
              toast('已保存', 'ok');
              await load();
              return true;
            } catch (e) { toast(e.message || '保存失败', 'err'); return false; }
          },
        },
      ],
    });
  }

  addBtn.addEventListener('click', () => openEditor(null));

  async function load() {
    if (!Auth.loggedIn) {
      clear(listBox);
      listBox.appendChild(needLoginState(() => openLoginModal(() => navigate('/snippets', { replace: true }))));
      return;
    }
    clear(listBox);
    listBox.appendChild(loadingState('读取片段…'));
    try {
      const r = await api('/api/snippets', { signal });
      items = r.items || [];
      renderList();
    } catch (e) {
      if (e.name === 'AbortError') return;
      clear(listBox);
      listBox.appendChild(emptyState({ icon: 'alert', title: '读取失败', text: e.message || '后端未响应' }));
    }
  }

  function renderList() {
    clear(listBox);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((i) => i.title.toLowerCase().includes(q) || (i.code || '').toLowerCase().includes(q) || (i.lang || '').toLowerCase().includes(q))
      : items;

    if (!items.length) {
      listBox.appendChild(emptyState({ icon: 'code', title: '还没有片段', text: '点右上角「新建片段」存下常用代码。' }));
      return;
    }
    if (!filtered.length) {
      listBox.appendChild(emptyState({ icon: 'search', title: '没有匹配的片段', text: '换个关键词试试。' }));
      return;
    }

    const list = el('div.list');
    for (const it of filtered) {
      list.appendChild(el('div.list-row', { dataset: { clickable: 'true' } },
        el('span', { style: { color: 'var(--accent)', display: 'flex' } }, icon('code')),
        el('div.list-main', null,
          el('div.list-title', { text: it.title, onclick: () => showDetail(it) }),
          el('div.list-meta', { text: it.lang + ' · ' + (it.code || '').length + ' 字符 · ' + fmtAgo(it.createdAt) + (it.note ? ' · ' + it.note : '') })
        ),
        el('div.list-actions', null,
          el('button.icon-btn', { type: 'button', title: '查看', onclick: () => showDetail(it) }, icon('eye')),
          el('button.icon-btn', { type: 'button', title: '复制代码', onclick: () => copyText(it.code) }, icon('copy')),
          el('button.icon-btn', { type: 'button', title: '编辑', onclick: () => openEditor(it) }, icon('edit')),
          el('button.icon-btn', { type: 'button', title: '删除', onclick: () => removeItem(it) }, icon('trash'))
        )
      ));
    }
    listBox.appendChild(list);
  }

  async function showDetail(it) {
    listBox.style.display = 'none';
    detailBox.style.display = 'block';
    clear(detailBox);

    const pre = el('pre', { style: { maxHeight: '60vh', overflow: 'auto' } });
    const codeEl = el('code', { class: 'language-' + (it.lang || 'text'), text: it.code });
    pre.appendChild(codeEl);

    detailBox.append(
      el('button.post-back', { type: 'button', onclick: () => { detailBox.style.display = 'none'; listBox.style.display = 'block'; } }, icon('back', 13), '返回列表'),
      el('div.row-between', { style: { marginBottom: 'var(--s5)', flexWrap: 'wrap', gap: 'var(--s4)' } },
        el('div', null,
          el('h2', { text: it.title, style: { fontSize: '18px' } }),
          el('div.small.muted', { text: it.lang + ' · ' + fmtDateTime(it.createdAt) + (it.note ? ' · ' + it.note : '') })
        ),
        el('div.row', null,
          el('button.btn.btn-sm', { type: 'button', onclick: () => copyText(it.code) }, icon('copy'), '复制'),
          el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => downloadText(it.code, (it.title || 'snippet').replace(/[\\/:*?"<>|]/g, '_') + '.' + extFor(it.lang)) }, icon('download'), '下载'),
          el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => openEditor(it) }, icon('edit'), '编辑')
        )
      ),
      pre
    );

    // 语法高亮，按需加载 hljs
    try {
      await ensureLib('hljs');
      if (typeof hljs !== 'undefined') hljs.highlightElement(codeEl);
    } catch { /* 高亮失败不影响看代码 */ }
  }

  function extFor(lang) {
    const map = { javascript: 'js', typescript: 'ts', python: 'py', bash: 'sh', powershell: 'ps1', csharp: 'cs', html: 'html', css: 'css', json: 'json', yaml: 'yml', markdown: 'md', sql: 'sql', text: 'txt' };
    return map[lang] || lang || 'txt';
  }

  async function removeItem(it) {
    const ok = await confirmModal({ title: '删除片段', message: '确定删除「' + it.title + '」？', okLabel: '删除', danger: true });
    if (!ok) return;
    try {
      await api('/api/snippets/' + encodeURIComponent(it.id), { method: 'DELETE' });
      toast('已删除', 'ok');
      items = items.filter((x) => x.id !== it.id);
      detailBox.style.display = 'none';
      listBox.style.display = 'block';
      renderList();
    } catch (e) { toast(e.message || '删除失败', 'err'); }
  }

  searchBox.addEventListener('input', debounce((e) => { query = e.target.value; renderList(); }, 150));
  await load();
  return { node: root };
});

/* ================================================================== *
 * 留言板（读取公开，写入需登录）
 * ================================================================== */

registerView('guestbook', async (ctx) => {
  const { setTitle, signal } = ctx;
  setTitle('留言板', '');
  const root = el('div');

  root.appendChild(el('div.page-head', null,
    el('h1', { text: '留言板' }),
    el('p.page-desc', { text: '留言公开可读。写入需要登录，每个 IP 每分钟最多 3 条，单条上限 500 字。' })
  ));

  const formCard = el('div.card', { style: { marginBottom: 'var(--s6)' } });
  const listBox = el('div');

  const nameInput = el('input.input', { type: 'text', placeholder: '你的名字（留空为匿名）', maxlength: '40' });
  nameInput.value = Store.getPref('gb.name', '');
  const msgInput = el('textarea.textarea', { placeholder: '说点什么…', rows: 4, maxlength: '500' });
  const counter = el('span.small.faint', { text: '0 / 500' });
  const submitBtn = el('button.btn.btn-primary', { type: 'button' }, icon('message'), '发表留言');

  msgInput.addEventListener('input', () => setText(counter, msgInput.value.length + ' / 500'));

  formCard.appendChild(el('div.card-body', null,
    Auth.loggedIn
      ? el('div', null,
          el('div.field', null, el('label.field-label', { text: '昵称' }), nameInput),
          el('div.field', null,
            el('div.row-between', null, el('label.field-label', { text: '留言内容' }), counter),
            msgInput
          ),
          el('div.row-between', null,
            el('span.field-hint', { text: '内容会经过后端过滤，HTML 标签不会被渲染。' }),
            submitBtn
          )
        )
      : el('div', null,
          el('p.muted', { text: '留言功能需要登录后使用。这是为了防止匿名灌水。', style: { marginBottom: 'var(--s4)', fontSize: '13px' } }),
          el('button.btn.btn-primary', { type: 'button', onclick: () => openLoginModal(() => navigate(location.pathname, { replace: true })) }, icon('user'), '登录')
        )
  ));

  root.append(formCard, listBox);

  submitBtn.addEventListener('click', async () => {
    const msg = msgInput.value.trim();
    if (!msg) { toast('留言内容不能为空', 'warn'); return; }
    submitBtn.disabled = true;
    try {
      const name = nameInput.value.trim();
      Store.setPref('gb.name', name);
      await api('/api/guestbook', { method: 'POST', body: { name, msg } });
      msgInput.value = '';
      setText(counter, '0 / 500');
      toast('留言成功', 'ok');
      await load();
    } catch (e) {
      toast(e.message || '发表失败', 'err');
    } finally {
      submitBtn.disabled = false;
    }
  });

  async function load() {
    clear(listBox);
    listBox.appendChild(loadingState('读取留言…'));
    try {
      // 读取是公开的，不需要登录
      const r = await api('/api/guestbook', { signal });
      render(r.items || []);
    } catch (e) {
      if (e.name === 'AbortError') return;
      clear(listBox);
      listBox.appendChild(emptyState({ icon: 'alert', title: '读取失败', text: e.message || '后端未响应' }));
    }
  }

  function render(items) {
    clear(listBox);
    if (!items.length) {
      listBox.appendChild(emptyState({ icon: 'message', title: '还没有留言', text: '来说点什么吧。' }));
      return;
    }
    listBox.appendChild(el('div.section-head', null,
      el('h2', { text: '全部留言' }),
      el('span.tag', { text: String(items.length) })
    ));
    const list = el('div', { style: { display: 'grid', gap: 'var(--s4)' } });
    for (const it of items) {
      list.appendChild(el('div.card', null,
        el('div.card-body', { style: { padding: 'var(--s5) var(--s6)' } },
          el('div.row-between', { style: { marginBottom: 'var(--s3)' } },
            el('div.row', { style: { gap: 'var(--s3)' } },
              el('span', { style: { width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center', fontSize: '11px', fontWeight: '600' }, text: (it.name || '匿')[0].toUpperCase() }),
              el('span', { text: it.name || '匿名', style: { fontSize: '13px', fontWeight: '550' } })
            ),
            el('div.row', { style: { gap: 'var(--s3)' } },
              el('time.small.faint', { text: fmtAgo(it.createdAt), title: fmtDateTime(it.createdAt), datetime: new Date(it.createdAt).toISOString() }),
              Auth.loggedIn ? el('button.icon-btn', { type: 'button', title: '删除', style: { width: '22px', height: '22px' }, onclick: () => removeItem(it) }, icon('trash', 12)) : null
            )
          ),
          // 用 textContent 而非 innerHTML，留言内容天然免疫 XSS
          el('div', { text: it.msg, style: { fontSize: '13.5px', lineHeight: '1.75', whiteSpace: 'pre-wrap', color: 'var(--ink-2)' } })
        )
      ));
    }
    listBox.appendChild(list);
  }

  async function removeItem(it) {
    const ok = await confirmModal({ title: '删除留言', message: '确定删除这条留言？', okLabel: '删除', danger: true });
    if (!ok) return;
    try {
      await api('/api/guestbook/' + encodeURIComponent(it.id), { method: 'DELETE' });
      toast('已删除', 'ok');
      await load();
    } catch (e) { toast(e.message || '删除失败', 'err'); }
  }

  await load();
  return { node: root };
});
