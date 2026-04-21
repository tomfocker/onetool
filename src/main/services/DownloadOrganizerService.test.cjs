const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function createDirent(name, kind = 'file') {
  return {
    name,
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'directory',
    isSymbolicLink: () => false
  }
}

function loadDownloadOrganizerServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'DownloadOrganizerService.ts')
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

  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return {
        app: overrides.appModule || { getPath: () => 'C:\\Users\\Admin\\Downloads' }
      }
    }

    if (specifier === 'node:fs' || specifier === 'fs') {
      return overrides.fsModule || require(specifier)
    }

    if (specifier === 'node:fs/promises' || specifier === 'fs/promises') {
      return overrides.fsPromises || require(specifier)
    }

    if (specifier === 'node:path' || specifier === 'path') {
      return overrides.pathModule || require(specifier)
    }

    if (specifier === '../utils/logger') {
      return { logger: overrides.logger || { info() {}, warn() {}, error() {}, debug() {} } }
    }

    if (specifier === './StoreService') {
      return {
        storeService: overrides.storeService || {
          get: () => undefined,
          set() {}
        }
      }
    }

    if (specifier === '../../shared/downloadOrganizer') {
      return require(path.join(__dirname, '../../shared/downloadOrganizer.ts'))
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

test('preview keeps top-level directories as single entries instead of splitting their contents', async () => {
  const storeState = {
    downloadOrganizer: {
      config: {
        enabled: false,
        watchPath: 'C:\\Users\\Admin\\Downloads',
        destinationRoot: 'C:\\Users\\Admin\\Downloads\\整理归档',
        conflictPolicy: 'rename',
        stableWindowMs: 10,
        ignoredExtensions: ['.crdownload'],
        rules: [
          {
            id: 'installers',
            name: '安装包',
            enabled: true,
            conditions: { categories: ['installer'] },
            action: { targetPathTemplate: '安装包/{yyyy-mm}' }
          }
        ]
      },
      lastPreviewAt: null,
      lastPreviewItems: [],
      activity: []
    }
  }

  const stats = {
    'C:\\Users\\Admin\\Downloads\\setup.exe': {
      isFile: () => true,
      isDirectory: () => false,
      size: 50,
      mtime: new Date('2026-04-21T10:00:00.000Z')
    },
    'C:\\Users\\Admin\\Downloads\\nested': {
      isFile: () => false,
      isDirectory: () => true,
      size: 4096,
      mtime: new Date('2026-04-21T10:00:00.000Z')
    },
    'C:\\Users\\Admin\\Downloads\\整理归档': {
      isFile: () => false,
      isDirectory: () => true,
      size: 4096,
      mtime: new Date('2026-04-21T10:00:00.000Z')
    }
  }

  const { DownloadOrganizerService } = loadDownloadOrganizerServiceModule({
    fsPromises: {
      readdir: async () => [createDirent('setup.exe'), createDirent('nested', 'directory'), createDirent('整理归档', 'directory')],
      stat: async (targetPath) => stats[targetPath],
      mkdir: async () => undefined,
      rename: async () => undefined,
      copyFile: async () => undefined,
      unlink: async () => undefined,
      access: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) }
    }
  })

  const service = new DownloadOrganizerService({
    storeService: {
      get: (key) => storeState[key],
      set: (key, value) => { storeState[key] = value }
    },
    now: () => new Date('2026-04-21T12:00:00.000Z').getTime(),
    createId: (() => {
      let index = 0
      return () => `id-${++index}`
    })()
  })

  await service.initialize()
  const result = await service.preview()

  assert.equal(result.success, true)
  assert.equal(result.data.lastPreviewItems.length, 2)
  assert.equal(result.data.lastPreviewItems[0].matchedRuleId, 'installers')
  assert.equal(result.data.lastPreviewItems[0].targetPath, 'C:\\Users\\Admin\\Downloads\\整理归档\\安装包\\2026-04\\setup.exe')
  assert.equal(result.data.lastPreviewItems[1].fileName, 'nested')
  assert.equal(result.data.lastPreviewItems[1].matchedRuleId, 'others')
  assert.equal(result.data.lastPreviewItems[1].targetPath, 'C:\\Users\\Admin\\Downloads\\整理归档\\其他\\2026-04\\nested')
})

test('preview ignores temporary download extensions and backfilled defaults catch the remaining files', async () => {
  const storeState = {
    downloadOrganizer: {
      config: {
        enabled: false,
        watchPath: 'C:\\Users\\Admin\\Downloads',
        destinationRoot: 'D:\\Sorted',
        conflictPolicy: 'rename',
        stableWindowMs: 10,
        ignoredExtensions: ['.crdownload', '.tmp'],
        rules: []
      },
      lastPreviewAt: null,
      lastPreviewItems: [],
      activity: []
    }
  }

  const stats = {
    'C:\\Users\\Admin\\Downloads\\video.mp4': {
      isFile: () => true,
      isDirectory: () => false,
      size: 120,
      mtime: new Date('2026-04-21T10:00:00.000Z')
    }
  }

  const { DownloadOrganizerService } = loadDownloadOrganizerServiceModule({
    fsPromises: {
      readdir: async () => [createDirent('video.mp4'), createDirent('movie.crdownload')],
      stat: async (targetPath) => stats[targetPath],
      mkdir: async () => undefined,
      rename: async () => undefined,
      copyFile: async () => undefined,
      unlink: async () => undefined,
      access: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) }
    }
  })

  const service = new DownloadOrganizerService({
    storeService: {
      get: (key) => storeState[key],
      set: (key, value) => { storeState[key] = value }
    }
  })

  await service.initialize()
  const result = await service.preview()

  assert.equal(result.success, true)
  assert.equal(result.data.lastPreviewItems.length, 1)
  assert.equal(result.data.lastPreviewItems[0].status, 'ready')
  assert.equal(result.data.lastPreviewItems[0].matchedRuleId, 'videos')
})

test('initialize backfills missing built-in default rules for legacy configs', async () => {
  const storeState = {
    downloadOrganizer: {
      config: {
        enabled: false,
        watchPath: 'C:\\Users\\Admin\\Downloads',
        destinationRoot: 'D:\\Sorted',
        conflictPolicy: 'rename',
        stableWindowMs: 10,
        ignoredExtensions: ['.crdownload'],
        rules: [
          {
            id: 'installers',
            name: '安装包',
            enabled: true,
            conditions: { categories: ['installer'] },
            action: { targetPathTemplate: '安装包/{yyyy-mm}' }
          }
        ]
      },
      lastPreviewAt: null,
      lastPreviewItems: [],
      activity: []
    }
  }

  const { DownloadOrganizerService } = loadDownloadOrganizerServiceModule({
    fsPromises: {
      readdir: async () => [],
      stat: async () => ({ isFile: () => true, size: 1, mtime: new Date() }),
      mkdir: async () => undefined,
      rename: async () => undefined,
      copyFile: async () => undefined,
      unlink: async () => undefined,
      access: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) }
    }
  })

  const service = new DownloadOrganizerService({
    storeService: {
      get: (key) => storeState[key],
      set: (key, value) => { storeState[key] = value }
    }
  })

  await service.initialize()
  const state = service.getState().data

  assert.equal(state.config.rules.some((rule) => rule.conditions.categories?.includes('audio')), true)
  assert.equal(state.config.rules.some((rule) => rule.conditions.categories?.includes('other')), true)
})

test('applyPreview moves ready items into the resolved target path', async () => {
  const renameCalls = []
  const storeState = {
    downloadOrganizer: {
      config: {
        enabled: false,
        watchPath: 'C:\\Users\\Admin\\Downloads',
        destinationRoot: 'D:\\Sorted',
        conflictPolicy: 'rename',
        stableWindowMs: 10,
        ignoredExtensions: ['.crdownload'],
        rules: []
      },
      lastPreviewAt: '2026-04-21T12:00:00.000Z',
      lastPreviewItems: [
        {
          id: 'item-1',
          sourcePath: 'C:\\Users\\Admin\\Downloads\\setup.exe',
          fileName: 'setup.exe',
          extension: '.exe',
          sizeBytes: 50,
          modifiedAt: '2026-04-21T10:00:00.000Z',
          category: 'installer',
          matchedRuleId: 'installers',
          matchedRuleName: '安装包',
          targetRelativePath: '安装包/2026-04/setup.exe',
          targetPath: 'D:\\Sorted\\安装包\\2026-04\\setup.exe',
          status: 'ready',
          reason: null
        }
      ],
      activity: []
    }
  }

  const { DownloadOrganizerService } = loadDownloadOrganizerServiceModule({
    fsPromises: {
      readdir: async () => [],
      stat: async () => ({ isFile: () => true, size: 50, mtime: new Date() }),
      mkdir: async () => undefined,
      rename: async (from, to) => {
        renameCalls.push([from, to])
      },
      copyFile: async () => undefined,
      unlink: async () => undefined,
      access: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) }
    }
  })

  const service = new DownloadOrganizerService({
    storeService: {
      get: (key) => storeState[key],
      set: (key, value) => { storeState[key] = value }
    }
  })

  await service.initialize()
  const result = await service.applyPreview()

  assert.equal(result.success, true)
  assert.deepEqual(renameCalls, [['C:\\Users\\Admin\\Downloads\\setup.exe', 'D:\\Sorted\\安装包\\2026-04\\setup.exe']])
  assert.equal(result.data.lastPreviewItems[0].status, 'moved')
})

test('applyPreview moves matched directories as a whole instead of splitting files inside', async () => {
  const renameCalls = []
  const storeState = {
    downloadOrganizer: {
      config: {
        enabled: false,
        watchPath: 'C:\\Users\\Admin\\Downloads',
        destinationRoot: 'D:\\Sorted',
        conflictPolicy: 'rename',
        stableWindowMs: 10,
        ignoredExtensions: ['.crdownload'],
        rules: []
      },
      lastPreviewAt: '2026-04-21T12:00:00.000Z',
      lastPreviewItems: [
        {
          id: 'item-1',
          sourcePath: 'C:\\Users\\Admin\\Downloads\\素材包',
          fileName: '素材包',
          extension: '',
          sizeBytes: 4096,
          modifiedAt: '2026-04-21T10:00:00.000Z',
          category: 'other',
          matchedRuleId: 'others',
          matchedRuleName: '其他',
          targetRelativePath: '其他/2026-04/素材包',
          targetPath: 'D:\\Sorted\\其他\\2026-04\\素材包',
          status: 'ready',
          reason: null
        }
      ],
      activity: []
    }
  }

  const { DownloadOrganizerService } = loadDownloadOrganizerServiceModule({
    fsPromises: {
      readdir: async () => [],
      stat: async () => ({
        isFile: () => false,
        isDirectory: () => true,
        size: 4096,
        mtime: new Date()
      }),
      mkdir: async () => undefined,
      rename: async (from, to) => {
        renameCalls.push([from, to])
      },
      copyFile: async () => undefined,
      unlink: async () => undefined,
      access: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) }
    }
  })

  const service = new DownloadOrganizerService({
    storeService: {
      get: (key) => storeState[key],
      set: (key, value) => { storeState[key] = value }
    }
  })

  await service.initialize()
  const result = await service.applyPreview()

  assert.equal(result.success, true)
  assert.deepEqual(renameCalls, [['C:\\Users\\Admin\\Downloads\\素材包', 'D:\\Sorted\\其他\\2026-04\\素材包']])
  assert.equal(result.data.lastPreviewItems[0].status, 'moved')
})

test('updating enabled watcher configuration restarts the watcher on the new path', async () => {
  const closedPaths = []
  const watchedPaths = []
  const storeState = {
    downloadOrganizer: {
      config: {
        enabled: true,
        watchPath: 'C:\\Users\\Admin\\Downloads',
        destinationRoot: 'D:\\Sorted',
        conflictPolicy: 'rename',
        stableWindowMs: 10,
        ignoredExtensions: ['.crdownload'],
        rules: []
      },
      lastPreviewAt: null,
      lastPreviewItems: [],
      activity: []
    }
  }

  const { DownloadOrganizerService } = loadDownloadOrganizerServiceModule({
    fsModule: {
      watch(targetPath, _options, _listener) {
        watchedPaths.push(targetPath)
        return {
          close() {
            closedPaths.push(targetPath)
          }
        }
      }
    },
    fsPromises: {
      readdir: async () => [],
      stat: async () => ({ isFile: () => true, size: 1, mtime: new Date() }),
      mkdir: async () => undefined,
      rename: async () => undefined,
      copyFile: async () => undefined,
      unlink: async () => undefined,
      access: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) }
    }
  })

  const service = new DownloadOrganizerService({
    storeService: {
      get: (key) => storeState[key],
      set: (key, value) => { storeState[key] = value }
    }
  })

  await service.initialize()
  await service.updateConfig({
    watchPath: 'D:\\Downloads'
  })

  assert.deepEqual(watchedPaths, ['C:\\Users\\Admin\\Downloads', 'D:\\Downloads'])
  assert.deepEqual(closedPaths, ['C:\\Users\\Admin\\Downloads'])
})

test('applyPreview processes multiple ready items concurrently instead of one-by-one', async () => {
  const renameCalls = []
  let inFlight = 0
  let maxInFlight = 0
  const pendingResolvers = []

  const storeState = {
    downloadOrganizer: {
      config: {
        enabled: false,
        watchPath: 'C:\\Users\\Admin\\Downloads',
        destinationRoot: 'D:\\Sorted',
        conflictPolicy: 'rename',
        stableWindowMs: 10,
        ignoredExtensions: ['.crdownload'],
        rules: []
      },
      lastPreviewAt: '2026-04-21T12:00:00.000Z',
      lastPreviewItems: [
        {
          id: 'item-1',
          sourcePath: 'C:\\Users\\Admin\\Downloads\\a.wav',
          fileName: 'a.wav',
          extension: '.wav',
          sizeBytes: 10,
          modifiedAt: '2026-04-21T10:00:00.000Z',
          category: 'audio',
          matchedRuleId: 'audio',
          matchedRuleName: '音频',
          targetRelativePath: '音频/2026-04/a.wav',
          targetPath: 'D:\\Sorted\\音频\\2026-04\\a.wav',
          status: 'ready',
          reason: null
        },
        {
          id: 'item-2',
          sourcePath: 'C:\\Users\\Admin\\Downloads\\b.wav',
          fileName: 'b.wav',
          extension: '.wav',
          sizeBytes: 11,
          modifiedAt: '2026-04-21T10:00:00.000Z',
          category: 'audio',
          matchedRuleId: 'audio',
          matchedRuleName: '音频',
          targetRelativePath: '音频/2026-04/b.wav',
          targetPath: 'D:\\Sorted\\音频\\2026-04\\b.wav',
          status: 'ready',
          reason: null
        }
      ],
      activity: []
    }
  }

  const { DownloadOrganizerService } = loadDownloadOrganizerServiceModule({
    fsPromises: {
      readdir: async () => [],
      stat: async () => ({ isFile: () => true, size: 50, mtime: new Date() }),
      mkdir: async () => undefined,
      rename: async (from, to) => {
        renameCalls.push([from, to])
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => pendingResolvers.push(() => {
          inFlight -= 1
          resolve()
        }))
      },
      copyFile: async () => undefined,
      unlink: async () => undefined,
      access: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) }
    }
  })

  const service = new DownloadOrganizerService({
    storeService: {
      get: (key) => storeState[key],
      set: (key, value) => { storeState[key] = value }
    }
  })

  await service.initialize()
  const applyPromise = service.applyPreview()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(renameCalls.length, 2)
  assert.equal(maxInFlight > 1, true)

  pendingResolvers.splice(0).forEach((resolve) => resolve())
  const result = await applyPromise
  assert.equal(result.success, true)
})
