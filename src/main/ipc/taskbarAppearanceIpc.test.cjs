const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadTaskbarAppearanceIpcModule(overrides = {}) {
  const filePath = path.join(__dirname, 'taskbarAppearanceIpc.ts')
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
  const handlers = {}

  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return overrides.electronModule || {
        ipcMain: {
          handle(channel, handler) {
            handlers[channel] = handler
          }
        }
      }
    }

    if (specifier === '../services/TaskbarAppearanceService') {
      return {
        taskbarAppearanceService: overrides.taskbarAppearanceService || {
          getStatus: () => ({ success: true, data: { settings: { enabled: false } } }),
          applyPreset: async () => ({ success: true }),
          restoreDefault: async () => ({ success: true }),
          restoreFromSettings: async () => ({ success: true })
        }
      }
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

  return { ...module.exports, handlers }
}

test('registerTaskbarAppearanceIpc wires the explicit handlers to the taskbar appearance service', async () => {
  const calls = []
  const service = {
    getStatus() {
      calls.push(['getStatus'])
      return { success: true, data: { settings: { enabled: true } } }
    },
    async applyPreset(input) {
      calls.push(['applyPreset', input])
      return { success: true, data: input }
    },
    async restoreDefault() {
      calls.push(['restoreDefault'])
      return { success: true }
    }
  }

  const { registerTaskbarAppearanceIpc, handlers } = loadTaskbarAppearanceIpcModule({
    taskbarAppearanceService: service
  })

  registerTaskbarAppearanceIpc()

  const statusResult = handlers['taskbar-appearance-get-status']()
  const presetResult = await handlers['taskbar-appearance-apply-preset']({}, {
    preset: 'blur',
    intensity: 60,
    tintHex: '#FFFFFF33'
  })
  const restoreResult = await handlers['taskbar-appearance-restore-default']()

  assert.deepEqual(statusResult, { success: true, data: { settings: { enabled: true } } })
  assert.deepEqual(presetResult, {
    success: true,
    data: {
      preset: 'blur',
      intensity: 60,
      tintHex: '#FFFFFF33'
    }
  })
  assert.deepEqual(restoreResult, { success: true })
  assert.deepEqual(calls, [
    ['getStatus'],
    ['applyPreset', {
      preset: 'blur',
      intensity: 60,
      tintHex: '#FFFFFF33'
    }],
    ['restoreDefault']
  ])
})

test('restoreTaskbarAppearanceOnStartup delegates to restoreFromSettings when the service supports it', async () => {
  const calls = []
  const service = {
    getStatus() {
      calls.push(['getStatus'])
      return { success: true, data: { settings: { enabled: true } } }
    },
    async applyPreset() {
      calls.push(['applyPreset'])
      return { success: true }
    },
    async restoreDefault() {
      calls.push(['restoreDefault'])
      return { success: true }
    },
    async restoreFromSettings() {
      calls.push(['restoreFromSettings'])
      return { success: true }
    }
  }

  const { restoreTaskbarAppearanceOnStartup } = loadTaskbarAppearanceIpcModule({
    taskbarAppearanceService: service
  })

  const result = await restoreTaskbarAppearanceOnStartup()

  assert.deepEqual(result, { success: true })
  assert.deepEqual(calls, [['restoreFromSettings']])
})

test('restoreTaskbarAppearanceOnStartup returns the restoreFromSettings result when startup recovery fails', async () => {
  const calls = []
  const service = {
    getStatus() {
      calls.push(['getStatus'])
      return { success: true, data: { settings: { enabled: true } } }
    },
    async applyPreset() {
      calls.push(['applyPreset'])
      return { success: true }
    },
    async restoreDefault() {
      calls.push(['restoreDefault'])
      return { success: true }
    },
    async restoreFromSettings() {
      calls.push(['restoreFromSettings'])
      return { success: false, error: 'startup failed' }
    }
  }

  const { restoreTaskbarAppearanceOnStartup } = loadTaskbarAppearanceIpcModule({
    taskbarAppearanceService: service
  })

  const result = await restoreTaskbarAppearanceOnStartup()

  assert.deepEqual(result, { success: false, error: 'startup failed' })
  assert.deepEqual(calls, [['restoreFromSettings']])
})

