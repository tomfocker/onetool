const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadStoreServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'StoreService.ts')
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
  const storedJson = overrides.storedJson || JSON.stringify({
    settings: {
      recorderHotkey: 'Ctrl+Alt+R',
      screenshotHotkey: 'Ctrl+Alt+S',
      screenshotSavePath: 'D:/shots',
      autoSaveScreenshot: true,
      floatBallHotkey: 'Ctrl+Alt+F',
      clipboardHotkey: 'Ctrl+Alt+C',
      minimizeToTray: false,
      translateApiUrl: 'https://example.com',
      translateApiKey: 'key',
      translateModel: 'model'
    }
  })

  const electronModule = overrides.electronModule || {
    app: {
      getPath: () => 'C:/tmp',
      getVersion: () => '1.0.0'
    }
  }
  const logger = overrides.logger || {
    info() {},
    debug() {},
    error() {}
  }
  const fsModule = overrides.fsModule || {
    existsSync: () => true,
    readFileSync: () => storedJson,
    promises: {
      writeFile: async () => {}
    }
  }

  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return electronModule
    }

    if (specifier === 'fs') {
      return fsModule
    }

    if (specifier === 'path') {
      return path
    }

    if (specifier === 'events') {
      return require('events')
    }

    if (specifier === '../../shared/types') {
      return {}
    }

    if (specifier === '../../shared/devEnvironment') {
      return require(path.join(__dirname, '../../shared/devEnvironment.ts'))
    }

    if (specifier === '../../shared/downloadOrganizer') {
      return require(path.join(__dirname, '../../shared/downloadOrganizer.ts'))
    }

    if (specifier === '../utils/logger') {
      return { logger }
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
    clearTimeout
  }, { filename: filePath })

  return module.exports
}

test('StoreService backfills new nested settings defaults during schema migration', () => {
  const { StoreService } = loadStoreServiceModule()
  const service = new StoreService()

  assert.equal(service.get('settings').autoCheckForUpdates, true)
  assert.equal(service.get('settings').screenshotSavePath, 'D:/shots')
  assert.equal(service.get('settings').autoSaveScreenshot, true)
})
