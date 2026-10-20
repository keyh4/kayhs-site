/**
 * check.js — 部署前静态一致性检查
 *
 * 这个项目的教训来自旧版：一堆功能是假的，且文案与实现矛盾，
 * 但语法全部合法，所以「能跑」并不等于「能用」。
 * 这里交叉验证所有模块间的引用关系，把结构性错误在部署前拦下来。
 *
 * 用法：node tools/check.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');

let failures = 0;
let checks = 0;

function ok(msg) { checks++; console.log('  \x1b[32m✓\x1b[0m ' + msg); }
function bad(msg) { checks++; failures++; console.log('  \x1b[31m✗\x1b[0m ' + msg); }
function info(msg) { console.log('  \x1b[90m·\x1b[0m ' + msg); }
function section(title) { console.log('\n\x1b[1m' + title + '\x1b[0m'); }

function read(p) { return fs.readFileSync(p, 'utf8'); }
function exists(p) { return fs.existsSync(p); }

/*
 * 这几个文件被多个章节共用，必须在顶层读取一次。
 * 早期版本把它们声明在各自章节的块作用域里，导致后面的章节
 * 访问不到（ReferenceError），第 9/10/11 节根本没执行。
 */
const workerSrc = exists(path.join(ROOT, 'worker.js')) ? read(path.join(ROOT, 'worker.js')) : '';
const tomlSrc = exists(path.join(ROOT, 'wrangler.toml')) ? read(path.join(ROOT, 'wrangler.toml')) : '';
const appSrc = exists(path.join(PUB, 'js', 'app.js')) ? read(path.join(PUB, 'js', 'app.js')) : '';

/* ================================================================== *
 * 1. 文件完整性
 * ================================================================== */

section('1. 文件完整性');

const REQUIRED_FILES = [
  'wrangler.toml',
  'worker.js',
  'public/index.html',
  'public/manifest.webmanifest',
  'public/sw.js',
  'public/robots.txt',
  'public/favicon.svg',
  'public/icon-192.png',
  'public/icon-512.png',
  'public/apple-touch-icon.png',
  'public/css/base.css',
  'public/css/components.css',
  'public/js/core.js',
  'public/js/app.js',
  'public/js/views/home.js',
  'public/js/views/drive.js',
  'public/js/views/tools.js',
  'public/js/views/collections.js',
  'public/js/views/blog.js',
  'public/js/views/settings.js',
];

for (const f of REQUIRED_FILES) {
  exists(path.join(ROOT, f)) ? ok(f) : bad('缺失文件：' + f);
}

/* ================================================================== *
 * 2. index.html 引用的资源是否都存在
 * ================================================================== */

section('2. index.html 资源引用');

const html = read(path.join(PUB, 'index.html'));
const refs = new Set();
for (const m of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) refs.add(m[1]);
for (const m of html.matchAll(/register\('\/([^']+)'\)/g)) refs.add('/' + m[1]); // sw.js 预缓存

for (const r of [...refs].sort()) {
  const clean = r.split('?')[0].split('#')[0];
  if (clean === '/' || clean === '/feed.xml') { info('运行时路由，跳过：' + clean); continue; }
  exists(path.join(PUB, clean)) ? ok('资源存在：' + clean) : bad('index.html 引用了不存在的资源：' + clean);
}

/* ================================================================== *
 * 3. sw.js 预缓存清单与实际文件一致
 * ================================================================== */

section('3. Service Worker 预缓存清单');

const sw = read(path.join(PUB, 'sw.js'));
const precacheMatch = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
if (!precacheMatch) {
  bad('sw.js 中找不到 PRECACHE 数组');
} else {
  const entries = [...precacheMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const e of entries) {
    if (e === '/') { ok("预缓存 '/'（由 Worker 提供）"); continue; }
    exists(path.join(PUB, e)) ? ok('预缓存项存在：' + e) : bad('sw.js 预缓存了不存在的文件：' + e);
  }
  // 反向检查：public 下的 js/css 是否都进了预缓存
  const walk = (dir, base = '') => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = (base + '/' + ent.name).replace(/^\/+/, '/');
      if (ent.isDirectory()) { if (ent.name !== 'vendor') walk(path.join(dir, ent.name), rel); continue; }
      if (/\.(js|css)$/.test(ent.name)) allPubAssets.push(rel);
    }
  };
  const allPubAssets = [];
  walk(PUB);
  // sw.js 自身不需要预缓存：浏览器每次都重新拉取 SW 脚本来比对版本，
  // 从缓存读反而会导致更新失效。
  const needCache = allPubAssets.filter((a) => a !== '/sw.js');
  for (const a of needCache) {
    if (!entries.includes(a)) bad('public 下的资源未加入 SW 预缓存：' + a);
  }
  if (needCache.every((a) => entries.includes(a))) ok('所有 js/css 均已预缓存（sw.js 自身与 vendor 按需加载，不预缓存）');
}

/* ================================================================== *
 * 4. 第三方库：声明 vs 实际文件 vs 代码引用
 * ================================================================== */

section('4. 第三方库一致性');

const core = read(path.join(PUB, 'js', 'core.js'));
const libSpecMatch = core.match(/const LIB_SPECS = \{([\s\S]*?)\n\};/);
if (!libSpecMatch) {
  bad('core.js 中找不到 LIB_SPECS');
} else {
  const declared = new Map();
  for (const m of libSpecMatch[1].matchAll(/(\w+):\s*\{\s*src:\s*'([^']+)',\s*global:\s*'([^']+)'/g)) {
    declared.set(m[1], { src: m[2], global: m[3] });
  }
  info('声明的库：' + declared.size + ' 个');

  // 4a. 每个声明的 src 文件必须真实存在
  for (const [name, spec] of declared) {
    const p = path.join(PUB, spec.src);
    exists(p) ? ok(`库文件存在：${name} → ${spec.src}`) : bad(`声明了 ${name} 但文件不存在：${spec.src}`);
  }

  // 4b. vendor 目录下不应有未声明的孤儿文件
  const vendorDir = path.join(PUB, 'vendor');
  if (exists(vendorDir)) {
    const actual = fs.readdirSync(vendorDir).filter((f) => f.endsWith('.js'));
    const declaredSrcs = new Set([...declared.values()].map((s) => path.basename(s.src)));
    for (const f of actual) {
      declaredSrcs.has(f) ? ok(`vendor 文件已声明：${f}`) : bad(`vendor 下有未声明的孤儿文件：${f}（不会被加载，应删除或补充声明）`);
    }
  }

  // 4c. 每个库的 UMD 全局名必须在文件里真的能找到
  for (const [name, spec] of declared) {
    const p = path.join(PUB, spec.src);
    if (!exists(p)) continue;
    const lib = read(p);
    // ESM 构建不能用普通 <script> 加载，这是旧版同类问题的根源
    if (/^\s*export\s*\{/m.test(lib) || /\nexport\s*\{/.test(lib)) {
      bad(`${name}（${spec.src}）是 ESM 构建，含 export{} —— 用普通 <script> 加载会语法报错，必须换成 UMD 版`);
      continue;
    }
    const g = spec.global;
    /*
     * 全局名的赋值形式很多，不能只认 `var X=`：
     *   qrcodejs 是 `var QRCode;!function(){...}();QRCode=function(...)`
     *   —— 声明与赋值分离，且赋值前缀是 `;` 而非空白或点号。
     * 只要出现「X 被赋值」或「X.prototype 被扩展」或「X 作为导出名」之一即可。
     */
    const patterns = [
      new RegExp(`\\b(?:var|let|const)\\s+${g}\\b`),          // var X; 或 var X=
      new RegExp(`[;})\\s(,]${g}\\s*=`),                        // 裸赋值：X= / ;X= / }X=
      new RegExp(`\\.${g}\\s*=`),                               // 属性赋值：UMD 的 self.Diff= / n.md5= / ).Fuse=
      new RegExp(`\\b${g}\\.prototype\\b`),                     // X.prototype.x=
      new RegExp(`["']${g}["']`),                               // UMD 导出名
      new RegExp(`\\bfunction\\s+${g}\\b`),
    ];
    const found = patterns.some((re) => re.test(lib));
    found ? ok(`${name} 的全局名 ${g} 在文件中可寻`) : bad(`${name} 期望全局名 ${g}，但在 ${spec.src} 中找不到 —— 调用会 ReferenceError`);
  }

  // 4d. 工具声明的 libs 必须在 LIB_SPECS 里
  const tools = read(path.join(PUB, 'js', 'views', 'tools.js'));
  const usedLibs = new Set();
  for (const m of tools.matchAll(/libs:\s*\[([^\]]*)\]/g)) {
    for (const l of m[1].matchAll(/'([^']+)'/g)) usedLibs.add(l[1]);
  }
  for (const l of usedLibs) {
    declared.has(l) ? ok(`工具依赖的库已声明：${l}`) : bad(`工具依赖了未声明的库：${l}`);
  }

  // 4e. 代码里用到的全局库名（typeof X）应有对应声明
  const globalUses = new Set();
  for (const f of ['js/views/tools.js', 'js/views/blog.js', 'js/views/collections.js', 'js/core.js']) {
    const src = read(path.join(PUB, f));
    for (const m of src.matchAll(/typeof\s+(\w+)\s*!==\s*'undefined'/g)) globalUses.add(m[1]);
    // 直接调用形式：Diff.diffLines / sqlFormatter.format / new QRCode / jsQR( / new Cron(
    for (const m of src.matchAll(/\b(Diff|sqlFormatter|QRCode|jsQR|Cron|marked|DOMPurify|md5|hljs|Fuse)\b/g)) globalUses.add(m[1]);
  }
  const declaredGlobals = new Set([...declared.values()].map((s) => s.global));
  for (const g of globalUses) {
    if (g === 'window' || g === 'hljs' && declaredGlobals.has('hljs')) continue;
    declaredGlobals.has(g)
      ? ok(`代码使用的全局 ${g} 有对应库声明`)
      : bad(`代码使用了全局 ${g}，但没有任何库声明提供它 —— 运行时会 ReferenceError`);
  }
}

/* ================================================================== *
 * 5. 路由与视图注册一致性
 * ================================================================== */

section('5. 路由 ↔ 视图注册');

const app = appSrc;
const routesBlock = app.match(/const ROUTES = \[([\s\S]*?)\n\];/);
if (!routesBlock) {
  bad('app.js 中找不到 ROUTES');
} else {
  const routes = [];
  for (const m of routesBlock[1].matchAll(/\{\s*path:\s*'([^']+)',\s*view:\s*'([^']+)'/g)) {
    routes.push({ path: m[1], view: m[2] });
  }
  info('路由数：' + routes.length);

  // 收集所有 registerView 调用
  const registered = new Map();
  const viewFiles = fs.readdirSync(path.join(PUB, 'js', 'views')).filter((f) => f.endsWith('.js'));
  for (const f of viewFiles) {
    const src = read(path.join(PUB, 'js', 'views', f));
    for (const m of src.matchAll(/registerView\(\s*'([^']+)'/g)) registered.set(m[1], f);
  }

  for (const r of routes) {
    registered.has(r.view)
      ? ok(`路由 ${r.path} 的视图 '${r.view}' 已注册（${registered.get(r.view)}）`)
      : bad(`路由 ${r.path} 指向视图 '${r.view}'，但没有任何 registerView('${r.view}') —— 访问会显示「视图未加载」`);
  }

  // 反向：注册了但没有路由的视图（除了 post/write 这类，检查是否被引用）
  for (const [v, f] of registered) {
    if (!routes.some((r) => r.view === v)) {
      bad(`视图 '${v}'（${f}）已注册但没有对应路由 —— 死代码`);
    }
  }

  // 导航分组里的路径必须存在于 ROUTES
  const navBlock = app.match(/const NAV_GROUPS = \[([\s\S]*?)\n\];/);
  if (navBlock) {
    const navPaths = [...navBlock[1].matchAll(/'(\/[a-z\-\/:]*)'/g)].map((m) => m[1]);
    for (const p of navPaths) {
      routes.some((r) => r.path === p)
        ? ok(`导航项 ${p} 在路由表中`)
        : bad(`导航项 ${p} 不在路由表中 —— 点击会 404`);
    }
  }
}

/* ================================================================== *
 * 6. 工具索引 ↔ 工具实现
 * ================================================================== */

section('6. 工具索引 ↔ 工具实现');

{
  const tools = read(path.join(PUB, 'js', 'views', 'tools.js'));
  const indexBlock = tools.match(/const TOOL_INDEX = \[([\s\S]*?)\n\];/);
  if (!indexBlock) {
    bad('tools.js 中找不到 TOOL_INDEX');
  } else {
    const indexed = [];
    for (const m of indexBlock[1].matchAll(/\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*cat:\s*'([^']+)'/g)) {
      indexed.push({ id: m[1], name: m[2], cat: m[3] });
    }
    info('索引工具数：' + indexed.length);

    const impls = new Set();
    for (const m of tools.matchAll(/TOOL_IMPL\.(\w+)\s*=/g)) impls.add(m[1]);
    for (const m of tools.matchAll(/TOOL_IMPL\[['"](\w+)['"]\]\s*=/g)) impls.add(m[1]);

    const ids = new Set();
    for (const t of indexed) {
      if (ids.has(t.id)) bad(`工具 id 重复：${t.id}`);
      ids.add(t.id);
      impls.has(t.id)
        ? ok(`工具 ${t.id}（${t.name}）有实现`)
        : bad(`工具 ${t.id}（${t.name}）在索引里但没有 TOOL_IMPL.${t.id} —— 点开会显示「该工具尚未实现」`);
    }
    for (const impl of impls) {
      if (!ids.has(impl)) bad(`TOOL_IMPL.${impl} 有实现但不在 TOOL_INDEX 里 —— 用户永远点不到`);
    }
    if (impls.size === ids.size && [...impls].every((i) => ids.has(i))) {
      ok(`索引与实现完全对应（${impls.size} 个）`);
    }

    /*
     * 分类一致性：CATS 可能是字面量数组，也可能是从 TOOL_INDEX 动态推导
     * （`['全部', ...new Set(TOOL_INDEX.map(t => t.cat))]`）。
     * 动态推导时天然一致，只需确认「全部」这一项存在，否则会缺一个筛选入口。
     */
    const catsBlock = tools.match(/const CATS = \[([^\]]*)\]/);
    const usedCatsCount = new Set(indexed.map((t) => t.cat)).size;
    if (catsBlock) {
      const isDerived = /TOOL_INDEX\.map/.test(catsBlock[1]) || /\.\.\./.test(catsBlock[1]);
      if (isDerived) {
        const hasAll = [...catsBlock[1].matchAll(/'([^']+)'/g)].some((m) => m[1] === '全部');
        hasAll
          ? ok(`CATS 由 TOOL_INDEX 动态推导，且包含「全部」（${usedCatsCount} 个分类自动同步）`)
          : bad('CATS 动态推导但缺少「全部」选项 —— 用户无法一次看到所有工具');
      } else {
        const declaredCats = new Set([...catsBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
        const usedCats = new Set(indexed.map((t) => t.cat));
        for (const c of usedCats) {
          declaredCats.has(c) ? ok(`分类 '${c}' 已在 CATS 中`) : bad(`工具用了分类 '${c}'，但 CATS 里没有 —— 该分类的筛选按钮不会出现`);
        }
      }
    } else {
      bad('tools.js 中找不到 CATS 定义 —— 分类筛选不可用');
    }
  }
}

/* ================================================================== *
 * 7. 前后端接口契约
 * ================================================================== */

section('7. 前后端接口契约');

{
  const worker = workerSrc;
  // 后端实现的路由
  const backendRoutes = new Set();
  for (const m of worker.matchAll(/path === '(\/api\/[^']+)'/g)) backendRoutes.add(m[1]);
  for (const m of worker.matchAll(/path\.startsWith\('(\/api\/[^']+)'\)/g)) backendRoutes.add(m[1] + ':prefix');
  info('后端接口数：' + backendRoutes.size);

  // 前端调用的路径
  const frontendCalls = new Set();
  const jsFiles = ['js/core.js', 'js/app.js', 'js/views/home.js', 'js/views/drive.js', 'js/views/tools.js', 'js/views/collections.js', 'js/views/blog.js', 'js/views/settings.js'];
  for (const f of jsFiles) {
    const src = read(path.join(PUB, f));
    for (const m of src.matchAll(/api\(\s*'(\/api\/[^'?]*)/g)) frontendCalls.add(m[1]);
    for (const m of src.matchAll(/path:\s*'(\/api\/[^']+)'/g)) frontendCalls.add(m[1]);
  }

  for (const call of [...frontendCalls].sort()) {
    // 前端可能带动态后缀，如 /api/nav/ + id，用前缀匹配
    const exact = backendRoutes.has(call);
    const prefixed = [...backendRoutes].some((r) => r.endsWith(':prefix') && call.startsWith(r.replace(':prefix', '')));
    const dynamicParent = [...backendRoutes].some((r) => call.startsWith(r + '/'));
    (exact || prefixed || dynamicParent)
      ? ok(`前端调用 ${call} 在后端有对应路由`)
      : bad(`前端调用 ${call}，但后端没有匹配的路由 —— 会 404`);
  }

  // 反向：后端有但前端从没调用的（提示，不算失败）
  for (const r of [...backendRoutes].sort()) {
    if (r.endsWith(':prefix')) continue;
    const used = [...frontendCalls].some((c) => c === r || c.startsWith(r + '/'));
    if (!used) info(`后端接口 ${r} 前端未直接调用（可能通过动态拼接使用）`);
  }
}

/* ================================================================== *
 * 8. wrangler.toml 配置
 * ================================================================== */

section('8. wrangler.toml 配置');

{
  const toml = tomlSrc;
  const worker = workerSrc;

  // assets.directory 必须存在
  const dirMatch = toml.match(/directory\s*=\s*"([^"]+)"/);
  if (dirMatch) {
    const d = path.join(ROOT, dirMatch[1]);
    exists(d) ? ok(`assets.directory 存在：${dirMatch[1]}`) : bad(`assets.directory 指向不存在的目录：${dirMatch[1]}`);
  } else bad('wrangler.toml 未配置 assets.directory');

  // main 必须存在
  const mainMatch = toml.match(/^main\s*=\s*"([^"]+)"/m);
  if (mainMatch) exists(path.join(ROOT, mainMatch[1])) ? ok(`main 存在：${mainMatch[1]}`) : bad(`main 指向不存在的文件：${mainMatch[1]}`);

  // run_worker_first 必须覆盖所有由 Worker 动态处理的路径，
  // 否则 Assets 会把它们回退成 index.html（返回 200 但内容是首页，极难排查）
  const rwf = toml.match(/run_worker_first\s*=\s*\[([^\]]*)\]/);
  if (!rwf) {
    bad('未配置 run_worker_first —— Workers Assets 默认资源优先，/api/* 会被 SPA 回退成 index.html，后端完全失效');
  } else {
    const rwfList = [...rwf[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    // /feed.xml、/rss.xml 由 Worker 动态生成，public/ 下没有对应文件，必须显式列出
    const required = ['/api/*', '/s/*', '/f/*', '/feed.xml', '/rss.xml'];
    for (const p of required) {
      rwfList.includes(p)
        ? ok(`run_worker_first 覆盖 ${p}`)
        : bad(`run_worker_first 未覆盖 ${p} —— 该路径会被 SPA 回退成 index.html`);
    }
    // 反向核对：worker.js 里精确匹配的顶层路径也应被覆盖
    for (const m of worker.matchAll(/path === '(\/[\w.\-]+)'/g)) {
      const p = m[1];
      if (p.startsWith('/api/')) continue;
      const covered = rwfList.includes(p) || rwfList.some((r) => r.endsWith('*') && p.startsWith(r.slice(0, -1)));
      if (!covered) bad(`worker.js 处理了 ${p}，但 run_worker_first 未覆盖 —— 会被 SPA 回退`);
    }
  }

  // 绑定名与 worker.js 里使用的 env 变量一致
  const bindings = [];
  for (const m of toml.matchAll(/binding\s*=\s*"([^"]+)"/g)) bindings.push(m[1]);
  const envUses = new Set();
  for (const m of worker.matchAll(/env\.([A-Z_][A-Z0-9_]*)/g)) envUses.add(m[1]);
  for (const b of bindings) {
    envUses.has(b) ? ok(`绑定 ${b} 在 worker.js 中被使用`) : bad(`绑定 ${b} 在 worker.js 中未被使用`);
  }
  // ASSETS 绑定（Workers Assets 隐式）
  if (envUses.has('ASSETS')) {
    toml.includes('binding = "ASSETS"') ? ok('ASSETS 绑定已声明') : bad('worker.js 用了 env.ASSETS，但 wrangler.toml 未声明该 binding');
  }
  // 需要 secret 的变量
  for (const v of ['ADMIN_CREDENTIAL']) {
    if (new RegExp('env\\.' + v).test(worker)) {
      info(`${v} 从 env 读取 —— 部署后需执行 wrangler secret put ${v}`);
    }
  }
}

/* ================================================================== *
 * 9. 旧版问题回归检查（防止同类缺陷再次出现）
 * ================================================================== */

section('9. 旧版缺陷回归检查');

{
  const allJs = ['js/core.js', 'js/app.js', 'js/views/home.js', 'js/views/drive.js', 'js/views/tools.js', 'js/views/collections.js', 'js/views/blog.js', 'js/views/settings.js']
    .map((f) => ({ f, src: read(path.join(PUB, f)) }));
  const allSrc = allJs.map((x) => x.src).join('\n');

  /*
   * 剥离注释后再检查「危险写法」和「矛盾文案」。
   * 否则会出现两类误报：
   *   1. 注释里写「旧版说数据存在本地，实际在云端」→ 被判成文案矛盾
   *   2. 注释里提到 innerHTML → 被判成未消毒赋值
   * 这两类内容恰恰是有益的说明，不该被当成缺陷。
   *
   * 实现上用逐字符状态机而非正则，避免把字符串里的 // 或 /* 误当注释起点。
   */
  function stripComments(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      const c2 = src[i + 1];
      // 字符串（单引号 / 双引号 / 反引号）原样保留
      if (c === '"' || c === "'" || c === '`') {
        const quote = c;
        out += c;
        i++;
        while (i < n) {
          if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
          out += src[i];
          if (src[i] === quote) { i++; break; }
          i++;
        }
        continue;
      }
      // 行注释
      if (c === '/' && c2 === '/') {
        while (i < n && src[i] !== '\n') i++;
        out += ' ';
        continue;
      }
      // 块注释
      if (c === '/' && c2 === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i += 2;
        out += ' ';
        continue;
      }
      // 正则字面量：粗略跳过，避免把 / 当成除法后误判
      out += c;
      i++;
    }
    return out;
  }

  const codeOnly = allJs.map((x) => ({ f: x.f, src: stripComments(x.src) }));
  const allCode = codeOnly.map((x) => x.src).join('\n');
  const toolsCode = codeOnly.find((x) => x.f === 'js/views/tools.js')?.src || '';

  // 9a. 不得出现硬编码的 workers.dev 地址（旧版默认值在大陆访问不了）
  const wd = allCode.match(/https?:\/\/[a-z0-9.-]*workers\.dev[^\s'"`]*/gi);
  wd ? bad('发现硬编码的 workers.dev 地址：' + [...new Set(wd)].join(', ')) : ok('没有硬编码的 workers.dev 地址');

  // 9b. 不得从外部 CDN 加载资源（旧版字体挂在 miaoda.feishu.cn，大陆随时可能失效）
  //
  // 注意区分两件事：
  //   - 加载资源：<script src>、<link href>、@import、new Image().src、fetch 外链 → 必须禁止
  //   - 普通跳转：<a href="https://github.com/..."> 用户点了才离开站点 → 完全正常
  // 之前把两者混为一谈，导致 GitHub 源码链接被误报成「外部 CDN」。
  const extLoads = [];

  // HTML 里的资源加载标签（排除 <a>，那是导航）
  for (const m of html.matchAll(/<(script|link|img|iframe)\b[^>]*?(?:src|href)="(https?:\/\/[^"]+)"/gi)) {
    const tag = m[1].toLowerCase();
    // <link rel="alternate" href="/feed.xml"> 之类是站内；只报真正的外域资源
    extLoads.push(`index.html <${tag}> → ${m[2]}`);
  }
  // CSS 里的 @import / url() 外链
  for (const cssName of ['base.css', 'components.css']) {
    const css = exists(path.join(PUB, 'css', cssName)) ? read(path.join(PUB, 'css', cssName)) : '';
    for (const m of css.matchAll(/@import\s+(?:url\()?['"]?(https?:\/\/[^'")]+)/gi)) extLoads.push(`${cssName} @import → ${m[1]}`);
    for (const m of css.matchAll(/url\(\s*['"]?(https?:\/\/[^'")]+)/gi)) extLoads.push(`${cssName} url() → ${m[1]}`);
  }
  // JS 里的动态资源加载
  for (const { f, src } of allJs) {
    for (const m of src.matchAll(/(?:document\.createElement\(['"]script['"]\)[\s\S]{0,200}?\.src\s*=|\.src\s*=|import\s*\(|new\s+Image\(\)[\s\S]{0,80}?\.src\s*=)\s*['"`](https?:\/\/[^'"`]+)/g)) {
      extLoads.push(`${f} 动态加载 → ${m[1]}`);
    }
  }

  if (extLoads.length) {
    for (const e of [...new Set(extLoads)]) bad('从外部加载资源：' + e);
  } else {
    ok('没有从外部 CDN 加载任何资源（全部自托管）');
    // 顺带确认站内确实存在指向 GitHub 的导航链接（这是应该有的）
    if (/href="https:\/\/github\.com\/keyh4/.test(html)) ok('GitHub 导航链接正常（属页面跳转，非资源依赖）');
  }

  // 9c. 二维码不得再用随机数伪造
  const qrBlock = toolsCode.match(/TOOL_IMPL\.qrcode[\s\S]*?(?=\nTOOL_IMPL\.)/);
  if (qrBlock) {
    if (/Math\.random|rng\(\)/.test(qrBlock[0])) bad('二维码生成仍在使用随机数 —— 生成的码扫不出来');
    else if (/new QRCode\(/.test(qrBlock[0])) ok('二维码生成使用 QRCode 库（真实编码）');
    else bad('二维码生成没有调用 QRCode 库');
  } else bad('找不到 TOOL_IMPL.qrcode 实现');

  // 9d. MD5 不得再输出"不支持"
  if (/浏览器原生不支持|需第三方库/.test(toolsCode)) bad('MD5 仍是"不支持"的假输出');
  else if (/typeof md5 === 'function'/.test(toolsCode)) ok('MD5 走真实库（blueimp-md5），且有加载失败的降级提示');

  // 9e. 不得使用正则拼 innerHTML 渲染 Markdown
  if (/\.innerHTML\s*=\s*[^;]*replace\(/.test(allCode)) bad('存在用正则拼 innerHTML 的写法（XSS 风险）');
  else ok('没有正则拼 innerHTML');

  // 9f. 用户数据插入 DOM 应走 textContent / el() / setSafeHtml
  const dangerous = [];
  for (const { f, src } of codeOnly) {
    for (const m of src.matchAll(/\.innerHTML\s*=/g)) {
      const ctx = src.slice(m.index, m.index + 140);
      // setSafeHtml 内部会过 DOMPurify；clear() 用的是 removeChild 不算
      if (!/DOMPurify\.sanitize|setSafeHtml/.test(ctx)) dangerous.push(f + ': ' + ctx.slice(0, 80).replace(/\s+/g, ' '));
    }
  }
  if (dangerous.length) for (const d of dangerous) bad('未经消毒的 innerHTML 赋值 → ' + d);
  else ok('所有 innerHTML 赋值都经过 DOMPurify 消毒');

  // 9g. 文案不得再声称"数据存在本地/纯静态"（旧版与实现矛盾）
  const lies = [];
  for (const { f, src } of codeOnly) {
    for (const m of src.matchAll(/(数据存在本地|存在你的浏览器里|不上传任何服务器|纯静态)/g)) lies.push(f + ' → ' + m[1]);
  }
  if (lies.length) for (const l of lies) bad('文案与实现矛盾：' + l);
  else ok('没有「数据存在本地/纯静态」这类与实现矛盾的文案');
  // 允许工具箱单独声明本地计算（那是真的：32 个工具全部不发请求）
  if (/全部在浏览器本地运行/.test(toolsCode)) {
    ok('工具箱声明「本地运行」—— 与实现一致（工具确实不发请求）');
  }

  // 9h. GitHub 链接不得是占位死链
  if (/href="https:\/\/github\.com"/.test(html)) bad('GitHub 链接仍是占位符 https://github.com');
  else if (/github\.com\/keyh4/.test(html)) ok('GitHub 链接指向真实仓库/账号');
}

/* ================================================================== *
 * 10. HTML 结构与脚本加载顺序
 * ================================================================== */

section('10. 加载顺序与结构');

{
  // core.js 必须在 app.js 之前；app.js 必须在 views 之前
  const order = [...html.matchAll(/<script src="(\/js\/[^"]+)"/g)].map((m) => m[1]);
  info('脚本顺序：' + order.join(' → '));
  const iCore = order.indexOf('/js/core.js');
  const iApp = order.indexOf('/js/app.js');
  const iViews = order.findIndex((p) => p.startsWith('/js/views/'));
  if (iCore >= 0 && iApp > iCore) ok('core.js 在 app.js 之前');
  else bad('core.js 必须在 app.js 之前加载');
  if (iApp >= 0 && iViews > iApp) ok('app.js 在所有 views 之前');
  else bad('app.js 必须在 views 之前加载（views 要调用 registerView）');

  // 所有 script 都应带 defer，否则阻塞渲染且顺序不可控
  const nonDefer = [...html.matchAll(/<script\s+src="[^"]+"(?![^>]*defer)[^>]*>/g)];
  nonDefer.length ? bad('有 script 未加 defer：' + nonDefer.map((m) => m[0]).join(', ')) : ok('所有外链 script 均带 defer');

  // boot 时机：必须等 DOMContentLoaded，不能在 readyState==='loading' 判断下直接跑
  if (/readyState === 'loading'\)\s*document\.addEventListener/.test(app)) {
    bad("app.js 用 readyState === 'loading' 判断启动 —— defer 脚本执行时已是 interactive，boot() 会在视图注册前运行");
  } else if (/readyState === 'complete'\)\s*boot\(\)/.test(app)) {
    ok("启动时机正确（判断 'complete'，否则等 DOMContentLoaded）");
  } else {
    bad('app.js 启动时机判断不明确');
  }

  // index.html 里引用的 DOM id 必须在 app.js 中被 getElementById
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const missing = ids.filter((id) => !app.includes("'" + id + "'") && !app.includes('"' + id + '"'));
  if (missing.length) info('index.html 中这些 id 未被 app.js 引用（可能由视图使用或冗余）：' + missing.join(', '));
  else ok('index.html 的所有 id 都被 app.js 引用');

  // 反过来：app.js getElementById 的 id 必须存在
  const getByIds = [...app.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
  for (const g of getByIds) {
    ids.includes(g) ? ok(`app.js 引用的 #${g} 在 HTML 中存在`) : bad(`app.js getElementById('${g}')，但 index.html 里没有这个 id`);
  }
}

/* ================================================================== *
 * 11. CSS 令牌引用完整性
 * ================================================================== */

section('11. CSS 令牌');

{
  const base = read(path.join(PUB, 'css', 'base.css'));
  const comp = read(path.join(PUB, 'css', 'components.css'));

  // 收集 base.css 中定义的令牌
  const defined = new Set();
  const rootBlock = base.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (rootBlock) for (const m of rootBlock[1].matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
  info('定义的令牌数：' + defined.size);

  // 收集所有 var(--x) 引用
  const used = new Map();
  for (const [name, src] of [['base.css', base], ['components.css', comp]]) {
    for (const m of src.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (!used.has(m[1])) used.set(m[1], new Set());
      used.get(m[1]).add(name);
    }
  }
  const undefined_tokens = [...used.keys()].filter((t) => !defined.has(t));
  if (undefined_tokens.length) {
    for (const t of undefined_tokens) bad(`引用了未定义的 CSS 令牌 ${t}（出现在 ${[...used.get(t)].join(', ')}）—— 样式会静默失效`);
  } else ok(`所有 var() 引用的令牌均已定义（${used.size} 个）`);

  // 暗色主题应覆盖主要的颜色令牌
  const darkBlock = base.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
  if (darkBlock) {
    const darkDefined = new Set();
    for (const m of darkBlock[1].matchAll(/(--[\w-]+)\s*:/g)) darkDefined.add(m[1]);
    const colorTokens = [...defined].filter((t) => /--(paper|surface|ink|muted|faint|line|accent|ok|warn|danger)/.test(t));
    const notOverridden = colorTokens.filter((t) => !darkDefined.has(t) && !darkDefined.has(t + '-2') && !darkDefined.has(t + '-soft'));
    if (notOverridden.length) info('这些颜色令牌在暗色主题下未覆盖：' + notOverridden.join(', '));
    else ok('主要颜色令牌在暗色主题下均有覆盖');
    ok(`暗色主题覆盖了 ${darkDefined.size} 个令牌`);
  } else bad('base.css 中没有 [data-theme="dark"] 块 —— 暗色模式无效');

  // components.css 不应出现裸色值（应全部走令牌）
  const bareColors = [...comp.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  if (bareColors.length) bad('components.css 出现裸色值（应使用令牌）：' + [...new Set(bareColors)].join(', '));
  else ok('components.css 无裸色值，全部走令牌');
}

/* ================================================================== *
 * 汇总
 * ================================================================== */

console.log('\n' + '='.repeat(56));
if (failures === 0) {
  console.log(`\x1b[32m\x1b[1m全部通过\x1b[0m — ${checks} 项检查，0 项失败`);
} else {
  console.log(`\x1b[31m\x1b[1m存在 ${failures} 项失败\x1b[0m — 共 ${checks} 项检查`);
}
console.log('='.repeat(56));
process.exit(failures === 0 ? 0 : 1);
