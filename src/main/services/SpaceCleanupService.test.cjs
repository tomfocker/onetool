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

  assert.equal(result.success, true)
  assert.equal(result.data.scanMode, 'ntfs-fast')
  assert.equal(result.data.summary.totalBytes, 123)
  assert.equal(result.data.tree.path, 'D:\\')
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

  assert.equal(result.success, true)
  assert.equal(result.data.status, 'completed')
  assert.equal(result.data.isPartial, true)
  assert.equal(result.data.summary.skippedEntries, 3)
  assert.equal(result.data.tree.skippedChildren, 3)
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

test('startScan falls back to filesystem scan when fast eligibility lookup fails', async () => {
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

  assert.equal(result.success, true)
  assert.equal(result.data.scanMode, 'filesystem')
  assert.equal(result.data.summary.totalBytes, 13)
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

  assert.equal(result.success, true)
  assert.equal(result.data.scanMode, 'filesystem')
  assert.equal(result.data.scanModeReason, 'NTFS 极速扫描失败，已回退到普通扫描：native worker crashed')
  assert.equal(result.data.summary.totalBytes, 17)
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
  assert.equal(result.data.status, 'cancelled')
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

  assert.equal(result.success, true)
  assert.deepEqual(result.data.largestFiles, [largestFile])
  assert.deepEqual(result.data.summary.largestFile, largestFile)
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
