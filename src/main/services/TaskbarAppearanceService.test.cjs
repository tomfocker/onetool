const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadTaskbarAppearanceSharedModule() {
  const filePath = path.join(__dirname, '..', '..', 'shared', 'taskbarAppearance.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    },
    fileName: filePath
  }).outputText

  const module = { exports: {} }
  vm.runInNewContext(
    transpiled,
    {
      module,
      exports: module.exports,
      require,
      __dirname: path.dirname(filePath),
      __filename: filePath,
      console,
      process
    },
    { filename: filePath }
  )

  return module.exports
}

function loadTaskbarAppearanceServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'TaskbarAppearanceService.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: filePath
  }).outputText

  const sharedModule = loadTaskbarAppearanceSharedModule()
  const module = { exports: {} }
  const adapter = overrides.adapter || {
    applyAppearance: async () => ({ success: true }),
    restoreDefault: async () => ({ success: true })
  }
  const settingsService = overrides.settingsService || {
    getSettings: () => ({
      taskbarAppearanceEnabled: false,
      taskbarAppearancePreset: 'blur',
      taskbarAppearanceIntensity: 60,
      taskbarAppearanceTint: '#FFFFFF33'
    }),
    updateSettings: async () => ({ success: true })
  }
  const customRequire = (specifier) => {
    if (specifier === './SettingsService') {
      return { settingsService }
    }

    if (specifier === './windows/WindowsTaskbarAdapter') {
      return {
        WindowsTaskbarAdapter: class WindowsTaskbarAdapter {
          async applyAppearance(input) {
            return adapter.applyAppearance(input)
          }

          async restoreDefault() {
            return adapter.restoreDefault()
          }
        }
      }
    }

    if (specifier === '../../shared/taskbarAppearance') {
      return sharedModule
    }

    if (specifier === 'node:os' || specifier === 'os') {
      return {
        release: () => overrides.release || '10.0.22631'
      }
    }

    return require(specifier)
  }

  vm.runInNewContext(
    transpiled,
    {
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
    },
    { filename: filePath }
  )

  return module.exports
}

test('getStatus reports support details alongside persisted taskbar settings', () => {
  const { TaskbarAppearanceService } = loadTaskbarAppearanceServiceModule({
    settingsService: {
      getSettings: () => ({
        taskbarAppearanceEnabled: true,
        taskbarAppearancePreset: 'transparent',
        taskbarAppearanceIntensity: 72,
        taskbarAppearanceTint: '#22446688'
      }),
      updateSettings: async () => ({ success: true })
    }
  })

  const service = new TaskbarAppearanceService(undefined, undefined, {
    platform: 'win32',
    release: '10.0.22000'
  })
  const result = service.getStatus()

  assert.equal(result.success, true)
  assert.equal(result.data.settings.enabled, true)
  assert.equal(result.data.settings.preset, 'transparent')
  assert.equal(result.data.settings.intensity, 72)
  assert.equal(result.data.settings.tintHex, '#22446688')
  assert.equal(result.data.support.supported, true)
  assert.equal(result.data.support.host.build, 22000)
  assert.equal(result.data.support.presets.transparent.available, true)
  assert.equal(result.data.support.presets.acrylic.available, false)
})

test('applyPreset blocks unsupported presets before touching the adapter or persisted settings', async () => {
  const events = []
  const { TaskbarAppearanceService } = loadTaskbarAppearanceServiceModule({
    adapter: {
      applyAppearance: async () => {
        events.push('adapter')
        return { success: true }
      },
      restoreDefault: async () => ({ success: true })
    },
    settingsService: {
      getSettings: () => ({
        taskbarAppearanceEnabled: false,
        taskbarAppearancePreset: 'blur',
        taskbarAppearanceIntensity: 60,
        taskbarAppearanceTint: '#FFFFFF33'
      }),
      updateSettings: async () => {
        events.push('settings')
        return { success: true }
      }
    }
  })

  const service = new TaskbarAppearanceService(undefined, undefined, {
    platform: 'win32',
    release: '10.0.22000'
  })
  const result = await service.applyPreset({
    preset: 'acrylic',
    intensity: 80,
    tintHex: '#11223344'
  })

  assert.equal(result.success, false)
  assert.match(result.error, /需要较新的 Windows 11 版本/)
  assert.deepEqual(events, [])
})

test('applyPreset persists settings only after the adapter succeeds', async () => {
  const saved = []
  const events = []
  const { TaskbarAppearanceService } = loadTaskbarAppearanceServiceModule({
    adapter: {
      applyAppearance: async () => {
        events.push('adapter')
        return { success: true }
      },
      restoreDefault: async () => ({ success: true })
    },
    settingsService: {
      getSettings: () => ({
        taskbarAppearanceEnabled: false,
        taskbarAppearancePreset: 'blur',
        taskbarAppearanceIntensity: 60,
        taskbarAppearanceTint: '#FFFFFF33'
      }),
      updateSettings: async (updates) => {
        events.push('settings')
        saved.push(updates)
        return { success: true }
      }
    }
  })

  const service = new TaskbarAppearanceService(undefined, undefined, {
    platform: 'win32',
    release: '10.0.22631'
  })
  const result = await service.applyPreset({
    preset: 'blur',
    intensity: 70,
    tintHex: '#AABBCC44'
  })

  assert.equal(result.success, true)
  assert.deepEqual(events, ['adapter', 'settings'])
  assert.equal(saved.length, 1)
  assert.equal(saved[0].taskbarAppearanceEnabled, true)
  assert.equal(saved[0].taskbarAppearancePreset, 'blur')
  assert.equal(saved[0].taskbarAppearanceIntensity, 70)
  assert.equal(saved[0].taskbarAppearanceTint, '#AABBCC44')
})

test('applyPreset does not persist when the adapter fails', async () => {
  const saved = []
  const { TaskbarAppearanceService } = loadTaskbarAppearanceServiceModule({
    adapter: {
      applyAppearance: async () => ({ success: false, error: 'adapter failed' }),
      restoreDefault: async () => ({ success: true })
    },
    settingsService: {
      getSettings: () => ({
        taskbarAppearanceEnabled: false,
        taskbarAppearancePreset: 'blur',
        taskbarAppearanceIntensity: 60,
        taskbarAppearanceTint: '#FFFFFF33'
      }),
      updateSettings: async (updates) => {
        saved.push(updates)
        return { success: true }
      }
    }
  })

  const service = new TaskbarAppearanceService(undefined, undefined, {
    platform: 'win32',
    release: '10.0.22631'
  })
  const result = await service.applyPreset({
    preset: 'blur',
    intensity: 75,
    tintHex: '#33445566'
  })

  assert.equal(result.success, false)
  assert.match(result.error, /adapter failed/)
  assert.equal(saved.length, 0)
})

test('applyPreset with the default preset persists canonical default intensity and tint', async () => {
  const saved = []
  const events = []
  const { TaskbarAppearanceService } = loadTaskbarAppearanceServiceModule({
    adapter: {
      applyAppearance: async () => ({ success: true }),
      restoreDefault: async () => {
        events.push('adapter')
        return { success: true }
      }
    },
    settingsService: {
      getSettings: () => ({
        taskbarAppearanceEnabled: true,
        taskbarAppearancePreset: 'blur',
        taskbarAppearanceIntensity: 90,
        taskbarAppearanceTint: '#99887766'
      }),
      updateSettings: async (updates) => {
        events.push('settings')
        saved.push(updates)
        return { success: true }
      }
    }
  })

  const service = new TaskbarAppearanceService(undefined, undefined, {
    platform: 'win32',
    release: '10.0.22631'
  })
  const result = await service.applyPreset({
    preset: 'default',
    intensity: 5,
    tintHex: '#01020304'
  })

  assert.equal(result.success, true)
  assert.deepEqual(events, ['adapter', 'settings'])
  assert.equal(saved.length, 1)
  assert.equal(saved[0].taskbarAppearanceEnabled, false)
  assert.equal(saved[0].taskbarAppearancePreset, 'default')
  assert.equal(saved[0].taskbarAppearanceIntensity, 60)
  assert.equal(saved[0].taskbarAppearanceTint, '#FFFFFF33')
})

test('restoreDefault persists the disabled default preset only after the adapter succeeds', async () => {
  const saved = []
  const events = []
  const { TaskbarAppearanceService } = loadTaskbarAppearanceServiceModule({
    adapter: {
      applyAppearance: async () => ({ success: true }),
      restoreDefault: async () => {
        events.push('adapter')
        return { success: true }
      }
    },
    settingsService: {
      getSettings: () => ({
        taskbarAppearanceEnabled: true,
        taskbarAppearancePreset: 'acrylic',
        taskbarAppearanceIntensity: 88,
        taskbarAppearanceTint: '#ABCDEF99'
      }),
      updateSettings: async (updates) => {
        events.push('settings')
        saved.push(updates)
        return { success: true }
      }
    }
  })

  const service = new TaskbarAppearanceService(undefined, undefined, {
    platform: 'win32',
    release: '10.0.22631'
  })
  const result = await service.restoreDefault()

  assert.equal(result.success, true)
  assert.deepEqual(events, ['adapter', 'settings'])
  assert.equal(saved.length, 1)
  assert.equal(saved[0].taskbarAppearanceEnabled, false)
  assert.equal(saved[0].taskbarAppearancePreset, 'default')
  assert.equal(saved[0].taskbarAppearanceIntensity, 60)
  assert.equal(saved[0].taskbarAppearanceTint, '#FFFFFF33')
})
