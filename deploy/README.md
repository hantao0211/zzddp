# 小步学习服务器部署

使用前请阅读随附的 `LICENSE`、`NOTICE` 与[使用许可说明](https://github.com/hantao0211/zzddp/blob/main/docs/licensing.md)：项目采用标准 `AGPL-3.0-only`，允许商业使用。分发软件及运行修改后的网络交互版本时，按协议提供该版本的相应源码；随附许可文本不能替代源码提供义务。部署包保留项目许可、声明、使用说明及直接运行依赖的原许可证文本。

当前目标服务器：`14.103.24.55`。目标项目目录：`/home/hantao/work/zzddp`。建议在其中新建 `xiaobu-prototype`，不覆盖既有项目文件。

部署包包含已编译网页、静态服务器、打包后的独立小助手服务及配置模板，不含任何凭据。服务器无需安装项目 npm 依赖；小助手使用独立 Node.js 22 运行时，静态服务保留原部署方式。

## 构建与打包

在开发环境使用 Node.js 22.13 或更新的兼容版本：

```sh
npm run build:preview
npm run build:assistant
npm run package:prototype
```

部署包生成于 `dist/xiaobu-prototype.tar.gz`，其中不含源代码仓库、密钥、node_modules 或真实学习资料。

## 运行与检查

将包上传并解压至独立目录后，在包含 `server.cjs` 的目录运行：

```sh
HOST=0.0.0.0 PORT=3080 node server.cjs public
```

静态服务默认端口为 `3080`，健康检查路径为 `/healthz`。当前服务器通过 Nginx 的80及443端口访问，原型仅监听 `127.0.0.1:3080`；推荐地址为 `https://14.103.24.55/`，已配置受信任的公网 IP 证书和自动续期。详见 [部署记录模板](DEPLOYMENT.example.md) 和 [HTTPS 运维说明](HTTPS.md)。

## 后台服务

附带 `xiaobu-prototype.service` 为 systemd 用户服务模板。部署时将 `@NODE@` 和 `@RELEASE@` 替换为目标服务器实际的 Node.js 可执行文件及发布目录，再安装到当前账号的 `~/.config/systemd/user/` 并启动。用户服务是否能开机运行取决于目标服务器的用户会话和 linger 设置，需实机检查。

模板仅管理此原型，不修改已有网站、反向代理或防火墙配置。若目标没有可用的用户级 systemd，应根据服务器环境选择已有进程管理方式。

## 当前能力

真实作业空间支持家庭访问码、服务器私有原件、后台AI分科、备忘录作业清单、跨批次查缺、处理状态和换设备查看。小助手支持真实问答、语音识别及朗读。

后台使用固定Node.js 22.23.5（内置SQLite），依赖Ubuntu官方 `imagemagick libheif-examples poppler-utils`。安装 `xiaobu-assistant.service` 和Nginx的学习上传代理配置，不能只更新静态页面。私有数据位于 `/var/lib/xiaobu-assistant/learning`，不得随发布目录替换。详见 [作业整理说明](../docs/homework.md)。

独立家庭账号和家长管理已接通，真实针对练习尚未接入；真实自动批改、错因分析与错题归档由私有ASSISTANT_AUTO_GRADING=1启用；示例体验保留原有浏览器资料。HTTP与HTTPS浏览器资料隔离，旧文件不会自动迁移；保留原HTTP入口用于查看下载，真实上传仅走HTTPS。

公开仓库不含真实服务器维护日志。可复制 `DEPLOYMENT.example.md` 为被Git忽略的 `DEPLOYMENT.md`，在维护环境记录实际发布及回退信息，不将真实学习结果或私有备份位置发布到仓库。

首次启动账号服务后，家长用服务器私有状态目录中的一次性开通码在 `/admin/` 建立管理员，再创建孩子账号。旧访问码只保留孩子权限。备份时同时保留新增 `accounts.sqlite`（含WAL文件）和原有学习数据库、原件及state.json。详见 [家庭账号与管理](../docs/accounts.md)。
