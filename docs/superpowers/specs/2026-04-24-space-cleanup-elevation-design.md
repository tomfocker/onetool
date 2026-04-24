# 空间分析 NTFS 极速扫描提权设计

**日期：** 2026-04-24

**状态：** 已确认，待实现

## 目标

在保持 OneTool 主应用继续以普通权限运行的前提下，让“空间分析”的 NTFS 极速扫描在需要时单独请求管理员权限，确保本地 NTFS 根盘始终优先走 `ntfs-fast-scan.exe`，而不是长期退回普通递归扫描。

这轮设计只解决：

- NTFS 极速扫描的权限获取
- 提权后结果如何安全回传主应用
- 用户拒绝 UAC 或提权失败时的明确反馈

这轮不解决：

- 把整个 OneTool 变成管理员应用
- 把 NTFS 快扫改造成普通权限可读的实现
- 非 Windows 平台的磁盘极速扫描

## 背景与结论

当前空间分析的快扫实现已经能确定两件事：

1. `fsutil` 在部分机器上会被拒绝访问，不能再作为是否允许 NTFS 快扫的硬门槛。
2. `ntfs-fast-scan.exe` 当前通过 `CreateFileW("\\\\.\\D:")` 打开裸卷，并使用 `FSCTL_ENUM_USN_DATA` / `FSCTL_GET_NTFS_FILE_RECORD` 读取 USN Journal 与 MFT。这条路径在普通权限下会直接返回 `Access denied (os error 5)`。

因此，“必须走 NTFS 快扫”的现实前提不是继续优化普通扫描，而是为快扫单独补一条提权执行链路。

## 方案对比

### 方案 A：整个应用强制管理员运行

做法：

- 给 Windows 主程序设置 `requestedExecutionLevel=requireAdministrator`

优点：

- 实现最简单
- 快扫天然可用

缺点：

- 每次启动 OneTool 都要 UAC
- 自动更新、拖拽、普通工具使用体验都会受到影响
- 风险外溢到整个应用

### 方案 B：仅 NTFS 快扫单独提权

做法：

- 主应用保持 `asInvoker`
- 空间分析在真正开始 NTFS 快扫前拉起一个提权 helper
- helper 在管理员权限下启动 `ntfs-fast-scan.exe`
- 主应用通过临时事件文件读取扫描进度和结果

优点：

- UAC 只在需要时出现
- 其他工具保持普通权限
- 产品边界清晰

缺点：

- 需要新增 helper 与临时事件文件协议

### 方案 C：常驻后台服务

做法：

- 安装一个系统服务或后台常驻代理，专门负责磁盘快扫

优点：

- 长期最完整

缺点：

- 超出 `v0.2.0` 合理范围
- 安装、更新、调试成本过高

### 推荐

采用 **方案 B：仅 NTFS 快扫单独提权**。

这是当前项目里最现实、风险最小、用户体验最可控的路线。

## 核心设计

### 执行链路

```text
Renderer SpaceCleanupTool
  -> Main SpaceCleanupService
  -> 判断目标是否为本地盘根路径
  -> 若当前进程已管理员: 直接启动 ntfs-fast-scan.exe
  -> 若当前进程非管理员: 启动 elevate helper (runas)
  -> helper 在管理员权限下执行 ntfs-fast-scan.exe
  -> ntfs-fast-scan JSON Lines 写入临时事件文件
  -> Main 轮询读取事件文件并还原为 SpaceCleanupSession
  -> Renderer 消费统一的 progress / complete / error 事件
```

### 为什么用临时事件文件

第一版不用命名管道或 socket，直接使用临时 JSONL 事件文件，原因是：

- Electron 主进程和提权 helper 之间边界清晰
- 实现简单，容易排查
- 扫描器本身已经输出 JSON Lines，几乎不用改协议
- 用户拒绝 UAC 或 helper 启动失败时，主进程更容易稳定回退

### 会话模型

空间分析会话继续沿用 `SpaceCleanupSession`，但增加一层“提权快扫状态”：

- `scanMode='ntfs-fast'`
- `status='scanning'`
- `scanModeReason='正在请求管理员权限以执行 NTFS 极速扫描'`

一旦 helper 成功启动并写入 `volume-info`，`scanModeReason` 清空。

如果用户拒绝 UAC 或 helper 无法启动，则转回：

- `scanMode='filesystem'`
- `scanModeReason='你拒绝了管理员权限请求，已回退到普通扫描'`

如果 helper 提权成功但 native scanner 仍失败，则保留：

- `scanMode='filesystem'`
- `scanModeReason='NTFS 极速扫描失败，已回退到普通扫描：...'`

## 组件划分

### 1. SpaceCleanupService

继续作为统一入口，但新增职责：

- 判断当前是否管理员
- 创建本轮扫描的临时工作目录
- 在需要时启动提权 helper
- 轮询读取事件文件
- 把事件文件里的 JSON Lines 还原为 `NtfsFastScannerBridgeEvent`

不负责：

- 自己执行 UAC 交互细节
- 直接拼装复杂 shell 命令

### 2. ElevatedNtfsScanRunner

新增一个主进程侧的小模块，负责：

- 生成临时工作目录
- 写入 helper 所需的 manifest JSON
- 用 `PowerShell Start-Process -Verb RunAs` 启动 helper
- 返回本轮扫描的 `done/cancel/watch` 句柄

### 3. 提权 helper 脚本

新增一个 Windows 专用脚本，例如：

- `scripts/run-elevated-ntfs-fast-scan.ps1`

职责：

- 以管理员权限读取 manifest
- 启动 `ntfs-fast-scan.exe scan --root <path>`
- 将 stdout 原样转写到事件文件
- 将 stderr 写到错误文件
- 写出退出码文件

helper 不负责任何 UI，只负责提权后代跑。

### 4. NtfsFastScannerBridge

现有桥接层保留，新增一个“从事件文件消费 JSON Lines”的变体，而不是只支持直接 spawn 子进程 stdout。

可以新增两种入口：

- `start(rootPath, onEvent)`：当前已有，直接本地起扫描器
- `startElevated(rootPath, onEvent)`：通过 helper + 临时事件文件消费

## 权限策略

### 检查是否管理员

新增一个 Windows 工具函数，例如：

- `src/main/utils/windowsAdmin.ts`

职责：

- 检测当前进程是否管理员

推荐实现：

- PowerShell `WindowsPrincipal.IsInRole(Administrator)` 的等价 Node 方式
- 只在 Windows 下可用

### UAC 触发时机

只有满足以下条件时才触发：

- 平台为 Windows
- 目标路径是本地盘根路径，如 `D:\`
- 目标被判定为应该走 `ntfs-fast`
- 当前进程不是管理员

### 用户拒绝 UAC 时

这不是异常崩溃，而是产品分支：

- 快扫中止
- 自动回退普通扫描
- 明确提示拒绝管理员权限导致无法使用 NTFS 极速扫描

## UI 行为

### 启动阶段

点击“开始扫描”后：

- 若当前已管理员：直接显示 `极速扫描（NTFS）`
- 若当前非管理员且符合快扫条件：先显示 `正在请求管理员权限`

### 用户拒绝时

页面提示：

- `你拒绝了管理员权限请求，已回退到普通扫描`

### 提权成功时

页面应继续显示：

- `极速扫描（NTFS）`

不需要额外弹窗。

### 错误提示

不能再显示底层错误原文：

- `failed to open NTFS volume \\.\D:`
- `os error 5`

而应转换为产品文案：

- `当前进程没有管理员权限，NTFS 极速扫描需要提升权限后才能直接访问磁盘卷`

## 文件与模块建议

### 新增

- `D:\code\onetool\src\main\utils\windowsAdmin.ts`
- `D:\code\onetool\src\main\utils\windowsAdmin.test.cjs`
- `D:\code\onetool\src\main\services\ElevatedNtfsScanRunner.ts`
- `D:\code\onetool\src\main\services\ElevatedNtfsScanRunner.test.cjs`
- `D:\code\onetool\scripts\run-elevated-ntfs-fast-scan.ps1`

### 修改

- `D:\code\onetool\src\main\services\SpaceCleanupService.ts`
- `D:\code\onetool\src\main\services\SpaceCleanupService.test.cjs`
- `D:\code\onetool\src\main\services\NtfsFastScannerBridge.ts`
- `D:\code\onetool\src\main\services\NtfsFastScannerBridge.test.cjs`
- `D:\code\onetool\src\renderer\src\tools\SpaceCleanupTool.tsx`

## 测试策略

### 主进程测试

至少覆盖：

- 当前进程已管理员时，直接走本地 NTFS 快扫
- 当前进程非管理员时，快扫会转到提权 helper
- 用户拒绝 UAC 时会回退普通扫描
- helper 启动成功但 native scanner 失败时，仍回退普通扫描
- 事件文件中的 JSON Lines 能被正确回放为进度事件

### helper 测试

脚本不做端到端真实 UAC 自动化，但至少验证：

- manifest 解析
- stdout 转发到事件文件
- stderr 和退出码落盘

### 集成验证

必须在真实 Windows 环境验证：

- 普通权限启动 OneTool
- 对 `D:\` 发起 NTFS 快扫
- 触发 UAC
- 同意后走快扫
- 拒绝后回退普通扫描

## 风险与边界

### 风险 1：UAC 被认为打扰

这是不可避免的，因为当前快扫实现就是需要裸卷访问。

缓解方式：

- 只在根盘 NTFS 快扫时触发
- 不让整个应用全程管理员

### 风险 2：事件文件轮询复杂度上升

第一版接受这个复杂度，因为它远低于引入命名管道或服务。

### 风险 3：便携版/安装版路径差异

helper 不能硬编码扫描器路径，必须从 manifest 读取。

## 验收标准

完成后应满足：

- 普通权限启动 OneTool 时，`D:\` 根盘扫描能请求管理员权限并成功走 NTFS 极速扫描
- 用户拒绝 UAC 时，普通扫描仍可继续
- UI 明确显示当前模式和原因
- 不再向用户暴露原始 `CreateFileW` / `os error 5` 级别的底层错误

## 非目标

本轮不做：

- 整个 OneTool 强制管理员启动
- 基于服务的长期提权方案
- 将 `ntfs-fast-scan` 改成普通权限可读的全新实现
