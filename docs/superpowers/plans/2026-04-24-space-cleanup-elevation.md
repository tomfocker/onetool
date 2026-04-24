# 空间分析 NTFS 极速扫描提权 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持 OneTool 主应用继续以普通权限运行的前提下，让“空间分析”对本地 NTFS 根盘发起极速扫描时按需请求管理员权限，并在提权后稳定执行 `ntfs-fast-scan.exe`。

**Architecture:** 主应用继续使用 `SpaceCleanupService` 作为统一入口；新增 `windowsAdmin` 做权限检测，新增 `ElevatedNtfsScanRunner` 负责创建提权任务与临时工作目录，使用 PowerShell `Start-Process -Verb RunAs` 启动提权 helper 脚本；helper 在管理员权限下执行 `ntfs-fast-scan.exe`，把 JSON Lines 写入事件文件，主应用轮询消费并还原为现有 `SpaceCleanupSession`。

**Tech Stack:** Electron, TypeScript, PowerShell, JSON Lines, Node test runner

---

## File Structure

### New Files

- `D:\code\onetool\src\main\utils\windowsAdmin.ts`
  - Windows 管理员权限检测
- `D:\code\onetool\src\main\utils\windowsAdmin.test.cjs`
  - 管理员权限检测测试
- `D:\code\onetool\src\main\services\ElevatedNtfsScanRunner.ts`
  - 提权 helper 编排、临时工作目录、轮询句柄
- `D:\code\onetool\src\main\services\ElevatedNtfsScanRunner.test.cjs`
  - runner 行为测试
- `D:\code\onetool\scripts\run-elevated-ntfs-fast-scan.ps1`
  - 提权后真正执行扫描器并写事件文件

### Modified Files

- `D:\code\onetool\src\main\services\SpaceCleanupService.ts`
  - 决定直接快扫还是提权快扫，并把拒绝/失败映射为产品文案
- `D:\code\onetool\src\main\services\SpaceCleanupService.test.cjs`
  - 补提权分支和用户拒绝分支
- `D:\code\onetool\src\main\services\NtfsFastScannerBridge.ts`
  - 增加从事件文件消费 JSON Lines 的入口
- `D:\code\onetool\src\main\services\NtfsFastScannerBridge.test.cjs`
  - 增加事件文件消费测试
- `D:\code\onetool\src\renderer\src\tools\SpaceCleanupTool.tsx`
  - 增加“正在请求管理员权限”/“拒绝管理员权限后回退”提示

---

### Task 1: 增加 Windows 管理员权限检测

**Files:**
- Create: `D:\code\onetool\src\main\utils\windowsAdmin.ts`
- Create: `D:\code\onetool\src\main\utils\windowsAdmin.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
test('isProcessElevated reports false when helper probe says non-admin', async () => {
  const { isProcessElevated } = loadWindowsAdminModule({
    execFile: async () => ({ stdout: 'False' })
  })

  const result = await isProcessElevated()
  assert.equal(result, false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/utils/windowsAdmin.test.cjs`
Expected: FAIL because `windowsAdmin.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function isProcessElevated(): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false
  }

  const stdout = await execFileAsync('powershell', [
    '-NoProfile',
    '-Command',
    '[Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent() | ForEach-Object { $_.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }'
  ])

  return /true/i.test(stdout)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/main/utils/windowsAdmin.test.cjs`
Expected: PASS for both `true` / `false` / non-Windows branches.

### Task 2: 新增提权 runner 和 helper 工作目录协议

**Files:**
- Create: `D:\code\onetool\src\main\services\ElevatedNtfsScanRunner.ts`
- Create: `D:\code\onetool\src\main\services\ElevatedNtfsScanRunner.test.cjs`
- Create: `D:\code\onetool\scripts\run-elevated-ntfs-fast-scan.ps1`

- [ ] **Step 1: Write the failing test**

```js
test('start creates manifest and requests elevated helper launch', async () => {
  const launches = []
  const runner = createRunner({
    launchElevated: async (manifestPath) => {
      launches.push(manifestPath)
      return { pid: 1234 }
    }
  })

  const handle = await runner.start('D:\\')

  assert.equal(launches.length, 1)
  assert.match(handle.workDir, /space-cleanup-fast-scan/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/services/ElevatedNtfsScanRunner.test.cjs`
Expected: FAIL because the runner file does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export class ElevatedNtfsScanRunner {
  async start(rootPath: string) {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'space-cleanup-fast-scan-'))
    const manifestPath = path.join(workDir, 'scan-manifest.json')
    await fs.writeFile(manifestPath, JSON.stringify({...}))
    await this.launchElevated(manifestPath)
    return { workDir, manifestPath, eventsPath, stderrPath, exitCodePath, cancel() {} }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/main/services/ElevatedNtfsScanRunner.test.cjs`
Expected: PASS for manifest creation and launch invocation.

### Task 3: 让 NtfsFastScannerBridge 支持读取事件文件

**Files:**
- Modify: `D:\code\onetool\src\main\services\NtfsFastScannerBridge.ts`
- Modify: `D:\code\onetool\src\main\services\NtfsFastScannerBridge.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
test('bridge can replay JSON line events from an external events file', async () => {
  const events = []
  await bridge.consumeEventFile(eventsPath, (event) => events.push(event))
  assert.equal(events[0].type, 'volume-info')
  assert.equal(events.at(-1).type, 'complete')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/services/NtfsFastScannerBridge.test.cjs`
Expected: FAIL because file-based consumption is not implemented.

- [ ] **Step 3: Write minimal implementation**

```ts
async consumeEventFile(eventsPath: string, onEvent: (event) => void) {
  const content = await fs.readFile(eventsPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue
    onEvent(JSON.parse(line))
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/main/services/NtfsFastScannerBridge.test.cjs`
Expected: PASS for JSONL replay and malformed line handling.

### Task 4: 让 SpaceCleanupService 分流到提权快扫

**Files:**
- Modify: `D:\code\onetool\src\main\services\SpaceCleanupService.ts`
- Modify: `D:\code\onetool\src\main\services\SpaceCleanupService.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
test('startScan requests elevated ntfs-fast execution when current process is not elevated', async () => {
  let elevatedCalls = 0
  const service = createSpaceCleanupService({
    fastEligibility: async () => ({ mode: 'ntfs-fast', reason: null }),
    isProcessElevated: async () => false,
    elevatedRunner: {
      start: async () => {
        elevatedCalls += 1
        return fakeElevatedHandle()
      }
    }
  })

  await service.startScan('D:\\')

  assert.equal(elevatedCalls, 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/services/SpaceCleanupService.test.cjs`
Expected: FAIL because `SpaceCleanupService` still only knows direct local fast scan.

- [ ] **Step 3: Write minimal implementation**

```ts
if (eligibility.mode === 'ntfs-fast') {
  const elevated = await this.isProcessElevated()
  if (elevated) {
    return this.startNtfsFastScan(rootPath)
  }
  return this.startElevatedNtfsFastScan(rootPath)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/main/services/SpaceCleanupService.test.cjs`
Expected: PASS for direct fast scan, elevated fast scan, UAC rejection fallback, and native failure fallback.

### Task 5: 将提权状态和拒绝原因展示到 UI

**Files:**
- Modify: `D:\code\onetool\src\renderer\src\tools\SpaceCleanupTool.tsx`

- [ ] **Step 1: Write the failing test**

```js
test('space cleanup tool shows administrator elevation reason when fast scan requires UAC', () => {
  const viewModel = buildSpaceCleanupViewModel({
    session: {
      ...createIdleSpaceCleanupSession(),
      status: 'scanning',
      scanMode: 'ntfs-fast',
      scanModeReason: '正在请求管理员权限以执行 NTFS 极速扫描'
    },
    selectedPath: null
  })

  assert.match(viewModel.modeReason, /管理员权限/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/renderer/src/hooks/useSpaceCleanup.test.cjs`
Expected: FAIL or missing coverage for elevation-specific reason.

- [ ] **Step 3: Write minimal implementation**

```tsx
{viewModel.modeReason ? (
  <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700">
    {viewModel.modeReason}
  </div>
) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build`
Expected: Build passes and UI preserves current mode-reason rendering.

### Task 6: 端到端验证与文档收口

**Files:**
- Modify: `D:\code\onetool\README.md` (only if needed)

- [ ] **Step 1: Verify core flows**

Run:

```bash
node --test src/main/utils/windowsAdmin.test.cjs src/main/services/ElevatedNtfsScanRunner.test.cjs src/main/services/NtfsFastScannerBridge.test.cjs src/main/services/SpaceCleanupService.test.cjs
npm run build
```

Expected:

- 非管理员场景会走提权分支
- 拒绝 UAC 会回退普通扫描
- 构建通过

- [ ] **Step 2: Manual validation**

Validate on Windows:

- 普通权限打开 OneTool
- 对 `D:\` 发起扫描
- 确认出现 UAC
- 同意时走 NTFS 快扫
- 拒绝时回退普通扫描并显示明确原因

## Self-Review

- 这个计划只处理“按需提权执行 NTFS 快扫”，没有把整个应用管理员化
- 通信机制统一使用临时 JSONL 事件文件，避免一次性引入服务或命名管道
- 风险边界集中在 `SpaceCleanupService` 和新 helper，不外溢到其他工具
