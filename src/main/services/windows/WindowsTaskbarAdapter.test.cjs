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

test('applyAppearance emits the real composition interop script for blur with the resolved gradient color', async () => {
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
  assert.match(calls[0], /AccentPolicy/)
  assert.match(calls[0], /WindowCompositionAttributeData/)
  assert.match(calls[0], /SetWindowCompositionAttribute/)
  assert.match(calls[0], /Shell_TrayWnd/)
  assert.match(calls[0], /Shell_SecondaryTrayWnd/)
  assert.match(calls[0], /FindWindowEx/)
  assert.match(calls[0], /\$accent\.AccentState = 3/)
  assert.match(calls[0], /0x31332211/)
  assert.match(calls[0], /apply-success/)
})

test('applyAppearance maps transparent and acrylic presets to distinct accent states', async () => {
  const calls = []
  const { WindowsTaskbarAdapter } = loadWindowsTaskbarAdapterModule({
    execPowerShellEncoded: async (script) => {
      calls.push(script)
      return 'apply-success'
    }
  })

  const adapter = new WindowsTaskbarAdapter()

  const transparentResult = await adapter.applyAppearance({
    preset: 'transparent',
    intensity: 35,
    tintHex: '#01020304'
  })
  const acrylicResult = await adapter.applyAppearance({
    preset: 'acrylic',
    intensity: 80,
    tintHex: '#55667788'
  })

  assert.equal(transparentResult.success, true)
  assert.equal(acrylicResult.success, true)
  assert.equal(calls.length, 2)
  assert.match(calls[0], /\$accent\.AccentState = 2/)
  assert.match(calls[1], /\$accent\.AccentState = 4/)
})

test('applyAppearance uses intensity to adjust the final gradient alpha', async () => {
  const calls = []
  const { WindowsTaskbarAdapter } = loadWindowsTaskbarAdapterModule({
    execPowerShellEncoded: async (script) => {
      calls.push(script)
      return 'apply-success'
    }
  })

  const adapter = new WindowsTaskbarAdapter()

  await adapter.applyAppearance({
    preset: 'blur',
    intensity: 100,
    tintHex: '#11223380'
  })
  await adapter.applyAppearance({
    preset: 'blur',
    intensity: 50,
    tintHex: '#11223380'
  })

  assert.equal(calls.length, 2)
  assert.match(calls[0], /0x80332211/)
  assert.match(calls[1], /0x40332211/)
})

test('restoreDefault emits the real composition restore script and returns success when the marker is present', async () => {
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
  assert.match(calls[0], /AccentPolicy/)
  assert.match(calls[0], /SetWindowCompositionAttribute/)
  assert.match(calls[0], /Shell_TrayWnd/)
  assert.match(calls[0], /Shell_SecondaryTrayWnd/)
  assert.match(calls[0], /\$accent\.AccentState = 0/)
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
