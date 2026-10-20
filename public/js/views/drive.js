/**
 * views/drive.js — 云盘
 *
 * 相比旧版的增强：
 *   - 文件夹层级（旧版是扁平列表，无法组织）
 *   - 图片/文本/PDF/音视频在线预览（旧版只能下载）
 *   - 多选 + 批量删除 + 批量移动
 *   - 拖拽上传 + 上传进度
 *   - 限时分享链接（后端 /f/:token 公开只读）
 *   - 排序（名称/大小/时间）
 * 所有文件操作走后端 R2，前端不缓存文件内容。
 */

registerView('drive', async (ctx) => {
  const { setTitle, signal, navigate } = ctx;
  setTitle('云盘', '');

  const root = el('div');
  let state = {
    path: '',           // 当前目录，'' 表示根
    folders: [],
    files: [],
    totalSize: 0,
    quota: 0,
    sort: { key: Store.getPref('drive.sortKey', 'name'), dir: Store.getPref('drive.sortDir', 1) },
    selected: new Set(), // 存文件 path
    uploading: false,
  };

  /* ---------- 顶部工具条 ---------- */
  const crumbs = el('div.crumbs');
  const uploadBtn = el('button.btn.btn-primary', { type: 'button' }, icon('upload'), '上传');
  const newFolderBtn = el('button.btn', { type: 'button' }, icon('folder'), '新建文件夹');
  const refreshBtn = el('button.icon-btn', { type: 'button', title: '刷新' }, icon('refresh'));

  const batchBar = el('div.batch-bar', { style: { display: 'none' } });

  const toolbar = el('div.row-between', { style: { marginBottom: 'var(--s5)', flexWrap: 'wrap', gap: 'var(--s4)' } },
    crumbs,
    el('div.row', { style: { flexWrap: 'wrap' } },
      refreshBtn, newFolderBtn, uploadBtn
    )
  );
  root.appendChild(toolbar);
  root.appendChild(batchBar);

  const uploadStatus = el('div', { style: { display: 'none', marginBottom: 'var(--s4)' } });
  root.appendChild(uploadStatus);

  /* ---------- 拖拽区 ---------- */
  const dropzone = el('div.dropzone', { style: { marginBottom: 'var(--s6)' } },
    icon('upload'),
    el('div', { text: '拖文件到这里上传，或' }),
    el('span', { text: ' 点击选择 ', style: { color: 'var(--accent)', fontWeight: '550' } }),
    el('div.small.faint', { text: '单文件上限约 100 MB（Workers 请求体限制）', style: { marginTop: 'var(--s2)' } })
  );
  const fileInput = el('input', { type: 'file', multiple: true, style: { display: 'none' } });
  dropzone.appendChild(fileInput);
  root.appendChild(dropzone);

  /* ---------- 文件列表容器 ---------- */
  const listBox = el('div.list', { style: { display: 'none' } });
  const listEl = el('div');
  listBox.appendChild(listEl);
  root.appendChild(listBox);
  const loadingEl = loadingState('读取文件列表…');
  root.appendChild(loadingEl);
  const emptyEl = emptyState({
    icon: 'drive',
    title: '这个文件夹是空的',
    text: '上传文件，或新建一个文件夹开始整理。',
  });
  emptyEl.style.display = 'none';
  root.appendChild(emptyEl);

  /* ---------- 排序头 ---------- */
  function buildSortHeader() {
    const head = el('div.list-row', { style: { background: 'var(--surface)', minHeight: '36px', position: 'sticky', top: '0', zIndex: '2' } },
      el('label.checkbox', { style: { width: '24px' } },
        el('input', { type: 'checkbox', onchange: (e) => toggleSelectAll(e.target.checked) })
      ),
      sortCell('name', '名称', { flex: '1' }),
      sortCell('size', '大小', { width: '90px', textAlign: 'right' }),
      sortCell('createdAt', '上传时间', { width: '150px' }),
      el('div', { style: { width: '76px' } })
    );
    return head;
  }

  function sortCell(key, label, style) {
    const active = state.sort.key === key;
    return el('button', {
      type: 'button',
      class: 'crumb',
      style: Object.assign({ fontSize: '11px', fontWeight: '600', letterSpacing: '.04em', textTransform: 'uppercase', color: active ? 'var(--accent)' : 'var(--faint)', display: 'flex', alignItems: 'center', gap: '3px' }, style || {}),
      onclick: () => {
        if (state.sort.key === key) state.sort.dir *= -1;
        else { state.sort.key = key; state.sort.dir = 1; }
        Store.setPref('drive.sortKey', state.sort.key);
        Store.setPref('drive.sortDir', state.sort.dir);
        renderList();
      },
    }, label, active ? el('span', { text: state.sort.dir > 0 ? '↑' : '↓', style: { fontSize: '10px' } }) : null);
  }

  /* ---------- 渲染列表 ---------- */
  function renderList() {
    clear(listEl);
    listBox.style.display = (state.files.length || state.folders.length) ? 'block' : 'none';
    emptyEl.style.display = (state.files.length || state.folders.length) ? 'none' : 'flex';
    if (!state.files.length && !state.folders.length) return;

    listEl.appendChild(buildSortHeader());

    // 文件夹永远在前
    for (const f of state.folders) {
      listEl.appendChild(renderFolderRow(f));
    }

    const files = sortFiles(state.files);
    for (const f of files) {
      listEl.appendChild(renderFileRow(f));
    }
    updateBatchBar();
  }

  function sortFiles(files) {
    const { key, dir } = state.sort;
    const arr = files.slice();
    arr.sort((a, b) => {
      let r = 0;
      if (key === 'name') r = a.name.localeCompare(b.name, 'zh-CN');
      else if (key === 'size') r = (a.size || 0) - (b.size || 0);
      else if (key === 'createdAt') r = (a.createdAt || 0) - (b.createdAt || 0);
      return r * dir;
    });
    return arr;
  }

  function renderFolderRow(folder) {
    const isSel = false; // 文件夹不参与文件多选，单独处理更清晰
    return el('div.list-row', { dataset: { clickable: 'true' } },
      el('span', { style: { color: 'var(--warn)', display: 'flex', width: '24px', justifyContent: 'center' } }, icon('folder')),
      el('div.list-main', null,
        el('div.list-title', { text: folder.name, onclick: () => enterFolder(folder.name) }),
        el('div.list-meta', { text: '文件夹' })
      ),
      el('div.list-actions', null,
        el('button.icon-btn', { type: 'button', title: '打开', onclick: () => enterFolder(folder.name) }, icon('external')),
        el('button.icon-btn', { type: 'button', title: '重命名', onclick: () => renameFolder(folder.name) }, icon('edit')),
        el('button.icon-btn', { type: 'button', title: '删除', onclick: () => deleteFolder(folder.name) }, icon('trash'))
      )
    );
  }

  function renderFileRow(file) {
    const isSel = state.selected.has(file.path);
    const kind = previewable(file.name, file.type);
    const row = el('div.list-row', { dataset: { clickable: 'true', selected: isSel ? 'true' : 'false' } },
      el('label.checkbox', { style: { width: '24px' } },
        el('input', {
          type: 'checkbox', checked: isSel,
          onchange: (e) => {
            if (e.target.checked) state.selected.add(file.path);
            else state.selected.delete(file.path);
            row.dataset.selected = e.target.checked ? 'true' : 'false';
            updateBatchBar();
          },
        })
      ),
      el('span', { style: { color: 'var(--muted)', display: 'flex', width: '20px', justifyContent: 'center' } }, icon(fileIconName(file.name))),
      el('div.list-main', null,
        el('div.list-title', { text: file.name, onclick: () => (kind ? previewFile(file, kind) : downloadFile(file)) }),
        el('div.list-meta', { text: file.type || '' })
      ),
      el('div.list-meta', { text: fmtBytes(file.size), style: { width: '90px', textAlign: 'right' } }),
      el('div.list-meta', { text: fmtAgo(file.createdAt), title: fmtDateTime(file.createdAt), style: { width: '150px' } }),
      el('div.list-actions', { style: { width: '76px', justifyContent: 'flex-end' } },
        kind ? el('button.icon-btn', { type: 'button', title: '预览', onclick: () => previewFile(file, kind) }, icon('eye')) : null,
        el('button.icon-btn', { type: 'button', title: '分享', onclick: () => shareFile(file) }, icon('share')),
        el('button.icon-btn', { type: 'button', title: '下载', onclick: () => downloadFile(file) }, icon('download'))
      )
    );
    return row;
  }

  function updateBatchBar() {
    const n = state.selected.size;
    if (n === 0) { batchBar.style.display = 'none'; return; }
    batchBar.style.display = 'flex';
    clear(batchBar);
    batchBar.className = 'row-between';
    Object.assign(batchBar.style, {
      marginBottom: 'var(--s4)', padding: 'var(--s4) var(--s5)',
      background: 'var(--accent-soft)', border: '1px solid var(--accent-ring)',
      borderRadius: 'var(--radius-l)',
    });
    batchBar.append(
      el('span', { style: { fontSize: '13px', color: 'var(--accent)', fontWeight: '550' } }, '已选 ' + n + ' 项'),
      el('div.row', null,
        el('button.btn.btn-sm', { type: 'button', onclick: () => moveSelected() }, icon('move'), '移动到…'),
        el('button.btn.btn-sm.btn-danger', { type: 'button', onclick: () => deleteSelected() }, icon('trash'), '删除'),
        el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => { state.selected.clear(); renderList(); } }, '取消')
      )
    );
  }

  function toggleSelectAll(checked) {
    state.selected.clear();
    if (checked) for (const f of state.files) state.selected.add(f.path);
    renderList();
  }

  /* ---------- 数据加载 ---------- */
  async function load(path = state.path) {
    state.path = path;
    state.selected.clear();
    updateBatchBar();
    loadingEl.style.display = 'flex';
    listBox.style.display = 'none';
    emptyEl.style.display = 'none';
    renderCrumbs();
    try {
      const r = await api('/api/drive/list?path=' + encodeURIComponent(path), { signal });
      state.folders = r.folders || [];
      state.files = r.files || [];
      state.totalSize = r.totalSize || 0;
      state.quota = r.quota || 0;
      loadingEl.style.display = 'none';
      renderList();
    } catch (e) {
      loadingEl.style.display = 'none';
      if (e.name === 'AbortError') return;
      if (e.status === 401) {
        listBox.style.display = 'none';
        root.appendChild(needLoginState(() => openLoginModal(() => navigate('/drive', { replace: true }))));
        return;
      }
      clear(listEl);
      listBox.style.display = 'block';
      listEl.appendChild(emptyState({ icon: 'alert', title: '加载失败', text: e.message || '后端未响应' }));
    }
  }

  function renderCrumbs() {
    clear(crumbs);
    const segs = state.path ? state.path.split('/') : [];
    crumbs.appendChild(el('button.crumb', {
      type: 'button', dataset: { current: segs.length ? 'false' : 'true' },
      onclick: () => { if (segs.length) load(''); },
    }, '根目录'));
    segs.forEach((s, i) => {
      crumbs.appendChild(el('span.crumb-sep', { text: '/' }));
      const isLast = i === segs.length - 1;
      crumbs.appendChild(el('button.crumb', {
        type: 'button', dataset: { current: isLast ? 'true' : 'false' },
        onclick: () => { if (!isLast) load(segs.slice(0, i + 1).join('/')); },
      }, s));
    });
  }

  function enterFolder(name) {
    load(state.path ? state.path + '/' + name : name);
  }

  /* ---------- 上传 ---------- */
  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (!Auth.loggedIn) { openLoginModal(() => navigate('/drive', { replace: true })); return; }

    state.uploading = true;
    uploadBtn.disabled = true;
    uploadStatus.style.display = 'block';
    const bar = el('div.progress-fill', { style: { width: '0%' } });
    const label = el('div.small', { text: '准备上传…', style: { marginBottom: 'var(--s2)' } });
    clear(uploadStatus);
    uploadStatus.append(label, el('div.progress', null, bar));

    const form = new FormData();
    form.append('path', state.path);
    for (const f of files) form.append('file', f, f.name);

    try {
      await apiUpload('/api/drive/upload', form, (pct) => {
        bar.style.width = pct + '%';
        setText(label, '上传中 ' + pct + '% · ' + files.length + ' 个文件');
      });
      toast('上传完成：' + files.length + ' 个文件', 'ok');
      await load(state.path);
    } catch (e) {
      setText(label, '上传失败：' + (e.message || '未知错误'));
      bar.parentElement.dataset.tone = 'err';
      toast(e.message || '上传失败', 'err');
    } finally {
      state.uploading = false;
      uploadBtn.disabled = false;
      setTimeout(() => { uploadStatus.style.display = 'none'; }, 2500);
    }
  }

  uploadBtn.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('click', (e) => { if (e.target === dropzone || e.target.tagName === 'DIV' || e.target.tagName === 'SPAN') fileInput.click(); });
  fileInput.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = ''; });

  ['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.dataset.over = 'true'; }));
  ['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'dragleave' && dropzone.contains(e.relatedTarget)) return; dropzone.dataset.over = 'false'; }));
  dropzone.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

  /* ---------- 新建/重命名/删除 文件夹 ---------- */
  refreshBtn.addEventListener('click', () => load(state.path));

  newFolderBtn.addEventListener('click', async () => {
    const name = await promptModal({
      title: '新建文件夹', label: '文件夹名', placeholder: '例如 2026-项目',
      required: true,
      validate: (v) => /[\\/:*?"<>|]/.test(v) ? '不能包含 \\ / : * ? " < > |' : (v.trim().length > 100 ? '名字太长' : null),
    });
    if (!name) return;
    try {
      await api('/api/drive/mkdir', { method: 'POST', body: { path: (state.path ? state.path + '/' : '') + name.trim() } });
      toast('已创建文件夹', 'ok');
      load(state.path);
    } catch (e) { toast(e.message || '创建失败', 'err'); }
  });

  async function renameFolder(oldName) {
    const name = await promptModal({
      title: '重命名文件夹', label: '新名称', value: oldName, required: true,
      validate: (v) => /[\\/:*?"<>|]/.test(v) ? '不能包含 \\ / : * ? " < > |' : null,
    });
    if (!name || name === oldName) return;
    const from = (state.path ? state.path + '/' : '') + oldName;
    const toDir = state.path;
    try {
      // 移动整个目录：后端按前缀逐个搬（此处简化为重命名顶层，子文件随之移动）
      await api('/api/drive/move', { method: 'POST', body: { paths: [from], dest: toDir, rename: name.trim() } });
      toast('已重命名', 'ok');
      load(state.path);
    } catch (e) { toast(e.message || '重命名失败', 'err'); }
  }

  async function deleteFolder(name) {
    const path = (state.path ? state.path + '/' : '') + name;
    const ok = await confirmModal({
      title: '删除文件夹', danger: true, okLabel: '删除',
      message: '确定删除文件夹「' + name + '」？',
      detail: '文件夹内的所有文件都会一并删除，此操作不可撤销。',
    });
    if (!ok) return;
    try {
      await api('/api/drive/delete', { method: 'POST', body: { path } });
      toast('已删除', 'ok');
      load(state.path);
    } catch (e) { toast(e.message || '删除失败', 'err'); }
  }

  /* ---------- 文件操作 ---------- */
  function downloadFile(file) {
    const url = API_BASE + '/api/drive/raw?path=' + encodeURIComponent(file.path);
    // 带鉴权的下载不能用 window.open（无法加 header），改用 fetch + blob
    fetch(url, { headers: Store.token ? { Authorization: 'Bearer ' + Store.token } : {}, signal })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then((blob) => downloadBlob(blob, file.name))
      .catch((e) => { if (e.name !== 'AbortError') toast('下载失败：' + (e.message || ''), 'err'); });
  }

  async function deleteSelected() {
    const paths = [...state.selected];
    const ok = await confirmModal({
      title: '删除文件', danger: true, okLabel: '删除 ' + paths.length + ' 项',
      message: '确定删除选中的 ' + paths.length + ' 个文件？',
      detail: '此操作不可撤销。',
    });
    if (!ok) return;
    try {
      await api('/api/drive/delete', { method: 'POST', body: { paths } });
      toast('已删除 ' + paths.length + ' 项', 'ok');
      state.selected.clear();
      load(state.path);
    } catch (e) { toast(e.message || '删除失败', 'err'); }
  }

  async function moveSelected() {
    const paths = [...state.selected];
    const dest = await promptModal({
      title: '移动到文件夹', label: '目标目录（留空为根目录）', value: state.path,
      hint: '填写完整路径，例如 图片/2026。目标目录不存在会自动创建对应层级。',
    });
    if (dest === null) return;
    try {
      await api('/api/drive/move', { method: 'POST', body: { paths, dest: dest.trim() } });
      toast('已移动 ' + paths.length + ' 项', 'ok');
      state.selected.clear();
      load(state.path);
    } catch (e) { toast(e.message || '移动失败', 'err'); }
  }

  async function shareFile(file) {
    const days = await promptModal({
      title: '创建分享链接', label: '有效天数', value: '7', type: 'number',
      hint: '链接公开可访问，无需登录，到期自动失效。最长 365 天。',
      validate: (v) => { const n = parseInt(v, 10); return isNaN(n) || n < 1 || n > 365 ? '请输入 1–365 的整数' : null; },
    });
    if (!days) return;
    try {
      const r = await api('/api/drive/share', { method: 'POST', body: { path: file.path, days: parseInt(days, 10) } });
      openModal({
        title: '分享链接已创建',
        size: 'lg',
        body: el('div', null,
          el('p.field-hint', { text: '任何人拿到这个链接都能下载该文件，有效期 ' + r.expiresInDays + ' 天。', style: { marginBottom: 'var(--s4)' } }),
          el('div.row', null,
            el('input.input.input-mono', { value: r.url, readonly: true, id: 'shareUrl', onclick: (e) => e.target.select() }),
            el('button.btn', { type: 'button', onclick: () => copyText(r.url) }, icon('copy'), '复制')
          )
        ),
        actions: [{ label: '完成', kind: 'primary' }],
      });
    } catch (e) { toast(e.message || '创建分享失败', 'err'); }
  }

  /* ---------- 预览 ---------- */
  async function previewFile(file, kind) {
    const rawUrl = API_BASE + '/api/drive/raw?path=' + encodeURIComponent(file.path) + '&inline=1';
    const headers = Store.token ? { Authorization: 'Bearer ' + Store.token } : {};
    let bodyNode;

    if (kind === 'image') {
      const img = el('img', { alt: file.name, style: { maxWidth: '100%', maxHeight: '70vh', margin: '0 auto', borderRadius: 'var(--radius-m)' } });
      bodyNode = el('div.center', null, img);
      fetch(rawUrl, { headers, signal }).then((r) => r.blob()).then((b) => { img.src = URL.createObjectURL(b); }).catch(() => setText(img.alt, '图片加载失败'));
    } else if (kind === 'video' || kind === 'audio') {
      const media = el(kind, { controls: true, style: { width: '100%', maxHeight: '70vh' } });
      bodyNode = media;
      fetch(rawUrl, { headers, signal }).then((r) => r.blob()).then((b) => { media.src = URL.createObjectURL(b); }).catch(() => toast('媒体加载失败', 'err'));
    } else if (kind === 'pdf') {
      bodyNode = el('div', { style: { height: '75vh' } }, el('iframe', { style: { width: '100%', height: '100%', border: '1px solid var(--line)', borderRadius: 'var(--radius-m)' } }));
      fetch(rawUrl, { headers, signal }).then((r) => r.blob()).then((b) => { bodyNode.querySelector('iframe').src = URL.createObjectURL(b); }).catch(() => toast('PDF 加载失败', 'err'));
    } else { // text
      const pre = el('pre', { style: { maxHeight: '65vh', overflow: 'auto', fontSize: '12.5px' } }, '加载中…');
      bodyNode = pre;
      fetch(rawUrl, { headers, signal }).then((r) => r.text()).then((t) => { setText(pre, t.length > 200000 ? t.slice(0, 200000) + '\n\n…（文件过大，仅显示前 200KB）' : t); }).catch(() => setText(pre, '加载失败'));
    }

    openModal({
      title: file.name,
      size: 'lg',
      body: bodyNode,
      actions: [
        { label: '下载', kind: 'ghost', onClick: () => { downloadFile(file); return false; }, closeOnClick: false },
        { label: '关闭', kind: 'primary' },
      ],
    });
  }

  /* ---------- 启动 ---------- */
  await load('');

  return { node: root };
});
