/**
 * seed.js — 把 seed/ 下的初始内容写入云端
 *
 * 博客文章存在 R2 的 _blog/ 前缀下，仓库里的 seed/blog/*.md 只是初始素材，
 * 需要跑一次这个脚本才会出现在站点上。之后的增删改都在站内「写文章」完成。
 *
 * 用法：
 *   node tools/seed.js                 # 上传 seed/blog 下所有文章
 *   node tools/seed.js --dry-run       # 只看会做什么，不写入
 *
 * 依赖 wrangler 已登录（wrangler login），或用 CLOUDFLARE_API_TOKEN。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SEED_DIR = path.join(ROOT, 'seed', 'blog');
const DRY = process.argv.includes('--dry-run');

if (!fs.existsSync(SEED_DIR)) {
  console.error('找不到 seed/blog 目录：' + SEED_DIR);
  process.exit(1);
}

const files = fs.readdirSync(SEED_DIR).filter((f) => f.endsWith('.md'));
if (!files.length) {
  console.log('seed/blog 下没有 .md 文件，无需操作。');
  process.exit(0);
}

console.log(`准备写入 ${files.length} 篇文章到 R2 的 _blog/ 前缀：`);
for (const f of files) console.log('  · ' + f);
if (DRY) {
  console.log('\n[dry-run] 未做任何写入。');
  process.exit(0);
}

// 用 wrangler r2 object put 写入，避免自己实现 R2 的 S3 签名
let okCount = 0;
for (const f of files) {
  const local = path.join(SEED_DIR, f);
  const key = '_blog/' + f;
  const body = fs.readFileSync(local);
  const tmp = path.join(require('os').tmpdir(), 'seed-' + f);
  fs.writeFileSync(tmp, body);

  try {
    execFileSync('wrangler', [
      'r2', 'object', 'put',
      'kayhs-drive/' + key,
      '--file=' + tmp,
      '--content-type=text/markdown; charset=utf-8',
    ], { cwd: ROOT, stdio: 'pipe' });
    console.log('  ✓ ' + key);
    okCount++;
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString().split('\n').slice(0, 4).join(' | ');
    console.error('  ✗ ' + key + ' — ' + msg);
    if (/not authenticated|No API Token|wrangler login/i.test(msg)) {
      console.error('\nwrangler 未登录。请先执行：wrangler login');
      break;
    }
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

console.log(`\n完成：${okCount}/${files.length} 篇写入成功。`);
if (okCount < files.length) process.exit(1);
