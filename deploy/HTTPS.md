# 小步学习公网 IP HTTPS

目标地址：`https://14.103.24.55/`。使用 Let's Encrypt 公网 IP 证书，不需要域名，也不要求客户端安装自签名根证书。

## 部署组成

- Nginx 监听公网80和443，转发至 `127.0.0.1:3080` 的原型服务。
- `xiaobu-prototype.service` 使用 `/etc/systemd/system/xiaobu-prototype.service.d/https-proxy.conf` 覆盖监听地址及端口，并移除绑定低端口的权限。
- Nginx 站点配置：`/etc/nginx/sites-available/xiaobu`，链接到 `sites-enabled/xiaobu`。模板在本目录的 `nginx/` 下。
- 独立签发工具：`/opt/xiaobu-certbot/bin/certbot`，版本5.10.0，使用独立 Python venv，不修改系统 Python 包。
- 正式证书：`/etc/letsencrypt/live/14.103.24.55/`，私钥仅保存在服务器，由 Nginx 主进程读取。
- 验证目录：`/var/lib/xiaobu-acme/.well-known/acme-challenge/`，与应用发布目录独立，切换 `current` 不影响续期。

IP 证书有效期较短，必须保留自动续期。`xiaobu-certbot-renew.timer` 每天北京时间08:00、20:00后随机延迟0—30分钟检查续期；仅在 Certbot 判断需要更新时签发。补跑机制在服务器重启后处理错过的检查。

续期成功后运行 `/usr/local/libexec/xiaobu-reload-nginx`，先检查 Nginx 配置再平滑重载。该 hook 只处理本 IP 的证书。定时服务失败会记录为 systemd 失败状态；目前没有接入邮件或聊天告警。

## 初次签发流程

仅适用于当前服务器已确认空闲的 Nginx 配置，不应覆盖其他站点。先备份配置，并保留切回原 HTTP 服务的路径。

1. 安装 Nginx 和独立 Certbot。签发工具需支持 IP 与 webroot，不能直接使用缺少该能力的旧版系统或镜像包。
2. 使用 `nginx/xiaobu-http.conf`，提供 HTTP 代理及独立验证目录。将原型移动至本机3080，由 Nginx 接管80；检查失败时恢复原型原来的80端口监听。
3. 从公网验证 ACME 目录返回预期内容。先进行 staging 测试签发；测试证书不安装到网站。
4. 签发正式证书：

```sh
/opt/xiaobu-certbot/bin/certbot certonly \
  --non-interactive --agree-tos --register-unsafely-without-email \
  --server https://acme-v02.api.letsencrypt.org/directory \
  --webroot --webroot-path /var/lib/xiaobu-acme \
  --preferred-profile shortlived --preferred-challenges http \
  --ip-address 14.103.24.55 --cert-name 14.103.24.55 \
  --key-type ecdsa \
  --deploy-hook /usr/local/libexec/xiaobu-reload-nginx
```

5. 安装 `nginx/xiaobu.conf`，执行 `nginx -t` 后重载。验证公网证书链、IP 匹配、首页及打印页。
6. 安装本目录中的续期 service/timer，启用定时器并验证续期及部署 hook。

正式签发、测试签发和检查均不使用 AI 密钥，也不需要读取孩子的学习资料。

## 检查与维护

以下命令在服务器以 root 执行，不输出私钥内容：

```sh
nginx -t
systemctl status nginx.service xiaobu-prototype.service
systemctl list-timers xiaobu-certbot-renew.timer
systemctl status xiaobu-certbot-renew.service
journalctl -u xiaobu-certbot-renew.service -n 50 --no-pager
/opt/xiaobu-certbot/bin/certbot certificates
openssl x509 -in /etc/letsencrypt/live/14.103.24.55/cert.pem \
  -noout -dates -issuer -ext subjectAltName
curl --fail https://14.103.24.55/healthz
curl --fail http://127.0.0.1:3080/healthz
```

手动执行一次正常续期检查：

```sh
systemctl start xiaobu-certbot-renew.service
```

测试续期流程，使用 staging 而不替换正在使用的正式证书，并实际检查重载 hook：

```sh
/opt/xiaobu-certbot/bin/certbot renew --cert-name 14.103.24.55 \
  --dry-run --run-deploy-hooks --no-random-sleep-on-renew
```

无需频繁使用 `--force-renewal` 申请正式证书。配置变更后应重复检查 `nginx -t` 和公网 HTTPS，并保持80端口的验证路径可达。

## 浏览器本地资料

当前原型仍把记录和原件存在浏览器。HTTP 与 HTTPS 属于不同来源，localStorage 和 IndexedDB 不会自动互通。启用 HTTPS 不会删除旧资料，但在新地址看不到旧来源的文件。

因此暂时保留 `http://14.103.24.55/`，不强制跳转，也不启用 HSTS。新访问优先使用 HTTPS；旧地址仅用于查看原先的本地资料。接入真实账号前，应完成资料迁移并将登录、私有上传强制限制在 HTTPS，届时再配置跳转策略。

## 回退至原 HTTP 服务

仅在需要恢复之前的原型服务时执行，HTTPS 将暂停；证书及私钥保留在服务器，不删除：

```sh
systemctl disable --now xiaobu-certbot-renew.timer
systemctl disable --now nginx.service
mv /etc/systemd/system/xiaobu-prototype.service.d/https-proxy.conf \
  /etc/systemd/system/xiaobu-prototype.service.d/https-proxy.conf.disabled
systemctl daemon-reload
systemctl restart xiaobu-prototype.service
curl --fail http://127.0.0.1/healthz
```

## 官方参考

- [Let's Encrypt IP 证书及 Certbot 支持](https://letsencrypt.org/2026/03/11/shorter-certs-certbot)
- [Certbot 自动续期与部署 hook](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates)
- [Nginx HTTPS 配置](https://nginx.org/en/docs/http/configuring_https_servers.html)
