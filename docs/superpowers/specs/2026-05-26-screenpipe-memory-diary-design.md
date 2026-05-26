# ScreenPipe 记忆日报设计

**日期：** 2026-05-26

**状态：** 已确认，待实施计划

## 目标

在 `onetool` 中新增一个“记忆日报”工具，基于 ScreenPipe 的免费本地采集层，为用户提供 ScreenPipe 半自动部署管理、采集健康检查、今日时间线、AI 日报生成和日报历史能力。

该功能的产品定位不是复制 ScreenPipe 官方收费 GUI，而是把 ScreenPipe 的本地 API 和采集能力接入 `onetool`，形成更轻量、更中文化、更偏日报和博客草稿的工作流。

## 已确认决策

- 管理深度选择 `B 档：本地运维面板`。
- 部署策略选择 `B 档：半自动部署`。
- 默认采集范围选择 `B 档：隐私保守默认`。

## 参考事实

截至 2026-05-26，ScreenPipe 的可集成能力包括：

- CLI 和核心采集引擎为开源 MIT，本地优先。
- 官方 Desktop App 为付费 GUI，覆盖 timeline、pipes、search、settings 等完整体验。
- 本地 REST API 默认运行在 `localhost:3030`。
- 健康检查端点为 `GET /health`。
- 搜索端点为 `GET /search`，支持 `content_type=ocr|audio|input|accessibility|all`、时间范围、应用名、窗口名、浏览器 URL 等过滤。
- 新版搜索 API 需要 API Key，可通过 `screenpipe auth token` 获取，或从官方设置页读取。

## 非目标

- 不复刻 ScreenPipe 官方 GUI 的完整 timeline 管理台。
- 不做 pipes 商店、pipes 发布、AI connections 管理、云同步、跨设备同步。
- 第一版不做全自动博客发布，先生成可编辑的 Markdown 日报和博客草稿。
- 第一版不内置自研长时截图采集系统，只保留未来作为后备采集源的扩展点。
- 不偷偷安装、启动或后台运行 ScreenPipe，所有部署和启动动作都必须由用户确认。

## 用户体验

新增工具名建议为 `记忆日报`，分类建议放在 `日常办公` 或 `实用工具`。第一屏是面向普通用户的工作台，而不是技术配置页。

左侧工具内导航包括：

- 总览
- 部署管理
- 采集设置
- 今日时间线
- 日报生成
- 日报历史

顶部状态区展示：

- ScreenPipe 是否运行
- API 地址
- API Key 是否已配置
- 今日记录数
- 最近采集时间
- 采集内容覆盖情况

## 部署管理

部署管理采用半自动模式。`onetool` 可以帮助用户完成关键动作，但每一步都显示说明、执行日志和失败原因。

第一版支持：

- 检测 ScreenPipe CLI 是否可用。
- 检测本地 API 是否可访问。
- 获取 ScreenPipe 版本信息。
- 提供官方安装命令入口。
- 触发安装或更新前弹出明确确认。
- 启动 ScreenPipe CLI。
- 停止由 `onetool` 启动的 ScreenPipe 进程。
- 获取并保存 API Key。
- 打开数据目录或文档页面。
- 展示最近一次启动、停止、安装、更新、Token 获取的日志摘要。

进程管理规则：

- 如果 ScreenPipe 是由 `onetool` 当前会话启动的，可以停止该进程。
- 如果 ScreenPipe 是用户从外部启动的，只显示“外部运行中”，不强行杀掉未知进程。
- 启动失败时保留完整错误摘要，并给出下一步建议。

## 隐私默认

第一版默认采用隐私保守配置：

- 默认进入时间线和日报的数据：`accessibility`、`ocr`、应用名、窗口名、浏览器 URL。
- 默认不进入日报的数据：`audio`、`input`。
- 音频转录需要用户单独开启。
- input/键盘相关内容需要用户单独开启。
- 提供敏感应用和敏感窗口过滤配置。
- 日报生成前必须展示本次将使用的数据范围。
- 博客草稿不会自动发布。

推荐内置敏感过滤示例：

- 密码管理器
- 银行和支付窗口
- 私密聊天窗口
- 浏览器隐身窗口或标题包含 `password`、`login`、`支付`、`密码` 的窗口

## 今日时间线

时间线是本功能的核心体验之一，目标是让用户看清一天怎么流动，而不是只看到一堆搜索结果。

时间线默认展示当天内容，可切换日期。第一版聚合粒度提供：

- 5 分钟
- 15 分钟，默认
- 30 分钟
- 1 小时

每个时间段展示：

- 时间范围
- 主要应用
- 主要窗口或网页
- 自动归纳的一句话活动描述
- 关键文本片段
- 数据来源标签，如 `屏幕文本`、`OCR`、`网页`、`音频`
- 可展开原始片段列表

时间线聚合策略：

- 从 `/search` 按时间范围分页拉取 `content_type=all` 或按隐私设置分别拉取内容。
- 先按时间桶分组。
- 再按应用、窗口、URL、文本相似度合并相邻片段。
- 对噪声片段做去重和长度过滤。
- 对每个时间桶生成轻量摘要，避免把全部原文直接塞进日报 prompt。

## 日报生成

日报生成复用 `onetool` 已有 OpenAI 兼容模型配置。

日报输入包括：

- 当天时间线摘要
- 关键片段
- 应用和窗口分布
- 用户手动添加的补充说明
- 隐私设置允许的数据类型

日报输出为 Markdown，默认包含：

- 今日概览
- 时间线回顾
- 关键成果
- 重要沟通或会议
- 遇到的问题
- 明日建议
- 博客草稿摘要

生成前必须展示：

- 时间范围
- 数据类型
- 是否包含音频
- 是否包含 input
- 已排除的应用和窗口

生成后支持：

- 复制 Markdown
- 重新生成
- 保存到日报历史
- 标记为博客草稿

## 博客发布

第一版只做博客草稿，不做自动发布。原因是日报可能包含隐私信息，自动发布风险高。

第二阶段再扩展发布器：

- 自定义 Webhook
- GitHub Pages 仓库提交
- MetaWeblog
- VanBlog 或其他博客 API

发布前必须有人工确认和最终预览。

## 技术设计

### 新增共享类型

建议新增 `src/shared/memoryDiary.ts`，定义：

- ScreenPipe 连接配置
- ScreenPipe 运行状态
- ScreenPipe 部署任务状态
- 采集隐私设置
- 时间线桶
- 日报生成请求和结果
- 日报历史记录

### 主进程服务

建议新增以下服务：

- `ScreenpipeClient`
- `ScreenpipeManagementService`
- `MemoryTimelineService`
- `MemoryDiaryService`

`ScreenpipeClient` 负责：

- 调用 `/health`
- 调用 `/search`
- 调用 `/audio/list`、`/vision/list` 等只读诊断接口
- 处理 API Key header
- 统一错误和超时

`ScreenpipeManagementService` 负责：

- CLI 探测
- 安装或更新命令执行
- `screenpipe auth token`
- 启动和停止由 `onetool` 托管的进程
- 管理日志摘要
- 上报部署任务状态

`MemoryTimelineService` 负责：

- 按日期和时间范围拉取 ScreenPipe 数据
- 分桶、去重、聚合
- 生成时间线视图模型

`MemoryDiaryService` 负责：

- 将时间线压缩为模型输入
- 调用现有 LLM 客户端生成结构化日报
- 保存日报历史

### IPC 与 preload

新增 IPC 命名建议：

- `memory-screenpipe-get-status`
- `memory-screenpipe-install`
- `memory-screenpipe-update`
- `memory-screenpipe-start`
- `memory-screenpipe-stop`
- `memory-screenpipe-get-token`
- `memory-screenpipe-get-logs`
- `memory-screenpipe-update-config`
- `memory-timeline-query`
- `memory-diary-generate`
- `memory-diary-list`
- `memory-diary-save`
- `memory-diary-delete`

preload 中暴露 `window.electron.memoryDiary`。

### 渲染层

新增工具组件建议为：

- `src/renderer/src/tools/MemoryDiaryTool.tsx`
- `src/renderer/src/hooks/useMemoryDiary.ts`

工具页内分区：

- 总览状态卡
- 部署管理面板
- 采集设置面板
- 今日时间线
- 日报生成器
- 日报历史列表

UI 应保持工具型、可扫描，不做营销式大屏。

## 存储设计

建议在 `GlobalStore` 或独立 JSON 存储中保存：

- ScreenPipe API 地址
- API Key
- 隐私设置
- 敏感应用和窗口过滤规则
- 时间线默认粒度
- 日报风格设置
- 日报历史索引

日报正文建议按日期拆到用户数据目录的 `memory-diary/daily/*.md`，避免 `global-store.json` 过大。

## 错误处理

常见错误需要分型：

- ScreenPipe 未安装
- CLI 不可用
- API 未启动
- API Key 缺失或无效
- API 返回空数据
- 搜索端点超时
- 安装脚本失败
- 启动进程失败
- LLM 配置缺失
- LLM 生成失败

每类错误都应该给出下一步操作，不只显示技术错误。

## 测试策略

共享逻辑测试：

- 时间线分桶
- 内容去重
- 隐私过滤
- 日报 prompt 输入压缩
- 设置迁移

主进程服务测试：

- ScreenPipe API 成功和失败响应
- API Key header
- CLI 探测
- 部署任务状态机
- 托管进程启动和停止

渲染层测试：

- 未安装状态
- 已安装未运行状态
- API Key 缺失状态
- 采集健康为空
- 时间线有数据
- 日报生成成功和失败

## 验收标准

第一版完成后应满足：

1. 用户可以在 `onetool` 中看到 ScreenPipe 安装、运行、API、Token 和今日采集健康状态。
2. 未安装时，用户可以通过半自动流程安装或查看安装指引。
3. 已安装时，用户可以通过 `onetool` 启动 ScreenPipe，并看到执行日志。
4. 用户可以配置隐私保守的数据范围，默认不包含音频和 input。
5. 用户可以查看当天按时间段聚合的时间线。
6. 用户可以基于当天时间线生成 Markdown 日报。
7. 日报生成前会明确提示本次使用的数据范围。
8. 日报可保存到历史记录，并可复制 Markdown。
9. 不会在未确认的情况下发布博客、安装软件或启动后台采集。

## 实施顺序

建议分四步实施：

1. ScreenPipe 管理和连接基础：状态、安装引导、Token、启动、日志。
2. 时间线查询和聚合：ScreenPipe API client、时间桶、隐私过滤、UI 展示。
3. 日报生成和历史：LLM adapter、Markdown 输出、历史保存。
4. 打磨和扩展：博客草稿、采集健康增强、更多过滤规则。
