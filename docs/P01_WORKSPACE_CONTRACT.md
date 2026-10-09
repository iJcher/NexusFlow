# Workspace 成员与邀请契约

本文件对应新增的 Workspace API，不代表旧 Flow/Knowledge/Skill/Connection 资源已支持团队共享。所有入口受应用全局 JWT guard 保护；身份只取可信 CurrentUser，不能从 body/header 指定他人身份。邮箱实发仍暂缓；邀请通过 ID 接受，不发送邮件、不自动加入成员。

## 权限与操作

- GET /workspaces：只列本人所属 workspace，最多 100 项。
- POST /workspaces/private：为当前有效用户创建或返回私有 workspace；并发创建串行化，已有 workspace/id/owner 不修改。
- GET /workspaces/:id/members：仅真实 owner 且 Owner membership 可列成员，最多 1000 项。
- POST /workspaces/:id/invitations：仅上述 owner，body 为 email 与 Editor/Operator/Approver/Viewer；不能邀请 Owner，邮箱规范化；同邮箱待接受邀请不能重复，每 workspace 同时最多 100 个有效待接受邀请，有效期 7 天。
- POST /workspaces/invitations/:invitationId/accept：取数据库当前有效用户及已验证邮箱；必须匹配邀请目标。邀请 ID 不是登录凭证。客户端追加 userId/role 等字段被 DTO 白名单拒绝。过期、撤销、已接受拒绝，已有成员不能被邀请覆盖权限。
- DELETE /workspaces/:id/invitations/:invitationId：owner 撤销未接受邀请；跨 workspace 目标拒绝。
- PATCH /workspaces/:id/members/:memberId：owner 调整非 owner 角色。
- DELETE /workspaces/:id/members/:memberId：owner 移除非 owner；不提供隐式 owner 转移。

示例：owner 邀请 reviewer@example.com 为 Approver，得到 invitationId。该邮箱用户通过已有邮箱登录链路成为 emailVerifiedAt 非空的身份，再以自己的 Bearer token 接受 invitationId。操作者不能只把请求 userId 改成 reviewer 的 ID 来完成接受。自动化在隔离 PG 构造验证身份，不声称已完成真实收件。

## 并发、审计和撤权

成员管理、邀请创建/接受/撤销在 workspace 行锁下执行；同一邀请并发接受最多一次成功。操作及 WorkspaceAudit 同一事务：审计写入失败时业务变更回滚。审计保存 actor、action、targetId、role、时间，不保存邮箱、验证码或连接秘密。

后续请求通过数据库实时读取 membership，不在 JWT 缓存团队角色。已有 Run 的 snapshot/events/create/disable/cancel 等沿用 RunsRepository 的权限检查，新增成员不是所有写权限的通行证：例如 Operator 可创建 Run，Viewer 不可；版本写入仍受现有仓库规则限制。旧资源 owner 私有边界不自动开放。

本轮没有把“移除成员”实现成“撤销其已经产生的外部操作”。长运行的停用、重新授权、审批和外部写动作检查仍需后续明确实现。不能声称一次成员移除可撤销远端已接受动作。

## 迁移与边界

新增 migration 20261009000100_workspace_invitations 仅添加邀请与审计表，不改已有 user/owner/resource ID。已在隔离测试库应用；没有操作生产数据库。workspace 历史资源归属迁移、连接 use 独立授权、逐资源角色矩阵、邀请邮件发送、成员管理前端及审计查询 API 仍未完成。

本契约的默认邀请数量/有效期为当前实现的明确边界，不宣称是所有企业环境的通用最佳值。变更这些边界需同步自动化合同。
