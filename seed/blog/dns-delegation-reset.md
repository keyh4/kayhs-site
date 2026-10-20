---
title: 域名突然解析不了，问题根本不在 Cloudflare Tunnel
date: 2026-10-13
tags: [Cloudflare, DNS, 排障]
summary: 站点打不开时，多数人第一反应是去看隧道掉没掉。这次真正的原因是免费域名后台的名称服务器被重置，解析请求压根没走到 Cloudflare。
---

## 现象

`https://kayhs.qzz.io` 突然打不开，浏览器报「无法解析主机名」。

因为这个站是 Cloudflare Tunnel 类架构（前端在 Workers 上，域名走 Cloudflare DNS），第一反应很容易是「隧道挂了」。但排障顺序错了就会白折腾——隧道断了的典型表现是 **502/1033 错误页**，而不是域名解析失败。解析都失败，说明请求根本没走到 Cloudflare 边缘节点，隧道在那之后，跟它没关系。

## 分层定位

按 DNS 的链路一层层往下查：

```powershell
# 1. 本地解析
Resolve-DnsName kayhs.qzz.io

# 2. 绕过本地缓存，问公共递归
Resolve-DnsName kayhs.qzz.io -Type NS -Server 1.1.1.1

# 3. 直连权威服务器，看它到底怎么说
nslookup -type=NS kayhs.qzz.io dns1.digitalplat.org
```

第 1、2 步返回的都是一条 SOA 记录，没有任何 A 或 CNAME——等价于「这个域名不存在」。

第 3 步是关键，它直接暴露了断点：

```
kayhs.qzz.io  nameserver = dns1.digitalplat.org
kayhs.qzz.io  nameserver = dns2.digitalplat.org
```

委派指向的是**域名注册商自己的服务器**，不是 Cloudflare 的 `xxx.ns.cloudflare.com`。

而 `.qzz.io` 来自 DigitalPlat FreeDomain，这个平台有个特点：它**不托管 DNS 记录**，注册时就强制要求你填外部 NS，解析记录全靠 Cloudflare 那边维护。NS 一旦掉回平台默认值，就等于没人给这个域名配解析了。Cloudflare 里的 zone 配置可以完好无损，但它收不到任何查询。

## 一个容易误判的干扰项

本机跑着代理软件时，`Resolve-DnsName` 返回的可能是 `198.18.x.x` 这种地址。那是代理的 fake-ip 段，不是真实解析结果，拿它做判断会得出错误结论。

要看真实记录，走 DNS-over-HTTPS 绕开本机解析器：

```powershell
curl.exe -sS "https://dns.google/resolve?name=kayhs.qzz.io&type=A"
```

修复后这里返回了 `104.21.25.85` 和 `172.67.133.227`，都是 Cloudflare 边缘节点。

## 修复

1. 去 Cloudflare 控制台拿到该 zone 分配的两个名称服务器地址
2. 回 DigitalPlat 后台，把 Name Server 1/2 从 `dns1/dns2.digitalplat.org` 改成 Cloudflare 的那两个
3. 等委派生效（记录 TTL 是 300 秒，全球生效通常几分钟到几小时）

验证要三方交叉，不能只信后台提示：上级域权威、`1.1.1.1`、`8.8.8.8`、Google DoH 都查一遍，委派一致才算真的好了。

## 值得记下来的两点

**排障要按链路顺序，不要按猜测顺序。** 域名解析 → 边缘节点 → 隧道 → 源站，从前往后查。哪一层断了，后面的层根本轮不到出场。看到「无法解析」就别去重启隧道。

**免费域名有续期窗口。** 这个域名 2027-02-17 到期，按「剩余少于 120 天可免费续期」的规则，2026-10-20 起后台才会出现续费按钮。错过窗口域名会被回收。NS 被重置成平台默认值，很可能就是平台侧状态变更留下的痕迹——如果哪天又出现同样的症状，先去后台看看域名状态和 NS 字段，比查 Cloudflare 快得多。
