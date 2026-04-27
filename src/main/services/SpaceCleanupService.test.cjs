const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function createDirent(name, kind) {
  return {
    name,
    isDirectory: () => kind === 'directory',
    isFile: () => kind === 'file',
    isSymbolicLink: () => kind === 'symlink'
  }
}

function createTree(rootPath, sizeBytes, skippedChildren = 0) {
  return {
    id: rootPath,
    name: rootPath,
    path: rootPath,
    type: 'directory',
    sizeBytes,
    childrenCount: 0,
    fileCount: 0,
    directoryCount: 0,
    skippedChildren,
    children: []
  }
}

function waitForAsyncTick() {
  return new Promise((resolve) => setImmediate(resolve))
}

function loadSpaceCleanupServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'SpaceCleanupService.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: filePath
  }).outputText

  const module = { exports: {} }
  const logger = overrides.logger || { info() {}, warn() {}, error() {} }

  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return {
        BrowserWindow: class BrowserWindowMock {},
        clipboard: overrides.clipboard || { writeText() {} },
        dialog: overrides.dialog || { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
        shell: overrides.shell || { openPath: async () => '', showItemInFolder() {}, trashItem: async () => {} }
      }
    }

    if (specifier === 'node:fs/promises' || specifier === 'fs/promises') {
      return overrides.fsPromises || require(specifier)
    }

    if (specifier === 'node:path' || specifier === 'path') {
      return overrides.pathModule || require(specifier)
    }

    if (specifier === '../utils/logger') {
      return { logger }
    }

    if (specifier === '../utils/windowsVolume') {
      return {
        getFastScanEligibility: overrides.fastEligibility || (async () => ({ mode: 'filesystem', reason: null }))
      }
    }

    if (specifier === '../utils/windowsAdmin') {
      return {
        isProcessElevated: overrides.isProcessElevated || (async () => true)
      }
    }

    if (specifier === './NtfsFastScannerBridge') {
      const defaultRunHandle = {
        done: Promise.resolve(),
        cancel() {}
      }
      return {
        NtfsFastScannerBridge: class NtfsFastScannerBridgeMock {
          start(rootPath, onEvent) {
            if (overrides.fastBridge?.start) {
              return overrides.fastBridge.start(rootPath, onEvent)
            }

            return defaultRunHandle
          }
        }
      }
    }

    if (specifier === './ElevatedNtfsScanRunner') {
      return {
        ElevatedNtfsScanRunner: class ElevatedNtfsScanRunnerMock {
          start(rootPath, onEvent) {
            if (overrides.elevatedRunner?.start) {
              return overrides.elevatedRunner.start(rootPath, onEvent)
            }

            return Promise.resolve({
              done: Promise.resolve(),
              cancel() {}
            })
          }
        }
      }
    }

    if (specifier === '../../shared/spaceCleanup') {
      return require(path.join(__dirname, '../../shared/spaceCleanup.ts'))
    }

    if (specifier === '../../shared/types') {
      return {}
    }

    return require(specifier)
  }

  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: customRequire,
    __dirname,
    __filename: filePath,
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
    setImmediate
  }, { filename: filePath })

  return module.exports
}

test('package build config includes ntfs fast scanner resource', () => {
  const pkg = require(path.join(__dirname, '../../../package.json'))
  const entry = pkg.build.win.extraResources.find((item) => item.from === 'resources/space-scan/ntfs-fast-scan.exe')
  const helperEntry = pkg.build.win.extraResources.find(
    (item) => item.from === 'resources/space-scan/run-elevated-ntfs-fast-scan.ps1'
  )

  assert.ok(entry)
  assert.equal(entry.to, 'space-scan/ntfs-fast-scan.exe')
  assert.ok(helperEntry)
  assert.equal(helperEntry.to, 'space-scan/run-elevated-ntfs-fast-scan.ps1')
})

test('idle space cleanup session includes scan mode metadata', () => {
  const { createIdleSpaceCleanupSession } = require('../../shared/spaceCleanup.ts')
  const session = createIdleSpaceCleanupSession()

  assert.equal(session.scanMode, 'filesystem')
  assert.equal(session.scanModeReason, null)
  assert.equal(session.isPartial, false)
})

test('startScan uses ntfs-fast mode for eligible NTFS root volumes', async () => {
  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => ({ mode: 'ntfs-fast', reason: null }),
    fastBridge: {
      start(_rootPath, onEvent) {
        onEvent({ type: 'volume-info', mode: 'ntfs-fast', rootPath: 'D:\\', filesystem: 'NTFS' })
        onEvent({
          type: 'complete',
          summary: {
            totalBytes: 123,
            scannedFiles: 0,
            scannedDirectories: 1,
            skippedEntries: 0,
            largestFile: null
          },
          largestFiles: [],
          tree: createTree('D:\\', 123)
        })
        return {
          done: Promise.resolve(),
          cancel() {}
        }
      }
    }
  })

  const service = new SpaceCleanupService({ now: () => 4000, createId: () => 'session-fast-1' })
  const result = await service.startScan('D:\\')
  await Promise.resolve()
  const finalSession = service.getSession()

  assert.equal(result.success, true)
  assert.equal(result.data.scanMode, 'ntfs-fast')
  assert.match(result.data.status, /scanning|completed/)
  assert.equal(finalSession.data.status, 'completed')
  assert.equal(finalSession.data.summary.totalBytes, 123)
  assert.equal(finalSession.data.tree.path, 'D:\\')
})

test('startScan exposes an immediate ntfs-fast progress reason while native scan is pending', async () => {
  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => ({ mode: 'ntfs-fast', reason: null }),
    fastBridge: {
      start() {
        return {
          done: new Promise(() => {}),
          cancel() {}
        }
      }
    }
  })

  const service = new SpaceCleanupService({ now: () => 4300, createId: () => 'session-fast-pending-1' })
  const result = await service.startScan('D:\\')
  const activeSession = service.getSession()

  assert.equal(result.success, true)
  assert.equal(result.data.status, 'scanning')
  assert.equal(result.data.scanMode, 'ntfs-fast')
  assert.match(result.data.scanModeReason, /读取 NTFS/)
  assert.equal(activeSession.data.scanModeReason, result.data.scanModeReason)
})

test('startScan updates the ntfs-fast progress reason from native stage events', async () => {
  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => ({ mode: 'ntfs-fast', reason: null }),
    fastBridge: {
      start(_rootPath, onEvent) {
        onEvent({
          type: 'scan-progress',
          stage: 'aggregating',
          message: '正在整理目录占用和大文件列表'
        })
        return {
          done: new Promise(() => {}),
          cancel() {}
        }
      }
    }
  })

  const service = new SpaceCleanupService({ now: () => 4400, createId: () => 'session-fast-progress-1' })
  const result = await service.startScan('D:\\')
  const activeSession = service.getSession()

  assert.equal(result.success, true)
  assert.equal(activeSession.data.status, 'scanning')
  assert.equal(activeSession.data.scanModeReason, '正在整理目录占用和大文件列表')
})

test('startScan updates ntfs-fast tree and chart data from native tree-update events before completion', async () => {
  const partialTree = {
    id: 'D:\\',
    name: 'D:\\',
    path: 'D:\\',
    type: 'directory',
    sizeBytes: 4096,
    childrenCount: 1,
    fileCount: 1,
    directoryCount: 1,
    skippedChildren: 0,
    children: [
      {
        id: 'D:\\Users',
        name: 'Users',
        path: 'D:\\Users',
        type: 'directory',
        sizeBytes: 4096,
        childrenCount: 1,
        fileCount: 1,
        directoryCount: 0,
        skippedChildren: 0,
        children: []
      }
    ]
  }

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => ({ mode: 'ntfs-fast', reason: null }),
    fastBridge: {
      start(_rootPath, onEvent) {
        onEvent({
          type: 'tree-update',
          summary: {
            totalBytes: 4096,
            scannedFiles: 1,
            scannedDirectories: 2,
            skippedEntries: 0,
            largestFile: null
          },
          tree: partialTree
        })
        return {
          done: new Promise(() => {}),
          cancel() {}
        }
      }
    }
  })

  const service = new SpaceCleanupService({ now: () => 4500, createId: () => 'session-fast-tree-update-1' })
  const result = await service.startScan('D:\\')
  const activeSession = service.getSession()

  assert.equal(result.success, true)
  assert.equal(activeSession.data.status, 'scanning')
  assert.equal(activeSession.data.summary.totalBytes, 4096)
  assert.equal(activeSession.data.tree.children[0].path, 'D:\\Users')
  assert.equal(activeSession.data.tree.children[0].sizeBytes, 4096)
})

test('startScan keeps ntfs-fast sessions partial when native complete reports skipped entries', async () => {
  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => ({ mode: 'ntfs-fast', reason: null }),
    fastBridge: {
      start(_rootPath, onEvent) {
        onEvent({ type: 'volume-info', mode: 'ntfs-fast', rootPath: 'D:\\', filesystem: 'NTFS' })
        onEvent({
          type: 'complete',
          summary: {
            totalBytes: 456,
            scannedFiles: 2,
            scannedDirectories: 1,
            skippedEntries: 3,
            largestFile: null
          },
          largestFiles: [],
          tree: createTree('D:\\', 456, 3)
        })
        return {
          done: Promise.resolve(),
          cancel() {}
        }
      }
    }
  })

  const service = new SpaceCleanupService({ now: () => 4500, createId: () => 'session-fast-partial-1' })
  const result = await service.startScan('D:\\')
  await Promise.resolve()
  const finalSession = service.getSession()

  assert.equal(result.success, true)
  assert.match(result.data.status, /scanning|completed/)
  assert.equal(finalSession.data.status, 'completed')
  assert.equal(finalSession.data.isPartial, true)
  assert.equal(finalSession.data.summary.skippedEntries, 3)
  assert.equal(finalSession.data.tree.skippedChildren, 3)
})

test('startScan keeps filesystem mode and ineligibility reason for non-eligible paths', async () => {
  const entries = {
    'D:\\folder': [createDirent('nested.bin', 'file')]
  }
  const stats = {
    'D:\\folder': { isDirectory: () => true, size: 0 },
    'D:\\folder\\nested.bin': { isDirectory: () => false, size: 7 }
  }

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => ({ mode: 'filesystem', reason: 'NTFS 极速扫描仅支持本地盘根路径' }),
    fsPromises: {
      readdir: async (targetPath) => entries[targetPath] || [],
      stat: async (targetPath) => stats[targetPath]
    }
  })

  const service = new SpaceCleanupService({ now: () => 5000, createId: () => 'session-filesystem-1' })
  const result = await service.startScan('D:\\folder')

  assert.equal(result.success, true)
  assert.equal(result.data.scanMode, 'filesystem')
  assert.equal(result.data.scanModeReason, 'NTFS 极速扫描仅支持本地盘根路径')
  assert.equal(result.data.summary.totalBytes, 7)
})

test('startScan still attempts ntfs-fast when fsutil-style eligibility probing fails', async () => {
  let fastStartCalls = 0

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => ({
      mode: 'ntfs-fast',
      reason: 'fsutil 探测失败，无法预判文件系统；将先尝试 NTFS 极速扫描，失败后自动回退普通扫描'
    }),
    fastBridge: {
      start(_rootPath, onEvent) {
        fastStartCalls += 1
        onEvent({ type: 'volume-info', mode: 'ntfs-fast', rootPath: 'D:\\', filesystem: 'NTFS' })
        onEvent({
          type: 'complete',
          summary: {
            totalBytes: 21,
            scannedFiles: 1,
            scannedDirectories: 1,
            skippedEntries: 0,
            largestFile: null
          },
          largestFiles: [],
          tree: createTree('D:\\', 21)
        })
        return {
          done: Promise.resolve(),
          cancel() {}
        }
      }
    }

  })

  const service = new SpaceCleanupService({ now: () => 5400, createId: () => 'session-fast-after-fsutil-fail' })
  const result = await service.startScan('D:\\')
  await Promise.resolve()
  const finalSession = service.getSession()

  assert.equal(result.success, true)
  assert.equal(fastStartCalls, 1)
  assert.equal(finalSession.data.scanMode, 'ntfs-fast')
  assert.equal(finalSession.data.status, 'completed')
  assert.equal(finalSession.data.summary.totalBytes, 21)
})

test('startScan requests elevated ntfs-fast execution when current process is not elevated', async () => {
  let elevatedCalls = 0

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => ({ mode: 'ntfs-fast', reason: null }),
    isProcessElevated: async () => false,
    elevatedRunner: {
      async start(_rootPath, onEvent) {
        elevatedCalls += 1
        onEvent({ type: 'volume-info', mode: 'ntfs-fast', rootPath: 'D:\\', filesystem: 'NTFS' })
        onEvent({
          type: 'complete',
          summary: {
            totalBytes: 222,
            scannedFiles: 2,
            scannedDirectories: 1,
            skippedEntries: 0,
            largestFile: null
          },
          largestFiles: [],
          tree: createTree('D:\\', 222)
        })
        return {
          done: Promise.resolve(),
          cancel() {}
        }
      }
    }
  })

  const service = new SpaceCleanupService({ now: () => 5410, createId: () => 'session-fast-elevated-1' })
  const result = await service.startScan('D:\\')
  await Promise.resolve()
  const finalSession = service.getSession()

  assert.equal(result.success, true)
  assert.equal(elevatedCalls, 1)
  assert.equal(finalSession.data.scanMode, 'ntfs-fast')
  assert.equal(finalSession.data.status, 'completed')
  assert.equal(finalSession.data.summary.totalBytes, 222)
})

test('startScan falls back to filesystem scan when fast eligibility lookup throws before mode resolution', async () => {
  const entries = {
    'D:\\': [createDirent('fallback.bin', 'file')]
  }
  const stats = {
    'D:\\': { isDirectory: () => true, size: 0 },
    'D:\\fallback.bin': { isDirectory: () => false, size: 11 }
  }

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => {
      throw new Error('fsutil exploded')
    },
    fsPromises: {
      readdir: async (targetPath) => entries[targetPath] || [],
      stat: async (targetPath) => stats[targetPath]
    }
  })

  const service = new SpaceCleanupService({ now: () => 5500, createId: () => 'session-filesystem-2' })
  const result = await service.startScan('D:\\')

  assert.equal(result.success, true)
  assert.equal(result.data.scanMode, 'filesystem')
  assert.equal(result.data.summary.totalBytes, 11)
})

test('startScan falls back to filesystem scan when ntfs-fast startup throws', async () => {
  const entries = {
    'D:\\': [createDirent('fallback.bin', 'file')]
  }
  const stats = {
    'D:\\': { isDirectory: () => true, size: 0 },
    'D:\\fallback.bin': { isDirectory: () => false, size: 13 }
  }

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => ({ mode: 'ntfs-fast', reason: null }),
    fastBridge: {
      start() {
        throw new Error('spawn failed')
      }
    },
    fsPromises: {
      readdir: async (targetPath) => entries[targetPath] || [],
      stat: async (targetPath) => stats[targetPath]
    }
  })

  const service = new SpaceCleanupService({ now: () => 5750, createId: () => 'session-filesystem-3' })
  const result = await service.startScan('D:\\')
  await waitForAsyncTick()
  const finalSession = service.getSession()

  assert.equal(result.success, true)
  assert.equal(finalSession.data.scanMode, 'filesystem')
  assert.equal(finalSession.data.summary.totalBytes, 13)
})

test('startScan falls back to filesystem scan when a started ntfs-fast run fails', async () => {
  const entries = {
    'D:\\': [createDirent('fallback-after-start.bin', 'file')]
  }
  const stats = {
    'D:\\': { isDirectory: () => true, size: 0 },
    'D:\\fallback-after-start.bin': { isDirectory: () => false, size: 17 }
  }

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => ({ mode: 'ntfs-fast', reason: null }),
    fastBridge: {
      start(_rootPath, onEvent) {
        onEvent({ type: 'volume-info', mode: 'ntfs-fast', rootPath: 'D:\\', filesystem: 'NTFS' })
        return {
          done: Promise.reject(new Error('native worker crashed')),
          cancel() {}
        }
      }
    },
    fsPromises: {
      readdir: async (targetPath) => entries[targetPath] || [],
      stat: async (targetPath) => stats[targetPath]
    }
  })

  const service = new SpaceCleanupService({ now: () => 5875, createId: () => 'session-filesystem-4' })
  const result = await service.startScan('D:\\')
  await waitForAsyncTick()
  const finalSession = service.getSession()

  assert.equal(result.success, true)
  assert.equal(finalSession.data.scanMode, 'filesystem')
  assert.equal(finalSession.data.scanModeReason, 'NTFS 极速扫描失败，已回退到普通扫描：native worker crashed')
  assert.equal(finalSession.data.summary.totalBytes, 17)
})

test('startScan reports a friendly administrator hint when ntfs-fast volume access is denied', async () => {
  const entries = {
    'D:\\': [createDirent('fallback-after-denied.bin', 'file')]
  }
  const stats = {
    'D:\\': { isDirectory: () => true, size: 0 },
    'D:\\fallback-after-denied.bin': { isDirectory: () => false, size: 19 }
  }

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => ({ mode: 'ntfs-fast', reason: null }),
    fastBridge: {
      start() {
        return {
          done: Promise.reject(new Error('scan failed: failed to open NTFS volume \\\\.\\D:: 拒绝访问。 (os error 5)')),
          cancel() {}
        }
      }
    },
    fsPromises: {
      readdir: async (targetPath) => entries[targetPath] || [],
      stat: async (targetPath) => stats[targetPath]
    }
  })

  const service = new SpaceCleanupService({ now: () => 5890, createId: () => 'session-filesystem-5' })
  const result = await service.startScan('D:\\')
  await waitForAsyncTick()
  const finalSession = service.getSession()

  assert.equal(result.success, true)
  assert.equal(finalSession.data.scanMode, 'filesystem')
  assert.equal(
    finalSession.data.scanModeReason,
    'NTFS 极速扫描失败，已回退到普通扫描：当前进程没有管理员权限，NTFS 极速扫描需要提升权限后才能直接访问磁盘卷'
  )
  assert.equal(finalSession.data.summary.totalBytes, 19)
})

test('startScan reports a friendly reason when administrator permission request is cancelled', async () => {
  const entries = {
    'D:\\': [createDirent('fallback-after-uac-cancel.bin', 'file')]
  }
  const stats = {
    'D:\\': { isDirectory: () => true, size: 0 },
    'D:\\fallback-after-uac-cancel.bin': { isDirectory: () => false, size: 23 }
  }

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => ({ mode: 'ntfs-fast', reason: null }),
    isProcessElevated: async () => false,
    elevatedRunner: {
      async start() {
        throw new Error('管理员权限请求已取消')
      }
    },
    fsPromises: {
      readdir: async (targetPath) => entries[targetPath] || [],
      stat: async (targetPath) => stats[targetPath]
    }
  })

  const service = new SpaceCleanupService({ now: () => 5905, createId: () => 'session-filesystem-uac-cancel' })
  const result = await service.startScan('D:\\')
  const finalSession = service.getSession()

  assert.equal(result.success, true)
  assert.equal(finalSession.data.scanMode, 'filesystem')
  assert.equal(
    finalSession.data.scanModeReason,
    'NTFS 极速扫描失败，已回退到普通扫描：你取消了管理员权限请求，NTFS 极速扫描未启动'
  )
  assert.equal(finalSession.data.summary.totalBytes, 23)
})

test('cancelScan cancels an active ntfs-fast run through the bridge handle', async () => {
  let cancelCalls = 0
  let releaseScan
  let markStarted
  const fastDone = new Promise((resolve) => {
    releaseScan = resolve
  })
  const fastStarted = new Promise((resolve) => {
    markStarted = resolve
  })

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => ({ mode: 'ntfs-fast', reason: null }),
    fastBridge: {
      start() {
        markStarted()
        return {
          done: fastDone,
          cancel() {
            cancelCalls += 1
            releaseScan()
          }
        }
      }
    }
  })

  const service = new SpaceCleanupService({ now: () => 6000, createId: () => 'session-fast-2' })
  const resultPromise = service.startScan('D:\\')
  await fastStarted
  const cancelResult = service.cancelScan()
  const result = await resultPromise

  assert.equal(cancelResult.success, true)
  assert.equal(cancelCalls, 1)
  assert.equal(cancelResult.data.status, 'cancelled')
  assert.match(result.data.status, /scanning|cancelled/)
})

test('startScan updates largest files from standalone ntfs-fast largest-files events', async () => {
  const largestFile = {
    path: 'D:\\big.iso',
    name: 'big.iso',
    sizeBytes: 2048,
    extension: '.iso'
  }

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => ({ mode: 'ntfs-fast', reason: null }),
    fastBridge: {
      start(_rootPath, onEvent) {
        onEvent({ type: 'volume-info', mode: 'ntfs-fast', rootPath: 'D:\\', filesystem: 'NTFS' })
        onEvent({ type: 'largest-files', largestFiles: [largestFile] })
        onEvent({ type: 'complete' })
        return {
          done: Promise.resolve(),
          cancel() {}
        }
      }
    }
  })

  const service = new SpaceCleanupService({ now: () => 6100, createId: () => 'session-fast-largest-files-1' })
  const result = await service.startScan('D:\\')
  await Promise.resolve()
  const finalSession = service.getSession()

  assert.equal(result.success, true)
  assert.match(result.data.status, /scanning|completed/)
  assert.deepEqual(finalSession.data.largestFiles, [largestFile])
  assert.deepEqual(finalSession.data.summary.largestFile, largestFile)
})

test('startScan lets ntfs-fast completion settle through events before bridge close resolves', async () => {
  let releaseDone
  const done = new Promise((resolve) => {
    releaseDone = resolve
  })

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fastEligibility: async () => ({ mode: 'ntfs-fast', reason: null }),
    fastBridge: {
      start(_rootPath, onEvent) {
        onEvent({ type: 'volume-info', mode: 'ntfs-fast', rootPath: 'D:\\', filesystem: 'NTFS' })
        onEvent({
          type: 'complete',
          summary: {
            totalBytes: 99,
            scannedFiles: 1,
            scannedDirectories: 1,
            skippedEntries: 0,
            largestFile: null
          },
          largestFiles: [],
          tree: createTree('D:\\', 99)
        })
        return {
          done,
          cancel() {}
        }
      }
    }
  })

  const service = new SpaceCleanupService({ now: () => 6200, createId: () => 'session-fast-complete-before-close' })
  const result = await service.startScan('D:\\')
  const midSession = service.getSession()

  assert.equal(result.success, true)
  assert.equal(result.data.status, 'completed')
  assert.equal(midSession.data.status, 'completed')
  assert.equal(midSession.data.summary.totalBytes, 99)

  releaseDone()
  await Promise.resolve()
})

test('startScan aggregates nested directory sizes and largest files', async () => {
  const entries = {
    'C:\\scan': [
      createDirent('src', 'directory'),
      createDirent('readme.md', 'file'),
      createDirent('movie.mkv', 'file')
    ],
    'C:\\scan\\src': [
      createDirent('index.ts', 'file')
    ]
  }

  const stats = {
    'C:\\scan': { isDirectory: () => true, size: 0 },
    'C:\\scan\\src': { isDirectory: () => true, size: 0 },
    'C:\\scan\\src\\index.ts': { isDirectory: () => false, size: 25 },
    'C:\\scan\\readme.md': { isDirectory: () => false, size: 10 },
    'C:\\scan\\movie.mkv': { isDirectory: () => false, size: 400 }
  }

  const eventLog = []

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fsPromises: {
      readdir: async (targetPath) => entries[targetPath] || [],
      stat: async (targetPath) => stats[targetPath]
    }
  })

  const service = new SpaceCleanupService({ now: () => 1000, createId: () => 'session-1' })
  service.setMainWindow({
    isDestroyed: () => false,
    webContents: {
      send(channel, payload) {
        eventLog.push([channel, payload.status])
      }
    }
  })

  const result = await service.startScan('C:\\scan')

  assert.equal(result.success, true)
  assert.equal(result.data.summary.totalBytes, 435)
  assert.equal(result.data.summary.scannedFiles, 3)
  assert.equal(result.data.summary.scannedDirectories, 2)
  assert.equal(result.data.largestFiles[0].name, 'movie.mkv')
  assert.equal(result.data.tree.children[0].name, 'movie.mkv')
  assert.deepEqual(eventLog.at(-1), ['space-cleanup-complete', 'completed'])
})

test('filesystem scan publishes discovered largest files before completion', async () => {
  const entries = {
    'C:\\scan': [
      createDirent('huge.iso', 'file'),
      createDirent('small.txt', 'file')
    ]
  }

  const stats = {
    'C:\\scan': { isDirectory: () => true, size: 0 },
    'C:\\scan\\huge.iso': { isDirectory: () => false, size: 1024 * 1024 * 1024 },
    'C:\\scan\\small.txt': { isDirectory: () => false, size: 10 }
  }

  const eventLog = []
  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fsPromises: {
      readdir: async (targetPath) => entries[targetPath] || [],
      stat: async (targetPath) => stats[targetPath]
    }
  })

  const service = new SpaceCleanupService({ now: () => 1500, createId: () => 'session-progress-largest', yieldEvery: 100 })
  service.setMainWindow({
    isDestroyed: () => false,
    webContents: {
      send(channel, payload) {
        eventLog.push({
          channel,
          status: payload.status,
          largestFiles: payload.largestFiles.map((item) => item.name),
          largestFile: payload.summary.largestFile?.name ?? null
        })
      }
    }
  })

  const result = await service.startScan('C:\\scan')

  const firstLargestProgressIndex = eventLog.findIndex(
    (event) => event.channel === 'space-cleanup-progress' && event.largestFiles.includes('huge.iso')
  )
  const completeIndex = eventLog.findIndex((event) => event.channel === 'space-cleanup-complete')

  assert.equal(result.success, true)
  assert.ok(firstLargestProgressIndex >= 0)
  assert.ok(completeIndex > firstLargestProgressIndex)
  assert.equal(eventLog[firstLargestProgressIndex].largestFile, 'huge.iso')
})

test('filesystem scan defaults to the first two directory levels', async () => {
  const readdirCalls = []
  const stats = {
    'C:\\scan': { isDirectory: () => true, size: 0 },
    'C:\\scan\\top.bin': { isDirectory: () => false, size: 100 },
    'C:\\scan\\level1': { isDirectory: () => true, size: 0 },
    'C:\\scan\\level1\\level2': { isDirectory: () => true, size: 0 },
    'C:\\scan\\level1\\level2\\deep.bin': { isDirectory: () => false, size: 9999 }
  }
  const entries = {
    'C:\\scan': [
      createDirent('top.bin', 'file'),
      createDirent('level1', 'directory')
    ],
    'C:\\scan\\level1': [
      createDirent('level2', 'directory')
    ],
    'C:\\scan\\level1\\level2': [
      createDirent('deep.bin', 'file')
    ]
  }

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fsPromises: {
      readdir: async (targetPath) => {
        readdirCalls.push(targetPath)
        return entries[targetPath] || []
      },
      stat: async (targetPath) => stats[targetPath]
    }
  })

  const service = new SpaceCleanupService({ now: () => 1600, createId: () => 'session-depth-limited' })
  const result = await service.startScan('C:\\scan')

  assert.equal(result.success, true)
  assert.equal(result.data.scanMode, 'filesystem')
  assert.equal(result.data.isPartial, true)
  assert.equal(result.data.summary.totalBytes, 100)
  assert.equal(result.data.summary.skippedEntries, 1)
  assert.equal(result.data.largestFiles[0].name, 'top.bin')
  assert.deepEqual(readdirCalls, ['C:\\scan', 'C:\\scan\\level1'])
})

test('startScan reports cancelled when traversal is interrupted', async () => {
  const entries = {
    'C:\\scan': [
      createDirent('keep.txt', 'file'),
      createDirent('stop.txt', 'file')
    ]
  }
  let releaseFirstStat
  const firstStatGate = new Promise((resolve) => {
    releaseFirstStat = resolve
  })

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fsPromises: {
      readdir: async (targetPath) => entries[targetPath] || [],
      stat: async (targetPath) => {
        if (targetPath.endsWith('keep.txt')) {
          await firstStatGate
        }
        return { isDirectory: () => false, size: 5 }
      }
    }
  })

  const service = new SpaceCleanupService({ now: () => 2000, createId: () => 'session-2' })
  const resultPromise = service.startScan('C:\\scan')
  service.cancelScan()
  releaseFirstStat()
  const result = await resultPromise

  assert.equal(result.success, true)
  assert.equal(result.data.status, 'cancelled')
})

test('startScan skips unreadable entries instead of failing the whole scan', async () => {
  const entries = {
    'C:\\scan': [
      createDirent('docs', 'directory'),
      createDirent('secret', 'directory')
    ],
    'C:\\scan\\docs': [createDirent('guide.txt', 'file')]
  }

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fsPromises: {
      readdir: async (targetPath) => {
        if (targetPath === 'C:\\scan\\secret') {
          const error = new Error('denied')
          error.code = 'EACCES'
          throw error
        }
        return entries[targetPath] || []
      },
      stat: async (targetPath) => {
        if (targetPath.endsWith('guide.txt')) {
          return { isDirectory: () => false, size: 20 }
        }
        return { isDirectory: () => true, size: 0 }
      }
    }
  })

  const service = new SpaceCleanupService({ now: () => 3000, createId: () => 'session-3' })
  const result = await service.startScan('C:\\scan')

  assert.equal(result.success, true)
  assert.equal(result.data.status, 'completed')
  assert.equal(result.data.summary.skippedEntries, 1)
})

test('deleteToTrash uses recycle-bin deletion instead of permanent removal', async () => {
  const trashCalls = []
  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    shell: {
      openPath: async () => '',
      showItemInFolder() {},
      trashItem: async (targetPath) => {
        trashCalls.push(targetPath)
      }
    }
  })

  const service = new SpaceCleanupService()
  const result = await service.deleteToTrash('C:\\scan\\movie.mkv')

  assert.equal(result.success, true)
  assert.deepEqual(trashCalls, ['C:\\scan\\movie.mkv'])
})

test('openPath reveals files in Explorer and opens directories directly', async () => {
  const showItemCalls = []
  const openPathCalls = []

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fsPromises: {
      stat: async (targetPath) => ({
        isDirectory: () => targetPath.endsWith('\\folder'),
        size: 0
      })
    },
    shell: {
      showItemInFolder(targetPath) {
        showItemCalls.push(targetPath)
      },
      openPath: async (targetPath) => {
        openPathCalls.push(targetPath)
        return ''
      },
      trashItem: async () => {}
    }
  })

  const service = new SpaceCleanupService()
  await service.openPath('C:\\scan\\clip.mp4')
  await service.openPath('C:\\scan\\folder')

  assert.deepEqual(showItemCalls, ['C:\\scan\\clip.mp4'])
  assert.deepEqual(openPathCalls, ['C:\\scan\\folder'])
})

test('scanDirectoryBreakdown returns only the direct children summary for a selected deep directory', async () => {
  const entries = {
    'D:\\vmware\\windows 10': [
      createDirent('disk-flat.vmdk', 'file'),
      createDirent('snapshots', 'directory')
    ],
    'D:\\vmware\\windows 10\\snapshots': [
      createDirent('s1.vmdk', 'file'),
      createDirent('nested', 'directory')
    ],
    'D:\\vmware\\windows 10\\snapshots\\nested': [
      createDirent('deep.bin', 'file')
    ]
  }

  const stats = {
    'D:\\vmware\\windows 10': { isDirectory: () => true, size: 0 },
    'D:\\vmware\\windows 10\\disk-flat.vmdk': { isDirectory: () => false, size: 100 },
    'D:\\vmware\\windows 10\\snapshots': { isDirectory: () => true, size: 0 },
    'D:\\vmware\\windows 10\\snapshots\\s1.vmdk': { isDirectory: () => false, size: 40 },
    'D:\\vmware\\windows 10\\snapshots\\nested': { isDirectory: () => true, size: 0 },
    'D:\\vmware\\windows 10\\snapshots\\nested\\deep.bin': { isDirectory: () => false, size: 10 }
  }

  const { SpaceCleanupService } = loadSpaceCleanupServiceModule({
    fsPromises: {
      readdir: async (targetPath) => entries[targetPath] || [],
      stat: async (targetPath) => stats[targetPath]
    }
  })

  const service = new SpaceCleanupService()
  const result = await service.scanDirectoryBreakdown('D:\\vmware\\windows 10')

  assert.equal(result.success, true)
  assert.equal(result.data.path, 'D:\\vmware\\windows 10')
  assert.equal(result.data.children.length, 2)
  assert.equal(result.data.children[0].path, 'D:\\vmware\\windows 10\\disk-flat.vmdk')
  assert.equal(result.data.children[0].sizeBytes, 100)
  assert.equal(result.data.children[1].path, 'D:\\vmware\\windows 10\\snapshots')
  assert.equal(result.data.children[1].sizeBytes, 50)
  assert.equal(result.data.children[1].children.length, 0)
})
