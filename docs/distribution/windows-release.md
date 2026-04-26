# Windows 发布链路

## 目标

仓库现在提供一个可重复的 Windows 发布闭环：

- 本地可通过统一脚本产出安装包和便携版
- GitHub Actions 可手动触发打包
- 推送 `v*` 标签时会先自动生成草稿 Release，再上传构建产物
- 如果配置了签名证书，`electron-builder` 会在同一条链路里自动签名

## 本地构建

```bash
npm run release:win
```

本地打包前提：

- 当前 Windows 会话需要具备创建符号链接的权限
- 最常见的做法是开启“开发者模式”，或使用管理员终端执行
- 如果本机不具备这项权限，`electron-builder` 在解压 `winCodeSign` 缓存时会失败，此时应改走 GitHub Actions 的 `Release` 工作流

输出目录：

- `release_new/`

默认产物：

- `onetool-<version>-win-x64-setup.exe`
- `onetool-<version>-win-x64-portable.exe`
- `latest.yml`
- 对应的 `.blockmap`

## GitHub Actions

工作流文件：

- `.github/workflows/release.yml`

触发方式：

- 手动触发：用于验证发布链路或生成候选构建
- 推送标签：`git tag v0.2.0 && git push origin v0.2.0`

标签触发时，工作流会：

1. 安装依赖
2. 执行 `npm run test`
3. 执行 `npm run release:win`
4. 上传构建工件
5. 创建 GitHub 草稿 Release 并附带安装包、便携版和更新元数据

草稿 Release 需要在 GitHub 上手动或自动发布为正式 Release 之后，Windows 运行时更新器才会把它当作可见版本。

当前仓库已经集成 Windows 运行时更新客户端，行为由设置控制：

- `autoCheckForUpdates` 开启时，Windows 正式包会在启动阶段自动检查一次更新
- 设置页提供手动“立即检查更新”入口，适合用户临时复核当前可见版本
- 如果检查结果是“没有可用更新”，界面会把它当作正常状态而不是错误
- 非 Windows、未打包环境、开发态和 Windows 便携版都不会触发 GitHub Releases 自动检查
- Windows 便携版即使把 `autoCheckForUpdates` 从关闭切回开启，也不会补跑后台检查或弹出“不支持自动更新”提示
- 不支持自动更新的运行时里，手动检查会在主进程直接返回统一的“不支持自动更新”状态，而不会发起远端请求

## 可选签名

当前仓库已经不再显式禁用 Windows 签名。要启用签名，只需要在 GitHub 仓库或本地环境配置 `electron-builder` 识别的证书变量。

常用环境变量：

- `CSC_LINK`
- `CSC_KEY_PASSWORD`

如果团队需要把 Windows 证书变量单独隔离，也可以改用 `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`。

未配置证书时，工作流仍会产出可安装工件，但属于未签名构建。

## 当前边界

这条链路解决的是“持续产出正式工件”与“Windows 运行时只读取已发布 Release”的问题。当前还没有解决：

- SmartScreen 信任积累
- 证书采购与轮换
- 多平台正式发布矩阵

## v0.3 发布清单

首个正式 Windows 版本建议按下面顺序执行：

1. 确认 [package.json](D:/code/onetool/package.json:1) 里的 `version` 已经是目标版本，例如 `0.3.0`
2. 执行 `npm run test`
3. 执行 `npm run build`
4. 执行 `npm run release:win`，或手动触发 GitHub Actions `Release` 工作流
5. 分别启动一次 `setup.exe` 和 `portable.exe` 做冒烟验证
6. 核对自动更新行为：Windows 安装版可检查更新，便携版不触发自动更新
7. 使用安装版选择一个非默认目录做启动验证，例如 `D:\Apps\One Tool 测试`
8. 创建并推送标签，例如 `git tag v0.3.0 && git push origin v0.3.0`
9. 等待 GitHub 自动生成 draft Release，检查产物与说明
10. 手动发布 draft Release 为正式 Release，之后运行时更新器才会把它视为可见版本

当前 `v0.3.x` 建议额外确认：

- 如果未配置签名证书，要在发布说明里明确“Windows 可能出现 SmartScreen 警告”
- 当前正式发布链路以 Windows 为主，其他平台仍不建议对外承诺
- 如果用户反馈非默认目录启动无响应，优先检查 `%APPDATA%\onetool\logs\main-YYYY-MM-DD.log` 与安装目录下 `resources/app.asar`
