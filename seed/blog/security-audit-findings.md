---
title: 个人网站的云盘全公开，而我以为它有鉴权
date: 2026-10-13
tags: [Cloudflare, 安全, Workers]
summary: 重写后端时翻出四个真实漏洞：云盘列表和下载接口完全不鉴权、密码哈希硬编码在公开仓库、CORS 返回星号、书签 URL 不校验协议。个人站也不是可以不管安全的地方。
---

重写后端的时候顺手审了一遍旧代码，翻出四个真问题。都是「个人站点，无所谓」心态下最容易漏的那类。

## 1. 云盘完全是公开的

旧版 `worker.js` 里，写操作有鉴权，读操作没有：

```js
// 上传、删除：有 requireAuth
async function handleDriveUpload(request, env) {
  const authErr = await requireAuth(request, env);
  if (authErr) return authErr;
  // ...
}

// 列表、下载：什么都没有
async function handleDriveList(env) {
  const files = await kvGet(env.KV, 'drive_files', []);
  return json({ files, totalSize, quota });
}
async function handleDriveDownload(env, id) {
  const obj = await env.R2.get(id);
  return new Response(obj.body, { /* ... */ });
}
```

`GET /api/drive/list` 和 `GET /api/drive/download/:id` 任何人直接请求就能拿到结果。我实测确认过：

```
GET /api/drive/list  →  200  {"files":[...],"totalSize":...}
```

云盘里当时是空的，所以没造成实际损失。但只要传过一份文件，就等于全网可读——文件 id 是 `Date.now().toString(36) + 随机串`，不是密码学安全的，而且列表接口直接把全部 id 摊开给你。

**修法**：所有 `/api/drive/*` 统一挪到鉴权之后。需要公开分享的场景单独开一条路：后端生成一次性 token 存 KV 并带 TTL，公开入口只认 token（`/f/:token`），不暴露原始路径。

## 2. 密码哈希硬编码在公开仓库

```js
const ADMIN_USER = 'kayhs';
const ADMIN_PASS_HASH = '93c3a3ad151da7504249818525c604e65c0bd21526d58c5da9f3e24e0da5e1ab';
```

仓库是 public 的，这行等于把哈希挂在网上。而且是**无盐 SHA-256**——彩虹表或者 hashcat 跑一遍就能出明文。密码要是复用过，别的账号一起遭殃。

**修法**：改读加密 Secret，源码里不留任何凭据：

```js
const credential = env.ADMIN_CREDENTIAL;   // 格式 salt$sha256(salt+password)
if (!credential) return fail('服务端未配置登录凭据', 503);
```

部署时执行一次 `wrangler secret put ADMIN_CREDENTIAL`。值可以用这个生成：

```powershell
node -e "const c=require('crypto');const s=c.randomBytes(16).toString('hex');const p=process.argv[1];console.log(s+'$'+c.createHash('sha256').update(s+p).digest('hex'))" 你的密码
```

顺手把口令比对换成定长时间比较，避免通过响应耗时推测：

```js
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

## 3. CORS 返回 `*`

```js
'Access-Control-Allow-Origin': '*',
```

任何网站都能带着用户凭据调你的 API。配合第 1 条，等于给全网开了个读写入口。

**修法**：改成白名单回显。前后端同源部署之后，其实连跨域都不需要：

```js
const ALLOWED_ORIGINS = ['https://kayhs.qzz.io', 'http://localhost:8787'];
if (origin && ALLOWED_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
```

## 4. 书签 URL 不校验协议

```js
items.push({ id: genId(), name, url, cat, icon });   // url 原样存
```

前端渲染成 `<a href="${b.url}">`。存一条 `javascript:alert(document.cookie)` 进去，点一下就执行。这是自己 XSS 自己，但配合留言板（公开可写）就不是自娱自乐了。

**修法**：后端入库前强制校验，只收 http/https：

```js
function sanitizeUrl(raw) {
  if (!/^https?:\/\//i.test(String(raw).trim())) return null;
  const u = new URL(raw.trim());
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return u.toString();
}
```

前端也一并改掉：不再用模板字符串拼 `innerHTML`，全部走 `el()` 构造 DOM，用户数据只经过 `textContent`。留言内容因此天然免疫 XSS——它压根没被当成 HTML 解析过。

## 还有两个小的

**中文文件名乱码**。旧版用 `Content-Disposition: attachment; filename="..."` 直接塞 UTF-8 文件名，多数浏览器会显示成乱码。换成 RFC 5987：

```js
`Content-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(name)}`
```

**KV 存文件列表会烂掉**。旧版把全部文件元数据塞进一个 KV key 的 JSON 数组，每上传一个文件就整体读出来改再写回去。文件一多，单次写入就越来越大；KV 又是最终一致的，并发上传会互相覆盖。新版直接把元数据写进 R2 的 `customMetadata`，文件本身即索引，没有这个问题。

## 一点感想

个人站点的常见心态是「反正没人攻击我」。但上面第 1 条和第 3 条组合起来，不需要攻击者——搜索引擎爬虫、扫段脚本、甚至你自己浏览器里另一个网站的 JS 都能读到。

免费额度不等于免费责任。R2 和 KV 都是生产级存储，放进去的东西得按生产级的标准对待。
