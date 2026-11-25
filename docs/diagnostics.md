# 小步运行日志

排查时先问「几点、在哪个功能、看到什么」。服务端日志目录为 `/var/log/xiaobu-diagnostics/`，仅限服务器运维读取。文件名按上海日期分组，每行是一条 JSON，行内 `at` 采用 UTC。例如上海晚上 20 点对应行内的 12 点 UTC。

```sh
# 查看某天的错误和重复次数
sudo cat /var/log/xiaobu-diagnostics/2026-11-26-errors.jsonl
# 按请求参考号查找保留下来的记录
sudo grep -hF '"ref":"abcd1234"' /var/log/xiaobu-diagnostics/*.jsonl
# 核对收集器是否运行以及实际字节数
systemctl is-active xiaobu-diagnostics
sudo wc -c /var/log/xiaobu-diagnostics/*.jsonl
```

上传开始和提交、批改和重试、试卷整理、阅读打卡、兑换与家庭设置等关键操作写入 `ops`。接口响应带 `X-Request-Id`，小助手已有的错误参考号与它相同。上传提交成功表示服务端已接收请求，后续识别与批改另记处理结果。排查先按时间和功能定位，再查 `errors` 中的状态码、原因码、阶段、尝试次数。相同原因的错误在一分钟内保留首条样本，后续次数汇总为 `repeated`；样本以外的请求可按时间和功能查汇总。

常见原因包括 AI 网络故障 `NETWORK_ERROR`、输出格式不符合要求 `INVALID_RESULT`、网关连不上后台 `UPSTREAM_CONNECT`、网关等待超时 `UPSTREAM_TIMEOUT`。网关和后台把事件发往仅监听本机的独立收集器。普通访问、成功的状态轮询、照片内容、文件名、孩子作答、AI 对话、IP、Cookie 和密码均省略。手机整页卡住且未发出请求时，服务端无法还原当时的界面动作。

每天关键操作最多 1,000,000 字节，错误最多 4,000,000 字节。某类写满后留下 `daily.limit` 提示，该类暂停写入至次日。重启继续计算当天用量。保留今天及前 9 个上海自然日，运行时每 30 秒检查跨日，启动时也清理。诊断正文最多 50,000,000 字节，文件系统块和目录略有额外开销。日志与家庭数据库分目录存放。学习记录、错题及奖励账本按产品规则保存。

容量估算示例：按每条 150 字节，每天 500 条操作和 100 条不同错误合计约 90 KB，约占日预算 1.8%。实际量可按文件字节数核对。收集器停止或本机报文丢失期间可能缺记录。主机的 systemd 启停、系统故障和其他站点日志由主机管理，运维可用 `journalctl -u xiaobu-diagnostics -u xiaobu-assistant -u xiaobu-prototype` 交叉检查。

部署时安装并启用 `deploy/xiaobu-diagnostics.service`，更新后台服务及本站 Nginx 配置。后台服务依赖使收集器随后台启动；独立设置开机启动后，后台停止期间仍能接收本站网关错误。站点配置的 `access_log off` 省去逐次网页访问记录，`error_log syslog:server=127.0.0.1:13092,tag=xiaobu_gateway error` 将网关错误交给同一额度管理。
