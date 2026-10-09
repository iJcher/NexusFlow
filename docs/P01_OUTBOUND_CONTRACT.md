# P01 出站网络子契约

不代表完整 P01 或生产网络出口已验收。应用策略与实际网络出口需要分别验证；测试不可加入私网放行后门。

- OUTBOUND_ALLOWED_HOSTS 为精确域名列表，默认空即拒绝。用户/系统模型、Embedding、Rerank、Skill、旧 HTTP 节点都走 safeFetch。只批准 HTTPS/443，拒绝 IP literal、URL 用户口令、fragment、其他协议与端口。
- DNS 全部 IPv4 结果必须通过公网策略；私网、回环、链路本地/元数据、组播/保留等范围拒绝。IPv6-only 首版拒绝，不通过未校验路径回退。DNS 最长等待 5 秒，可取消。
- 每次新连接使用第一次已验证的地址，HTTPS lookup 固定 IP、TLS 证书校验保持开启；agent=false 防连接池/环境代理改变连接路径。不自动跟随任何 3xx，避免向重定向目标传播凭据。
- 请求正文只支持字符串，最大 1 MiB；拒绝覆盖 host/connection/content-length/transfer-encoding。响应累计最大 2 MiB，流式背压限制排队数据；总期限 30 秒包含 DNS。以上是本项目初始设计限制，并非行业保证。
- 中途 error/aborted/close、取消或超限终止连接；正常完成释放 timer/AbortSignal listener。错误为稳定代码，不包含 URL、密钥或外部响应正文。
- P02 的 HttpEffectExecutor 另有副作用 unknown/retry 契约、1 MiB 输出限制与独立 WORKFLOW_HTTP_ALLOWED_HOSTS，不能以旧 HTTP 节点冒充持久副作用治理。
- 本轮测试用 mock DNS/HTTPS 检验应用输送层契约，不冒充真实 TLS、iptables/网关或生产出口测试；后续必须追加真实网络隔离演练。管理员批准合法模型域名之前，调用失败是明确策略拒绝，不自动开权限。

实现选择核对 Node 官方 HTTPS/request/lookup 接口；不使用新版本专属 proxy 选项：
[Node 22 HTTPS](https://nodejs.org/docs/latest-v22.x/api/https.html#httpsrequesturl-options-callback)、
[Node 22 HTTP request](https://nodejs.org/docs/latest-v22.x/api/http.html#httprequesturl-options-callback)。
