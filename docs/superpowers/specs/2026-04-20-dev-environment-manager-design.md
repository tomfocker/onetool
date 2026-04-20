# 开发环境检测与管理设计

**日期：** 2026-04-20

**状态：** 已确认，待评审

## 目标

新增一个独立的“开发环境”工具页，用于检测常见开发环境的安装状态、版本、命令路径，并在第一版中支持对主要系统级环境执行安装或更新。

本次功能重点是把“这台 Windows 机器是否具备基本开发能力”做成可见、可操作、可重复执行的检测面板，而不是扩展现有“极速装机”成为另一个泛软件中心。

## 用户意图与约束

基于本轮确认，用户希望：

- 看到当前机器上主流开发环境是否已安装。
- 直接看到版本信息，而不是只知道“有/没有”。
- 对缺失或过旧的主要环境提供安装或更新入口。
- 第一版先做主要环境，不引入太多生态细节。
- `WSL` 作为关联环境状态展示，但不在本工具里重复做完整管理。

## 第一版覆盖范围

### 检测项

- `Node.js`
- `npm`
- `Git`
- `Python`
- `pip`
- `Go`
- `Java`
- `WSL`（仅状态展示与跳转，不在本工具内安装/更新）

### 操作项

第一版仅对以下“系统级主环境”提供安装与更新：

- `Node.js`
- `Git`
- `Python`
- `Go`
- `Java`

以下项只展示状态，不单独安装或更新：

- `npm`
- `pip`

## 非目标

- 不支持 `pnpm`、`yarn`、`Rust`、`Docker`、`ADB` 等扩展环境。
- 不做复杂的版本策略校验，例如“Node.js 必须 >= 20 才算健康”。
- 不做来源追踪，不区分用户是通过官网安装、压缩包安装还是 `winget` 安装。
- 不在第一版里重做 `WSL` 安装、导入导出、发行版切换或空间回收。
- 不做多来源包管理整合，例如 `npm`、`pip`、`scoop`、`choco` 同时支持。

## 设计原则

### 1. 工具独立，不塞进极速装机

“极速装机”解决的是常用桌面软件的批量安装问题；开发环境工具解决的是开发运行时与基础链路的检测与维护问题。两者的状态模型、操作粒度、错误处理方式都不同，继续复用一个页面会让交互混乱。

因此本功能应新增独立工具页，例如：

- 工具 ID：`dev-environment-manager`
- 工具名：`开发环境`
- 分类：`系统维护`

### 2. 主环境统一管理，附属工具只做展示

`npm` 与 `pip` 分别是 `Node.js` 和 `Python` 生态中的附属工具。它们应被展示为环境状态的一部分，但不应在第一版中被单独当成系统环境管理对象。

这样可以避免：

- 用户误以为 `npm` 可以脱离 `Node.js` 独立治理。
- 更新链路变成多种生态命令混用。
- 服务层为了少量收益引入过多分支逻辑。

### 3. 统一安装/更新渠道

第一版的安装与更新统一通过 `winget` 执行。

原因：

- 仓库中已经存在 `QuickInstallerService` 的 `winget` 能力和日志通路。
- `winget` 适合作为系统级软件统一入口。
- 对 `Node.js`、`Git`、`Python`、`Go`、`Java` 这类环境足够实用。

### 4. Java 固定发行版

`Java` 在第一版固定为 `Microsoft OpenJDK 17`。

不做发行版选择器，避免：

- 同一个按钮背后实际安装目标不明确。
- 未来检测结果与安装行为无法对齐。
- UI 与服务层需要同时处理多个 Java 发行版映射。

## 用户体验设计

### 顶部总览

页面顶部展示一个总览区域，显示：

- 已安装数量
- 缺失数量
- 异常数量
- 可更新数量
- 最近一次检测时间

同时提供两个顶层操作：

- `重新检测全部`
- `更新全部可更新项`

`更新全部` 仅针对第一版支持更新的主环境生效。

### 环境卡片列表

每个环境一张卡片，展示：

- 环境名称
- 简短说明
- 当前状态
- 当前版本
- 命令路径
- 管理方式
- 可用操作

### 状态定义

- `installed`
  已安装且命令可执行。
- `missing`
  未检测到命令或运行时。
- `broken`
  能找到命令入口但执行失败，或输出无法解析。
- `available-update`
  已安装且检测到 `winget` 可升级。
- `linked`
  仅用于 `npm`、`pip` 这类附属工具，表示其状态依赖主环境。
- `external`
  仅用于 `WSL`，表示它是关联环境，由其他工具负责管理。

### 操作策略

- `Node.js` / `Git` / `Python` / `Go` / `Java`
  - 缺失时显示 `安装`
  - 已安装且可更新时显示 `更新`
  - 任意状态都显示 `重新检测`
- `npm` / `pip`
  - 不显示安装或更新按钮
  - 仅显示版本与依赖说明，例如“随 Node.js 提供”
- `WSL`
  - 显示当前启用状态
  - 显示 `前往 WSL 管理`

### 日志区

页面底部保留实时日志区，复用当前“极速装机”的交互模式：

- 记录检测日志
- 记录安装与更新日志
- 区分 `stdout` / `stderr` / `info` / `error` / `success`
- 支持清空日志

日志区是第一版的主要故障反馈入口，不额外设计复杂的历史任务页。

## 检测逻辑设计

### 统一数据模型

渲染层和主进程需要围绕一个统一的数据结构工作。第一版建议使用如下抽象：

- `id`
- `name`
- `description`
- `status`
- `detectedVersion`
- `resolvedPath`
- `manager`
- `canInstall`
- `canUpdate`
- `installTarget`
- `notes`

### manager 语义

- `winget`
- `bundled-with-node`
- `bundled-with-python`
- `external-wsl`
- `unknown`

### 版本与路径检测

第一版通过命令行检测版本与路径：

- `node --version`
- `npm --version`
- `git --version`
- `python --version`
- `pip --version`
- `go version`
- `java -version`

命令路径通过 Windows 命令定位，例如 `where.exe`，优先取第一条可执行路径。

`java -version` 输出在 `stderr`，检测逻辑需要兼容这一点，不能简单复用只看 `stdout` 的解析方式。

### 更新状态检测

主环境的更新状态通过 `winget upgrade --id <packageId>` 或等价查询方式获得。

第一版采用静态映射：

- `Node.js` -> `OpenJS.NodeJS.LTS`
- `Git` -> `Git.Git`
- `Python` -> `Python.Python.3.12`
- `Go` -> `GoLang.Go`
- `Java` -> `Microsoft.OpenJDK.17`

如果检测到环境已安装但 `winget` 查不到对应包，则：

- 状态仍显示 `installed`
- 不给出 `available-update`
- 在备注中提示“当前安装来源未映射到 winget 升级通道”

这样避免误把非 `winget` 安装环境标成异常。

### WSL 联动

本工具不复刻 `WSL 管理` 的逻辑，只从现有 WSL 服务中读取一个轻量状态摘要：

- 是否启用 WSL
- 是否存在已安装发行版
- 可选的默认发行版名称

卡片上提供跳转入口，直接切到现有 `wsl-manager` 工具页。

## 服务层设计

### 新增独立服务

建议新增 `DevEnvironmentService`，而不是把逻辑继续堆进 `DoctorService` 或 `QuickInstallerService`。

职责：

- 定义受支持的开发环境清单
- 执行单项与全量检测
- 执行单项与批量安装/更新
- 发送实时日志和进度事件
- 封装 `winget` 映射与版本解析

### 不与 QuickInstallerService 混合的原因

`QuickInstallerService` 当前面向“安装一批桌面软件”。如果直接复用为开发环境管理器，会产生两个问题：

- 现有软件数据结构没有“检测状态 / 版本 / 路径 / 附属关系”的概念。
- 以后“开发环境”与“常用软件”会共享一个过宽的服务边界，后续维护会越来越乱。

更合理的做法是：

- 复用其 `winget` 执行经验与日志模式
- 不复用其抽象层

### IPC 设计

建议新增独立 IPC，例如：

- `dev-environment-get-overview`
- `dev-environment-refresh-all`
- `dev-environment-refresh-one`
- `dev-environment-install`
- `dev-environment-update`
- `dev-environment-update-all`
- `dev-environment-open-related-tool`

事件通道：

- `dev-environment-log`
- `dev-environment-progress`
- `dev-environment-operation-complete`

## 渲染层设计

### 新增工具页

新增一个独立工具组件，例如：

- `src/renderer/src/tools/DevEnvironmentManagerTool.tsx`

页面职责：

- 拉取环境总览
- 渲染环境卡片
- 触发安装/更新/重新检测
- 展示日志与进度

### 共享数据文件

建议把第一版支持的环境定义抽到共享数据文件中，而不是写死在 JSX 内。

例如：

- `src/renderer/src/tools/devEnvironmentData.ts`

包含：

- 环境顺序
- 名称
- 描述
- 图标
- 与 `WSL` 的特殊交互说明

### 路由与工具定义

需要将该工具加入现有工具清单与自动路由：

- `src/renderer/src/data/tools.ts`
- `App.tsx` 现有懒加载逻辑无需重写，只要工具定义接入即可

## 错误处理

第一版错误处理规则：

- 单项检测失败时，只影响当前卡片，页面整体仍可用。
- 全量检测失败时，总览区域显示错误状态，并允许重试。
- 安装或更新失败时，保留最后一次已知检测结果，不清空卡片。
- `winget` 不可用时：
  - 检测功能仍尽量可用
  - 安装与更新按钮禁用
  - 顶部显示“未检测到 winget，无法执行安装/更新”

## 测试策略

### 主进程测试

至少覆盖：

- 每个环境的版本解析成功路径
- 命令不存在时返回 `missing`
- 命令执行失败时返回 `broken`
- `npm` 与 `pip` 的附属状态建模
- `winget` 可更新与不可更新场景
- `Java` 映射到固定发行版 `Microsoft.OpenJDK.17`
- `winget` 缺失时安装/更新请求被正确拒绝

### 渲染层测试

至少覆盖：

- 总览统计正确汇总
- 缺失项显示 `安装`
- 可更新项显示 `更新`
- `npm` / `pip` 不显示安装或更新按钮
- `WSL` 卡片显示跳转行为而不是安装行为
- 安装/更新中的日志和进度状态

## 验证标准

当以下条件都满足时，第一版视为完成：

- 能稳定检测 `Node.js`、`npm`、`Git`、`Python`、`pip`、`Go`、`Java`
- 页面能明确区分缺失、已安装、异常、可更新
- 主环境能从 UI 发起安装或更新
- `npm` 与 `pip` 被正确显示为附属工具
- `WSL` 能展示状态并跳转到现有 `WSL 管理`
- 日志区能显示完整的执行反馈
- 现有测试与构建通过

## 后续扩展位

第二版可以考虑：

- 增加 `pnpm`、`yarn`、`Rust`、`Docker`
- 增加版本建议策略
- 增加“复制诊断报告”
- 增加环境变量修复提示
- 增加 `scoop` / `choco` 作为备用管理器
