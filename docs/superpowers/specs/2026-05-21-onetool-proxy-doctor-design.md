# OneTool Proxy Doctor Integration Design

## 目标

将 OneTool 现有的“本地代理”工具升级为“代理医生”，保留原工具入口和路由 ID `local-proxy-manager`，在不拆出新应用的前提下，把 Proxy Doctor 的开发代理诊断能力整合进 OneTool。

第一版以 Windows 为主，覆盖用户级系统代理、WinHTTP、命令行环境变量、Git、npm、端口探测、进程环境诊断和报告导出。macOS 不在第一版交付范围内，但服务边界要为后续平台适配留出清晰位置。

## 当前上下文

OneTool 已经有完整的 Electron + React + TypeScript 桌面框架、Windows 打包发布链路、IPC 桥、通知系统和工具路由。当前代理功能位于：

- `src/main/services/LocalProxyService.ts`
- `src/main/ipc/localProxyIpc.ts`
- `src/preload/createElectronBridge.ts`
- `src/renderer/src/tools/LocalProxyManagerTool.tsx`
- `src/shared/types.ts`

现有能力只管理 Windows WinINET 用户级系统代理，并明确不改动 WinHTTP。Proxy Doctor 独立仓库已有 Git、npm、环境变量、端口和诊断报告等思路，但 macOS 绑定较深。整合进 OneTool 比继续维护独立跨平台桌面应用更合适。

## 方案选择

采用“增强现有本地代理工具”的方案。

不新增并列工具，不更换工具 ID，不新建独立应用。用户仍从 OneTool 的“本地代理”入口进入，但页面标题和能力升级为“代理医生”。这样可以复用现有路由、置顶状态、侧边栏配置、打包流程和视觉系统。

## 范围

第一版包含：

- 目标代理输入：支持 `host:port`、纯端口、`http://`、`https://`、`socks5://`。
- WinINET 系统代理：读取、启用、关闭、写入旁路规则、打开 Windows 代理设置页。
- WinHTTP 代理：读取 `netsh winhttp show proxy`，支持从 WinINET 同步，支持重置。
- 用户级环境变量：读取和写入 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、小写变量、`NO_PROXY`、`no_proxy`。
- Git 代理：读取、写入、清除 `git config --global http.proxy` 和 `https.proxy`。
- npm 代理：读取、写入、清除 `npm config get/set/delete proxy` 和 `https-proxy`。
- 端口探测：检查目标代理 host/port 是否可连接。
- 进程诊断：读取当前 OneTool/Electron 进程代理环境；Codex 进程诊断以可扩展接口实现，如果第一版无法稳定枚举外部进程环境，则显示明确的不可用说明。
- 诊断报告：生成可复制或导出的文本报告，包含每层状态、当前值、冲突点和建议动作。
- 一键修复：将目标代理统一写入 WinINET、WinHTTP、用户环境、Git、npm。
- 一键清理：关闭 WinINET、重置 WinHTTP、清除用户环境、清除 Git/npm 显式代理。

第一版不包含：

- 修改管理员级机器环境变量。
- 修改 PAC 脚本内容或自动代理脚本。
- 强杀或重启 Codex、浏览器、终端等外部应用。
- macOS `launchctl`、LaunchAgent、`.zshrc` 写入。
- Linux 代理适配。

## 架构

后端继续以 `LocalProxyService` 作为入口，但内部拆成清晰的单元：

- `ProxyTarget`：代理地址规范化结果，包括协议、host、port、完整 URL、WinINET server 字符串。
- `ProxyLayerStatus`：单层状态，包含层 ID、名称、状态级别、当前值、说明、建议动作、是否可修复。
- `ProxyDoctorSnapshot`：完整诊断快照，包含目标代理、端口状态、所有层状态、汇总状态和报告文本。
- `WindowsProxyAdapter`：Windows 专属系统操作，负责 WinINET、WinHTTP、用户环境变量、进程环境查询。
- `ToolProxyAdapter`：开发工具代理操作，负责 Git 和 npm。

第一版可以先在 `LocalProxyService.ts` 中实现这些结构和私有方法，避免过早拆太多文件。若文件明显变大，再将 Windows 和工具适配器提取到 `src/main/services/proxyDoctor/` 下。

## IPC 与类型

在 `src/shared/types.ts` 增加共享类型：

- `ProxyDoctorLayerId`
- `ProxyDoctorLayerState`
- `ProxyDoctorLayerStatus`
- `ProxyDoctorSnapshot`
- `ProxyDoctorTarget`
- `ProxyDoctorApplyRequest`

扩展 preload 暴露的 `localProxy` API：

- `getStatus()`：保留现有 API，兼容旧 UI。
- `setConfig(config)`：保留现有 API。
- `disable()`：保留现有 API。
- `openSystemSettings()`：保留现有 API。
- `doctorScan(target)`：返回完整诊断快照。
- `doctorApplyAll(request)`：一键修复。
- `doctorClearAll()`：一键清理。
- `doctorFixLayer(layerId, target)`：单层修复。
- `doctorClearLayer(layerId)`：单层清理。

这样旧能力不被破坏，新页面可以逐步迁移到更完整的医生接口。

## UI 设计

`LocalProxyManagerTool.tsx` 保持单页面，但信息结构重排。

顶部区域显示：

- 页面标题“代理医生”。
- 目标代理输入框。
- 总状态：已统一、未启用、存在冲突、无法诊断。
- 端口连通性提示。
- 刷新按钮、系统设置按钮。

主操作区显示：

- “一键修复开发代理”主按钮。
- “清除开发代理”危险按钮。
- 当前 WinINET 开关和旁路规则编辑入口。

诊断区显示分层列表：

- Windows 系统代理
- WinHTTP 代理
- 命令行环境变量
- Git 代理
- npm 代理
- 当前进程
- Codex 进程

每层展示当前值、状态标签、影响范围、建议动作，并提供“修复此层”或“清除此层”。高级区域折叠显示执行日志和报告导出。

视觉上沿用 OneTool 当前 Tailwind、lucide-react 和本地 UI 组件，不引入新依赖。页面密度比当前代理页略高，但保持普通用户先看到结论和主按钮，细节放在诊断列表里。

## 状态判定

单层状态：

- `ok`：当前值匹配目标代理。
- `off`：该层未设置代理。
- `conflict`：该层设置了代理，但不匹配目标代理。
- `unavailable`：依赖工具不存在或平台不支持。
- `error`：读取或操作失败。

汇总状态：

- 所有可管理核心层匹配目标代理时为“已统一”。
- 所有核心层关闭时为“未启用”。
- 任一核心层冲突时为“存在冲突”。
- 读取失败过多或目标代理无效时为“无法诊断”。

核心层第一版定义为 WinINET、WinHTTP、用户环境变量、Git、npm。进程诊断只作为证据层，不阻断一键修复结果。

## 安全与错误处理

所有写入动作必须由用户点击触发，不在页面加载时自动修改系统状态。

危险动作需要确认：

- 一键修复：说明会写入 WinINET、WinHTTP、用户环境变量、Git、npm。
- 一键清理：说明会关闭或清除上述开发代理配置。
- 单层清理：说明具体影响范围。

命令执行失败时返回结构化错误，不把原始长堆栈直接展示给用户。界面使用通知和层内错误文案提示，同时在高级日志中保留命令摘要和错误详情。

用户环境变量写入后，需要提示“新打开的终端或应用才会继承新环境”。不尝试修改已运行进程的环境变量。

## 测试计划

服务层测试：

- 代理地址规范化：纯端口、host:port、完整 URL、非法端口、非法协议。
- WinINET ProxyServer 解析：HTTP/HTTPS、SOCKS、空值、异常格式。
- WinHTTP 输出解析：Direct access、代理服务器、旁路列表、中文/英文输出。
- Git/npm 输出解析：未安装、未设置、已设置、命令失败。
- 状态汇总：全匹配、全关闭、冲突、不可用、错误。
- 一键修复和清理：通过 mock PowerShell/命令执行验证命令构造和错误路径。

界面测试：

- 初始加载显示骨架或加载态。
- 扫描成功显示汇总和分层状态。
- 冲突状态显示修复按钮。
- 一键修复和清理触发正确 IPC。
- 失败状态显示通知和层内错误。

验证命令：

- `npm test -- src/main/services/LocalProxyService.test.cjs`
- `npm test -- src/renderer/src/tools/LocalProxyManagerTool.test.cjs`
- `npm run typecheck`
- `npm run build`

## 迁移策略

第一步先保留现有 `getStatus`、`setConfig`、`disable` API，避免影响当前页面和外部调用。新增医生 API 后改造 UI。UI 切换完成后，旧 API 仍可作为兼容方法留在服务中。

工具元数据仍使用 `local-proxy-manager`，显示名可以从“本地代理”改为“代理医生”或“本地代理医生”。如担心用户找不到，可描述中保留“本地代理”。

## 后续扩展

macOS 适配可以在下一阶段接入：

- Shell 配置：`.zshrc` 或用户选择的 shell 配置文件。
- GUI 环境：`launchctl getenv/setenv/unsetenv`。
- 登录持久化：用户级 LaunchAgent。
- 系统代理读取：`scutil --proxy`。

这些能力应通过平台适配器接入同一套 `ProxyDoctorSnapshot` 和 UI 分层模型，而不是恢复独立 SwiftUI 应用的分叉维护。
