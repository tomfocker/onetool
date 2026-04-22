# 移除 CapsWriter 主应用接线设计

## 背景

当前 `CapsWriter` 语音输入工具并不是随 `onetool` 一起可用的内置能力。主进程服务会直接调用固定外部目录 `C:\CapsWriter-Offline` 下的可执行文件，因此用户单独安装 `onetool` 后，该功能默认不可用。

对 `v0.1.0` 首发来说，这属于默认不可工作的功能入口，不应继续保留在主应用中。

## 目标

- 从主应用移除 `CapsWriter` 工具入口与所有运行时接线
- 保留相关源码到仓库内的备用目录，便于未来重新接回
- 不影响其他工具的路由、预加载桥接与主进程初始化

## 方案

采用“主应用移除 + 备用目录归档”方案：

1. 从工具列表与首页展示中移除 `capswriter`
2. 从 preload bridge 中移除 `window.electron.capswriter`
3. 从主进程移除 `CapsWriterService` 初始化、IPC 注册和退出清理
4. 将相关源码移动到 `backup/capswriter/`，不参与构建
5. 更新 README，避免继续宣传该能力

## 非目标

- 不尝试把 `CapsWriter-Offline` 内置进安装包
- 不做新的语音输入替代方案
- 不在首发版本保留“未安装依赖”的占位页面

## 验收标准

- 主应用工具列表不再出现 `capswriter`
- preload bridge 不再暴露 `capswriter` API
- 测试与构建继续通过
- 相关源码仍保存在 `backup/capswriter/`
