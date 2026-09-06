# Birdbox Agent

Agent 是受管节点的主动连接模式。节点上的 `birdbox-agent` 以 root 身份运行，只向主控发起 HTTPS/HTTP 长轮询连接；主控不需要能够从公网 SSH 进入节点。现有 SSH 节点仍然完全兼容。

## 新建 Agent 节点

1. 在节点管理中点击“添加节点”，填写节点名称、Router ID、BIRD 主配置、生成配置和 Socket 路径。新建节点默认且只能使用 Agent；页面不再提供 SSH 新建选项。
2. 点击“生成准备脚本”，在目标 Linux/OpenWrt 节点以 root 执行完整脚本。
3. 脚本会按节点架构下载并校验 SHA-256 后安装 Agent、生成 systemd unit 或 OpenWrt procd 服务、写入 `/etc/birdbox/agent.env`，并为 BIRD 增加生成配置 include。
4. 等待 Agent 注册后点击“测试连接”，确认通过后保存节点。

主控生成脚本时使用 `BIRDBOX_PUBLIC_URL` 作为节点回连地址。生产环境必须把它设置为节点可达的主控 URL，不能使用监听地址 `0.0.0.0`。

## 旧 SSH 节点升级

编辑旧 SSH 节点，点击“生成 Agent 升级脚本”，在节点上执行脚本。脚本不会删除旧 SSH 配置。确认 Agent 在线后点击“切换为 Agent”，主控才会把后续预检、应用、回滚和状态采集切换为 Agent 通道。

切换失败时保留原 SSH 节点配置，重新执行升级脚本或从节点管理继续使用 SSH，不会影响已有 BIRD 会话。

## Agent RPC

Agent 使用以下主控接口：

- `POST /api/agent/register`
- `POST /api/agent/heartbeat`
- `POST /api/agent/tasks/poll`
- `POST /api/agent/tasks/:taskId/result`
- `GET /api/agent/releases/latest/download?arch=<arch>`
- `GET /api/agent/releases/latest/checksum?arch=<arch>`

结构化方法包括 `system.info`、`bird.inspect`、`bird.validate`、`bird.stage`、`bird.apply`、`bird.rollback`、`bird.protocol`、`bird.routes` 和 `agent.self_upgrade`。旧功能暂时通过受限的 `legacy.exec` 兼容，命令长度、超时、输入和输出均有上限。

## 升级 Agent

主控管理员可向在线 Agent 下发版本、下载地址和 SHA-256。Agent 下载到临时文件，校验摘要后原子替换二进制并重启服务；校验失败不会覆盖当前版本。

## 安全要求

- Agent token 只在生成脚本和创建响应中显示一次，库存接口不返回明文 token。
- Agent 必须以 root 运行；服务文件和环境文件仅允许 root 读取。
- 生产环境建议使用 HTTPS，并限制主控发布二进制的下载地址。
- 旧 SSH 节点保持 SSH 管理时，不需要安装 Agent；两种模式可以在同一套 Birdbox 库存中并存。
