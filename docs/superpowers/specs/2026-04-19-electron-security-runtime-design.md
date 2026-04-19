# Electron 安全与运行边界加固设计

**日期：** 2026-04-19

**状态：** 已确认，待实现

## 目标

把当前 Electron 应用从“功能可运行”收紧到“窗口权限边界清晰、运行时能力最小化”的基线状态。

本批次只处理窗口安全和运行边界，不扩展到 CI、签名、自动更新或托盘体验。

## 当前问题

### 1. 窗口权限配置分散

主窗口、悬浮球、截图覆盖层、取色覆盖层、录屏提示条和录屏边框窗分别手写 `webPreferences`，导致权限模型不一致，后续很难确认哪些窗口真的需要 Node 能力。

### 2. 录屏提示窗直接依赖 `require('electron')`

录屏提示条的内联页面通过 `require('electron')` 直接拿 `ipcRenderer`。这迫使窗口打开 `nodeIntegration: true` 与 `contextIsolation: false`，是当前最明显的高风险入口。

### 3. preload 窗口没有统一收口

仓库已经有成熟的 preload 桥接能力，且 `window.electron` 类型已经在渲染层定义，但大多数窗口仍然只显式设置了 `sandbox: false`，没有统一声明 `contextIsolation: true` 和 `nodeIntegration: false`。

## 设计结论

本批次采用“统一安全配置助手 + 录屏提示窗切换到 preload 桥接”的方案。

## 方案细节

### 1. 新增统一窗口安全助手

新增 `src/main/utils/windowSecurity.ts`，提供一个极小的工厂函数，专门生成 preload 窗口的安全 `webPreferences`：

- `preload` 指向给定 preload 路径
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: false`

这里暂时保留 `sandbox: false`，是为了降低这批改动的运行风险。当前 preload 暴露面较大，直接切到 `sandbox: true` 会让一批依赖 Node 能力的 preload 代码一起进入回归面，不适合作为第一批成熟化改造。

### 2. 统一迁移 preload 窗口

以下窗口统一改用助手函数：

- 主窗口
- 取色覆盖层
- 屏幕覆盖层
- 截图选择层
- 悬浮球窗口
- 录屏提示窗
- 录屏边框窗

结果是所有这些窗口都显式进入同一套权限模型，而不是靠 Electron 默认值或历史残留行为。

### 3. 录屏提示窗停用 Node 注入

录屏提示条内联 HTML 改为使用 `window.electron`：

- 停止录制走 `window.electron.screenRecorder.stopRecording()`
- 录制时长更新走 `window.electron.ipcRenderer.on('update-time', ...)`

这样录屏提示窗可以与其他 preload 窗口保持同样的隔离策略。

## 错误处理

- 只改权限边界，不改变窗口创建失败后的业务返回语义
- 若 preload 没有正确注入，录屏提示窗将失去停止与计时能力，因此本批次必须补测试锁住 HTML 内容与窗口配置

## 测试策略

本批次只补最小回归测试：

- `windowSecurity` 纯单测，锁定统一 `webPreferences`
- `WindowManagerService` 测试悬浮球窗口是否使用隔离配置
- `ScreenRecorderService` 测试提示窗和边框窗是否使用隔离配置，并确认提示窗 HTML 不再包含 `require('electron')`

## 非目标

- 不在本批次启用 `sandbox: true`
- 不重构 preload API 面积
- 不处理 CI、签名、自动更新、托盘、关闭行为
- 不清理所有 Electron 安全告警，只先收最高风险入口
