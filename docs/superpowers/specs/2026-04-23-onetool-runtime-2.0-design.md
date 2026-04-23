# OneTool Runtime 2.0 Design

## Goal

把 `onetool` 从“功能持续叠加的本地工具箱”推进到“辅助窗口秒开、智能能力统一复用、主进程可持续扩展”的运行时架构。该设计优先解决辅助窗口启动迟滞、主进程入口过重、LLM/OCR 能力散落，以及配置/共享契约演进风险。

## Scope

- 重构截图翻译、取色、录屏选区、截图选区等辅助窗口的启动路径与生命周期。
- 建立统一的 `LLM + OCR + multimodal` 能力层，供多个工具复用。
- 拆分主进程启动链，明确窗口、IPC、后台服务、warmup 的边界。
- 为 `settings/global-store` 引入正式的 schema 与 migration 机制。
- 收紧 preload/renderer/shared 的契约与类型边界。

## Out of Scope

- 不在这一轮引入通用聊天页面。
- 不在这一轮实现多 agent 工作流编排。
- 不在这一轮推翻现有 UI 视觉设计体系。
- 不强行重写成熟工具的业务逻辑，只围绕运行时骨架做必要拆分。

## Current Problems

### Auxiliary Window Startup

- `screen-overlay`、`color-picker-overlay`、`recorder-selection`、`screenshot-selection` 仍有冷启动迟滞。
- 当前虽然已完成轻量 bootstrap，但屏幕抓取、会话复位、窗口预热策略仍不统一。
- 辅助窗口之间存在重复模式：预创建、复用、截图分发、关闭回收、快捷键触发。

### Main Process Weight

- `src/main/index.ts` 仍承担过多启动编排职责。
- 服务初始化、IPC 注册、窗口创建、健康检查、更新器初始化耦合在同一入口。
- 启动性能和维护成本都受影响，后续继续加工具会继续放大这个问题。

### AI Capability Fragmentation

- `OCR`、`翻译`、`系统诊断建议`、`重命名建议`、`空间清理建议` 已经接入了统一方向，但还没有正式的平台层结构。
- 工具依然偏向“先做一个功能，再补一层通用服务”，长期会导致 prompt、错误处理、请求节流、配置复用继续分散。

### Contract and State Evolution

- `shared` 模型还偏集中，领域边界不清晰。
- `settings/global-store` 缺少显式版本迁移层。
- preload bridge 虽已收口，但随着工具增加，仍需要更明确的领域 API 边界。

## Architecture

### 1. Utility Window Runtime

新增统一的辅助窗口运行时层，负责：

- 预创建与隐藏复用
- 会话启动和重置
- 截图/缩略图分发
- 当前显示器定位
- 生命周期回收

该层不关心具体业务，只关心“如何更快、更稳地打开一个覆盖型工具窗口”。现有 `ScreenOverlayService` 的复用思路会推广到：

- `ColorPickerService`
- `ScreenRecorderService` 的选区窗口部分
- `ScreenshotService` 的选区窗口部分

### 2. Capture Pipeline

建立统一的抓屏与局部截图策略，目标是“只在真正需要时抓当前显示器/区域”：

- 启动辅助窗口时优先显示遮罩，不阻塞在全量抓屏。
- 进入交互后才按显示器或选区请求截图。
- 优先抓当前焦点显示器，而不是默认全屏幕集合。
- 对 OCR-only 与 translate 两种路径使用统一下采样和坐标映射。

### 3. AI Platform Layer

在 main 进程内形成正式的智能能力层：

- `LlmService`: provider 配置、请求、超时、错误归一化、结构化响应
- `OcrService`: worker 生命周期、文本归一化、块/行坐标提取
- 工具适配器：截图理解、重命名建议、系统诊断、空间清理建议

renderer 只依赖明确 IPC，不直接处理 provider 差异，也不持有任何密钥。

### 4. Main Bootstrap Split

把主进程入口拆成 4 类 bootstrap：

- `window bootstrap`
- `ipc bootstrap`
- `background services bootstrap`
- `optional warmup bootstrap`

最终 `src/main/index.ts` 只保留高层顺序与生命周期钩子，不再堆满初始化细节。

### 5. Contracts and Persistence

收紧这几类边界：

- `shared/llm`
- `shared/settings`
- `shared/store`
- `shared/utilityWindowRuntime`

同时给 `SettingsService` 与 `StoreService` 引入显式 schema、版本号和 migration 流程，避免后续字段扩展继续依赖隐式 merge 修补。

## Data Flow

### Auxiliary Window Session

1. 工具页或快捷键触发某个辅助窗口会话。
2. main 进程复用预创建窗口，并下发新的 session payload。
3. renderer 覆盖页收到会话事件后重置本地 UI 状态。
4. main 进程按当前显示器或局部策略异步抓图。
5. renderer 收到截图后开始交互。
6. 完成操作后窗口隐藏回池，而不是销毁。

### AI-Enhanced Tool Flow

1. renderer 发起工具级请求。
2. main IPC 转发到智能能力层。
3. `OcrService` / `LlmService` / 工具适配器执行工作。
4. main 返回结构化结果，而不是工具自行解释原始文本。
5. renderer 只负责展示与用户确认。

## Error Handling

- 预创建窗口失败时，退回一次性创建路径，不让工具完全不可用。
- 当前显示器定位失败时，退回已有的全屏抓取逻辑。
- LLM/OCR 任一层失败，都返回结构化错误并保留可重试状态。
- migration 失败时，保底回退到默认结构并记录诊断日志。

## Testing Strategy

- `node:test` 覆盖辅助窗口 runtime 行为，包括预创建、复用、会话重置、截图补发。
- `preload` bridge 测试覆盖新会话事件和领域 API。
- `shared` 纯函数测试覆盖坐标、文本归一化、migration helper。
- `typecheck + build` 作为每个阶段的基础验收。
- 每个阶段结束后重打本地预览包并人工验证至少一个高频工具链路。

## Delivery Phases

### Phase 1: Utility Runtime

- 统一辅助窗口复用模型
- 继续压缩截图翻译/取色/选区窗口冷启动

### Phase 2: Capture Pipeline

- 只抓当前显示器/局部区域
- 统一截图缩放、坐标映射、截图缓存

### Phase 3: AI Platform

- 正式形成智能能力平台层
- 清理工具内重复调用和 prompt 拼装

### Phase 4: Main Bootstrap

- 拆 `src/main/index.ts`
- 引入更清晰的 app startup 生命周期

### Phase 5: Contracts & Migrations

- shared 边界治理
- settings/store schema + migration

## Success Criteria

- 辅助窗口二次打开接近即时，首次打开明显快于当前版本。
- 同类辅助窗口不再重复维护独立启动套路。
- LLM/OCR 相关工具不再各自维护分散逻辑。
- `src/main/index.ts` 明显瘦身，服务初始化职责清晰。
- 新版本设置与状态具备显式 migration，不靠隐式兼容合并。
