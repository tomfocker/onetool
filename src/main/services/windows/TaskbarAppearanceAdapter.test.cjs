const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadTaskbarAppearanceAdapterModule(overrides = {}) {
  const filePath = path.join(__dirname, 'TaskbarAppearanceAdapter.ts')
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
  const events = overrides.events || []

  const customRequire = (specifier) => {
    if (specifier === './WindowsTaskbarAdapter') {
      return {
        WindowsTaskbarAdapter: class WindowsTaskbarAdapter {
          async applyAppearance(input) {
            events.push({ adapter: 'legacy', method: 'applyAppearance', input })
            return { success: true, adapter: 'legacy' }
          }

          async restoreDefault() {
            events.push({ adapter: 'legacy', method: 'restoreDefault' })
            return { success: true, adapter: 'legacy' }
          }
        }
      }
    }

    if (specifier === './TranslucentTbAdapter') {
      return {
        TranslucentTbAdapter: class TranslucentTbAdapter {
          async applyAppearance(input) {
            events.push({ adapter: 'modern', method: 'applyAppearance', input })
            return { success: true, adapter: 'modern' }
          }

          async restoreDefault() {
            events.push({ adapter: 'modern', method: 'restoreDefault' })
            return { success: true, adapter: 'modern' }
          }
        }
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

test('TaskbarAppearanceAdapter keeps the legacy composition backend on Windows 11 build 22000', async () => {
  const events = []
  const { TaskbarAppearanceAdapter } = loadTaskbarAppearanceAdapterModule({ events })
  const adapter = new TaskbarAppearanceAdapter({
    platform: 'win32',
    release: '10.0.22000'
  })

  const result = await adapter.applyAppearance({
    preset: 'blur',
    intensity: 55,
    tintHex: '#AABBCC44'
  })

  assert.equal(result.success, true)
  assert.deepEqual(events, [
    {
      adapter: 'legacy',
      method: 'applyAppearance',
      input: {
        preset: 'blur',
        intensity: 55,
        tintHex: '#AABBCC44'
      }
    }
  ])
})

test('TaskbarAppearanceAdapter switches Windows 11 22H2+ to the managed TranslucentTB helper backend', async () => {
  const events = []
  const { TaskbarAppearanceAdapter } = loadTaskbarAppearanceAdapterModule({ events })
  const adapter = new TaskbarAppearanceAdapter({
    platform: 'win32',
    release: '10.0.22631'
  })

  const result = await adapter.applyAppearance({
    preset: 'acrylic',
    intensity: 80,
    tintHex: '#11223344'
  })

  assert.equal(result.success, true)
  assert.deepEqual(events, [
    {
      adapter: 'modern',
      method: 'applyAppearance',
      input: {
        preset: 'acrylic',
        intensity: 80,
        tintHex: '#11223344'
      }
    }
  ])
})

test('TaskbarAppearanceAdapter restores through the modern helper backend on Windows 11 24H2', async () => {
  const events = []
  const { TaskbarAppearanceAdapter } = loadTaskbarAppearanceAdapterModule({ events })
  const adapter = new TaskbarAppearanceAdapter({
    platform: 'win32',
    release: '10.0.26200'
  })

  const result = await adapter.restoreDefault()

  assert.equal(result.success, true)
  assert.deepEqual(events, [
    {
      adapter: 'modern',
      method: 'restoreDefault'
    }
  ])
})

test('TaskbarAppearanceAdapter blocks modern helper apply calls on Windows 11 24H2 builds with known XAML issues', async () => {
  const events = []
  const { TaskbarAppearanceAdapter } = loadTaskbarAppearanceAdapterModule({ events })
  const adapter = new TaskbarAppearanceAdapter({
    platform: 'win32',
    release: '10.0.26200'
  })

  const result = await adapter.applyAppearance({
    preset: 'blur',
    intensity: 60,
    tintHex: '#FFFFFF33'
  })

  assert.equal(result.success, false)
  assert.match(result.error, /24H2.*XAML Diagnostics/i)
  assert.deepEqual(events, [])
})
