# Windows NTFS 极速空间扫描 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为“空间清理”新增 Windows 本地 NTFS 根盘的极速扫描模式，使用 Rust 独立扫描器直读 MFT，显著快于现有普通递归扫描。

**Architecture:** 保留现有 Electron `SpaceCleanupService` 作为统一入口，在主进程内部新增模式判定和 `NtfsFastScannerBridge`，把 Rust 扫描器的 JSON Lines 流式输出转换为统一的 `SpaceCleanupSession`。渲染层继续复用现有工具页，但新增扫描模式、禁用原因和增量结果展示。

**Tech Stack:** Electron, TypeScript, Rust, JSON Lines, electron-builder extraResources, Node test runner

---

## File Structure

### New Files

- `D:\code\onetool\native\ntfs-fast-scan\Cargo.toml`
  - Rust 扫描器工程定义
- `D:\code\onetool\native\ntfs-fast-scan\src\main.rs`
  - 扫描器入口，处理 CLI 参数、stdout JSON Lines 输出、退出码
- `D:\code\onetool\native\ntfs-fast-scan\src\ntfs.rs`
  - NTFS 卷校验、MFT 读取与记录解析
- `D:\code\onetool\native\ntfs-fast-scan\src\aggregate.rs`
  - 目录大小聚合、前 N 大文件堆、顶层目录摘要
- `D:\code\onetool\native\ntfs-fast-scan\src\events.rs`
  - 扫描器事件结构与 JSON 序列化
- `D:\code\onetool\native\ntfs-fast-scan\tests\scan_events.rs`
  - Rust 侧事件与聚合测试
- `D:\code\onetool\scripts\build-ntfs-fast-scan.ps1`
  - 本地构建扫描器并拷贝到 Electron 资源目录
- `D:\code\onetool\src\main\services\NtfsFastScannerBridge.ts`
  - 启动/取消原生扫描器、解析 JSON Lines、拼接 stderr
- `D:\code\onetool\src\main\services\NtfsFastScannerBridge.test.cjs`
  - 主进程桥接层测试
- `D:\code\onetool\src\main\utils\windowsVolume.ts`
  - Windows 卷格式、本地盘、根路径判定
- `D:\code\onetool\src\main\utils\windowsVolume.test.cjs`
  - 卷判定测试

### Modified Files

- `D:\code\onetool\src\shared\spaceCleanup.ts`
  - 扩展会话模型，加入 `scanMode`、`scanModeReason`、`isPartial`、`isHydrated`
- `D:\code\onetool\src\main\services\SpaceCleanupService.ts`
  - 模式分流、普通扫描保留、极速扫描桥接接入
- `D:\code\onetool\src\main\services\SpaceCleanupService.test.cjs`
  - 新增极速模式分流和回退测试
- `D:\code\onetool\src\main\ipc\spaceCleanupIpc.ts`
  - 暴露扫描模式与禁用原因
- `D:\code\onetool\src\preload\createElectronBridge.ts`
  - 扩展 `spaceCleanup` bridge 返回值和事件订阅
- `D:\code\onetool\src\preload\createElectronBridge.test.cjs`
  - bridge 形态测试
- `D:\code\onetool\src\renderer\src\hooks\useSpaceCleanup.ts`
  - 处理 `scanMode`、局部结果、禁用提示
- `D:\code\onetool\src\renderer\src\hooks\useSpaceCleanup.test.cjs`
  - hook 视图模型与模式提示测试
- `D:\code\onetool\src\renderer\src\tools\SpaceCleanupTool.tsx`
  - 增加模式标签、极速模式状态和禁用说明
- `D:\code\onetool\package.json`
  - 增加 Rust 扫描器打包资源与构建脚本
- `D:\code\onetool\.github\workflows\release.yml`
  - Windows 发布时先构建扫描器
- `D:\code\onetool\README.md`
  - 记录极速模式环境限制

---

### Task 1: 扩展共享模型以承载极速扫描会话

**Files:**
- Modify: `D:\code\onetool\src\shared\spaceCleanup.ts`
- Test: `D:\code\onetool\src\main\services\SpaceCleanupService.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
test('space cleanup session carries fast scan mode metadata', () => {
  const { createIdleSpaceCleanupSession } = require('../../shared/spaceCleanup.ts')
  const session = createIdleSpaceCleanupSession()

  assert.equal(session.scanMode, 'filesystem')
  assert.equal(session.scanModeReason, null)
  assert.equal(session.isPartial, false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/services/SpaceCleanupService.test.cjs`
Expected: FAIL because `scanMode`, `scanModeReason`, or `isPartial` are undefined on the session shape.

- [ ] **Step 3: Write minimal implementation**

```ts
export type SpaceCleanupScanMode = 'filesystem' | 'ntfs-fast'

export type SpaceCleanupSession = {
  sessionId: string
  rootPath: string | null
  status: SpaceCleanupScanStatus
  scanMode: SpaceCleanupScanMode
  scanModeReason: string | null
  isPartial: boolean
  startedAt: string | null
  finishedAt: string | null
  summary: SpaceCleanupSummary
  largestFiles: SpaceCleanupLargestFile[]
  tree: SpaceCleanupNode | null
  error: string | null
}

export function createIdleSpaceCleanupSession(): SpaceCleanupSession {
  return {
    sessionId: 'idle',
    rootPath: null,
    status: 'idle',
    scanMode: 'filesystem',
    scanModeReason: null,
    isPartial: false,
    startedAt: null,
    finishedAt: null,
    summary: createEmptySpaceCleanupSummary(),
    largestFiles: [],
    tree: null,
    error: null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/main/services/SpaceCleanupService.test.cjs`
Expected: PASS for the new session metadata assertion; other existing `SpaceCleanupService` tests remain green.

- [ ] **Step 5: Commit**

```bash
git add src/shared/spaceCleanup.ts src/main/services/SpaceCleanupService.test.cjs
git commit -m "feat: extend space cleanup session metadata"
```

### Task 2: 新增 Windows 卷能力判定工具

**Files:**
- Create: `D:\code\onetool\src\main\utils\windowsVolume.ts`
- Create: `D:\code\onetool\src\main\utils\windowsVolume.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
test('getFastScanEligibility accepts local NTFS root volumes only', async () => {
  const { getFastScanEligibility } = loadWindowsVolumeModule({
    platform: 'win32',
    execFile: async () => ({ stdout: 'File System Name : NTFS' })
  })

  const eligible = await getFastScanEligibility('D:\\')
  const ineligible = await getFastScanEligibility('D:\\Work')

  assert.equal(eligible.mode, 'ntfs-fast')
  assert.equal(ineligible.mode, 'filesystem')
  assert.match(ineligible.reason, /根路径/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/utils/windowsVolume.test.cjs`
Expected: FAIL because `windowsVolume.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function getFastScanEligibility(targetPath: string): Promise<{
  mode: 'ntfs-fast' | 'filesystem'
  reason: string | null
}> {
  if (process.platform !== 'win32') {
    return { mode: 'filesystem', reason: '仅 Windows 支持极速扫描' }
  }

  if (!/^[A-Za-z]:\\$/.test(targetPath)) {
    return { mode: 'filesystem', reason: '极速扫描仅支持本地盘根路径' }
  }

  const filesystem = await readFilesystemType(targetPath)
  if (filesystem !== 'NTFS') {
    return { mode: 'filesystem', reason: `当前文件系统为 ${filesystem || '未知'}，不支持极速扫描` }
  }

  return { mode: 'ntfs-fast', reason: null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/main/utils/windowsVolume.test.cjs`
Expected: PASS with explicit NTFS/非根路径 coverage.

- [ ] **Step 5: Commit**

```bash
git add src/main/utils/windowsVolume.ts src/main/utils/windowsVolume.test.cjs
git commit -m "feat: add NTFS fast scan eligibility checks"
```

### Task 3: 实现主进程桥接层来启动原生扫描器

**Files:**
- Create: `D:\code\onetool\src\main\services\NtfsFastScannerBridge.ts`
- Create: `D:\code\onetool\src\main\services\NtfsFastScannerBridge.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
test('NtfsFastScannerBridge parses JSON lines into structured events', async () => {
  const bridge = createBridgeWithFakeProcess([
    '{"type":"volume-info","mode":"ntfs-fast","rootPath":"D:\\\\","filesystem":"NTFS"}',
    '{"type":"top-level-summary","directories":[{"path":"D:\\\\Games","sizeBytes":200}],"filesScanned":12}',
    '{"type":"complete","summary":{"totalBytes":200},"tree":{"path":"D:\\\\","name":"D:\\\\","type":"directory","sizeBytes":200,"children":[]}}'
  ])

  const events = []
  await bridge.start('D:\\', (event) => events.push(event))

  assert.equal(events[0].type, 'volume-info')
  assert.equal(events.at(-1).type, 'complete')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/services/NtfsFastScannerBridge.test.cjs`
Expected: FAIL because the bridge file does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export class NtfsFastScannerBridge {
  async start(rootPath: string, onEvent: (event: NtfsFastScanEvent) => void) {
    const child = spawn(this.resolveScannerPath(), ['scan', '--root', rootPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const rl = createInterface({ input: child.stdout })
    for await (const line of rl) {
      if (!line.trim()) continue
      onEvent(JSON.parse(line))
    }

    const exitCode = await onceChildExit(child)
    if (exitCode !== 0) {
      throw new Error(`ntfs-fast-scan exited with ${exitCode}`)
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/main/services/NtfsFastScannerBridge.test.cjs`
Expected: PASS with parsed JSON event coverage and a separate non-zero exit test.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/NtfsFastScannerBridge.ts src/main/services/NtfsFastScannerBridge.test.cjs
git commit -m "feat: add NTFS fast scanner bridge"
```

### Task 4: 让 SpaceCleanupService 支持模式分流和原生流式结果

**Files:**
- Modify: `D:\code\onetool\src\main\services\SpaceCleanupService.ts`
- Modify: `D:\code\onetool\src\main\services\SpaceCleanupService.test.cjs`
- Modify: `D:\code\onetool\src\main\ipc\spaceCleanupIpc.ts`

- [ ] **Step 1: Write the failing test**

```js
test('startScan uses ntfs-fast mode for eligible NTFS root volumes', async () => {
  const service = createSpaceCleanupService({
    fastEligibility: async () => ({ mode: 'ntfs-fast', reason: null }),
    fastBridge: {
      start: async (_root, onEvent) => {
        onEvent({ type: 'volume-info', mode: 'ntfs-fast', rootPath: 'D:\\', filesystem: 'NTFS' })
        onEvent({ type: 'complete', summary: { totalBytes: 123 }, tree: fakeTree('D:\\', 123) })
      }
    }
  })

  const result = await service.startScan('D:\\')

  assert.equal(result.success, true)
  assert.equal(result.data.scanMode, 'ntfs-fast')
  assert.equal(result.data.summary.totalBytes, 123)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/services/SpaceCleanupService.test.cjs`
Expected: FAIL because `SpaceCleanupService` still only uses the filesystem recursive path.

- [ ] **Step 3: Write minimal implementation**

```ts
async startScan(rootPath: string): Promise<IpcResponse<SpaceCleanupSession>> {
  const eligibility = await this.getFastScanEligibility(rootPath)
  if (eligibility.mode === 'ntfs-fast') {
    return this.startNtfsFastScan(rootPath, eligibility.reason)
  }

  return this.startFilesystemScan(rootPath, eligibility.reason)
}

private async startNtfsFastScan(rootPath: string, reason: string | null) {
  this.currentSession = {
    ...createIdleSpaceCleanupSession(),
    sessionId: this.createId(),
    rootPath,
    status: 'scanning',
    scanMode: 'ntfs-fast',
    scanModeReason: reason,
    isPartial: true,
    startedAt: new Date(this.now()).toISOString()
  }

  await this.ntfsFastScannerBridge.start(rootPath, (event) => {
    this.currentSession = reduceFastScanEvent(this.currentSession, event)
    this.emit('space-cleanup-progress', this.currentSession)
  })

  return { success: true, data: this.currentSession }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/main/services/SpaceCleanupService.test.cjs`
Expected: PASS with both `ntfs-fast` and fallback `filesystem` branches covered.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/SpaceCleanupService.ts src/main/services/SpaceCleanupService.test.cjs src/main/ipc/spaceCleanupIpc.ts
git commit -m "feat: route space cleanup scans by mode"
```

### Task 5: 实现 Rust 扫描器 CLI 和事件流

**Files:**
- Create: `D:\code\onetool\native\ntfs-fast-scan\Cargo.toml`
- Create: `D:\code\onetool\native\ntfs-fast-scan\src\main.rs`
- Create: `D:\code\onetool\native\ntfs-fast-scan\src\ntfs.rs`
- Create: `D:\code\onetool\native\ntfs-fast-scan\src\aggregate.rs`
- Create: `D:\code\onetool\native\ntfs-fast-scan\src\events.rs`
- Create: `D:\code\onetool\native\ntfs-fast-scan\tests\scan_events.rs`

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn emits_top_level_and_complete_events() {
    let tree = build_test_tree();
    let events = build_scan_events("D:\\", &tree);

    assert_eq!(events.first().unwrap().event_type(), "volume-info");
    assert_eq!(events.last().unwrap().event_type(), "complete");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path native/ntfs-fast-scan/Cargo.toml`
Expected: FAIL because the Rust crate does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```rust
fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    let scan = ntfs::scan_volume(&args.root)?;

    emit(Event::VolumeInfo { mode: "ntfs-fast", root_path: args.root.clone(), filesystem: "NTFS" })?;
    emit(Event::TopLevelSummary { directories: aggregate::top_level(&scan), files_scanned: scan.files_scanned })?;
    emit(Event::LargestFiles { items: aggregate::largest_files(&scan, 500) })?;
    emit(Event::Complete { summary: aggregate::summary(&scan), tree: aggregate::tree(&scan) })?;
    Ok(())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path native/ntfs-fast-scan/Cargo.toml`
Expected: PASS for event ordering and serialization tests.

- [ ] **Step 5: Commit**

```bash
git add native/ntfs-fast-scan
git commit -m "feat: add NTFS fast scan native scanner"
```

### Task 6: 把扫描器纳入 Electron 打包与本地构建

**Files:**
- Create: `D:\code\onetool\scripts\build-ntfs-fast-scan.ps1`
- Modify: `D:\code\onetool\package.json`
- Modify: `D:\code\onetool\.github\workflows\release.yml`

- [ ] **Step 1: Write the failing test**

```js
test('package build config includes ntfs fast scanner resource', () => {
  const pkg = require('../../package.json')
  const entry = pkg.build.extraResources.find((item) => item.from === 'resources/space-scan/ntfs-fast-scan.exe')
  assert.ok(entry)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/services/SpaceCleanupService.test.cjs`
Expected: FAIL because `package.json` does not include the scanner resource yet.

- [ ] **Step 3: Write minimal implementation**

```json
{
  "scripts": {
    "build:ntfs-fast-scan": "powershell -ExecutionPolicy Bypass -File scripts/build-ntfs-fast-scan.ps1"
  },
  "build": {
    "extraResources": [
      { "from": "resources/space-scan/ntfs-fast-scan.exe", "to": "space-scan/ntfs-fast-scan.exe" }
    ]
  }
}
```

```yaml
- name: Build NTFS fast scanner
  run: npm run build:ntfs-fast-scan
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build:ntfs-fast-scan`
Expected: Scanner executable is copied into `resources/space-scan/ntfs-fast-scan.exe`.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-ntfs-fast-scan.ps1 package.json .github/workflows/release.yml
git commit -m "build: package NTFS fast scanner"
```

### Task 7: 渲染层展示极速模式与禁用原因

**Files:**
- Modify: `D:\code\onetool\src\preload\createElectronBridge.ts`
- Modify: `D:\code\onetool\src\preload\createElectronBridge.test.cjs`
- Modify: `D:\code\onetool\src\renderer\src\hooks\useSpaceCleanup.ts`
- Modify: `D:\code\onetool\src\renderer\src\hooks\useSpaceCleanup.test.cjs`
- Modify: `D:\code\onetool\src\renderer\src\tools\SpaceCleanupTool.tsx`

- [ ] **Step 1: Write the failing test**

```js
test('space cleanup view model exposes ntfs-fast mode label and fallback reason', () => {
  const viewModel = buildSpaceCleanupViewModel({
    session: {
      ...createIdleSpaceCleanupSession(),
      status: 'scanning',
      scanMode: 'filesystem',
      scanModeReason: '当前路径不是 NTFS 根盘',
      tree: null
    },
    selectedPath: null
  })

  assert.equal(viewModel.modeLabel, '普通扫描')
  assert.match(viewModel.modeReason, /NTFS 根盘/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/renderer/src/hooks/useSpaceCleanup.test.cjs`
Expected: FAIL because the view model does not include mode label or mode reason.

- [ ] **Step 3: Write minimal implementation**

```ts
return {
  ...existingViewModel,
  modeLabel: activeSession.scanMode === 'ntfs-fast' ? '极速扫描（NTFS）' : '普通扫描',
  modeReason: activeSession.scanModeReason,
  partialLabel: activeSession.isPartial ? '结果正在持续补全' : null
}
```

```tsx
<Badge variant="outline">{viewModel.modeLabel}</Badge>
{viewModel.modeReason ? (
  <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700">
    {viewModel.modeReason}
  </div>
) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/renderer/src/hooks/useSpaceCleanup.test.cjs src/preload/createElectronBridge.test.cjs`
Expected: PASS with mode and reason coverage.

- [ ] **Step 5: Commit**

```bash
git add src/preload/createElectronBridge.ts src/preload/createElectronBridge.test.cjs src/renderer/src/hooks/useSpaceCleanup.ts src/renderer/src/hooks/useSpaceCleanup.test.cjs src/renderer/src/tools/SpaceCleanupTool.tsx
git commit -m "feat: surface NTFS fast scan mode in UI"
```

### Task 8: 文档与验收

**Files:**
- Modify: `D:\code\onetool\README.md`

- [ ] **Step 1: Write the failing test**

```js
test('README documents NTFS fast scan limitations', () => {
  const readme = fs.readFileSync('README.md', 'utf8')
  assert.match(readme, /NTFS/)
  assert.match(readme, /仅支持本地盘根路径/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/services/SpaceCleanupService.test.cjs`
Expected: FAIL because the README does not mention the NTFS fast scan limitation yet.

- [ ] **Step 3: Write minimal implementation**

```md
### 空间清理极速扫描

- 仅支持 Windows 本地 NTFS 根盘
- 普通目录、网络盘、exFAT/FAT32 不支持极速模式
- 不支持时会回退到普通扫描并给出原因
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test && npm run build`
Expected: 全部测试通过，构建通过；空间清理 UI 仍存在已知动态导入告警但不新增其他错误。

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document NTFS fast scan constraints"
```

## Self-Review

- Spec coverage:
  - Windows + NTFS + 本地根盘限制: Task 2, Task 4, Task 7, Task 8
  - Rust 独立扫描器 + MFT 路线: Task 5
  - Electron 主进程桥接与回退: Task 3, Task 4
  - JSON Lines 流式输出: Task 3, Task 5
  - 打包与发布链: Task 6
  - UI 模式提示与禁用原因: Task 7
- Placeholder scan:
  - 已避免 `TODO/TBD`，每个任务都给了明确文件、测试、命令和最小代码示意。
- Type consistency:
  - 统一使用 `scanMode`, `scanModeReason`, `isPartial`, `NtfsFastScannerBridge`, `getFastScanEligibility`, `buildSpaceCleanupViewModel`。

