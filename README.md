# 小步学习

面向小学家庭的学习记录与辅助网站，以纸笔学习为主，减少家长整理作业的负担。支持自托管，适配手机、平板和电脑。

## 当前能力

- 独立家庭账号与角色权限保护的真实作业空间，兼容旧访问码的孩子权限，服务器保存照片及扫描件原件。
- 上传备忘录，AI识别日期与各科要求并生成清单；混合作业自动分科、关联，不需手动选择科目或任务。
- 支持JPG、PNG、WebP、HEIC和PDF；先传作业后传备忘录、分批补页均可，跨批次检查缺项。
- 持久队列、处理进度、有限重试、调用限额、去重；关闭页面后继续处理，换设备可查看。
- 文字及语音小助手，支持追问、编辑识别文字及朗读回答；可沟通作业识别疑问，并经确认修正清单。与作业空间共用账号登录状态。
- 小助手支持复制对话及文本下载；从已聊清楚的说明中选择性提炼知识，后续问答和新资料识别检索使用，保留依据和可停用版本。
- 书面作业逐项检查是否作答，区分照片收到、作业完成和答案正确。
- 独立后台自动批改并再次核验；已核验错题自动归档，保存可能错因、知识点和订正建议，支持继续向小助手提问。
- 家庭说明优先展示当前理解，旧原话保留历史；手写识字纠正不会变成不同课号的长期替换规则。
- 原有示例体验和浏览器旧记录保留，与真实档案分开。可迁移当前HTTPS浏览器的旧原件，或从旧HTTP地址下载再上传。

“材料齐全”不表示答案正确或作业完成。支持家庭管理员、家长和孩子的独立账号；真实针对练习、积分审批、学习周报和直接发送至打印机尚未接入。自动批改、错因分析和错题本通过服务器私有配置启用，分歧题保留未确认，主观题给点评。示例错题和奖励不作为孩子的真实学习结论。小助手会读取所选日期的整理记录，解释疑问；家庭补充说明先预览，确认后保存并重新查缺，可撤销。

家长管理入口：`/admin/`。首次开通及孩子账号创建见 [家庭账号与管理](docs/accounts.md)。

## 开发与发布

TypeScript、React、Next.js；后端为Node.js 22.23.5，使用SQLite与服务器私有文件目录。后端的Node22内置SQLite仍标记实验性，当前固定运行时，更新时需验证兼容性。正式服务器另需Ubuntu官方 `imagemagick libheif-examples poppler-utils`。

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build:preview
npm run build:assistant
npm run package:prototype
```

开发页面默认 `http://localhost:3000`。真实接口由独立后端提供，前端开发服务器本身不提供上传或AI接口；生产使用同源HTTPS代理。`build:preview` 生成静态页面至 `out/`，`build:assistant` 将后端打包为独立CJS，发布包在 `dist/xiaobu-prototype.tar.gz`，不含密钥或真实资料。

服务器静态进程和后端独立运行，由Nginx代理。部署方法与运行要求见 [部署说明](deploy/README.md)。

## 代码与文档

- `src/components/homework-app.tsx`：真实学习空间；`learning-app.tsx`保留示例入口。
- `src/server/homework`：私有上传、SQLite、页面转换和持久AI任务。
- `src/server/assistant`：认证、问答与语音；`src/server/ai`：结构化模型适配与工作流。
- `src/domain`：共享契约与校验；`src/services`：浏览器与服务端数据访问。
- `tests`：关键行为验证；`tests/browser/homework-smoke.mjs`：显式的隔离环境真实AI验收。

[作业整理说明](docs/homework.md) · [小助手说明](docs/assistant.md) · [AI工作流](docs/ai-workflows.md) · [部署记录模板](deploy/DEPLOYMENT.example.md) · [HTTPS维护](deploy/HTTPS.md) · [产品需求](docs/product-requirements.md) · [家庭账号与管理](docs/accounts.md)

公开仓库只保存代码、文档和模拟数据，不保存家庭原件、密钥、会话或数据库备份。

真实部署日志 `deploy/DEPLOYMENT.md` 仅在维护环境保存，不提交到公开仓库。仓库中的测试样本均为模拟资料；需要实际模型的验收脚本位于 `tests/manual/`，不会随 `npm test` 自动调用付费接口。
