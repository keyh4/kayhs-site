/**
 * setup-local-auth.js — 为本地开发生成管理员凭据
 *
 * 生产环境的 ADMIN_CREDENTIAL 必须用 `wrangler secret put` 设置（加密存储）。
 * 本地 wrangler dev 不读 Secret，而是读 .dev.vars 文件。
 *
 * 这个脚本生成一个随机测试口令，算出 salt$sha256(salt+password) 格式的哈希，
 * 写入 .dev.vars（给 wrangler 用）和 .local-test-password（给 e2e 测试用）。
 * 两个文件都在 .gitignore 里，不会进仓库。
 *
 * 用法：node tools/setup-local-auth.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

// 随机 16 位口令，每次运行都不同
const password = crypto.randomBytes(12).toString('base64url');
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
const credential = `${salt}$${hash}`;

const devVars = `# 本地开发凭据，由 tools/setup-local-auth.js 生成。
# 生产环境请用 wrangler secret put ADMIN_CREDENTIAL 设置，不要用这个文件。
ADMIN_USER=kayhs
ADMIN_CREDENTIAL=${credential}
`;

fs.writeFileSync(path.join(ROOT, '.dev.vars'), devVars, 'utf8');
fs.writeFileSync(path.join(ROOT, '.local-test-password'), password, 'utf8');

console.log('已写入 .dev.vars 与 .local-test-password');
console.log('本地测试口令（仅本地有效，非生产凭据）：' + password);
console.log('凭据格式校验：' + (/^[a-f0-9]{32}\$[a-f0-9]{64}$/.test(credential) ? '✓ salt$sha256' : '✗ 格式异常'));

// 自检：用同一套算法验证一遍，确保 e2e 登录能通过
const verify = crypto.createHash('sha256').update(salt + password).digest('hex');
console.log('哈希自校验：' + (verify === hash ? '✓ 一致' : '✗ 不一致'));
