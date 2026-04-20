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
