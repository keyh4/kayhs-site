# kayhs 个人工具站 v3

前后端同源部署在 Cloudflare Workers 上：前端是原生 HTML/CSS/JS（无框架、无构建步骤），
后端是单个 Worker，文件存 R2，结构化数据存 KV。

线上地址：https://kayhs.qzz.io

---

## 目录结构

```
kayhs-site/
├── worker.js              # 后端：全部 /api/* 路由 + 短链跳转 + 分享链接 + RSS
├── wrangler.toml          # Workers 配置：资源目录、R2/KV 绑定、路由优先级
├── package.json
├── public/                # 前端静态资源，由 Workers Assets 托管
│   ├── index.html         # 单页外壳（侧栏 + 顶栏 + 视图挂载点）
│   ├── manifest.webmanifest
│   ├── sw.js              # Service Worker：离线可用
│   ├── robots.txt
│   ├── favicon.svg / icon-192.png / icon-512.png / apple-touch-icon.png
│   ├── css/
│   │   ├── base.css       # 设计令牌、重置、排版、布局骨架
│   │   └── components.css # 组件样式（全部引用令牌，无裸色值）
│   ├── js/
│   │   ├── core.js        # el() DOM 构造、API 客户端、主题、弹窗、Toast、按需加载库
│   │   ├── app.js         # 路由、导航、命令面板(⌘K)、鉴权 UI、连通性检测
│   │   └── views/
│   │       ├── home.js        # 首页概览 + 统计
│   │       ├── drive.js       # 云盘：文件夹、预览、批量操作、分享
│   │       ├── tools.js       # 32 个工具（索引 + 实现）
│   │       ├── collections.js # 书签、短链、片段、留言板
│   │       ├── blog.js        # 博客列表、详情、Markdown 编辑器
│   │       └── settings.js    # 账号、后端探测、本地偏好
│   └── vendor/            # 自托管第三方库（不走外部 CDN）
├── seed/blog/             # 初始文章素材，用 tools/seed.js 写入 R2
└── tools/
    ├── check.js           # 部署前静态一致性检查（223 项）
    ├── gen-icons.js       # 用 Node 标准库生成 PNG 图标
    └── seed.js            # 上传初始文章到 R2
```

---

## 架构要点

### 前端不再内联在 Worker 里

v2 把整个 HTML 字符串写死在 Worker 代码中，仓库里的 `worker.js` 和线上实际运行的
代码不一致（线上 `/` 返回 HTML，仓库返回 JSON）。这意味着**直接部署仓库版本会让
前端整个消失**。

v3 改用 Workers Assets：前端是 `public/` 下的独立文件，Worker 只负责 `/api/*`。
两者解耦，重新部署 Worker 不会动到前端。

### `run_worker_first` 是必须的

`wrangler.toml` 里这一段不能删：

```toml
[assets]
directory = "./public"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*", "/s/*", "/f/*"]
```

`not_found_handling = "single-page-application"` 的作用是：资源找不到时回退到
`index.html`，让 `/drive`、`/blog/xxx` 这类前端路由刷新后仍能工作。

但它会把 `/api/ping` 也回退成 `index.html` —— 后端直接失效。
`run_worker_first` 让这些路径**跳过资源查找、直接进 Worker**。
静态资源仍由资源层直出，不消耗 Worker 的 CPU 时间（免费额度每请求仅 10ms）。

### 第三方库全部自托管

`public/vendor/` 下 10 个库，按需加载（`core.js` 的 `ensureLib`）：

| 库 | 用途 | 体积 |
|---|---|---|
| qrcodejs | 二维码生成（真实编码） | 20 KB |
| jsQR | 二维码识别 | 257 KB |
| blueimp-md5 | MD5（Web Crypto 不支持） | 3.7 KB |
| jsdiff | 文本差异（Myers 算法） | 24 KB |
| croner | Cron 解析 + 未来执行时间 | 18 KB |
| marked | Markdown 解析 | 40 KB |
| DOMPurify | HTML 消毒，防 XSS | 30 KB |
| sql-formatter | SQL 格式化 | 275 KB |
| highlight.js | 代码语法高亮 | 127 KB |
| Fuse.js | 命令面板模糊搜索 | 26 KB |

不走 jsDelivr 等外部 CDN：这些域名在中国大陆间歇性不可用。
v2 把字体挂在 `miaoda.feishu.cn`，同样属于不可控的第三方依赖，已改为系统字体栈。

体积较大的 jsQR 和 sql-formatter 只在打开对应工具时才加载。

### 路由

History API 路径式路由（`/drive`、`/tools/json`、`/blog/slug`），不是 hash 路由。
SPA 回退由 `not_found_handling` 提供。

---

## 部署

### 前置条件

- Node.js（用于 `wrangler` 与检查脚本）
- wrangler 已登录：`wrangler login`
- Cloudflare 账号下已存在：
  - R2 存储桶 `kayhs-drive`
  - KV 命名空间，ID 为 `ea4e4fc6db90456aacb3456920938ddc`
    （换账号需同步修改 `wrangler.toml`）

### 步骤

```powershell
cd kayhs-site

# 1. 部署前检查（223 项，任一失败即退出）
npm run check

# 2. 设置管理员凭据（首次部署必做，否则登录返回 503）
#    生成 salt$hash 格式的值：
node -e "const c=require('crypto');const s=c.randomBytes(16).toString('hex');const p=process.argv[1];console.log(s+'$'+c.createHash('sha256').update(s+p).digest('hex'))" 你的密码

#    把输出的整串写入 Secret（不会出现在源码或日志里）：
wrangler secret put ADMIN_CREDENTIAL

#    可选：指定管理员用户名（默认 kayhs）
wrangler secret put ADMIN_USER

# 3. 部署
wrangler deploy

# 4. 写入初始博客文章（可选，之后可在站内「写文章」维护）
npm run seed
```

### 验证

```powershell
curl.exe -sS "https://kayhs.qzz.io/api/health"      # {"status":"ok",...}
curl.exe -sS "https://kayhs.qzz.io/api/blog"        # {"posts":[...]}
curl.exe -sS "https://kayhs.qzz.io/feed.xml"        # RSS
```

浏览器打开 https://kayhs.qzz.io 应看到首页概览，右上「设置 → 后端状态」可逐个探测接口。

---

## API

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/ping` `/api/health` | 否 | 心跳 |
| POST | `/api/login` | 否 | 登录，返回 token（限流 5 次/分钟/IP） |
| POST | `/api/logout` | 否 | 注销 |
| GET | `/api/auth/check` | 否 | 会话状态 |
| GET | `/api/drive/list?path=` | **是** | 列目录（返回文件夹 + 文件 + 总用量） |
| POST | `/api/drive/upload` | **是** | 上传，multipart，字段 `file`（可多个）+ `path` |
| POST | `/api/drive/mkdir` | **是** | 新建文件夹 |
| POST | `/api/drive/move` | **是** | 移动/重命名，`{paths, dest, rename?}` |
| POST | `/api/drive/delete` | **是** | 删除，`{paths}` 或 `{path}`，支持目录递归 |
| GET | `/api/drive/raw?path=&inline=1` | **是** | 读取/下载文件 |
| POST | `/api/drive/share` | **是** | 创建限时分享链接 `{path, days}` |
| GET | `/api/drive/share` | **是** | 列出分享链接 |
| DELETE | `/api/drive/share/:token` | **是** | 撤销分享 |
| GET | `/f/:token` | 否 | 公开下载分享的文件 |
| POST | `/api/short` | **是** | 创建短链 `{url, code?, note?}` |
| GET | `/api/short/list` | **是** | 短链列表 |
| DELETE | `/api/short/:code` | **是** | 删除短链 |
| GET | `/s/:code` | 否 | 短链跳转（302） |
| GET | `/api/nav` | **是** | 书签列表 |
| POST | `/api/nav` | **是** | 添加书签 |
| DELETE | `/api/nav/:id` | **是** | 删除书签 |
| GET | `/api/snippets` | **是** | 片段列表 |
| POST | `/api/snippets` | **是** | 新建片段 |
| DELETE | `/api/snippets/:id` | **是** | 删除片段 |
| GET | `/api/guestbook` | 否 | 留言列表（公开可读，不含 IP） |
| POST | `/api/guestbook` | **是** | 发表留言（限流 3 次/分钟/IP） |
| DELETE | `/api/guestbook/:id` | **是** | 删除留言 |
| GET | `/api/blog` | 否 | 文章列表（草稿不返回） |
| GET | `/api/blog/:slug` | 否 | 文章正文（Markdown 原文） |
| POST | `/api/blog/:slug` | **是** | 新建/更新文章 |
| DELETE | `/api/blog/:slug` | **是** | 删除文章 |
| GET | `/api/stats` | **是** | 各项数量与云盘用量 |
| GET | `/feed.xml` | 否 | RSS 2.0 |

鉴权方式：`Authorization: Bearer <token>`，token 有效期 7 天，存于 KV。

---

## 数据存储

| 数据 | 位置 | Key |
|---|---|---|
| 云盘文件 | R2 | `d/<路径>`，元数据在 `customMetadata` |
| 博客文章 | R2 | `_blog/<slug>.md`，含 YAML front matter |
| 书签 | KV | `bm:<id>` |
| 短链 | KV | `short:<code>` |
| 代码片段 | KV | `snip:<id>` |
| 留言 | KV | `gb:<id>` |
| 分享链接 | KV | `share:<token>`（带 TTL） |
| 会话 | KV | `sess:<token>`（带 TTL） |
| 限流计数 | KV | `rl:<bucket>:<ip>:<minute>`（TTL 180s） |

云盘元数据直接存 R2 的 `customMetadata`，不再像 v2 那样把全部文件塞进一个
KV key 的 JSON 数组——那样每次上传都要整体读写，且 KV 是最终一致的，并发会互相覆盖。

空文件夹用 `.keep` 占位对象表示，列表接口会过滤掉它。

---

## 免费额度

| 资源 | 额度 |
|---|---|
| R2 存储 | 10 GB/月 |
| R2 出口流量 | 免费 |
| R2 A 类操作（写/列） | 100 万次/月 |
| R2 B 类操作（读） | 1000 万次/月 |
| KV 存储 | 1 GB |
| KV 读 | 10 万次/天 |
| KV 写 | 1000 次/天 |
| Worker 请求 | 10 万次/天 |
| Worker CPU | 10 ms/请求 |
| Worker 请求体 | 100 MB |

单文件上限约 100 MB（请求体硬限制，Free/Pro 不可调）。
超过需改用 R2 预签名 URL 直传，当前未实现。

注意：KV 每天只有 1000 次写入。限流计数会消耗写配额，所以只对「登录」和
「未登录的公开写入（留言）」计数，已登录的写操作不再刷 KV。

---

## 开发

```powershell
npm install          # 装 wrangler
npm run dev          # 本地开发，http://localhost:8787
npm run check        # 静态一致性检查
npm run icons        # 重新生成 PNG 图标
```

`npm run dev` 需要本地能访问 R2/KV，首次会提示授权。

### 检查脚本做了什么

`tools/check.js` 共 223 项，覆盖：

1. 文件完整性
2. `index.html` 引用的资源是否都存在
3. Service Worker 预缓存清单与实际文件一致
4. 第三方库：声明 ↔ 文件 ↔ UMD 全局名 ↔ 代码引用，四方对齐；检测误用 ESM 构建
5. 路由表 ↔ `registerView` ↔ 导航项，双向检查
6. 工具索引 ↔ 工具实现 ↔ 分类，双向检查
7. 前端调用的每个 API 路径在后端都有对应路由
8. `wrangler.toml`：资源目录、`main`、`run_worker_first` 覆盖、绑定名与 `env.*` 用法一致
9. **旧版缺陷回归**：硬编码 workers.dev 地址、外部 CDN 加载、随机数伪造二维码、
   MD5 假输出、正则拼 innerHTML、未消毒的 innerHTML、「数据存在本地」类矛盾文案、
   GitHub 占位死链
10. 脚本加载顺序、defer、`boot()` 启动时机、HTML id 与 `getElementById` 对应
11. CSS 令牌：所有 `var()` 引用的令牌均已定义；暗色主题覆盖完整；无裸色值

第 9 项是重点。v2 的问题全部属于「语法正确、界面完整、结果是假的」，
普通测试拦不住，所以把每个坑都固化成一条断言。
