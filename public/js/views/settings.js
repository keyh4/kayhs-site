/**
 * views/settings.js — 设置：账号、后端状态、本地偏好、关于
 *
 * 旧版这里要求用户手动填 API 地址，而默认值又指向一个大陆访问不了的
 * workers.dev 域名，导致所有云端功能失效。现在前后端同源，无需配置地址，
 * 这一页改成展示真实状态与本地偏好。
 */

registerView('settings', async (ctx) => {
  const { setTitle, signal, navigate } = ctx;
  setTitle('设置', '');
  const root = el('div');

  root.appendChild(el('div.page-head', null,
    el('h1', { text: '设置' }),
    el('p.page-desc', { text: '账号状态、后端健康、本地偏好与站点信息。' })
  ));

  /* ---------- 账号 ---------- */
  const accountCard = el('div.card', { style: { marginBottom: 'var(--s6)' } });
  accountCard.appendChild(el('div.card-head', null, icon('user'), el('h3', { text: '账号' })));
  const accountBody = el('div.card-body');
  accountCard.appendChild(accountBody);
  root.appendChild(accountCard);

  function renderAccount() {
    clear(accountBody);
    if (Auth.loggedIn && Auth.user) {
      accountBody.append(
        el('div.setting-row', null,
          el('div.setting-info', null,
            el('div.setting-name', { text: '当前登录：' + Auth.user.username }),
            el('div.setting-desc', {
              text: Auth.user.expiresAt
                ? '会话将于 ' + fmtDateTime(Auth.user.expiresAt) + ' 过期（' + fmtAgo(Auth.user.expiresAt).replace('前', '后') + '）'
                : '已登录',
            })
          ),
          el('div.setting-ctl', null,
            el('button.btn.btn-danger', { type: 'button', onclick: async () => {
              const ok = await confirmModal({ title: '退出登录', message: '退出后云端功能将不可写。', okLabel: '退出' });
              if (!ok) return;
              await Auth.logout();
              toast('已退出登录', 'ok');
              if (typeof updateAuthUI === 'function') updateAuthUI();
              renderAccount();
              navigate(location.pathname, { replace: true });
            } }, icon('logout'), '退出登录')
          )
        )
      );
    } else {
      accountBody.append(
        el('div.setting-row', null,
          el('div.setting-info', null,
            el('div.setting-name', { text: '未登录' }),
            el('div.setting-desc', { text: '云盘、书签、短链、代码片段的读写，以及发文与删留言，都需要登录。工具箱与博客阅读无需登录。' })
          ),
          el('div.setting-ctl', null,
            el('button.btn.btn-primary', { type: 'button', onclick: () => openLoginModal(() => { renderAccount(); navigate(location.pathname, { replace: true }); }) }, icon('user'), '登录')
          )
        )
      );
    }
  }
  renderAccount();

  /* ---------- 后端状态 ---------- */
  const apiCard = el('div.card', { style: { marginBottom: 'var(--s6)' } });
  apiCard.appendChild(el('div.card-head', null, icon('terminal'), el('h3', { text: '后端状态' }),
    el('div.spacer', { style: { flex: '1' } }),
    el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => probe() }, icon('refresh'), '重新检测')));
  const apiBody = el('div.card-body');
  apiCard.appendChild(apiBody);
  root.appendChild(apiCard);

  const CHECKS = [
    { name: 'API 心跳', path: '/api/ping', auth: false },
    { name: '云盘列表', path: '/api/drive/list', auth: true },
    { name: '书签', path: '/api/nav', auth: true },
    { name: '短链', path: '/api/short/list', auth: true },
    { name: '代码片段', path: '/api/snippets', auth: true },
    { name: '留言板', path: '/api/guestbook', auth: false },
    { name: '博客', path: '/api/blog', auth: false },
    { name: '统计', path: '/api/stats', auth: true },
  ];

  async function probe() {
    clear(apiBody);
    const rows = [];
    const table = el('div.table-wrap', null,
      el('table.table', null,
        el('thead', null, el('tr', null,
          el('th', { text: '接口' }), el('th', { text: '路径' }),
          el('th', { text: '状态' }), el('th.num', { text: '耗时' })
        )),
        el('tbody')
      )
    );
    const tbody = table.querySelector('tbody');
    apiBody.appendChild(table);

    for (const c of CHECKS) {
      const statusCell = el('td', null, el('span.spinner'));
      const timeCell = el('td.num.muted', { text: '—' });
      const row = el('tr', null,
        el('td', { text: c.name }),
        el('td.mono.small.muted', { text: c.path }),
        statusCell, timeCell
      );
      tbody.appendChild(row);

      // 需要登录且当前未登录的，直接标记为跳过，不发请求
      if (c.auth && !Auth.loggedIn) {
        clear(statusCell);
        statusCell.appendChild(el('span.tag', { text: '需登录' }));
        continue;
      }

      const t0 = performance.now();
      try {
        await api(c.path, { signal });
        const dt = Math.round(performance.now() - t0);
        clear(statusCell);
        statusCell.appendChild(el('span.tag.tag-ok', { text: '正常' }));
        setText(timeCell, dt + ' ms');
      } catch (e) {
        if (e.name === 'AbortError') return;
        const dt = Math.round(performance.now() - t0);
        clear(statusCell);
        const label = e.status === 401 ? '未授权' : e.status === 404 ? '不存在' : e.status === 0 ? '无法连接' : 'HTTP ' + e.status;
        statusCell.appendChild(el('span.tag' + (e.status === 401 ? '.tag-warn' : '.tag-danger'), { text: label }));
        setText(timeCell, dt + ' ms');
        rows.push(c.name + '：' + label);
      }
    }

    apiBody.appendChild(el('div.tool-note', { style: { marginTop: 'var(--s5)' } },
      icon('info'),
      el('span', { text: rows.length
        ? '有 ' + rows.length + ' 个接口异常（' + rows.join('；') + '）。'
        : '所有接口均正常。前后端同源部署，无需配置 API 地址。' })
    ));
  }
  probe();

  /* ---------- 本地偏好 ---------- */
  const prefCard = el('div.card', { style: { marginBottom: 'var(--s6)' } });
  prefCard.appendChild(el('div.card-head', null, icon('settings'), el('h3', { text: '本地偏好' })));
  const prefBody = el('div.card-body');
  prefCard.appendChild(prefBody);
  root.appendChild(prefCard);

  // 主题
  const themeSel = el('select.select', { style: { width: '160px' } });
  [['', '跟随系统'], ['light', '浅色'], ['dark', '深色']].forEach(([v, t]) => themeSel.appendChild(el('option', { value: v, text: t })));
  themeSel.value = Store.getPref('themeChoice', '') || getStoredTheme() || '';
  if (getStoredTheme()) themeSel.value = getStoredTheme();
  themeSel.addEventListener('change', () => {
    const v = themeSel.value;
    if (!v) {
      try { localStorage.removeItem(THEME_KEY); } catch {}
      Store.setPref('themeChoice', '');
      applyTheme(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } else {
      Store.setPref('themeChoice', v);
      applyTheme(v);
      try { localStorage.setItem(THEME_KEY, v); } catch {}
    }
    toast('主题已更新', 'ok', 1400);
  });

  prefBody.append(
    el('div.setting-row', null,
      el('div.setting-info', null,
        el('div.setting-name', { text: '外观主题' }),
        el('div.setting-desc', { text: '跟随系统会随操作系统自动切换明暗。' })
      ),
      el('div.setting-ctl', null, themeSel)
    )
  );

  // 云盘排序偏好
  const sortKeySel = el('select.select', { style: { width: '160px' } });
  [['name', '名称'], ['size', '大小'], ['createdAt', '上传时间']].forEach(([v, t]) => sortKeySel.appendChild(el('option', { value: v, text: t })));
  sortKeySel.value = Store.getPref('drive.sortKey', 'name');
  const sortDirSel = el('select.select', { style: { width: '120px' } });
  [['1', '升序'], ['-1', '降序']].forEach(([v, t]) => sortDirSel.appendChild(el('option', { value: v, text: t })));
  sortDirSel.value = String(Store.getPref('drive.sortDir', 1));
  const saveSort = () => { Store.setPref('drive.sortKey', sortKeySel.value); Store.setPref('drive.sortDir', parseInt(sortDirSel.value, 10)); toast('已保存', 'ok', 1400); };
  sortKeySel.addEventListener('change', saveSort);
  sortDirSel.addEventListener('change', saveSort);

  prefBody.append(
    el('div.setting-row', null,
      el('div.setting-info', null,
        el('div.setting-name', { text: '云盘默认排序' }),
        el('div.setting-desc', { text: '进入云盘时按此规则排列文件。' })
      ),
      el('div.setting-ctl', null, el('div.row', null, sortKeySel, sortDirSel))
    )
  );

  // 本地数据管理
  prefBody.append(
    el('div.setting-row', null,
      el('div.setting-info', null,
        el('div.setting-name', { text: '清除本地数据' }),
        el('div.setting-desc', { text: '删除保存在浏览器里的登录令牌与偏好设置。云端数据不受影响。' })
      ),
      el('div.setting-ctl', null,
        el('button.btn.btn-danger', { type: 'button', onclick: async () => {
          const ok = await confirmModal({
            title: '清除本地数据', danger: true, okLabel: '清除',
            message: '将退出登录并重置所有本地偏好。',
            detail: '云盘文件、书签、短链、片段、文章都存在服务端，不会受影响。',
          });
          if (!ok) return;
          try {
            const keys = Object.keys(localStorage).filter((k) => k.startsWith('kayhs.'));
            keys.forEach((k) => localStorage.removeItem(k));
          } catch {}
          Auth.user = null;
          toast('已清除 ' + '本地数据', 'ok');
          if (typeof updateAuthUI === 'function') updateAuthUI();
          navigate('/', { replace: true });
        } }, icon('trash'), '清除')
      )
    )
  );

  /* ---------- 关于 ---------- */
  const aboutCard = el('div.card');
  aboutCard.appendChild(el('div.card-head', null, icon('info'), el('h3', { text: '关于这个站点' })));
  const aboutBody = el('div.card-body.prose');
  aboutCard.appendChild(aboutBody);
  root.appendChild(aboutCard);

  aboutBody.append(
    el('p', null, '这是一个个人工具站，前后端同源部署在 Cloudflare Workers 上。'),
    el('h3', { text: '架构' }),
    el('ul', null,
      el('li', null, '前端：原生 HTML / CSS / JavaScript，无框架、无构建步骤。静态资源由 Workers Assets 托管。'),
      el('li', null, '后端：单个 Cloudflare Worker，提供 ', el('code', { text: '/api/*' }), ' 接口与短链跳转。'),
      el('li', null, '文件：Cloudflare R2（免费额度 10 GB，出站流量不计费）。'),
      el('li', null, '结构化数据：Cloudflare KV（书签、短链、片段、留言、会话、限流计数）。'),
      el('li', null, '文章：Markdown 原文存在 R2 的 ', el('code', { text: '_blog/' }), ' 前缀下。'),
      el('li', null, '域名：DigitalPlat 的免费二级域名，DNS 托管在 Cloudflare。')
    ),
    el('h3', { text: '第三方库' }),
    el('p', null, '全部自托管在 ', el('code', { text: '/vendor/' }), '，按需加载，不依赖外部 CDN：'),
    el('ul', null,
      el('li', null, el('code', { text: 'marked' }), ' + ', el('code', { text: 'DOMPurify' }), ' — Markdown 渲染与 HTML 消毒'),
      el('li', null, el('code', { text: 'qrcodejs' }), ' / ', el('code', { text: 'jsQR' }), ' — 二维码生成与识别'),
      el('li', null, el('code', { text: 'blueimp-md5' }), ' — MD5（Web Crypto 不支持）'),
      el('li', null, el('code', { text: 'jsdiff' }), ' — 文本差异对比'),
      el('li', null, el('code', { text: 'croner' }), ' — Cron 表达式解析与执行时间计算'),
      el('li', null, el('code', { text: 'sql-formatter' }), ' — SQL 格式化'),
      el('li', null, el('code', { text: 'highlight.js' }), ' — 代码语法高亮'),
      el('li', null, el('code', { text: 'Fuse.js' }), ' — 命令面板模糊搜索')
    ),
    el('h3', { text: '数据说明' }),
    el('p', null, '工具箱的全部计算都在浏览器本地完成，输入内容不会发送到服务器。云盘、书签、短链、片段、留言与文章存在 Cloudflare，登录后可跨设备访问。'),
    el('p', null, el('a', { href: 'https://github.com/keyh4/kayhs-site', target: '_blank', rel: 'noopener noreferrer', text: '查看源码 →' }))
  );

  return { node: root };
});
