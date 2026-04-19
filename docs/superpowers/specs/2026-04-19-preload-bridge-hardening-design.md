# Preload 桥接与 Sandbox 收口设计

**日期：** 2026-04-19

**状态：** 已确认，待实现

## 目标

把主渲染层与 overlay 窗口从“拿着半个 Electron 原生 API 直接调用”收紧为“只走项目定义的最小桥接接口”，并在此基础上把 preload 窗口切换到 `sandbox: true`。

## 当前问题

### 1. `window.electron` 暴露面过宽

当前 preload 直接把 `@electron-toolkit/preload` 的 `electronAPI` 展开到 `window.electron`。这个对象自带 `ipcRenderer`，等于主渲染层和 overlay 可以绕过业务 API，直接订阅和调用任意 IPC 通道。

### 2. 主渲染层存在多处原始 IPC 直连

当前这些逻辑直接使用 `window.electron.ipcRenderer`：

- 打开工具页
- 全局通知
- AutoClicker 状态事件
- 录屏选区打开/关闭
- 截图选区打开/关闭
- 系统自检
- 悬浮球热键设置
- 超级截图触发与结果回传

这使得“安全边界”只停留在口头约束，没有真正落实到桥接层。

### 3. 第一批仍保留 `sandbox: false`

第一批为了降低风险先统一了 `contextIsolation: true` 和 `nodeIntegration: false`，但 preload 窗口仍旧没有打开 Chromium sandbox。

## 设计结论

本批次采用“自定义最小桥接 + 显式 API 替换 + preload 窗口启用 sandbox”的方案。

## 方案细节

### 1. 停用 `electronAPI` 直通暴露

preload 不再把 `electronAPI` 或任何 `ipcRenderer` 直接暴露到 `window.electron`。

改为由项目自己的 `createElectronBridge` 生成桥接对象，只包含业务侧真正需要的方法和事件订阅器。

### 2. 补齐显式桥接 API

为当前仍依赖原始 IPC 的场景补齐最小接口：

- `app.onOpenTool`
- `app.onNotification`
- `doctor.runAudit`
- `autoClicker.onStarted` / `onStopped`
- `screenRecorder.openSelection` / `closeSelection` / `onIndicatorTimeUpdated`
- `screenshot.openSelection` / `closeSelection` / `onTrigger` / `onSelectionResult`
- `floatBall.setHotkey` / `onVisibilityChanged`

同时渲染层和 overlay 组件全部切换到这些显式 API，不再保留原始 `ipcRenderer` 兜底通道。

### 3. preload 窗口启用 `sandbox: true`

在桥接面收紧后，把 preload 窗口统一切到：

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`

这一步覆盖主窗口和所有基于 preload 的子窗口。

## 错误处理

- 本批次不改变主进程 IPC 业务语义
- 只收紧桥接方式与窗口权限边界
- 若某个渲染入口遗漏了原始 IPC 替换，TypeScript 声明和 preload 单测会先把问题暴露出来

## 测试策略

- 为 `createElectronBridge` 增加纯单测，锁定“无原始 `ipcRenderer` 暴露”和关键 API 的通道映射
- 更新 `windowSecurity` 单测，要求 `sandbox: true`
- 更新窗口测试，要求关键窗口显式启用 `sandbox: true`
- 更新录屏提示窗 HTML 测试，要求不再引用 `window.electron.ipcRenderer`

## 非目标

- 不重写所有 preload API 的参数类型
- 不新增权限提示 UI
- 不在本批次收 CI、签名、自动更新
