# Kernel 导出策略实机测试用例

本文用于在测试节点上验收 Kernel 导出策略的两种模式：快速设置 `krt_prefsrc`，以及原有的可视化 Function/Filter 策略。测试只应使用专用测试节点和测试路由，避免修改生产 BIRD 配置。

## 测试准备

1. 准备一台或两台运行 BIRD 2 的测试节点，节点已通过 Birdbox Agent 接入，且 Agent 版本与主控一致。
2. 为测试节点准备一条 IPv4 地址和一条 IPv6 地址。示例使用文档地址 `192.0.2.1`、`2001:db8::1`，实际测试替换为节点真实地址。
3. 在“资源管理”中确认存在可用的 Function、Filter 和 Define；可视化策略测试只引用作用域覆盖测试节点的资源。
4. 每次应用前先点击“预检配置”，确认生成配置中的协议名称、地址族和策略与表单一致。
5. 在节点上记录应用前状态，便于回滚：

```sh
birdc show protocols
ip route show table main
ip -6 route show table main
```

## 用例矩阵

### KE-01：IPv4 快速设置

- 在 Kernel 资源中只启用 IPv4。
- IPv4 导出策略选择“快速设置 `krt_prefsrc`”，填写 IPv4 源地址。
- 预检并应用。

预期：配置预览出现 `ipv4 { ... export filter { ... krt_prefsrc = <IPv4>; accept; } }`，没有 IPv6 Kernel 协议；BIRD 配置检查通过，应用后 Kernel 协议为 `up`。

### KE-02：IPv6 快速设置

- 只启用 IPv6。
- IPv6 导出策略选择快速模式，填写 IPv6 源地址。
- 预检并应用。

预期：只生成 IPv6 Kernel 协议，`krt_prefsrc` 为 IPv6 地址；`bird -p` 检查通过，协议状态为 `up`。

### KE-03：双栈分别配置

- 同时启用 IPv4、IPv6。
- IPv4 选择快速模式，IPv6 选择“可视化编辑”，将 IPv6 策略设为导出所有。
- 修改 IPv4 源地址，观察预览变化，再修改 IPv6 策略，观察预览变化。

预期：生成两个独立的 Kernel 协议实例；IPv4 只出现 `krt_prefsrc`，IPv6 只出现 `export all`。修改一族不会改变另一族的设置。

### KE-04：可视化 Function/Filter

- 将 IPv4 或 IPv6 切换到可视化模式。
- 添加一个可用 Function，或切换到自定义 Filter。
- 预检并应用。

预期：配置预览反映 Function/Filter；预检会校验作用域、启用状态和依赖关系。引用不存在或不可用资源时，保存失败且节点原配置不变。

### KE-05：非法地址族拦截

- IPv4 快速模式填写 IPv6 地址，或 IPv6 快速模式填写 IPv4 地址。
- 尝试预检或保存。

预期：页面提示对应地址族错误，不生成或下发候选配置；修正地址后才能继续。

### KE-06：旧配置兼容

- 使用只有旧共享 `exportPolicy`、没有 `exportPolicies` 字段的既有 Kernel 资源。
- 打开编辑器后不修改策略，直接预检；再分别切换 v4/v6 策略并保存。

预期：打开时 v4/v6 都继承旧导出策略；不修改时生成结果与升级前一致。保存后写入新的 v4/v6 字段，同时保留兼容用共享字段。

### KE-07：作用域与下发范围

- 创建“指定节点”的 Kernel 资源，只选择测试节点 A。
- 应用后确认节点 A 有协议，节点 B 没有协议。
- 切换为“所有节点”并应用。

预期：下发范围严格按照选择器变化；切换范围不会丢失各地址族导出策略。

### KE-08：重复应用与回滚

- 对同一资源连续应用两次，不修改表单。
- 将 `krt_prefsrc` 改为另一个合法地址并应用；再改回原地址并应用。

预期：重复应用幂等，无重复协议；每次应用后协议状态正常，失败时保留上一个已生效配置。

## 节点侧检查

在每次应用后执行以下检查，并记录输出：

```sh
bird -p -c /var/lib/birdbox/generated.conf
birdc show protocols all <kernel-protocol-name>
ip route show table <table-id>
ip -6 route show table <table-id>
```

确认 `bird -p` 返回成功，目标 Kernel 协议状态为 `up`，并且路由表中的路由源地址符合快速模式设置。可视化模式则确认 Filter 的 accept/reject 行为符合预期。

## 本次实现已执行的自动化实机检查

本机 `/usr/sbin/bird` 为 BIRD 2.17.5，已使用真实 BIRD 解析器对双栈 `krt_prefsrc` 生成配置执行 `bird -p -c <temporary-config>`，解析通过；同时完成项目完整测试、服务端/前端类型检查和生产构建。
