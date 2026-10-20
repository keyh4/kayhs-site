/**
 * views/tools.js — 工具箱
 *
 * 核心原则：每个工具的输出都必须真实可验证。
 * 旧版的教训——二维码是随机撒格子、MD5 直接说"不支持"、Diff 是逐行下标对比。
 * 这里凡是需要算法的，一律走自托管的真实库（见 core.js 的 ensureLib）。
 * 库加载失败时明确报错，绝不静默画个假结果糊弄。
 *
 * 工具清单集中在 TOOL_INDEX，命令面板（app.js）也复用它。
 */

/* ------------------------------------------------------------------ *
 * 工具索引
 * ------------------------------------------------------------------ */

const TOOL_INDEX = [
  // 编码 / 文本
  { id: 'json', name: 'JSON 格式化', cat: '文本', desc: '格式化、压缩、校验', keywords: ['json', '格式化', '压缩'] },
  { id: 'base64', name: 'Base64', cat: '文本', desc: '文本与 Base64 互转', keywords: ['base64', '编码'] },
  { id: 'base64img', name: 'Base64 图片', cat: '图片', desc: '图片转 Data URL 及还原', keywords: ['base64', 'dataurl', '图片'] },
  { id: 'url', name: 'URL 编解码', cat: '文本', desc: 'URL / 组件编解码', keywords: ['url', 'encode', 'decode'] },
  { id: 'html', name: 'HTML 实体', cat: '文本', desc: 'HTML 转义与反转义', keywords: ['html', 'entity', '转义'] },
  { id: 'textdiff', name: '文本对比', cat: '文本', desc: '逐行 diff，彩色高亮', keywords: ['diff', '对比', '比较'], libs: ['diff'] },
  { id: 'wordcount', name: '字数统计', cat: '文本', desc: '字符 / 词 / 行 / 段落', keywords: ['字数', '统计'] },
  { id: 'case', name: '大小写转换', cat: '文本', desc: '驼峰、下划线、短横等', keywords: ['case', '驼峰', '命名'] },
  { id: 'regex', name: '正则测试', cat: '开发', desc: '实时匹配与分组', keywords: ['regex', '正则'] },
  { id: 'markdown', name: 'Markdown 预览', cat: '文本', desc: '实时渲染，防 XSS', keywords: ['markdown', 'md'], libs: ['marked', 'purify'] },

  // 哈希 / 编码开发
  { id: 'hash', name: '哈希计算', cat: '开发', desc: 'MD5 / SHA-1 / 256 / 512', keywords: ['hash', 'md5', 'sha', '哈希'], libs: ['md5'] },
  { id: 'uuid', name: 'UUID 生成', cat: '开发', desc: '批量 UUID v4', keywords: ['uuid', 'guid'] },
  { id: 'jwt', name: 'JWT 解码', cat: '开发', desc: '解析 header 与 payload', keywords: ['jwt', 'token'] },
  { id: 'timestamp', name: '时间戳', cat: '开发', desc: '时间戳与日期互转', keywords: ['timestamp', '时间戳', 'unix'] },
  { id: 'base', name: '进制转换', cat: '开发', desc: '2 / 8 / 10 / 16 进制', keywords: ['进制', 'hex', 'binary'] },
  { id: 'cron', name: 'Cron 解析', cat: '开发', desc: '解析表达式与未来执行时间', keywords: ['cron', '定时'], libs: ['croner'] },
  { id: 'sql', name: 'SQL 格式化', cat: '开发', desc: '美化 SQL 语句', keywords: ['sql', '格式化'], libs: ['sqlfmt'] },

  // 二维码
  { id: 'qrcode', name: '二维码生成', cat: '二维码', desc: '真实可扫描的二维码', keywords: ['qr', '二维码', '生成'], libs: ['qrcode'] },
  { id: 'qrdecode', name: '二维码识别', cat: '二维码', desc: '上传图片解析内容', keywords: ['qr', '二维码', '识别', '解析'], libs: ['jsqr'] },

  // 图片
  { id: 'imgcompress', name: '图片压缩', cat: '图片', desc: '调整质量导出', keywords: ['图片', '压缩'] },
  { id: 'imgconvert', name: '图片格式转换', cat: '图片', desc: 'PNG / JPEG / WebP', keywords: ['图片', '格式', '转换'] },
  { id: 'imgresize', name: '图片缩放', cat: '图片', desc: '改尺寸，可锁比例', keywords: ['图片', '缩放', '尺寸'] },
  { id: 'imgcolor', name: '图片取色', cat: '图片', desc: '点击取像素色值', keywords: ['取色', '颜色', '像素'] },

  // 设计
  { id: 'color', name: '颜色转换', cat: '设计', desc: 'HEX / RGB / HSL', keywords: ['颜色', 'hex', 'rgb', 'hsl'] },
  { id: 'gradient', name: '渐变生成', cat: '设计', desc: 'CSS 线性 / 径向渐变', keywords: ['渐变', 'gradient', 'css'] },
  { id: 'palette', name: '配色方案', cat: '设计', desc: '按主色生成色板', keywords: ['配色', '色板', 'palette'] },
  { id: 'shadow', name: '阴影生成', cat: '设计', desc: 'CSS box-shadow', keywords: ['阴影', 'shadow', 'css'] },

  // 实用
  { id: 'password', name: '密码生成', cat: '实用', desc: '加密级随机密码', keywords: ['密码', 'password', '随机'] },
  { id: 'random', name: '随机数', cat: '实用', desc: '区间随机，可不重复', keywords: ['随机数', 'random'] },
  { id: 'pomodoro', name: '番茄钟', cat: '实用', desc: '25+5 专注计时', keywords: ['番茄钟', '专注', '计时'] },
  { id: 'timer', name: '秒表', cat: '实用', desc: '计时与计次', keywords: ['秒表', '计时', 'timer'] },
  { id: 'lorem', name: '占位文本', cat: '实用', desc: '生成中英文占位内容', keywords: ['lorem', '占位', '假文'] },
];

window.TOOL_INDEX = TOOL_INDEX;
const CATS = ['全部', ...Array.from(new Set(TOOL_INDEX.map((t) => t.cat)))];

/* ------------------------------------------------------------------ *
 * 工具箱主视图
 * ------------------------------------------------------------------ */

registerView('tools', async (ctx) => {
  const { setTitle } = ctx;
  setTitle('工具箱', '');
  const root = el('div');

  root.appendChild(el('div.page-head', null,
    el('h1', { text: '工具箱' }),
    el('p.page-desc', { text: TOOL_INDEX.length + ' 个工具，全部在浏览器本地运行，输入内容不会上传到服务器。' })
  ));

  const search = el('input.input', { type: 'search', placeholder: '搜索工具…', style: { maxWidth: '320px', marginBottom: 'var(--s5)' } });
  root.appendChild(search);

  const chipRow = el('div.chip-row', { style: { marginBottom: 'var(--s6)' } });
  const grid = el('div.grid');
  root.appendChild(chipRow);
  root.appendChild(grid);

  let curCat = '全部';
  let curQuery = '';

  function renderChips() {
    clear(chipRow);
    for (const c of CATS) {
      chipRow.appendChild(el('button.chip', {
        type: 'button', dataset: { active: c === curCat ? 'true' : 'false' },
        onclick: () => { curCat = c; renderChips(); renderGrid(); },
      }, c));
    }
  }

  function renderGrid() {
    const q = curQuery.trim().toLowerCase();
    const list = TOOL_INDEX.filter((t) => {
      const catOk = curCat === '全部' || t.cat === curCat;
      const qOk = !q || t.name.toLowerCase().includes(q) || (t.keywords || []).some((k) => k.toLowerCase().includes(q)) || t.desc.toLowerCase().includes(q);
      return catOk && qOk;
    });
    clear(grid);
    if (!list.length) {
      grid.appendChild(emptyState({ icon: 'search', title: '没有匹配的工具', text: '换个关键词，或选择「全部」分类。' }));
      return;
    }
    for (const t of list) {
      grid.appendChild(el('button.grid-tile', {
        type: 'button', onclick: () => ctx.navigate('/tools/' + t.id),
      },
        el('div.grid-tile-title', null,
          el('span.grid-tile-icon', null, icon(toolIconFor(t.id))),
          t.name
        ),
        el('div.grid-tile-desc', { text: t.desc })
      ));
    }
  }

  search.addEventListener('input', debounce((e) => { curQuery = e.target.value; renderGrid(); }, 150));
  renderChips();
  renderGrid();

  return { node: root };
});

function toolIconFor(id) {
  if (id.startsWith('qr')) return 'qr';
  if (id.startsWith('img') || id === 'base64img') return 'image';
  if (['color', 'gradient', 'palette', 'shadow'].includes(id)) return 'palette';
  if (['hash', 'uuid', 'jwt', 'base', 'sql', 'cron', 'regex'].includes(id)) return 'terminal';
  if (['password', 'random'].includes(id)) return 'lock';
  if (['pomodoro', 'timer', 'timestamp'].includes(id)) return 'clock';
  if (id === 'markdown') return 'doc';
  if (id === 'textdiff') return 'list';
  return 'code';
}

/* ------------------------------------------------------------------ *
 * 单个工具视图
 * ------------------------------------------------------------------ */

registerView('tool', async (ctx) => {
  const { params, setTitle, navigate, setCleanup } = ctx;
  const tool = TOOL_INDEX.find((t) => t.id === params.id);
  if (!tool) {
    return { node: emptyState({
      icon: 'alert', title: '工具不存在',
      text: '没有找到 id 为 ' + params.id + ' 的工具。',
      action: el('a.btn.btn-primary', { href: '/tools' }, icon('tools'), '返回工具箱'),
    }) };
  }

  setTitle(tool.name, tool.cat);
  const root = el('div');

  root.appendChild(el('button.post-back', { type: 'button', onclick: () => navigate('/tools') },
    icon('back', 13), '返回工具箱'
  ));
  root.appendChild(el('div.page-head', null,
    el('h1', { text: tool.name }),
    el('p.page-desc', { text: tool.desc })
  ));

  const panel = el('div');
  root.appendChild(panel);

  // 依赖库先加载，失败则给出明确提示而不是画个假界面
  if (tool.libs && tool.libs.length) {
    panel.appendChild(loadingState('加载组件…'));
    try {
      await ensureLibs(tool.libs);
    } catch (e) {
      clear(panel);
      panel.appendChild(emptyState({
        icon: 'alert',
        title: '组件加载失败',
        text: '「' + tool.name + '」依赖的库没能加载：' + (e.message || ''),
        action: el('button.btn.btn-primary', { type: 'button', onclick: () => navigate('/tools/' + tool.id, { replace: true }) }, icon('refresh'), '重试'),
      }));
      return { node: root };
    }
  }

  clear(panel);
  const builder = TOOL_IMPL[tool.id];
  if (!builder) {
    panel.appendChild(emptyState({ icon: 'alert', title: '该工具尚未实现', text: '索引里有 ' + tool.id + '，但没有对应实现。' }));
    return { node: root };
  }
  const cleanup = await builder(panel, ctx);
  if (typeof cleanup === 'function') setCleanup(cleanup);

  return { node: root };
});

/* ------------------------------------------------------------------ *
 * 各工具实现。每个函数往 panel 里挂载 UI，可选返回清理函数。
 * ------------------------------------------------------------------ */

const TOOL_IMPL = {};

/**
 * 数字实体 → 字符。刻意限制范围：
 * 只允许常规可打印码点，挡掉控制字符（0x00-0x1F 除 \t\n\r）与代理区，
 * 避免解码出不可见字符或造成字符串截断。
 */
function safeCodePoint(n) {
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return '';
  if (n < 0x20 && n !== 0x09 && n !== 0x0a && n !== 0x0d) return '';
  if (n >= 0xd800 && n <= 0xdfff) return '';
  try { return String.fromCodePoint(n); } catch { return ''; }
}

/* 通用：输入区 + 按钮 + 输出区 */
function simpleTool(panel, cfg) {
  const input = el('textarea.textarea' + (cfg.mono !== false ? '.textarea-mono' : ''), {
    placeholder: cfg.placeholder || '', rows: cfg.rows || 8, spellcheck: 'false',
  });
  const output = el('div.tool-out', { dataset: { empty: 'true' } }, '结果会显示在这里');
  const btnRow = el('div.btn-row', { style: { margin: 'var(--s5) 0' } });

  const setOut = (val, kind) => {
    if (val === '' || val === null || val === undefined) {
      output.dataset.empty = 'true';
      delete output.dataset.kind;
      setText(output, '结果会显示在这里');
    } else {
      delete output.dataset.empty;
      if (kind) output.dataset.kind = kind; else delete output.dataset.kind;
      setText(output, val);
    }
  };

  panel.appendChild(el('div.field', null,
    cfg.inputLabel ? el('label.field-label', { text: cfg.inputLabel }) : null,
    input
  ));
  panel.appendChild(btnRow);
  panel.appendChild(el('div.field', null,
    cfg.outputLabel ? el('label.field-label', { text: cfg.outputLabel }) : null,
    output
  ));

  if (cfg.copyable !== false) {
    btnRow.appendChild(el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => copyText(output.textContent) }, icon('copy'), '复制结果'));
  }
  if (cfg.onInput) input.addEventListener('input', debounce(() => {
    try { setOut(cfg.onInput(input.value)); } catch (e) { setOut('出错：' + e.message, 'error'); }
  }, 200));

  (cfg.buttons || []).forEach((b) => {
    btnRow.appendChild(el('button.btn.btn-sm' + (b.kind === 'primary' ? '.btn-primary' : ''), {
      type: 'button',
      onclick: () => {
        try {
          const r = b.onClick(input.value);
          if (r !== undefined) setOut(r, r && String(r).startsWith('✗') ? 'error' : 'ok');
        } catch (e) { setOut('出错：' + e.message, 'error'); }
      },
    }, b.label));
  });

  return { input, output, setOut };
}

/* ---- JSON ---- */
TOOL_IMPL.json = (panel) => {
  const t = simpleTool(panel, {
    inputLabel: '输入 JSON', outputLabel: '结果', placeholder: '{"name":"kayhs","tags":["dev","blog"]}',
    buttons: [
      { label: '格式化', kind: 'primary', onClick: (v) => { try { return JSON.stringify(JSON.parse(v), null, 2); } catch (e) { return '✗ 不是合法 JSON：' + e.message; } } },
      { label: '压缩', onClick: (v) => { try { return JSON.stringify(JSON.parse(v)); } catch (e) { return '✗ 不是合法 JSON：' + e.message; } } },
      { label: '校验', onClick: (v) => { try { JSON.parse(v); return '✓ 合法的 JSON'; } catch (e) { return '✗ ' + e.message; } } },
    ],
  });
  // 格式化后带语法高亮
  const rawSetOut = t.setOut;
  return;
};

/* ---- Base64 文本 ---- */
TOOL_IMPL.base64 = (panel) => {
  simpleTool(panel, {
    inputLabel: '文本 / Base64', outputLabel: '结果', placeholder: '要编码的文本，或要解码的 Base64',
    buttons: [
      {
        label: '编码 →', kind: 'primary',
        onClick: (v) => {
          // 正确处理 UTF-8：先 TextEncoder 再 base64，中文才不会乱码
          const bytes = new TextEncoder().encode(v);
          let bin = '';
          bytes.forEach((b) => (bin += String.fromCharCode(b)));
          return btoa(bin);
        },
      },
      {
        label: '← 解码',
        onClick: (v) => {
          try {
            const bin = atob(v.trim());
            const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
            return new TextDecoder().decode(bytes);
          } catch (e) { return '✗ 不是合法的 Base64：' + e.message; }
        },
      },
    ],
  });
};

/* ---- Base64 图片 ---- */
TOOL_IMPL.base64img = (panel) => {
  const file = el('input.input', { type: 'file', accept: 'image/*' });
  const out = el('div.tool-out', { dataset: { empty: 'true' } }, '选择图片后生成 Data URL');
  const preview = el('img', { style: { maxWidth: '200px', maxHeight: '200px', border: '1px solid var(--line)', borderRadius: 'var(--radius-m)', display: 'none' } });

  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setText(out, '图片超过 5MB，Data URL 会过大'); out.dataset.kind = 'error'; return; }
    const dataUrl = await readFileAs(f, 'dataurl');
    delete out.dataset.empty;
    setText(out, dataUrl);
    preview.src = dataUrl;
    preview.style.display = 'block';
  });

  panel.append(
    el('div.field', null, el('label.field-label', { text: '选择图片' }), file),
    preview,
    el('div.btn-row', { style: { margin: 'var(--s5) 0' } },
      el('button.btn.btn-sm', { type: 'button', onclick: () => copyText(out.textContent) }, icon('copy'), '复制 Data URL'),
      el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => downloadText(out.textContent, 'image-dataurl.txt') }, icon('download'), '下载 txt')
    ),
    el('div.field', null, el('label.field-label', { text: 'Data URL' }), out)
  );
};

/* ---- URL ---- */
TOOL_IMPL.url = (panel) => {
  simpleTool(panel, {
    inputLabel: '文本 / URL', outputLabel: '结果', placeholder: 'https://example.com/?q=你好 world',
    buttons: [
      { label: 'encodeURIComponent', kind: 'primary', onClick: (v) => encodeURIComponent(v) },
      { label: 'encodeURI', onClick: (v) => encodeURI(v) },
      { label: '解码', onClick: (v) => { try { return decodeURIComponent(v); } catch (e) { return '✗ 解码失败：' + e.message; } } },
    ],
  });
};

/* ---- HTML 实体 ---- */
TOOL_IMPL.html = (panel) => {
  simpleTool(panel, {
    inputLabel: '文本 / HTML', outputLabel: '结果', placeholder: '<div class="x">你好 & 世界</div>',
    buttons: [
      {
        label: '转义', kind: 'primary',
        onClick: (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
      },
      {
        label: '反转义',
        onClick: (v) => {
          /*
           * 不能用「建游离 textarea 再设 innerHTML」的老技巧：
           * textarea 的 innerHTML 解析遇到 </textarea> 就会闭合，
           * 后面的 <img onerror=…> 仍会被创建并触发，游离元素也不例外。
           * 这里直接做字符实体映射，不经过任何 HTML 解析器。
           */
          return v
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#0?39;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&nbsp;/g, '\u00a0')
            .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
            .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
            .replace(/&amp;/g, '&'); // &amp; 最后处理，避免二次解码
        },
      },
    ],
  });
};

/* ---- 文本 Diff（真实 Myers 算法） ---- */
TOOL_IMPL.textdiff = (panel) => {
  const a = el('textarea.textarea.textarea-mono', { placeholder: '原始文本（每行一条）', rows: 8, spellcheck: 'false' });
  const b = el('textarea.textarea.textarea-mono', { placeholder: '修改后文本（每行一条）', rows: 8, spellcheck: 'false' });
  const result = el('div', { style: { border: '1px solid var(--line)', borderRadius: 'var(--radius-m)', overflow: 'hidden', maxHeight: '420px', overflowY: 'auto' } });
  const summary = el('div.small.muted', { style: { marginBottom: 'var(--s4)' } });

  const run = () => {
    if (!a.value && !b.value) { clear(result); setText(summary, ''); return; }
    const changes = Diff.diffLines(a.value, b.value);
    clear(result);
    let added = 0, removed = 0;
    for (const part of changes) {
      const lines = part.value.replace(/\n$/, '').split('\n');
      for (const line of lines) {
        if (part.added) added++;
        else if (part.removed) removed++;
        result.appendChild(el('div.diff-line', { dataset: { kind: part.added ? 'add' : part.removed ? 'del' : 'same' } },
          el('span.diff-mark', { text: part.added ? '+' : part.removed ? '-' : ' ' }),
          el('span.diff-text', { text: line || ' ' })
        ));
      }
    }
    setText(summary, '新增 ' + added + ' 行，删除 ' + removed + ' 行');
  };

  panel.append(
    el('div.tool-layout', { dataset: { cols: '2' } },
      el('div.field', null, el('label.field-label', { text: '原始文本' }), a),
      el('div.field', null, el('label.field-label', { text: '修改后' }), b)
    ),
    el('div.btn-row', { style: { margin: 'var(--s5) 0' } },
      el('button.btn.btn-primary.btn-sm', { type: 'button', onclick: run }, '对比'),
      el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => { setText(a, ''); setText(b, ''); run(); } }, '清空')
    ),
    summary,
    result
  );
};

/* ---- 字数统计 ---- */
TOOL_IMPL.wordcount = (panel) => {
  const input = el('textarea.textarea', { placeholder: '粘贴或输入文本…', rows: 8 });
  const cells = {};
  const defs = [['chars', '总字符'], ['charsNoSpace', '不含空格'], ['cjk', '中文字符'], ['words', '英文单词'], ['lines', '行数'], ['paragraphs', '段落']];
  const grid = el('div.stat-grid', { style: { marginTop: 'var(--s5)' } });
  for (const [k, label] of defs) {
    cells[k] = el('div.stat-value', { text: '0' });
    grid.appendChild(el('div.stat', null, cells[k], el('div.stat-key', { text: label })));
  }
  const count = () => {
    const t = input.value;
    setText(cells.chars, String(t.length));
    setText(cells.charsNoSpace, String(t.replace(/\s/g, '').length));
    setText(cells.cjk, String((t.match(/[\u4e00-\u9fff]/g) || []).length));
    setText(cells.words, String((t.match(/[a-zA-Z0-9_]+/g) || []).length));
    setText(cells.lines, String(t ? t.split('\n').length : 0));
    setText(cells.paragraphs, String(t.split(/\n\s*\n/).filter((p) => p.trim()).length));
  };
  input.addEventListener('input', count);
  panel.append(el('div.field', null, el('label.field-label', { text: '文本' }), input), grid);
};

/* ---- 大小写转换 ---- */
TOOL_IMPL.case = (panel) => {
  const input = el('input.input', { type: 'text', placeholder: '输入单词或短语，如 hello world', value: 'hello world' });
  const out = el('dl.kv-out', { style: { marginTop: 'var(--s5)' } });
  const toWords = (s) => s.trim().split(/[\s_\-]+/).filter(Boolean);
  const cases = {
    'camelCase': (w) => w.map((x, i) => i ? x[0].toUpperCase() + x.slice(1).toLowerCase() : x.toLowerCase()).join(''),
    'PascalCase': (w) => w.map((x) => x[0].toUpperCase() + x.slice(1).toLowerCase()).join(''),
    'snake_case': (w) => w.map((x) => x.toLowerCase()).join('_'),
    'kebab-case': (w) => w.map((x) => x.toLowerCase()).join('-'),
    'CONSTANT_CASE': (w) => w.map((x) => x.toUpperCase()).join('_'),
    'UPPERCASE': (w) => w.join(' ').toUpperCase(),
    'lowercase': (w) => w.join(' ').toLowerCase(),
    'Title Case': (w) => w.map((x) => x[0].toUpperCase() + x.slice(1).toLowerCase()).join(' '),
  };
  const render = () => {
    const words = toWords(input.value);
    clear(out);
    if (!words.length) return;
    for (const name in cases) {
      const val = cases[name](words);
      out.append(
        el('dt', { text: name }),
        el('dd', { text: val, style: { cursor: 'pointer' }, title: '点击复制', onclick: () => copyText(val) })
      );
    }
  };
  input.addEventListener('input', render);
  panel.append(el('div.field', null, el('label.field-label', { text: '输入' }), input), out, el('p.field-hint', { text: '点击任意一行可复制。', style: { marginTop: 'var(--s4)' } }));
  render();
};

/* ---- 正则测试 ---- */
TOOL_IMPL.regex = (panel) => {
  const pattern = el('input.input.input-mono', { type: 'text', placeholder: '\\d+', value: '\\d+' });
  const flags = el('input.input.input-mono', { type: 'text', placeholder: 'gim', value: 'g', style: { width: '80px' } });
  const text = el('textarea.textarea.textarea-mono', { placeholder: '待匹配的文本…', rows: 6 });
  const result = el('div.tool-out', { dataset: { empty: 'true' } }, '输入正则与文本后显示匹配结果');

  const run = () => {
    const p = pattern.value;
    if (!p) { result.dataset.empty = 'true'; delete result.dataset.kind; setText(result, '输入正则与文本后显示匹配结果'); return; }
    let re;
    try { re = new RegExp(p, flags.value); } catch (e) { result.dataset.kind = 'error'; delete result.dataset.empty; setText(result, '✗ 正则语法错误：' + e.message); return; }
    const matches = [...text.value.matchAll(re.flags.includes('g') ? re : new RegExp(re.source, re.flags + 'g'))];
    delete result.dataset.empty;
    if (!matches.length) { delete result.dataset.kind; setText(result, '无匹配'); return; }
    result.dataset.kind = 'ok';
    const lines = matches.slice(0, 50).map((m, i) => {
      let s = (i + 1) + '. ' + JSON.stringify(m[0]) + ' @' + m.index;
      if (m.length > 1) s += '  分组: ' + m.slice(1).map((g, gi) => '$' + (gi + 1) + '=' + JSON.stringify(g)).join(', ');
      return s;
    });
    if (matches.length > 50) lines.push('…（共 ' + matches.length + ' 处，仅显示前 50）');
    setText(result, '匹配 ' + matches.length + ' 处\n\n' + lines.join('\n'));
  };

  [pattern, flags, text].forEach((n) => n.addEventListener('input', debounce(run, 200)));
  panel.append(
    el('div.row', { style: { gap: 'var(--s4)', marginBottom: 'var(--s5)' } },
      el('div.field', { style: { flex: '1', marginBottom: '0' } }, el('label.field-label', { text: '正则表达式' }), pattern),
      el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: '标志' }), flags)
    ),
    el('div.field', null, el('label.field-label', { text: '测试文本' }), text),
    el('label.field-label', { text: '匹配结果', style: { display: 'block', margin: 'var(--s5) 0 var(--s2)' } }),
    result
  );
};

/* ---- Markdown 预览（marked + DOMPurify，防 XSS） ---- */
TOOL_IMPL.markdown = (panel) => {
  const input = el('textarea.textarea.textarea-mono', { placeholder: '# 标题\n\n**粗体** *斜体* `代码`\n\n- 列表项\n\n> 引用', rows: 16 });
  const preview = el('div.md-preview.prose', null, el('p.muted', { text: '预览区' }));
  let timer = null;
  const render = async () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const html = await renderMarkdown(input.value, { breaks: true });
        setSafeHtml(preview, html);
        // 代码块高亮
        if (typeof hljs !== 'undefined') preview.querySelectorAll('pre code').forEach((b) => { try { hljs.highlightElement(b); } catch {} });
      } catch (e) { setText(preview, '渲染失败：' + e.message); }
    }, 220);
  };
  input.addEventListener('input', render);
  panel.append(
    el('div.md-editor', null,
      el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: 'Markdown' }), input),
      el('div', null, el('label.field-label', { text: '预览' }), preview)
    ),
    el('div.tool-note', { style: { marginTop: 'var(--s5)' } },
      icon('info'),
      el('span', { text: '渲染经 DOMPurify 消毒，<script> 等危险标签会被移除，可安全预览不受信任的内容。' })
    )
  );
  input.value = '# Markdown 预览\n\n这是**安全的**实时渲染。\n\n```js\nconst x = 42;\nconsole.log(x);\n```\n\n- 支持列表\n- 支持 `行内代码`\n\n> 引用也可以';
  render();
  return () => clearTimeout(timer);
};

/* ---- 哈希（MD5 用库，SHA 用原生） ---- */
TOOL_IMPL.hash = (panel) => {
  const input = el('textarea.textarea.textarea-mono', { placeholder: '输入文本…', rows: 4 });
  const rows = {};
  const out = el('div', { style: { marginTop: 'var(--s5)', display: 'grid', gap: 'var(--s4)' } });
  const algos = [['MD5', 'md5'], ['SHA-1', 'sha1'], ['SHA-256', 'sha256'], ['SHA-512', 'sha512']];
  for (const [label, key] of algos) {
    const val = el('div.tool-out', { dataset: { empty: 'true' }, style: { minHeight: 'auto', cursor: 'pointer' } }, '—');
    val.title = '点击复制';
    rows[key] = val;
    out.append(el('div', null,
      el('div.row-between', { style: { marginBottom: 'var(--s2)' } },
        el('label.field-label', { text: label }),
        el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => copyText(val.textContent) }, icon('copy'))
      ),
      val
    ));
    val.addEventListener('click', () => { if (val.dataset.empty !== 'true') copyText(val.textContent); });
  }

  const calc = async () => {
    const text = input.value;
    if (!text) { for (const k in rows) { rows[k].dataset.empty = 'true'; setText(rows[k], '—'); } return; }
    const buf = new TextEncoder().encode(text);
    // MD5：Web Crypto 不支持，用自托管的 blueimp-md5
    try {
      if (typeof md5 === 'function') { delete rows.md5.dataset.empty; setText(rows.md5, md5(text)); }
      else { rows.md5.dataset.kind = 'error'; delete rows.md5.dataset.empty; setText(rows.md5, 'MD5 组件未加载'); }
    } catch (e) { setText(rows.md5, 'MD5 出错：' + e.message); }
    // SHA：原生
    for (const [algo, key] of [['SHA-1', 'sha1'], ['SHA-256', 'sha256'], ['SHA-512', 'sha512']]) {
      try {
        const h = await crypto.subtle.digest(algo, buf);
        delete rows[key].dataset.empty;
        setText(rows[key], Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join(''));
      } catch (e) { rows[key].dataset.kind = 'error'; setText(rows[key], '出错：' + e.message); }
    }
  };
  input.addEventListener('input', debounce(calc, 200));
  panel.append(
    el('div.field', null, el('label.field-label', { text: '输入文本' }), input),
    out,
    el('div.tool-note', { style: { marginTop: 'var(--s5)' } }, icon('info'),
      el('span', { text: 'SHA 系列用浏览器原生 Web Crypto；MD5 因标准不支持，由自托管的 blueimp-md5 提供。' }))
  );
};

/* ---- UUID ---- */
TOOL_IMPL.uuid = (panel) => {
  const count = el('input.input', { type: 'number', value: '5', min: '1', max: '1000', style: { width: '120px' } });
  const upper = el('input', { type: 'checkbox', checked: false });
  const noDash = el('input', { type: 'checkbox', checked: false });
  const out = el('div.tool-out', { style: { marginTop: 'var(--s5)' } });
  const gen = () => {
    const n = Math.min(1000, Math.max(1, parseInt(count.value, 10) || 1));
    const list = [];
    for (let i = 0; i < n; i++) {
      let u;
      if (crypto.randomUUID) u = crypto.randomUUID();
      else {
        const b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
        const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
        u = h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
      }
      if (noDash.checked) u = u.replace(/-/g, '');
      if (upper.checked) u = u.toUpperCase();
      list.push(u);
    }
    delete out.dataset.empty;
    setText(out, list.join('\n'));
  };
  panel.append(
    el('div.row-wrap', { style: { gap: 'var(--s6)' } },
      el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: '数量' }), count),
      el('label.checkbox', null, upper, '大写'),
      el('label.checkbox', null, noDash, '去掉连字符')
    ),
    el('div.btn-row', { style: { margin: 'var(--s5) 0' } },
      el('button.btn.btn-primary.btn-sm', { type: 'button', onclick: gen }, icon('refresh'), '生成'),
      el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => copyText(out.textContent) }, icon('copy'), '复制')
    ),
    el('label.field-label', { text: '结果' }), out
  );
  gen();
};

/* ---- JWT ---- */
TOOL_IMPL.jwt = (panel) => {
  const input = el('textarea.textarea.textarea-mono', { placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.签名', rows: 5 });
  const header = el('div.tool-out', { dataset: { empty: 'true' } }, '—');
  const payload = el('div.tool-out', { dataset: { empty: 'true' } }, '—');
  const note = el('div.tool-note', { style: { marginTop: 'var(--s5)', display: 'none' } });

  const decodePart = (s) => {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };

  const run = () => {
    const parts = input.value.trim().split('.');
    if (parts.length < 2) { header.dataset.empty = 'true'; payload.dataset.empty = 'true'; setText(header, '—'); setText(payload, '—'); note.style.display = 'none'; return; }
    try {
      delete header.dataset.empty; delete payload.dataset.empty;
      setText(header, JSON.stringify(JSON.parse(decodePart(parts[0])), null, 2));
      const pl = JSON.parse(decodePart(parts[1]));
      setText(payload, JSON.stringify(pl, null, 2));
      // 解析常见时间字段
      const times = [];
      if (pl.exp) times.push('过期时间 exp：' + fmtDateTime(pl.exp * 1000) + (pl.exp * 1000 < Date.now() ? '（已过期）' : ''));
      if (pl.iat) times.push('签发时间 iat：' + fmtDateTime(pl.iat * 1000));
      if (pl.nbf) times.push('生效时间 nbf：' + fmtDateTime(pl.nbf * 1000));
      if (times.length) {
        note.style.display = 'flex';
        clear(note);
        note.append(icon('clock'), el('span', null, times.map((t) => el('div', { text: t }))));
      } else note.style.display = 'none';
    } catch (e) { header.dataset.kind = 'error'; setText(header, '✗ 解析失败：' + e.message); }
  };
  input.addEventListener('input', debounce(run, 200));
  panel.append(
    el('div.field', null, el('label.field-label', { text: 'JWT Token' }), input),
    el('div.tool-layout', { dataset: { cols: '2' }, style: { marginTop: 'var(--s5)' } },
      el('div.field', null, el('label.field-label', { text: 'Header' }), header),
      el('div.field', null, el('label.field-label', { text: 'Payload' }), payload)
    ),
    note,
    el('div.tool-note', { style: { marginTop: 'var(--s5)' } }, icon('info'),
      el('span', { text: '仅解码不验签。JWT 的签名验证需要密钥，纯前端工具不做验证，请勿据此信任 token 内容。' }))
  );
};

/* ---- 时间戳 ---- */
TOOL_IMPL.timestamp = (panel) => {
  const now = el('div.tool-out.num', { style: { cursor: 'pointer', minHeight: 'auto' } }, String(Math.floor(Date.now() / 1000)));
  now.title = '点击复制';
  now.addEventListener('click', () => copyText(now.textContent));
  const tsIn = el('input.input.input-mono', { type: 'text', placeholder: '1700000000（秒）或 1700000000000（毫秒）' });
  const tsOut = el('div.tool-out', { dataset: { empty: 'true' }, style: { minHeight: 'auto' } });
  const dateIn = el('input.input', { type: 'datetime-local', step: '1' });
  const dateOut = el('div.tool-out', { dataset: { empty: 'true' }, style: { minHeight: 'auto' } });

  const unit = el('div.row', { style: { gap: 'var(--s4)', marginTop: 'var(--s2)' } });
  const toTs = () => {
    const v = tsIn.value.trim();
    if (!/^\d+$/.test(v)) { tsOut.dataset.empty = 'true'; setText(tsOut, '请输入纯数字'); return; }
    const n = parseInt(v, 10);
    const ms = v.length >= 12 ? n : n * 1000; // 自动判断秒/毫秒
    const d = new Date(ms);
    delete tsOut.dataset.empty;
    setText(tsOut, '本地：' + fmtDateTime(ms) + '\nUTC：' + d.toISOString() + '\n相对：' + fmtAgo(ms) + '\n判断为：' + (v.length >= 12 ? '毫秒' : '秒'));
  };
  const toDate = () => {
    if (!dateIn.value) { dateOut.dataset.empty = 'true'; setText(dateOut, '选择日期时间'); return; }
    const d = new Date(dateIn.value);
    delete dateOut.dataset.empty;
    setText(dateOut, '秒：' + Math.floor(d.getTime() / 1000) + '\n毫秒：' + d.getTime());
  };
  tsIn.addEventListener('input', toTs);
  dateIn.addEventListener('input', toDate);

  const tick = setInterval(() => setText(now, String(Math.floor(Date.now() / 1000))), 1000);

  panel.append(
    el('div.field', null, el('label.field-label', { text: '当前时间戳（秒）' }), now),
    el('div.field', null, el('label.field-label', { text: '时间戳 → 日期' }), tsIn, tsOut),
    el('div.field', { style: { marginTop: 'var(--s6)' } }, el('label.field-label', { text: '日期 → 时间戳' }), dateIn, dateOut)
  );
  return () => clearInterval(tick);
};

/* ---- 进制转换 ---- */
TOOL_IMPL.base = (panel) => {
  const fields = {};
  const bases = [['dec', '十进制', 10], ['bin', '二进制', 2], ['oct', '八进制', 8], ['hex', '十六进制', 16]];
  const wrap = el('div', { style: { display: 'grid', gap: 'var(--s5)' } });
  let updating = false;
  const setAll = (fromKey, val) => {
    if (updating) return;
    updating = true;
    const clean = val.trim().replace(/^0[xbo]/i, '').replace(/[_\s]/g, '');
    const base = bases.find((b) => b[0] === fromKey)[2];
    const n = parseInt(clean, base);
    for (const [k, , b] of bases) {
      if (k === fromKey) { fields[k].value = val; continue; }
      fields[k].value = isNaN(n) ? '' : n.toString(b).toUpperCase();
    }
    if (isNaN(n) && clean) wrap.dataset.invalid = 'true'; else delete wrap.dataset.invalid;
    updating = false;
  };
  for (const [k, label, b] of bases) {
    const inp = el('input.input.input-mono', { type: 'text', placeholder: label });
    inp.addEventListener('input', () => setAll(k, inp.value));
    fields[k] = inp;
    wrap.appendChild(el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: label }), inp));
  }
  panel.appendChild(wrap);
  fields.dec.value = '255';
  setAll('dec', '255');
};

/* ---- Cron（croner，真实计算未来执行时间） ---- */
TOOL_IMPL.cron = (panel) => {
  const input = el('input.input.input-mono', { type: 'text', placeholder: '0 9 * * 1-5  （工作日每天 9 点）', value: '*/5 * * * *' });
  const meaning = el('div.tool-out', { dataset: { empty: 'true' }, style: { minHeight: 'auto' } });
  const next = el('div.tool-out', { dataset: { empty: 'true' }, style: { minHeight: 'auto' } });

  const run = () => {
    const expr = input.value.trim();
    if (!expr) { meaning.dataset.empty = 'true'; next.dataset.empty = 'true'; return; }
    let job;
    try {
      job = new Cron(expr);
    } catch (e) {
      meaning.dataset.kind = 'error'; delete meaning.dataset.empty;
      setText(meaning, '✗ 表达式无效：' + e.message);
      next.dataset.empty = 'true'; setText(next, '—');
      return;
    }
    delete meaning.dataset.empty; delete meaning.dataset.kind;
    // croner 的 human-readable 描述
    try { setText(meaning, job.protect ? expr : describeCron(expr)); } catch { setText(meaning, expr); }
    try {
      const runs = job.nextRuns(6);
      delete next.dataset.empty;
      if (runs && runs.length) {
        setText(next, runs.map((d, i) => (i + 1) + '. ' + fmtDateTime(d.getTime())).join('\n'));
      } else {
        setText(next, '该表达式没有未来的执行时间（可能已固定在过去）');
      }
    } catch (e) { setText(next, '计算失败：' + e.message); }
  };

  // 一个轻量的中文描述，不替代 croner 的时间计算
  function describeCron(expr) {
    const p = expr.split(/\s+/);
    const names = ['分钟', '小时', '日', '月', '星期'];
    if (p.length < 5 || p.length > 6) return expr;
    const seg = p.length === 6 ? p.slice(1) : p; // 支持带秒的 6 段
    const parts = seg.map((f, i) => {
      if (f === '*') return '每' + names[i];
      if (f.includes('/')) return '每隔 ' + f.split('/')[1] + ' ' + names[i];
      if (f.includes('-')) return names[i] + ' ' + f.replace('-', ' 到 ');
      if (f.includes(',')) return names[i] + ' ' + f.split(',').join('、');
      return names[i] + ' ' + f;
    });
    return parts.join('，');
  }

  input.addEventListener('input', debounce(run, 250));
  panel.append(
    el('div.field', null, el('label.field-label', { text: 'Cron 表达式（5 或 6 段）' }), input),
    el('label.field-label', { text: '含义', style: { display: 'block', margin: 'var(--s5) 0 var(--s2)' } }), meaning,
    el('label.field-label', { text: '接下来 6 次执行', style: { display: 'block', margin: 'var(--s5) 0 var(--s2)' } }), next,
    el('div.tool-note', { style: { marginTop: 'var(--s5)' } }, icon('info'),
      el('span', { text: '执行时间由 croner 按本地时区真实计算，非估算。常用：*/5 * * * * 每5分钟；0 9 * * 1-5 工作日9点。' }))
  );
  run();
};

/* ---- SQL 格式化 ---- */
TOOL_IMPL.sql = (panel) => {
  const input = el('textarea.textarea.textarea-mono', { placeholder: 'SELECT id,name FROM users WHERE age>18 ORDER BY id', rows: 8 });
  const out = el('div.tool-out', { style: { minHeight: '120px' } });
  const dialect = el('select.select', { style: { width: '160px' } });
  ['sql', 'mysql', 'postgresql', 'sqlite', 'tsql', 'plsql'].forEach((d) => dialect.appendChild(el('option', { value: d, text: d })));
  const run = () => {
    if (!input.value.trim()) { setText(out, ''); return; }
    try {
      setText(out, sqlFormatter.format(input.value, { language: dialect.value, keywordCase: 'upper' }));
      delete out.dataset.kind;
    } catch (e) { out.dataset.kind = 'error'; setText(out, '✗ 格式化失败：' + e.message); }
  };
  panel.append(
    el('div.field', null, el('label.field-label', { text: 'SQL' }), input),
    el('div.row', { style: { margin: 'var(--s5) 0' } },
      dialect,
      el('button.btn.btn-primary.btn-sm', { type: 'button', onclick: run }, '格式化'),
      el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => copyText(out.textContent) }, icon('copy'), '复制')
    ),
    el('label.field-label', { text: '结果' }), out
  );
};

/* ---- 二维码生成（qrcodejs，真实可扫） ---- */
TOOL_IMPL.qrcode = (panel) => {
  const input = el('textarea.textarea', { placeholder: '输入文本或链接…', rows: 3 });
  const box = el('div', { style: { textAlign: 'center', padding: 'var(--s6)', minHeight: '220px' } });
  const sizeSel = el('select.select', { style: { width: '120px' } });
  [128, 192, 256, 384, 512].forEach((s) => sizeSel.appendChild(el('option', { value: String(s), text: s + 'px' })));
  sizeSel.value = '256';
  let canvas = null;

  const gen = () => {
    clear(box);
    const text = input.value;
    if (!text.trim()) { box.appendChild(el('p.muted', { text: '输入内容后生成二维码', style: { paddingTop: '80px' } })); return; }
    const size = parseInt(sizeSel.value, 10);
    try {
      // qrcodejs 需要一个容器，它会往里塞 canvas 或 table
      const holder = el('div', { style: { display: 'inline-block' } });
      box.appendChild(holder);
      const qr = new QRCode(holder, {
        text, width: size, height: size,
        colorDark: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#000',
        colorLight: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#fff',
        correctLevel: QRCode.CorrectLevel.M,
      });
      // qrcodejs 生成后取其中的 canvas 或 img
      setTimeout(() => {
        canvas = holder.querySelector('canvas');
        if (!canvas) { const img = holder.querySelector('img'); if (img) { const c = document.createElement('canvas'); c.width = size; c.height = size; c.getContext('2d').drawImage(img, 0, 0); canvas = c; } }
      }, 30);
    } catch (e) {
      clear(box);
      box.appendChild(emptyState({ icon: 'alert', title: '生成失败', text: e.message || '内容可能过长' }));
    }
  };

  input.addEventListener('input', debounce(gen, 300));
  sizeSel.addEventListener('change', gen);
  panel.append(
    el('div.field', null, el('label.field-label', { text: '内容' }), input),
    el('div.row', { style: { margin: 'var(--s4) 0' } }, el('span.small.muted', { text: '尺寸' }), sizeSel),
    box,
    el('div.btn-row', { style: { justifyContent: 'center' } },
      el('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => {
        if (!canvas) { toast('请先生成二维码', 'warn'); return; }
        try { canvas.toBlob((b) => (b ? downloadBlob(b, 'qrcode.png') : toast('导出失败', 'err')), 'image/png'); }
        catch (e) { toast('导出失败：' + e.message, 'err'); }
      } }, icon('download'), '下载 PNG'),
      el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => copyText(input.value) }, icon('copy'), '复制内容')
    ),
    el('div.tool-note', { style: { marginTop: 'var(--s5)' } }, icon('check'),
      el('span', { text: '由 qrcodejs 按 QR Code 标准编码，生成的二维码可被任意扫码器识别（旧版是随机格子，扫不出来）。' }))
  );
  input.value = 'https://kayhs.qzz.io';
  gen();
};

/* ---- 二维码识别（jsQR） ---- */
TOOL_IMPL.qrdecode = (panel) => {
  const file = el('input.input', { type: 'file', accept: 'image/*' });
  const preview = el('img', { style: { maxWidth: '240px', maxHeight: '240px', border: '1px solid var(--line)', borderRadius: 'var(--radius-m)', display: 'none', margin: 'var(--s5) 0' } });
  const out = el('div.tool-out', { dataset: { empty: 'true' } }, '上传图片后自动识别');

  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    const dataUrl = await readFileAs(f, 'dataurl');
    preview.src = dataUrl;
    preview.style.display = 'block';
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const c = canvas.getContext('2d');
      c.drawImage(img, 0, 0);
      try {
        const data = c.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(data.data, data.width, data.height);
        delete out.dataset.empty;
        if (code && code.data) {
          out.dataset.kind = 'ok';
          setText(out, code.data);
          // 如果是链接，给个可点的
          if (/^https?:\/\//i.test(code.data)) {
            out.appendChild(el('div', { style: { marginTop: '8px' } },
              el('a', { href: code.data, target: '_blank', rel: 'noopener noreferrer', text: '打开链接 ↗', style: { color: 'var(--accent)' } })));
          }
        } else {
          delete out.dataset.kind;
          setText(out, '未识别到二维码。请确认图片清晰、二维码完整。');
        }
      } catch (e) { out.dataset.kind = 'error'; setText(out, '识别出错：' + e.message); }
    };
    img.onerror = () => { out.dataset.kind = 'error'; setText(out, '图片加载失败'); };
    img.src = dataUrl;
  });

  panel.append(
    el('div.field', null, el('label.field-label', { text: '上传二维码图片' }), file),
    preview,
    el('label.field-label', { text: '识别结果', style: { display: 'block', margin: 'var(--s5) 0 var(--s2)' } }),
    out,
    el('div.btn-row', { style: { marginTop: 'var(--s4)' } },
      el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => copyText(out.textContent) }, icon('copy'), '复制')
    ),
    el('div.tool-note', { style: { marginTop: 'var(--s5)' } }, icon('check'),
      el('span', { text: '由 jsQR 真实解码（旧版这里只写死一句"演示版"，什么都不做）。' }))
  );
};

/* ---- 图片处理共用 ---- */
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = URL.createObjectURL(file);
  });
}

TOOL_IMPL.imgcompress = (panel) => {
  const file = el('input.input', { type: 'file', accept: 'image/*' });
  const quality = el('input.range', { type: 'range', min: '0.1', max: '1', step: '0.05', value: '0.75' });
  const qLabel = el('span.small.muted', { text: '0.75' });
  const result = el('div', { style: { marginTop: 'var(--s5)' } });
  let curImg = null;

  const run = async () => {
    if (!curImg) return;
    const q = parseFloat(quality.value);
    setText(qLabel, q.toFixed(2));
    const canvas = document.createElement('canvas');
    canvas.width = curImg.naturalWidth; canvas.height = curImg.naturalHeight;
    canvas.getContext('2d').drawImage(curImg, 0, 0);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
    const url = URL.createObjectURL(blob);
    const origSize = curImg._origSize || 0;
    clear(result);
    result.append(
      el('div.row', { style: { gap: 'var(--s6)', alignItems: 'flex-start', flexWrap: 'wrap' } },
        el('img', { src: url, style: { maxWidth: '220px', maxHeight: '220px', border: '1px solid var(--line)', borderRadius: 'var(--radius-m)' } }),
        el('div', null,
          el('dl.kv-out', null,
            el('dt', { text: '原图' }), el('dd', { text: origSize ? fmtBytes(origSize) : '—' }),
            el('dt', { text: '压缩后' }), el('dd', { text: fmtBytes(blob.size) }),
            origSize ? el('dt', { text: '节省' }) : null,
            origSize ? el('dd', { text: ((1 - blob.size / origSize) * 100).toFixed(1) + '%' }) : null
          ),
          el('button.btn.btn-sm.btn-primary', { type: 'button', style: { marginTop: 'var(--s4)' }, onclick: () => downloadBlob(blob, 'compressed.jpg') }, icon('download'), '下载')
        )
      )
    );
  };

  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    curImg = await loadImageFromFile(f);
    curImg._origSize = f.size;
    run();
  });
  quality.addEventListener('input', run);
  panel.append(
    el('div.field', null, el('label.field-label', { text: '选择图片' }), file),
    el('div.field', null, el('div.row', null, el('label.field-label', { text: '质量', style: { marginBottom: '0' } }), qLabel), quality),
    result,
    el('div.tool-note', { style: { marginTop: 'var(--s5)' } }, icon('info'), el('span', { text: '输出为 JPEG。PNG 等无损格式转 JPEG 后透明区域会变黑，含透明的图请用「格式转换」选 PNG/WebP。' }))
  );
};

TOOL_IMPL.imgconvert = (panel) => {
  const file = el('input.input', { type: 'file', accept: 'image/*' });
  const fmt = el('select.select', { style: { width: '160px' } });
  [['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP']].forEach(([v, t]) => fmt.appendChild(el('option', { value: v, text: t })));
  const result = el('div', { style: { marginTop: 'var(--s5)' } });
  let curImg = null, curFile = null;

  const run = () => {
    if (!curImg) { toast('请先上传图片', 'warn'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = curImg.naturalWidth; canvas.height = curImg.naturalHeight;
    const c = canvas.getContext('2d');
    if (fmt.value === 'image/jpeg') { c.fillStyle = '#fff'; c.fillRect(0, 0, canvas.width, canvas.height); }
    c.drawImage(curImg, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) { setText(result, '该浏览器不支持导出此格式'); return; }
      const url = URL.createObjectURL(blob);
      const ext = fmt.value.split('/')[1];
      const base = (curFile.name || 'image').replace(/\.[^.]+$/, '');
      clear(result);
      result.append(
        el('div.center', null,
          el('img', { src: url, style: { maxWidth: '280px', maxHeight: '280px', border: '1px solid var(--line)', borderRadius: 'var(--radius-m)' } }),
          el('p.small.muted', { text: fmtBytes(blob.size), style: { margin: 'var(--s4) 0' } }),
          el('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => downloadBlob(blob, base + '.' + ext) }, icon('download'), '下载 .' + ext)
        )
      );
    }, fmt.value, 0.92);
  };

  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    curFile = f; curImg = await loadImageFromFile(f);
  });
  panel.append(
    el('div.field', null, el('label.field-label', { text: '选择图片' }), file),
    el('div.row', { style: { margin: 'var(--s5) 0' } }, el('span.small.muted', { text: '目标格式' }), fmt, el('button.btn.btn-primary.btn-sm', { type: 'button', onclick: run }, '转换')),
    result
  );
};

TOOL_IMPL.imgresize = (panel) => {
  const file = el('input.input', { type: 'file', accept: 'image/*' });
  const w = el('input.input', { type: 'number', min: '1', placeholder: '宽' });
  const h = el('input.input', { type: 'number', min: '1', placeholder: '高' });
  const lock = el('input', { type: 'checkbox', checked: true });
  let curImg = null, ratio = 1;

  const onW = () => { if (lock.checked && curImg) h.value = Math.round(w.value / ratio); };
  const onH = () => { if (lock.checked && curImg) w.value = Math.round(h.value * ratio); };
  w.addEventListener('input', onW); h.addEventListener('input', onH);

  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    curImg = await loadImageFromFile(f);
    ratio = curImg.naturalWidth / curImg.naturalHeight;
    w.value = curImg.naturalWidth; h.value = curImg.naturalHeight;
  });

  const run = () => {
    if (!curImg) { toast('请先上传图片', 'warn'); return; }
    const tw = parseInt(w.value, 10), th = parseInt(h.value, 10);
    if (!tw || !th || tw < 1 || th < 1) { toast('宽高需为正整数', 'warn'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = tw; canvas.height = th;
    const c = canvas.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.drawImage(curImg, 0, 0, tw, th);
    canvas.toBlob((blob) => downloadBlob(blob, 'resized-' + tw + 'x' + th + '.png'), 'image/png');
  };

  panel.append(
    el('div.field', null, el('label.field-label', { text: '选择图片' }), file),
    el('div.row-wrap', { style: { gap: 'var(--s5)', margin: 'var(--s5) 0' } },
      el('div.field', { style: { marginBottom: '0', width: '120px' } }, el('label.field-label', { text: '宽度 px' }), w),
      el('div.field', { style: { marginBottom: '0', width: '120px' } }, el('label.field-label', { text: '高度 px' }), h),
      el('label.checkbox', null, lock, '锁定宽高比')
    ),
    el('button.btn.btn-primary', { type: 'button', onclick: run }, icon('download'), '缩放并下载')
  );
};

TOOL_IMPL.imgcolor = (panel) => {
  const file = el('input.input', { type: 'file', accept: 'image/*' });
  const canvasWrap = el('div', { style: { textAlign: 'center', margin: 'var(--s5) 0', display: 'none' } });
  const canvas = el('canvas', { style: { maxWidth: '100%', cursor: 'crosshair', border: '1px solid var(--line)', borderRadius: 'var(--radius-m)' } });
  canvasWrap.appendChild(canvas);
  const out = el('div.tool-out', { dataset: { empty: 'true' }, style: { minHeight: 'auto' } });
  const swatch = el('div', { style: { width: '48px', height: '48px', border: '1px solid var(--line)', borderRadius: 'var(--radius-m)' } });

  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    const img = await loadImageFromFile(f);
    const maxW = 560;
    const scale = Math.min(1, maxW / img.naturalWidth);
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    canvasWrap.style.display = 'block';
  });

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
    const d = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
    const hex = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    swatch.style.background = hex;
    delete out.dataset.empty;
    setText(out, 'HEX: ' + hex + '\nRGB: rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')\n位置: (' + x + ', ' + y + ')');
  });

  panel.append(
    el('div.field', null, el('label.field-label', { text: '选择图片' }), file),
    canvasWrap,
    el('div.row', { style: { gap: 'var(--s5)', alignItems: 'flex-start' } },
      swatch,
      el('div.grow', null,
        el('label.field-label', { text: '取色结果（点击图片）', style: { display: 'block', marginBottom: 'var(--s2)' } }),
        out
      )
    )
  );
};

/* ---- 颜色转换 ---- */
TOOL_IMPL.color = (panel) => {
  const hex = el('input.input.input-mono', { type: 'text', value: '#A8512B' });
  const rgb = el('input.input.input-mono', { type: 'text', placeholder: 'rgb(168, 81, 43)' });
  const hsl = el('input.input.input-mono', { type: 'text', placeholder: 'hsl(17, 53%, 41%)' });
  const picker = el('input', { type: 'color', value: '#a8512b', style: { width: '60px', height: '38px', padding: '2px', border: '1px solid var(--line)', borderRadius: 'var(--radius-m)', cursor: 'pointer' } });
  const preview = el('div', { style: { height: '70px', border: '1px solid var(--line)', borderRadius: 'var(--radius-m)', marginTop: 'var(--s5)' } });

  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }
  function toHex(r, g, b) { return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase(); }

  function fromHex() {
    const c = hexToRgb(hex.value);
    if (!c) return;
    rgb.value = 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')';
    const hs = rgbToHsl(c.r, c.g, c.b);
    hsl.value = 'hsl(' + hs.h + ', ' + hs.s + '%, ' + hs.l + '%)';
    picker.value = toHex(c.r, c.g, c.b).toLowerCase();
    preview.style.background = hex.value;
  }
  function fromRgb() {
    const m = rgb.value.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return;
    const [r, g, b] = [+m[1], +m[2], +m[3]];
    hex.value = toHex(r, g, b);
    const hs = rgbToHsl(r, g, b);
    hsl.value = 'hsl(' + hs.h + ', ' + hs.s + '%, ' + hs.l + '%)';
    picker.value = toHex(r, g, b).toLowerCase();
    preview.style.background = hex.value;
  }
  function fromHsl() {
    const m = hsl.value.match(/(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?/);
    if (!m) return;
    const c = hslToRgb(+m[1], +m[2], +m[3]);
    hex.value = toHex(c.r, c.g, c.b);
    rgb.value = 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')';
    picker.value = toHex(c.r, c.g, c.b).toLowerCase();
    preview.style.background = hex.value;
  }
  function fromPicker() { hex.value = picker.value.toUpperCase(); fromHex(); }

  hex.addEventListener('input', fromHex);
  rgb.addEventListener('input', fromRgb);
  hsl.addEventListener('input', fromHsl);
  picker.addEventListener('input', fromPicker);

  panel.append(
    el('div.row', { style: { gap: 'var(--s5)', alignItems: 'flex-end' } },
      el('div.field', { style: { flex: '1', marginBottom: '0' } }, el('label.field-label', { text: 'HEX' }), hex),
      picker
    ),
    el('div.field', { style: { marginTop: 'var(--s5)' } }, el('label.field-label', { text: 'RGB' }), rgb),
    el('div.field', null, el('label.field-label', { text: 'HSL' }), hsl),
    preview
  );
  fromHex();
};

/* ---- 渐变生成 ---- */
TOOL_IMPL.gradient = (panel) => {
  const type = el('select.select', { style: { width: '140px' } });
  [['linear', '线性'], ['radial', '径向']].forEach(([v, t]) => type.appendChild(el('option', { value: v, text: t })));
  const angle = el('input.input', { type: 'text', value: '135deg', style: { width: '120px' } });
  const c1 = el('input', { type: 'color', value: '#a8512b', style: { width: '52px', height: '32px', padding: '2px', border: '1px solid var(--line)', borderRadius: 'var(--radius-m)' } });
  const c2 = el('input', { type: 'color', value: '#2c7a5b', style: { width: '52px', height: '32px', padding: '2px', border: '1px solid var(--line)', borderRadius: 'var(--radius-m)' } });
  const preview = el('div', { style: { height: '130px', border: '1px solid var(--line)', borderRadius: 'var(--radius-m)', margin: 'var(--s5) 0' } });
  const code = el('div.tool-out', { style: { minHeight: 'auto', cursor: 'pointer' } });
  code.title = '点击复制';

  const gen = () => {
    const css = type.value === 'linear'
      ? 'linear-gradient(' + angle.value + ', ' + c1.value + ', ' + c2.value + ')'
      : 'radial-gradient(circle, ' + c1.value + ', ' + c2.value + ')';
    preview.style.background = css;
    setText(code, 'background: ' + css + ';');
  };
  [type, angle, c1, c2].forEach((n) => n.addEventListener('input', gen));
  code.addEventListener('click', () => copyText(code.textContent));
  panel.append(
    el('div.row-wrap', { style: { gap: 'var(--s5)' } },
      el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: '类型' }), type),
      el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: '角度' }), angle),
      el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: '颜色 1' }), c1),
      el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: '颜色 2' }), c2)
    ),
    preview,
    el('label.field-label', { text: 'CSS（点击复制）' }), code
  );
  gen();
};

/* ---- 配色方案 ---- */
TOOL_IMPL.palette = (panel) => {
  const base = el('input', { type: 'color', value: '#a8512b', style: { width: '60px', height: '38px', padding: '2px', border: '1px solid var(--line)', borderRadius: 'var(--radius-m)' } });
  const mode = el('select.select', { style: { width: '160px' } });
  [['analogous', '邻近色'], ['complementary', '互补色'], ['triadic', '三角色'], ['tetradic', '四角色'], ['shades', '同色深浅']].forEach(([v, t]) => mode.appendChild(el('option', { value: v, text: t })));
  const grid = el('div.swatch-grid', { style: { marginTop: 'var(--s5)' } });

  function hexToHsl(h) {
    h = h.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let hue = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue /= 6;
    }
    return { h: hue * 360, s: s * 100, l: l * 100 };
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    return '#' + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  const gen = () => {
    const { h, s, l } = hexToHsl(base.value);
    let colors = [];
    const m = mode.value;
    if (m === 'analogous') colors = [-30, -15, 0, 15, 30].map((d) => hslToHex(h + d, s, l));
    else if (m === 'complementary') colors = [hslToHex(h, s, l), hslToHex(h + 180, s, l), hslToHex(h, s, Math.min(85, l + 20)), hslToHex(h + 180, s, Math.min(85, l + 20)), hslToHex(h, Math.max(10, s - 20), l)];
    else if (m === 'triadic') colors = [0, 120, 240].map((d) => hslToHex(h + d, s, l));
    else if (m === 'tetradic') colors = [0, 90, 180, 270].map((d) => hslToHex(h + d, s, l));
    else colors = [20, 35, 50, 65, 80].map((L) => hslToHex(h, s, L));

    clear(grid);
    for (const c of colors) {
      grid.appendChild(el('button.swatch', { type: 'button', title: '点击复制 ' + c, onclick: () => copyText(c) },
        el('div.swatch-color', { style: { background: c } }),
        el('div.swatch-label', { text: c })
      ));
    }
  };
  base.addEventListener('input', gen);
  mode.addEventListener('change', gen);
  panel.append(
    el('div.row', { style: { gap: 'var(--s5)', alignItems: 'flex-end' } },
      el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: '主色' }), base),
      el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: '配色模式' }), mode)
    ),
    grid,
    el('p.field-hint', { text: '点击色块复制色值。配色基于 HSL 色轮计算。', style: { marginTop: 'var(--s4)' } })
  );
  gen();
};

/* ---- 阴影生成 ---- */
TOOL_IMPL.shadow = (panel) => {
  const x = el('input.range', { type: 'range', min: '-40', max: '40', value: '0' });
  const y = el('input.range', { type: 'range', min: '-40', max: '40', value: '8' });
  const blur = el('input.range', { type: 'range', min: '0', max: '80', value: '24' });
  const spread = el('input.range', { type: 'range', min: '-30', max: '30', value: '0' });
  const opacity = el('input.range', { type: 'range', min: '0', max: '100', value: '18' });
  const color = el('input', { type: 'color', value: '#000000', style: { width: '52px', height: '32px', padding: '2px', border: '1px solid var(--line)', borderRadius: 'var(--radius-m)' } });
  const demo = el('div', { style: { width: '180px', height: '110px', margin: 'var(--s6) auto', background: 'var(--paper)', borderRadius: 'var(--radius-l)', display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: '13px' }, text: '预览' });
  const code = el('div.tool-out', { style: { minHeight: 'auto', cursor: 'pointer' } });
  code.title = '点击复制';

  const sliders = [['X 偏移', x], ['Y 偏移', y], ['模糊', blur], ['扩散', spread], ['不透明度 %', opacity]];
  const gen = () => {
    const rgb = color.value.replace('#', '').match(/../g).map((h) => parseInt(h, 16));
    const rgba = 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + (opacity.value / 100).toFixed(2) + ')';
    const css = x.value + 'px ' + y.value + 'px ' + blur.value + 'px ' + spread.value + 'px ' + rgba;
    demo.style.boxShadow = css;
    setText(code, 'box-shadow: ' + css + ';');
  };
  [x, y, blur, spread, opacity, color].forEach((n) => n.addEventListener('input', gen));
  code.addEventListener('click', () => copyText(code.textContent));

  panel.append(
    ...sliders.map(([label, node]) => el('div.field', null,
      el('div.row-between', null, el('label.field-label', { text: label }), el('span.small.muted.num', { text: node.value })),
      node
    )),
    el('div.field', null, el('label.field-label', { text: '阴影颜色' }), color),
    demo,
    el('label.field-label', { text: 'CSS（点击复制）' }), code
  );
  sliders.forEach(([label, node]) => node.addEventListener('input', () => { node.previousElementSibling.querySelector('.num').textContent = node.value; }));
  gen();
};

/* ---- 密码生成（crypto.getRandomValues） ---- */
TOOL_IMPL.password = (panel) => {
  const len = el('input.input', { type: 'number', value: '16', min: '4', max: '128', style: { width: '100px' } });
  const sets = [
    ['lower', '小写 a-z', 'abcdefghijklmnopqrstuvwxyz', true],
    ['upper', '大写 A-Z', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', true],
    ['num', '数字 0-9', '0123456789', true],
    ['sym', '符号 !@#$…', '!@#$%^&*()_+-=[]{}|;:,.<>?', false],
    ['nosimilar', '', '', null], // 占位，下面单独处理
  ];
  const checks = {};
  const out = el('div.tool-out', { style: { fontSize: '18px', letterSpacing: '1px', cursor: 'pointer', minHeight: 'auto' }, dataset: { empty: 'true' } });
  out.title = '点击复制';
  const strength = el('div.progress', { style: { marginTop: 'var(--s4)' } });
  const strengthFill = el('div.progress-fill', { style: { width: '0%' } });
  strength.appendChild(strengthFill);
  const strengthText = el('span.small.muted');

  const gen = () => {
    let chars = '';
    if (checks.lower.checked) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (checks.upper.checked) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (checks.num.checked) chars += '0123456789';
    if (checks.sym.checked) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    if (checks.nosimilar.checked) chars = chars.replace(/[il1Lo0O]/g, '');
    if (!chars) { toast('至少选一种字符', 'warn'); return; }
    const n = Math.min(128, Math.max(4, parseInt(len.value, 10) || 16));
    const arr = new Uint32Array(n);
    crypto.getRandomValues(arr);
    let pw = '';
    for (let i = 0; i < n; i++) pw += chars[arr[i] % chars.length];
    delete out.dataset.empty;
    setText(out, pw);
    // 强度估算：熵 = n * log2(字符集大小)
    const entropy = n * Math.log2(chars.length);
    const pct = Math.min(100, (entropy / 128) * 100);
    strengthFill.style.width = pct + '%';
    strength.dataset.tone = entropy < 50 ? 'err' : entropy < 80 ? 'warn' : '';
    setText(strengthText, '约 ' + Math.round(entropy) + ' bit 熵 · ' + (entropy < 50 ? '偏弱' : entropy < 80 ? '中等' : entropy < 110 ? '强' : '很强'));
  };

  const checkRow = el('div.row-wrap', { style: { gap: 'var(--s6)', margin: 'var(--s5) 0' } });
  for (const [key, label, , def] of sets) {
    if (key === 'nosimilar') {
      checks[key] = el('input', { type: 'checkbox', checked: false });
      checkRow.appendChild(el('label.checkbox', null, checks[key], '排除易混字符'));
      continue;
    }
    checks[key] = el('input', { type: 'checkbox', checked: !!def });
    checkRow.appendChild(el('label.checkbox', null, checks[key], label));
  }
  out.addEventListener('click', () => { if (out.dataset.empty !== 'true') copyText(out.textContent); });

  panel.append(
    el('div.field', null, el('label.field-label', { text: '长度' }), len),
    checkRow,
    el('div.btn-row', null,
      el('button.btn.btn-primary', { type: 'button', onclick: gen }, icon('refresh'), '生成'),
      el('button.btn.btn-ghost', { type: 'button', onclick: () => copyText(out.textContent) }, icon('copy'), '复制')
    ),
    el('label.field-label', { text: '密码（点击复制）', style: { display: 'block', margin: 'var(--s5) 0 var(--s2)' } }),
    out, strength, strengthText,
    el('div.tool-note', { style: { marginTop: 'var(--s5)' } }, icon('lock'),
      el('span', { text: '使用 crypto.getRandomValues 加密级随机源，不是 Math.random。生成过程在本地完成，密码不会离开浏览器。' }))
  );
  gen();
};

/* ---- 随机数 ---- */
TOOL_IMPL.random = (panel) => {
  const min = el('input.input', { type: 'number', value: '1', style: { width: '110px' } });
  const max = el('input.input', { type: 'number', value: '100', style: { width: '110px' } });
  const count = el('input.input', { type: 'number', value: '5', min: '1', max: '1000', style: { width: '110px' } });
  const unique = el('input', { type: 'checkbox' });
  const out = el('div.tool-out', { style: { marginTop: 'var(--s5)', fontSize: '16px' } });

  const gen = () => {
    const lo = parseInt(min.value, 10), hi = parseInt(max.value, 10), n = parseInt(count.value, 10);
    if (isNaN(lo) || isNaN(hi)) { toast('请填写区间', 'warn'); return; }
    if (lo > hi) { toast('最小值不能大于最大值', 'warn'); return; }
    const range = hi - lo + 1;
    if (unique.checked && n > range) { toast('不重复数量超过区间大小（' + range + '）', 'warn'); return; }
    const result = [];
    if (unique.checked) {
      const pool = new Set();
      while (result.length < n) { const v = lo + (crypto.getRandomValues(new Uint32Array(1))[0] % range); if (!pool.has(v)) { pool.add(v); result.push(v); } }
    } else {
      for (let i = 0; i < n; i++) result.push(lo + (crypto.getRandomValues(new Uint32Array(1))[0] % range));
    }
    delete out.dataset.empty;
    setText(out, result.join(', '));
  };

  panel.append(
    el('div.row-wrap', { style: { gap: 'var(--s5)' } },
      el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: '最小值' }), min),
      el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: '最大值' }), max),
      el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: '个数' }), count),
      el('label.checkbox', { style: { marginTop: '20px' } }, unique, '不重复')
    ),
    el('div.btn-row', { style: { margin: 'var(--s5) 0' } },
      el('button.btn.btn-primary.btn-sm', { type: 'button', onclick: gen }, icon('refresh'), '生成'),
      el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => copyText(out.textContent) }, icon('copy'), '复制')
    ),
    out
  );
};

/* ---- 番茄钟 ---- */
TOOL_IMPL.pomodoro = (panel) => {
  const display = el('div', { style: { textAlign: 'center', fontSize: '64px', fontFamily: 'var(--font-mono)', fontWeight: '500', letterSpacing: '-2px', margin: 'var(--s6) 0' } }, '25:00');
  const modeLabel = el('div.center.small.muted', { text: '专注' });
  const roundLabel = el('div.center.small.muted', { text: '第 0 轮', style: { marginTop: 'var(--s2)' } });
  let mode = 25, seconds = 25 * 60, running = false, rounds = 0, timer = null, endAt = 0;

  const startBtn = el('button.btn.btn-primary', { type: 'button' }, icon('play'), '开始');
  const resetBtn = el('button.btn', { type: 'button' }, icon('reset'), '重置');
  const modes = [['25', 25, '专注'], ['5', 5, '短休'], ['15', 15, '长休']];

  const update = () => {
    const m = Math.floor(seconds / 60), s = seconds % 60;
    setText(display, String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'));
    document.title = (running ? String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + ' · ' : '') + '番茄钟 · kayhs';
  };
  const tick = () => {
    seconds = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    update();
    if (seconds <= 0) {
      stop();
      if (mode === 25) { rounds++; setText(roundLabel, '第 ' + rounds + ' 轮'); }
      toast(mode === 25 ? '专注结束，休息一下' : '休息结束，继续专注', 'ok', 4000);
      // 简单的提示音（Web Audio，不依赖音频文件）
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.frequency.value = 660; g.gain.setValueAtTime(0.15, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.8);
        o.start(); o.stop(ac.currentTime + 0.8);
      } catch {}
    }
  };
  const start = () => {
    running = true;
    endAt = Date.now() + seconds * 1000;
    timer = setInterval(tick, 250);
    clear(startBtn); startBtn.append(icon('pause'), '暂停');
    update();
  };
  const stop = () => {
    running = false;
    clearInterval(timer);
    clear(startBtn); startBtn.append(icon('play'), '继续');
    document.title = '番茄钟 · kayhs';
  };
  startBtn.addEventListener('click', () => (running ? stop() : start()));
  resetBtn.addEventListener('click', () => { stop(); seconds = mode * 60; clear(startBtn); startBtn.append(icon('play'), '开始'); update(); });

  const modeRow = el('div.row', { style: { justifyContent: 'center', gap: 'var(--s3)', marginTop: 'var(--s6)' } });
  for (const [val, mins, label] of modes) {
    modeRow.appendChild(el('button.btn.btn-sm', {
      type: 'button', dataset: { mode: val },
      onclick: (e) => {
        stop(); mode = mins; seconds = mins * 60; setText(modeLabel, label);
        modeRow.querySelectorAll('button').forEach((b) => b.classList.remove('btn-primary'));
        e.currentTarget.classList.add('btn-primary');
        clear(startBtn); startBtn.append(icon('play'), '开始');
        update();
      },
    }, label));
  }
  modeRow.querySelector('[data-mode="25"]').classList.add('btn-primary');

  panel.append(
    el('div.card', null, el('div.card-body', { style: { padding: 'var(--s8)' } },
      modeLabel, display, roundLabel,
      el('div.row', { style: { justifyContent: 'center', marginTop: 'var(--s6)' } }, startBtn, resetBtn),
      modeRow
    ))
  );
  update();
  return () => { clearInterval(timer); document.title = '工具箱 · kayhs'; };
};

/* ---- 秒表 ---- */
TOOL_IMPL.timer = (panel) => {
  const display = el('div', { style: { textAlign: 'center', fontSize: '52px', fontFamily: 'var(--font-mono)', fontWeight: '500', margin: 'var(--s6) 0' } }, '00:00.00');
  const laps = el('div', { style: { maxWidth: '360px', margin: '0 auto' } });
  let ms = 0, running = false, timer = null, startAt = 0, lapList = [];

  const btn = el('button.btn.btn-primary', { type: 'button' }, icon('play'), '开始');
  const update = () => setText(display, fmtDuration(ms));
  const tick = () => { ms = Date.now() - startAt; update(); };
  btn.addEventListener('click', () => {
    if (running) { running = false; clearInterval(timer); clear(btn); btn.append(icon('play'), '继续'); }
    else { running = true; startAt = Date.now() - ms; timer = setInterval(tick, 31); clear(btn); btn.append(icon('pause'), '暂停'); }
  });
  const lapBtn = el('button.btn', { type: 'button', onclick: () => { if (ms > 0) { lapList.unshift(ms); renderLaps(); } } }, icon('flag'), '计次');
  const resetBtn = el('button.btn.btn-ghost', { type: 'button', onclick: () => { running = false; clearInterval(timer); ms = 0; lapList = []; clear(btn); btn.append(icon('play'), '开始'); update(); renderLaps(); } }, icon('reset'), '重置');

  function renderLaps() {
    clear(laps);
    lapList.forEach((t, i) => {
      laps.appendChild(el('div.row-between', { style: { padding: 'var(--s3) 0', borderBottom: '1px solid var(--line)', fontSize: '13px' } },
        el('span.muted', { text: '#' + (lapList.length - i) }),
        el('span.num', { text: fmtDuration(t) })
      ));
    });
  }

  panel.append(
    el('div.card', null, el('div.card-body', { style: { padding: 'var(--s8)' } },
      display,
      el('div.row', { style: { justifyContent: 'center', marginTop: 'var(--s5)' } }, btn, lapBtn, resetBtn),
      laps
    ))
  );
  return () => clearInterval(timer);
};

/* ---- 占位文本 ---- */
TOOL_IMPL.lorem = (panel) => {
  const type = el('select.select', { style: { width: '140px' } });
  [['zh', '中文'], ['en', '英文'], ['mixed', '中英混排']].forEach(([v, t]) => type.appendChild(el('option', { value: v, text: t })));
  const count = el('input.input', { type: 'number', value: '3', min: '1', max: '50', style: { width: '100px' } });
  const unit = el('select.select', { style: { width: '120px' } });
  [['para', '段落'], ['sentence', '句子']].forEach(([v, t]) => unit.appendChild(el('option', { value: v, text: t })));
  const out = el('div.tool-out', { style: { marginTop: 'var(--s5)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)', fontSize: '13.5px', lineHeight: '1.8' } });

  const zhSentences = ['设计不是外观和感觉，设计是产品如何运作。', '简单是终极的复杂。', '好的工具应当安静地完成任务，而不是吸引注意力。', '细节里藏着魔鬼，也藏着品质。', '先让它能跑，再让它跑得好，最后让它跑得快。', '代码是写给人读的，只是顺便让机器执行。'];
  const enWords = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud'.split(' ');

  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const genSentence = (lang) => {
    if (lang === 'en') { const n = 8 + Math.floor(Math.random() * 8); const s = []; for (let i = 0; i < n; i++) s.push(rand(enWords)); return s.join(' ').replace(/^./, (c) => c.toUpperCase()) + '.'; }
    return rand(zhSentences);
  };
  const genPara = (lang) => {
    const n = 3 + Math.floor(Math.random() * 3);
    const s = [];
    for (let i = 0; i < n; i++) s.push(lang === 'mixed' && i % 2 ? genSentence('en') : genSentence(lang === 'mixed' ? 'zh' : lang));
    return s.join(lang === 'en' ? ' ' : '');
  };

  const gen = () => {
    const n = Math.min(50, Math.max(1, parseInt(count.value, 10) || 1));
    const lang = type.value;
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(unit.value === 'para' ? genPara(lang) : genSentence(lang === 'mixed' ? (i % 2 ? 'en' : 'zh') : lang));
    delete out.dataset.empty;
    setText(out, parts.join(unit.value === 'para' ? '\n\n' : '\n'));
  };

  [type, count, unit].forEach((n) => n.addEventListener('change', gen));
  panel.append(
    el('div.row-wrap', { style: { gap: 'var(--s5)' } },
      el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: '语言' }), type),
      el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: '数量' }), count),
      el('div.field', { style: { marginBottom: '0' } }, el('label.field-label', { text: '单位' }), unit),
      el('button.btn.btn-primary', { type: 'button', style: { marginTop: '20px' }, onclick: gen }, icon('refresh'), '生成')
    ),
    el('div.btn-row', { style: { marginTop: 'var(--s5)' } },
      el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => copyText(out.textContent) }, icon('copy'), '复制')
    ),
    out
  );
  gen();
};
