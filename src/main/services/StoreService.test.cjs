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
  const settingsSchemaPath = path.join(__dirname, '../../shared/settingsSchema.ts')
  const settingsSchemaSource = fs.readFileSync(settingsSchemaPath, 'utf8')
  const settingsSchemaTranspiled = ts.transpileModule(settingsSchemaSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: settingsSchemaPath
  }).outputText
  const settingsSchemaModule = { exports: {} }
  const taskbarAppearanceModule = overrides.taskbarAppearanceModule || require(path.join(__dirname, '../../shared/taskbarAppearance.ts'))
  vm.runInNewContext(settingsSchemaTranspiled, {
    module: settingsSchemaModule,
    exports: settingsSchemaModule.exports,
    require: (specifier) => {
      if (specifier === './taskbarAppearance') {
        return taskbarAppearanceModule
      }
      return require(specifier)
    },
    __dirname: path.dirname(settingsSchemaPath),
    __filename: settingsSchemaPath,
    console,
    process,
    Buffer
  }, { filename: settingsSchemaPath })

  const storeSchemaPath = path.join(__dirname, '../../shared/storeSchema.ts')
  const storeSchemaSource = fs.readFileSync(storeSchemaPath, 'utf8')
  const storeSchemaTranspiled = ts.transpileModule(storeSchemaSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: storeSchemaPath
  }).outputText
  const storeSchemaModule = { exports: {} }
  vm.runInNewContext(storeSchemaTranspiled, {
    module: storeSchemaModule,
    exports: storeSchemaModule.exports,
    require: (specifier) => {
      if (specifier === './settingsSchema') {
        return settingsSchemaModule.exports
      }
      if (specifier === './downloadOrganizer') {
        return require(path.join(__dirname, '../../shared/downloadOrganizer.ts'))
      }
      if (specifier === './devEnvironment') {
        return require(path.join(__dirname, '../../shared/devEnvironment.ts'))
      }
      return require(specifier)
    },
    __dirname: path.dirname(storeSchemaPath),
    __filename: storeSchemaPath,
    console,
    process,
    Buffer
  }, { filename: storeSchemaPath })

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

    if (specifier === '../../shared/taskbarAppearance') {
      return taskbarAppearanceModule
    }

    if (specifier === '../../shared/settingsSchema') {
      return settingsSchemaModule.exports
    }

    if (specifier === '../../shared/storeSchema') {
      return storeSchemaModule.exports
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
  assert.equal(service.get('settings').taskbarAppearanceEnabled, false)
  assert.equal(service.get('settings').taskbarAppearancePreset, 'blur')
  assert.equal(service.get('settings').taskbarAppearanceIntensity, 60)
  assert.equal(service.get('settings').taskbarAppearanceTint, '#FFFFFF33')
})

test('StoreService reuses shared taskbar appearance defaults instead of duplicating them locally', () => {
  const { StoreService } = loadStoreServiceModule({
    taskbarAppearanceModule: {
      createDefaultTaskbarAppearanceSettings: () => ({
        enabled: true,
        preset: 'acrylic',
        intensity: 91,
        tintHex: '#12345678'
      })
    }
  })
  const service = new StoreService()

  assert.equal(service.get('settings').taskbarAppearanceEnabled, true)
  assert.equal(service.get('settings').taskbarAppearancePreset, 'acrylic')
  assert.equal(service.get('settings').taskbarAppearanceIntensity, 91)
  assert.equal(service.get('settings').taskbarAppearanceTint, '#12345678')
})

test('StoreService stamps migrated stores with the current schema version', () => {
  const { StoreService } = loadStoreServiceModule({
    storedJson: JSON.stringify({
      version: '0.0.9',
      settings: {
        screenshotHotkey: 'Ctrl+Shift+S'
      }
    })
  })
  const service = new StoreService()

  assert.equal(service.getAll().schemaVersion, 1)
  assert.equal(service.getAll().version, '0.0.9')
  assert.equal(service.get('settings').screenshotHotkey, 'Ctrl+Shift+S')
  assert.equal(service.get('settings').autoCheckForUpdates, true)
})

test('StoreService restores schema version when persisted metadata is missing', () => {
  const { StoreService } = loadStoreServiceModule({
    storedJson: JSON.stringify({
      pinnedToolIds: ['clipboard', 'clipboard', 42],
      windowsManagerFavorites: ['powershell']
    })
  })
  const service = new StoreService()

  assert.equal(service.getAll().schemaVersion, 1)
  assert.deepEqual(Array.from(service.get('pinnedToolIds')), ['clipboard'])
  assert.deepEqual(Array.from(service.get('windowsManagerFavorites')), ['powershell'])
})
