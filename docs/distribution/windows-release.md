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

输出目录：

- `release_new/`

默认产物：

- `onetool-<version>-win-x64.exe`
- `onetool-<version>-win-x64-portable.exe`
- `latest.yml`
- 对应的 `.blockmap`

## GitHub Actions

工作流文件：

- `.github/workflows/release.yml`

触发方式：

- 手动触发：用于验证发布链路或生成候选构建
- 推送标签：`git tag v1.0.1 && git push origin v1.0.1`

标签触发时，工作流会：

1. 安装依赖
2. 执行 `npm run test`
3. 执行 `npm run release:win`
4. 上传构建工件
5. 创建 GitHub 草稿 Release 并附带安装包、便携版和更新元数据

草稿 Release 需要在 GitHub 上手动或自动发布为正式 Release 之后，运行时更新器才会把它当作可见版本。

运行时更新行为由设置控制：

- `autoCheckForUpdates` 开启时，Windows 正式包会在启动阶段自动检查一次更新
- 设置页提供手动“立即检查更新”入口，适合用户临时复核当前可见版本
- 如果检查结果是“没有可用更新”，界面会把它当作正常状态而不是错误

## 可选签名

当前仓库已经不再显式禁用 Windows 签名。要启用签名，只需要在 GitHub 仓库或本地环境配置 `electron-builder` 识别的证书变量。

常用环境变量：

- `CSC_LINK`
- `CSC_KEY_PASSWORD`

如果团队需要把 Windows 证书变量单独隔离，也可以改用 `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`。

未配置证书时，工作流仍会产出可安装工件，但属于未签名构建。

## 当前边界

这条链路解决的是“持续产出正式工件”的问题。运行时更新器只读取已发布的 Release，草稿 Release 不会对客户端可见。当前还没有解决：

- 自动更新客户端接入
- SmartScreen 信任积累
- 证书采购与轮换
- 多平台正式发布矩阵
