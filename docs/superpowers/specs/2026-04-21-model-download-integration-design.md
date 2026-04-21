# Model Download Integration Design

## Goal

将 `ModelToolKits` 的模型下载能力完整整合进 `onetool`，以原生工具页提供 `HuggingFace` 与 `ModelScope` 的整仓/单文件下载、`HF Token`、镜像加速、目录选择、实时日志与常用站点入口，并确保 Windows 安装包开箱即用。

## Scope

- 保留原工具的全部用户可见能力。
- 不嵌入原 `customtkinter` 窗口。
- 不把下载逻辑改写为 Node/TypeScript。
- 不在第一版实现多任务队列或下载历史。

## Architecture

### Renderer

新增 `模型下载` 工具页，负责：

- 平台切换
- 仓库 ID 与单文件路径输入
- 保存目录选择
- `HF Token` 与镜像开关
- 运行状态展示
- 日志面板
- 常用站点快速打开

### Main Process

新增模型下载服务，负责：

- 解析内置运行时路径
- 管理 Python 子进程生命周期
- 校验任务参数
- 流式转发日志与状态
- 取消任务
- 打开目录

### Runtime Resource

打包一套精简的 Python 运行时目录到 `resources/model-download`，包含：

- `python.exe`
- `huggingface_hub` 与 `modelscope` 相关依赖
- `downloader.py` 入口脚本

## Data Flow

1. 渲染层通过 IPC 发起下载任务。
2. 主进程校验参数并确认当前无活动任务。
3. 主进程调用内置 Python 运行 `downloader.py`。
4. Python 脚本通过标准输出回传结构化事件与原始日志。
5. 主进程解析日志并广播最新状态到工具页。
6. 工具页展示实时日志并在完成后允许打开目录或重新下载。

## State Model

- `idle`
- `running`
- `success`
- `error`
- `cancelled`

状态中包含：

- 当前请求参数
- 当前日志列表
- 最近一次输出目录
- 最近一次错误
- 运行时可用性

## Packaging

- `resources/model-download/python/**/*`
- `resources/model-download/downloader.py`

通过 `electron-builder.extraResources` 打入安装包。

## Error Handling

- 缺少运行时资源时，在工具页显示明确错误。
- 同时只允许一个活动下载任务。
- 子进程异常退出时保留日志并标记为 `error`。
- 用户取消任务时标记为 `cancelled`，不伪装成失败。

## Testing

- `ModelDownloadService` 服务测试
- `modelDownloadIpc` IPC 注册测试
- `createElectronBridge` 新 API 映射测试
- `modelDownload` 共享类型纯函数测试

