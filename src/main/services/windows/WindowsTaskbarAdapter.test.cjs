const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadWindowsTaskbarAdapterModule(overrides = {}) {
  const filePath = path.join(__dirname, 'WindowsTaskbarAdapter.ts')
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
  const execPowerShellEncoded = overrides.execPowerShellEncoded || (async () => '')

  const customRequire = (specifier) => {
    if (specifier === '../../utils/processUtils') {
      return { execPowerShellEncoded }
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

test('applyAppearance emits a PowerShell script that pins composition calls and the requested blur tint', async () => {
  const calls = []
  const { WindowsTaskbarAdapter } = loadWindowsTaskbarAdapterModule({
    execPowerShellEncoded: async (script) => {
      calls.push(script)
      return 'apply-success'
    }
  })

  const adapter = new WindowsTaskbarAdapter()
  const result = await adapter.applyAppearance({
    preset: 'blur',
    intensity: 72,
    tintHex: '#11223344'
  })

  assert.equal(result.success, true)
  assert.equal(calls.length, 1)
  assert.match(calls[0], /Add-Type/)
  assert.match(calls[0], /SetWindowCompositionAttribute/)
  assert.match(calls[0], /apply-success/)
  assert.match(calls[0], /11223344/)
  assert.match(calls[0], /blur/i)
})

test('restoreDefault emits the reset script through execPowerShellEncoded and returns success when the marker is present', async () => {
  const calls = []
  const { WindowsTaskbarAdapter } = loadWindowsTaskbarAdapterModule({
    execPowerShellEncoded: async (script) => {
      calls.push(script)
      return 'restore-success'
    }
  })

  const adapter = new WindowsTaskbarAdapter()
  const result = await adapter.restoreDefault()

  assert.equal(result.success, true)
  assert.equal(calls.length, 1)
  assert.match(calls[0], /Add-Type/)
  assert.match(calls[0], /SetWindowCompositionAttribute/)
  assert.match(calls[0], /restore-success/)
})

test('applyAppearance returns a failure response when execPowerShellEncoded does not confirm the composition call', async () => {
  const { WindowsTaskbarAdapter } = loadWindowsTaskbarAdapterModule({
    execPowerShellEncoded: async () => 'SetWindowCompositionAttribute'
  })

  const adapter = new WindowsTaskbarAdapter()
  const result = await adapter.applyAppearance({
    preset: 'transparent',
    intensity: 40,
    tintHex: '#00000000'
  })

  assert.equal(result.success, false)
  assert.match(result.error, /任务栏样式应用失败/)
})

test('restoreDefault returns a failure response when execPowerShellEncoded throws', async () => {
  const { WindowsTaskbarAdapter } = loadWindowsTaskbarAdapterModule({
    execPowerShellEncoded: async () => {
      throw new Error('powershell unavailable')
    }
  })

  const adapter = new WindowsTaskbarAdapter()
  const result = await adapter.restoreDefault()

  assert.equal(result.success, false)
  assert.match(result.error, /任务栏样式恢复失败/)
})

test('restoreDefault returns a failure response when execPowerShellEncoded does not confirm restore success', async () => {
  const { WindowsTaskbarAdapter } = loadWindowsTaskbarAdapterModule({
    execPowerShellEncoded: async () => 'restore-default'
  })

  const adapter = new WindowsTaskbarAdapter()
  const result = await adapter.restoreDefault()

  assert.equal(result.success, false)
  assert.match(result.error, /任务栏样式恢复失败/)
})
