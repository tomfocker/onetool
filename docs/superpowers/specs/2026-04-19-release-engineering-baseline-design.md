# 发布工程基线设计

**日期：** 2026-04-19

**状态：** 已确认，待实现

## 目标

把项目从“本地能构建”推进到“仓库自带最小发布工程基线”：测试脚本、基础 CI、许可证文件和当前可明确清理的构建警告。

## 当前问题

### 1. 缺少统一测试入口

仓库已经有大量 `node:test` 用例，但 `package.json` 没有 `test` 脚本，意味着 CI 和新贡献者都没有统一入口。

### 2. 没有仓库级 CI

当前仓库没有 `.github/workflows`，代码合并前没有自动化的测试和构建门禁。

### 3. 许可证声明不完整

README 写了 MIT，但仓库根目录缺少 `LICENSE` 文件，`package.json` 也没有显式 `license` 字段。

### 4. 构建告警里有两类可以立即处理的噪音

- `postcss.config.js` 用了 ESM 导出，但包本身不是 ESM，导致 `MODULE_TYPELESS_PACKAGE_JSON` 警告
- `App.tsx` 的 `import.meta.glob` 范围过宽，把已经静态导入的组件也扫进了懒加载集合，导致 Vite 报“动态导入不会拆 chunk”的警告

## 设计结论

采用“最小可重复交付基线”方案：

- 新增统一 `test` 脚本
- 新增基础 GitHub Actions CI
- 补齐 MIT `LICENSE` 和 `package.json` 元信息
- 清除当前明确可修的构建噪音

## 方案细节

### 1. 统一测试入口

新增 `npm run test`，直接跑仓库现有 `*.test.cjs`。

不把 `lint` 放入基线 CI，因为仓库还有历史 lint 债，当前把它纳入 CI 只会形成持续红灯，并不能提升工程可靠性。

### 2. GitHub Actions 基线

新增一个最小 CI：

- `windows-latest`
- Node 22
- `npm ci --ignore-scripts`
- `npm run test`
- `npm run build`

这样至少能保证提交在“测试 + 类型检查 + 生产构建”三个层面是可重复的。

### 3. 许可证与元信息一致化

- 新增根目录 `LICENSE`（MIT）
- `package.json` 增加 `license: "MIT"`

### 4. 构建噪音清理

- 把 `postcss.config.js` 改成 CommonJS 导出，避免 Node 的模块类型告警
- 缩小 `App.tsx` 中 `import.meta.glob` 的匹配范围，只保留真正需要懒加载的模块，避免静态导入与动态导入重复命中

## 非目标

- 不在本批次引入签名、自动更新或发布产物上传
- 不把现有 lint 历史债纳入 CI
- 不处理所有前端分块策略，只清当前明确由错误匹配范围引入的告警
