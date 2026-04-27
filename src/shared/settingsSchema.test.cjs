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

function loadSettingsSchemaModule() {
  const filePath = path.join(__dirname, 'settingsSchema.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: filePath
  }).outputText

  const taskbarAppearanceModule = loadTaskbarAppearanceModule()
  const module = { exports: {} }
  const customRequire = (specifier) => {
    if (specifier === './taskbarAppearance') {
      return taskbarAppearanceModule
    }
    return require(specifier)
  }

  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: customRequire,
    __dirname: path.dirname(filePath),
    __filename: filePath,
    console,
    process,
    Buffer
  }, { filename: filePath })

  return module.exports
}

test('migrateSettings stamps the current schema version and default taskbar settings', () => {
  const { migrateSettings, SETTINGS_SCHEMA_VERSION } = loadSettingsSchemaModule()

  const next = migrateSettings({
    recorderHotkey: 'Alt+Shift+R',
    screenshotHotkey: 'Alt+Shift+S',
    floatBallHotkey: 'Alt+Shift+F',
    clipboardHotkey: 'Alt+Shift+C',
    screenshotSavePath: '',
    autoSaveScreenshot: false,
    autoCheckForUpdates: true,
    minimizeToTray: true,
    translateApiUrl: 'https://api.openai.com/v1',
    translateApiKey: '',
    translateModel: 'gpt-4o'
  })

  assert.equal(next.schemaVersion, SETTINGS_SCHEMA_VERSION)
  assert.equal(next.taskbarAppearanceEnabled, false)
  assert.equal(next.taskbarAppearancePreset, 'blur')
  assert.equal(next.taskbarAppearanceIntensity, 60)
  assert.equal(next.taskbarAppearanceTint, '#FFFFFF33')
})

test('migrateSettings preserves persisted taskbar appearance overrides', () => {
  const { migrateSettings } = loadSettingsSchemaModule()

  const next = migrateSettings({
    schemaVersion: 999,
    recorderHotkey: 'Alt+Shift+R',
    screenshotHotkey: 'Alt+Shift+S',
    floatBallHotkey: 'Alt+Shift+F',
    clipboardHotkey: 'Alt+Shift+C',
    screenshotSavePath: '',
    autoSaveScreenshot: false,
    autoCheckForUpdates: true,
    minimizeToTray: true,
    translateApiUrl: 'https://example.com/v1',
    translateApiKey: 'k',
    translateModel: 'x',
    taskbarAppearanceEnabled: true,
    taskbarAppearancePreset: 'acrylic',
    taskbarAppearanceIntensity: 25,
    taskbarAppearanceTint: '#000000'
  })

  assert.equal(next.schemaVersion, 1)
  assert.equal(next.taskbarAppearanceEnabled, true)
  assert.equal(next.taskbarAppearancePreset, 'acrylic')
  assert.equal(next.taskbarAppearanceIntensity, 25)
  assert.equal(next.taskbarAppearanceTint, '#000000')
})

test('migrateSettings adds desktop calendar widget defaults for older settings files', () => {
  const { migrateSettings } = loadSettingsSchemaModule()

  const migrated = migrateSettings({
    schemaVersion: 1,
    recorderHotkey: 'Alt+Shift+R',
    screenshotHotkey: 'Alt+Shift+S',
    floatBallHotkey: 'Alt+Shift+F',
    clipboardHotkey: 'Alt+Shift+C',
    screenshotSavePath: '',
    autoSaveScreenshot: false,
    autoCheckForUpdates: true,
    minimizeToTray: true,
    translateApiUrl: 'https://api.openai.com/v1',
    translateApiKey: '',
    translateModel: 'gpt-4o',
    taskbarAppearanceEnabled: false,
    taskbarAppearancePreset: 'default',
    taskbarAppearanceIntensity: 70,
    taskbarAppearanceTint: '#00000000'
  })

  assert.equal(migrated.calendarWidgetEnabled, false)
  assert.equal(migrated.calendarWidgetBounds, null)
  assert.equal(migrated.calendarWidgetAlwaysOnTop, false)
  assert.equal(migrated.calendarWidgetBackgroundMode, 'solid')
  assert.equal(migrated.calendarReminderLeadMinutes, 10)
})

test('migrateSettings preserves desktop calendar widget appearance choices', () => {
  const { migrateSettings } = loadSettingsSchemaModule()

  const migrated = migrateSettings({
    schemaVersion: 1,
    recorderHotkey: 'Alt+Shift+R',
    screenshotHotkey: 'Alt+Shift+S',
    floatBallHotkey: 'Alt+Shift+F',
    clipboardHotkey: 'Alt+Shift+C',
    screenshotSavePath: '',
    autoSaveScreenshot: false,
    autoCheckForUpdates: true,
    minimizeToTray: true,
    translateApiUrl: 'https://api.openai.com/v1',
    translateApiKey: '',
    translateModel: 'gpt-4o',
    taskbarAppearanceEnabled: false,
    taskbarAppearancePreset: 'default',
    taskbarAppearanceIntensity: 70,
    taskbarAppearanceTint: '#00000000',
    calendarWidgetEnabled: true,
    calendarWidgetBounds: null,
    calendarWidgetAlwaysOnTop: true,
    calendarWidgetBackgroundMode: 'glass',
    calendarReminderLeadMinutes: 5
  })

  assert.equal(migrated.calendarWidgetAlwaysOnTop, true)
  assert.equal(migrated.calendarWidgetBackgroundMode, 'glass')
})
