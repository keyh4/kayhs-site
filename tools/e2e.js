/**
 * e2e.js — 端到端实测
 *
 * 静态检查（tools/check.js）能验证结构一致性，但验证不了运行时行为。
 * 旧版的所有假功能在语法层面都是合法的，只有真的发请求、看返回才能发现。
 *
 * 这个脚本对着 wrangler dev（http://127.0.0.1:8787）跑一遍完整链路：
 *   登录 → 上传 → 列表 → 重命名 → 分享 → 公开下载 → 短链 → 书签 →
 *   片段 → 留言 → 发文 → RSS → 权限边界 → 输入校验
 *
 * 每条断言都指向可验证的外部事实，不是「有返回就算过」。
 *
 * 用法：
 *   node tools/setup-local-auth.js   # 先生成本地凭据
 *   npx wrangler dev --local --port 8787   # 另开终端启动
 *   node tools/e2e.js
 */

const fs = require('fs');
const path = require('path');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8787';
const ROOT = path.join(__dirname, '..');

const passFile = path.join(ROOT, '.local-test-password');
if (!fs.existsSync(passFile)) {
  console.error('找不到 .local-test-password，请先运行：node tools/setup-local-auth.js');
  process.exit(1);
}
const PASSWORD = fs.readFileSync(passFile, 'utf8').trim();

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, detail) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''}`); }
function bad(name, detail) { failed++; failures.push(name + (detail ? ' — ' + detail : '')); console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''}`); }
function assert(cond, name, detail) { cond ? ok(name, detail) : bad(name, detail); }
function section(t) { console.log(`\n\x1b[1m${t}\x1b[0m`); }

async function req(method, p, { body, token, form, raw } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  let res;
  try {
    res = await fetch(BASE + p, {
      method,
      headers,
      body: payload,
      redirect: 'manual',
      // 每个请求最多等 15 秒。服务器挂起时快速失败并给出可读错误，
      // 而不是让整个测试套件静默卡住（第一版就吃过这个亏）。
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    const reason = e && e.name === 'TimeoutError' ? '请求超时（服务器无响应）' : (e && e.message) || String(e);
    throw new Error(`${method} ${p} 失败：${reason}。请确认 wrangler dev 是否仍在 ${BASE} 正常运行。`);
  }

  if (raw) return { status: res.status, headers: res.headers, text: await res.text() };
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
  return { status: res.status, headers: res.headers, json, text };
}

async function main() {
  console.log(`\n端到端测试 → ${BASE}\n` + '='.repeat(58));

  /* ---------- 0. 服务可用 ---------- */
  section('0. 服务连通');
  const health = await req('GET', '/api/health');
  assert(health.status === 200 && health.json?.status === 'ok', '健康检查返回 ok', `v${health.json?.version}`);

  /* ---------- 1. 静态资源与 SPA ---------- */
  section('1. 静态资源与前端路由');
  const home = await req('GET', '/', { raw: true });
  assert(home.status === 200 && home.text.includes('<!DOCTYPE html>'), 'GET / 返回 HTML 首页');
  assert(home.text.includes('/js/core.js') && home.text.includes('/js/views/tools.js'), '首页引用了核心脚本');

  // 关键回归：前端路由必须回退到 index.html，而不是 404 JSON
  const spa = await req('GET', '/drive', { raw: true });
  assert(spa.status === 200 && spa.text.includes('<!DOCTYPE html>'), '前端路由 /drive 回退到 index.html');

  const css = await req('GET', '/css/base.css', { raw: true });
  assert(css.status === 200 && css.text.includes('--accent'), 'CSS 正常返回且含设计令牌');

  const vendor = await req('GET', '/vendor/qrcode.min.js', { raw: true });
  assert(vendor.status === 200 && vendor.text.includes('QRCode'), '自托管库可访问');

  // 这一条是踩过坑的：/feed.xml 漏配 run_worker_first 时会返回首页 HTML
  const feed = await req('GET', '/feed.xml', { raw: true });
  assert(
    feed.status === 200 && feed.text.trimStart().startsWith('<?xml'),
    '/feed.xml 返回 XML 而非首页 HTML',
    feed.text.trimStart().startsWith('<?xml') ? 'RSS 生效' : '⚠️ 被 SPA 回退吞掉了'
  );

  /* ---------- 2. 鉴权 ---------- */
  section('2. 登录与鉴权');

  const badLogin = await req('POST', '/api/login', { body: { username: 'kayhs', password: 'wrong-password' } });
  assert(badLogin.status === 401, '错误密码被拒绝', `HTTP ${badLogin.status}`);

  const noBody = await req('POST', '/api/login', { body: {} });
  assert(noBody.status === 400, '缺少字段返回 400 而非 500');

  const login = await req('POST', '/api/login', { body: { username: 'kayhs', password: PASSWORD } });
  assert(login.status === 200 && !!login.json?.token, '正确凭据登录成功');
  const TOKEN = login.json?.token;
  if (!TOKEN) { console.error('\n拿不到 token，后续测试无法继续。'); summarize(); process.exit(1); }
  ok('取得会话 token', `${TOKEN.slice(0, 10)}…`);

  const check = await req('GET', '/api/auth/check', { token: TOKEN });
  assert(check.status === 200 && check.json?.loggedIn === true, '会话校验通过');

  const forged = await req('GET', '/api/drive/list', { token: 'aaaa1111bbbb2222cccc3333dddd4444' });
  assert(forged.status === 401, '伪造 token 被拒绝');

  const noToken = await req('GET', '/api/drive/list');
  assert(noToken.status === 401, '无 token 访问云盘被拒绝（v2 这里是 200，云盘全公开）');

  /* ---------- 3. 云盘：上传 / 列表 / 目录 / 移动 / 删除 ---------- */
  section('3. 云盘');

  const stamp = Date.now().toString(36);
  const fileName = `e2e-测试文件-${stamp}.txt`;
  const fileBody = '端到端测试内容 / e2e payload / ' + stamp;

  const form = new FormData();
  form.append('path', '');
  form.append('file', new Blob([fileBody], { type: 'text/plain' }), fileName);
  const up = await req('POST', '/api/drive/upload', { token: TOKEN, form });
  assert(up.status === 200 && up.json?.files?.[0]?.name === fileName, '上传中文名文件成功', up.json?.files?.[0]?.name);

  const list = await req('GET', '/api/drive/list', { token: TOKEN });
  const uploaded = (list.json?.files || []).find((f) => f.name === fileName);
  assert(!!uploaded, '文件出现在根目录列表');
  assert(uploaded?.size === Buffer.byteLength(fileBody), '文件大小一致', `${uploaded?.size}B`);

  // 读回内容必须逐字节相同
  const raw = await req('GET', '/api/drive/raw?path=' + encodeURIComponent(fileName), { token: TOKEN, raw: true });
  assert(raw.status === 200 && raw.text === fileBody, '下载内容与上传完全一致');

  // 中文文件名必须走 RFC 5987，否则浏览器显示乱码（v2 的问题）
  const disp = raw.headers.get('content-disposition') || '';
  assert(/filename\*=UTF-8''/.test(disp), 'Content-Disposition 用 RFC 5987 编码中文名', disp.slice(0, 60));

  // 建目录并把文件移进去
  const dir = `e2e-目录-${stamp}`;
  const mk = await req('POST', '/api/drive/mkdir', { token: TOKEN, body: { path: dir } });
  assert(mk.status === 200, '新建文件夹成功');

  const rootList = await req('GET', '/api/drive/list', { token: TOKEN });
  assert((rootList.json?.folders || []).some((f) => f.name === dir), '文件夹出现在列表');
  assert(!(rootList.json?.files || []).some((f) => f.name === '.keep'), '.keep 占位文件不暴露给用户');

  const mv = await req('POST', '/api/drive/move', { token: TOKEN, body: { paths: [fileName], dest: dir } });
  assert(mv.status === 200 && mv.json?.moved?.length === 1, '文件移入文件夹');

  const inDir = await req('GET', '/api/drive/list?path=' + encodeURIComponent(dir), { token: TOKEN });
  assert((inDir.json?.files || []).some((f) => f.name === fileName), '目标目录能读到该文件');

  const oldGone = await req('GET', '/api/drive/raw?path=' + encodeURIComponent(fileName), { token: TOKEN, raw: true });
  assert(oldGone.status === 404, '原路径已不存在（移动而非复制）');

  /* ---------- 4. 分享链接：公开只读 + 路径穿越防护 ---------- */
  section('4. 分享链接与路径安全');

  const sharedPath = dir + '/' + fileName;
  const share = await req('POST', '/api/drive/share', { token: TOKEN, body: { path: sharedPath, days: 1 } });
  assert(share.status === 200 && !!share.json?.token, '创建分享链接成功');
  const shareToken = share.json?.token;

  const publicDl = await req('GET', '/f/' + shareToken, { raw: true });
  assert(publicDl.status === 200 && publicDl.text === fileBody, '未登录也能通过分享链接下载');

  // 路径穿越：必须挡在 normalizePath，绝不能读到 _blog/ 下的东西
  const traversal = await req('GET', '/api/drive/raw?path=' + encodeURIComponent('../../_blog/x.md'), { token: TOKEN, raw: true });
  assert(traversal.status === 404 || traversal.status === 400, '路径穿越被拒绝', `HTTP ${traversal.status}`);

  const traversal2 = await req('GET', '/api/drive/list?path=' + encodeURIComponent('../'), { token: TOKEN });
  assert(traversal2.status === 200 && (traversal2.json?.path ?? '') !== undefined && !String(traversal2.json?.path).includes('..'), '目录穿越被规范化，未逃出前缀');

  const badShare = await req('GET', '/f/' + 'z'.repeat(32), { raw: true });
  assert(badShare.status === 404 || badShare.status === 400, '无效分享 token 被拒绝');

  const revoke = await req('DELETE', '/api/drive/share/' + shareToken, { token: TOKEN });
  assert(revoke.status === 200, '撤销分享成功');
  const afterRevoke = await req('GET', '/f/' + shareToken, { raw: true });
  assert(afterRevoke.status === 404, '撤销后链接立即失效');

  /* ---------- 5. 短链 ---------- */
  section('5. 短链接');

  const target = 'https://example.com/e2e?ts=' + stamp;
  const sc = await req('POST', '/api/short', { token: TOKEN, body: { url: target, note: 'e2e' } });
  assert(sc.status === 200 && /^[a-z0-9]{6}$/.test(sc.json?.code || ''), '创建短链成功', sc.json?.code);
  const code = sc.json?.code;

  // 跳转必须是 302 且 Location 指向原地址
  const redir = await req('GET', '/s/' + code, { raw: true });
  assert(redir.status === 302 || redir.status === 301, '短链返回重定向', `HTTP ${redir.status}`);
  assert(redir.headers.get('location') === target, 'Location 指向原始地址');

  const afterView = await req('GET', '/api/short/list', { token: TOKEN });
  const item = (afterView.json?.items || []).find((i) => i.code === code);
  assert(item && item.views >= 1, '访问计数已累加', `views=${item?.views}`);

  // javascript: 协议必须被拒（v2 直接存，点击即执行）
  const jsUrl = await req('POST', '/api/short', { token: TOKEN, body: { url: 'javascript:alert(1)' } });
  assert(jsUrl.status === 400, 'javascript: 协议被拒绝');

  const dataUrl = await req('POST', '/api/short', { token: TOKEN, body: { url: 'data:text/html,<script>alert(1)</scr' + 'ipt>' } });
  assert(dataUrl.status === 400, 'data: 协议被拒绝');

  const delShort = await req('DELETE', '/api/short/' + code, { token: TOKEN });
  assert(delShort.status === 200, '删除短链成功');
  const goneShort = await req('GET', '/s/' + code, { raw: true });
  assert(goneShort.status === 404, '删除后短链失效');

  /* ---------- 6. 书签 / 片段 / 留言 ---------- */
  section('6. 书签、片段、留言板');

  const bm = await req('POST', '/api/nav', { token: TOKEN, body: { name: 'E2E 书签', url: 'https://cloudflare.com', cat: '测试' } });
  assert(bm.status === 200 && !!bm.json?.id, '添加书签成功');
  const bmId = bm.json?.id;

  const bmBad = await req('POST', '/api/nav', { token: TOKEN, body: { name: 'x', url: 'javascript:alert(1)' } });
  assert(bmBad.status === 400, '书签 URL 校验拒绝 javascript: 协议');

  const bmList = await req('GET', '/api/nav', { token: TOKEN });
  assert((bmList.json?.items || []).some((i) => i.id === bmId), '书签出现在列表');
  // 公开读取书签必须被拒（v2 是公开的）
  const bmPublic = await req('GET', '/api/nav');
  assert(bmPublic.status === 401, '未登录读不到书签');

  const snip = await req('POST', '/api/snippets', { token: TOKEN, body: { title: 'E2E 片段', lang: 'javascript', code: "const a = '<img src=x onerror=alert(1)>';" } });
  assert(snip.status === 200 && !!snip.json?.id, '添加代码片段成功');
  const snipId = snip.json?.id;
  const snipList = await req('GET', '/api/snippets', { token: TOKEN });
  const snipItem = (snipList.json?.items || []).find((i) => i.id === snipId);
  assert(snipItem?.code.includes('onerror=alert(1)'), '片段内容原样保存（转义由前端 textContent 负责）');

  // 留言：读取公开，写入需登录
  const gbPublicRead = await req('GET', '/api/guestbook');
  assert(gbPublicRead.status === 200, '留言列表公开可读');

  const gbAnon = await req('POST', '/api/guestbook', { body: { name: '路人', msg: '匿名留言' } });
  assert(gbAnon.status === 401, '未登录不能发留言');

  const gb = await req('POST', '/api/guestbook', { token: TOKEN, body: { name: 'E2E', msg: '一条端到端测试留言 ' + stamp } });
  assert(gb.status === 200, '登录后发留言成功');

  const gbList = await req('GET', '/api/guestbook');
  const gbItem = (gbList.json?.items || []).find((i) => i.id === gb.json?.id);
  assert(!!gbItem && gbItem.msg.includes(stamp), '留言已入库并可读');
  assert(gbItem && !('ip' in gbItem), '对外返回的留言不含 IP 字段');

  const gbLong = await req('POST', '/api/guestbook', { token: TOKEN, body: { name: 'x', msg: 'a'.repeat(501) } });
  assert(gbLong.status === 400, '超长留言被拒绝');

  const gbXss = await req('POST', '/api/guestbook', { token: TOKEN, body: { name: 'x', msg: '<script>alert(1)</scr' + 'ipt>' } });
  assert(gbXss.status === 400, '含 script 标签的留言被过滤');

  /* ---------- 7. 博客与 RSS ---------- */
  section('7. 博客与 RSS');

  const slug = 'e2e-post-' + stamp;
  const mdBody = '# 标题\n\n正文 **粗体** 与 `代码`。\n\n- 列表项\n';
  const post = await req('POST', '/api/blog/' + slug, {
    token: TOKEN,
    body: { title: 'E2E 测试文章', slug, date: '2026-10-13', tags: ['测试'], summary: '端到端摘要', content: mdBody },
  });
  assert(post.status === 200, '发布文章成功');

  const got = await req('GET', '/api/blog/' + slug);
  assert(got.status === 200 && got.json?.title === 'E2E 测试文章', '公开读取文章成功（无需登录）');
  assert(got.json?.body?.includes('**粗体**'), '正文以 Markdown 原文返回，渲染交给前端');
  assert(Array.isArray(got.json?.tags) && got.json.tags.includes('测试'), 'front matter 的 tags 正确解析为数组');

  const posts = await req('GET', '/api/blog');
  assert((posts.json?.posts || []).some((p) => p.slug === slug), '文章出现在列表');

  const feed2 = await req('GET', '/feed.xml', { raw: true });
  assert(feed2.text.includes('<rss') && feed2.text.includes('E2E 测试文章'), 'RSS 含新文章');

  // XML 转义：标题里的特殊字符不能破坏 feed 结构
  const xssSlug = 'e2e-escape-' + stamp;
  await req('POST', '/api/blog/' + xssSlug, {
    token: TOKEN,
    body: { title: 'a<b>&c"d', content: '正文', tags: [], date: '2026-10-13' },
  });
  const feed3 = await req('GET', '/feed.xml', { raw: true });
  assert(
    feed3.text.includes('a&lt;b&gt;&amp;c&quot;d'),
    'RSS 对标题做了 XML 转义',
    feed3.text.includes('a<b>') ? '⚠️ 未转义，feed 会被破坏' : ''
  );
  assert(!/<title>a<b>/.test(feed3.text), 'feed 中不存在裸尖括号标题');

  // 草稿不应公开
  const draftSlug = 'e2e-draft-' + stamp;
  await req('POST', '/api/blog/' + draftSlug, { token: TOKEN, body: { title: '草稿', content: 'x', draft: true, date: '2026-10-13' } });
  const publicPosts = await req('GET', '/api/blog');
  assert(!(publicPosts.json?.posts || []).some((p) => p.slug === draftSlug), '草稿不出现在公开列表');
  const draftDirect = await req('GET', '/api/blog/' + draftSlug);
  assert(draftDirect.status === 200, '草稿仍可通过直链读取（仅列表隐藏）');

  // 未登录不能写文章
  const anonPost = await req('POST', '/api/blog/hack-' + stamp, { body: { title: 'x', content: 'y' } });
  assert(anonPost.status === 401, '未登录不能发布文章');

  /* ---------- 8. 输入校验与边界 ---------- */
  section('8. 输入校验');

  const noJson = await req('POST', '/api/snippets', { token: TOKEN, body: { title: '', code: '' } });
  assert(noJson.status === 400, '空标题/空代码被拒绝');

  const bigSnippet = await req('POST', '/api/snippets', { token: TOKEN, body: { title: 'x', code: 'a'.repeat(200001) } });
  assert(bigSnippet.status === 413 || bigSnippet.status === 400, '超大片段被拒绝', `HTTP ${bigSnippet.status}`);

  const badSlug = await req('GET', '/api/blog/' + encodeURIComponent('../../etc/passwd'));
  assert(badSlug.status === 404 || badSlug.status === 400, '非法 slug 被拒绝');

  const delMissing = await req('POST', '/api/drive/delete', { token: TOKEN, body: { path: 'not-exist-' + stamp } });
  assert(delMissing.status === 404 || delMissing.status === 400, '删除不存在的文件返回 4xx 而非 500');

  // 未知 API：鉴权在路由匹配之前，未登录一律 401。
  // 这是刻意的——不通过 401/404 的差异泄露「哪些接口存在」，避免被探测枚举。
  const apiAnon = await req('GET', '/api/nope');
  assert(apiAnon.status === 401, '未登录访问未知 API 返回 401（不泄露接口是否存在）');
  assert(apiAnon.headers.get('content-type')?.includes('json'), '未知 API 返回 JSON 而非 HTML');

  const apiAuth = await req('GET', '/api/nope', { token: TOKEN });
  assert(apiAuth.status === 404 && !!apiAuth.json?.error, '登录后访问未知 API 返回 JSON 404');

  /* ---------- 9. 清理 ---------- */
  section('9. 清理测试数据');

  const delFile = await req('POST', '/api/drive/delete', { token: TOKEN, body: { path: dir } });
  assert(delFile.status === 200, '删除测试目录（含其中文件）');

  const delBm = await req('DELETE', '/api/nav/' + bmId, { token: TOKEN });
  assert(delBm.status === 200, '删除测试书签');

  const delSnip = await req('DELETE', '/api/snippets/' + snipId, { token: TOKEN });
  assert(delSnip.status === 200, '删除测试片段');

  if (gbItem) { const r = await req('DELETE', '/api/guestbook/' + gbItem.id, { token: TOKEN }); assert(r.status === 200, '删除测试留言'); }

  for (const s of [slug, xssSlug, draftSlug]) {
    const r = await req('DELETE', '/api/blog/' + s, { token: TOKEN });
    assert(r.status === 200, '删除测试文章 ' + s);
  }

  const finalList = await req('GET', '/api/drive/list', { token: TOKEN });
  assert(
    !(finalList.json?.files || []).some((f) => String(f.name).startsWith('e2e-')) &&
    !(finalList.json?.folders || []).some((f) => String(f.name).startsWith('e2e-')),
    '云盘已恢复干净'
  );

  // 登出后 token 必须立即失效
  await req('POST', '/api/logout', { token: TOKEN });
  const afterLogout = await req('GET', '/api/drive/list', { token: TOKEN });
  assert(afterLogout.status === 401, '登出后 token 立即失效');

  summarize();
}

function summarize() {
  console.log('\n' + '='.repeat(58));
  if (failed === 0) {
    console.log(`\x1b[32m\x1b[1m端到端全部通过\x1b[0m — ${passed} 项断言`);
  } else {
    console.log(`\x1b[31m\x1b[1m${failed} 项失败\x1b[0m / 共 ${passed + failed} 项断言`);
    console.log('\n失败明细：');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }
  console.log('='.repeat(58) + '\n');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n测试执行异常：' + (e && e.message));
  if (e && e.cause) console.error('  cause: ' + JSON.stringify(e.cause));
  console.error('\n请确认 wrangler dev 已在 ' + BASE + ' 运行。');
  process.exit(1);
});
