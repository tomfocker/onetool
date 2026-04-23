const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadTaskbarAppearanceModule() {
  const filePath = path.join(__dirname, 'taskbarAppearance.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    },
    fileName: filePath
  }).outputText

  const module = { exports: {} }
  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require,
    __dirname: path.dirname(filePath),
    __filename: filePath,
    console,
    process
  }, { filename: filePath })

  return module.exports
}

function transpileModule(filePath, customRequire) {
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
  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: customRequire ?? require,
    __dirname: path.dirname(filePath),
    __filename: filePath,
    console,
    process,
    Buffer
  }, { filename: filePath })

  return module.exports
}

function loadSettingsSchemaModule() {
  const taskbarAppearanceModule = loadTaskbarAppearanceModule()
  return transpileModule(path.join(__dirname, 'settingsSchema.ts'), (specifier) => {
    if (specifier === './taskbarAppearance') {
      return taskbarAppearanceModule
    }
    return require(specifier)
  })
}

function loadStoreSchemaModule() {
  const taskbarAppearanceModule = loadTaskbarAppearanceModule()
  const settingsSchemaModule = loadSettingsSchemaModule()
  return transpileModule(path.join(__dirname, 'storeSchema.ts'), (specifier) => {
    if (specifier === './taskbarAppearance') {
      return taskbarAppearanceModule
    }
    if (specifier === './settingsSchema') {
      return settingsSchemaModule
    }
    if (specifier === './downloadOrganizer') {
      return require(path.join(__dirname, 'downloadOrganizer.ts'))
    }
    if (specifier === './devEnvironment') {
      return require(path.join(__dirname, 'devEnvironment.ts'))
    }
    return require(specifier)
  })
}

test('migrateGlobalStore stamps schemaVersion and backfills settings schemaVersion', () => {
  const { migrateGlobalStore, GLOBAL_STORE_SCHEMA_VERSION } = loadStoreSchemaModule()
  const next = migrateGlobalStore(
    {
      version: '0.0.9',
      settings: {
        screenshotHotkey: 'Ctrl+Shift+S'
      }
    },
    '1.0.0'
  )

  assert.equal(next.schemaVersion, GLOBAL_STORE_SCHEMA_VERSION)
  assert.equal(next.version, '0.0.9')
  assert.equal(next.settings.schemaVersion, 1)
  assert.equal(next.settings.screenshotHotkey, 'Ctrl+Shift+S')
  assert.equal(next.settings.taskbarAppearancePreset, 'blur')
})

test('migrateGlobalStore normalizes pinned ids and windows favorites', () => {
  const { migrateGlobalStore } = loadStoreSchemaModule()
  const next = migrateGlobalStore(
    {
      pinnedToolIds: ['clipboard', 'clipboard', 42],
      windowsManagerFavorites: ['powershell']
    },
    '1.0.0'
  )

  assert.deepEqual(Array.from(next.pinnedToolIds), ['clipboard'])
  assert.deepEqual(Array.from(next.windowsManagerFavorites), ['powershell'])
})
