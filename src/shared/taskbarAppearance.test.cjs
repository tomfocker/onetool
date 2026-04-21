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
  vm.runInNewContext(
    transpiled,
    {
      module,
      exports: module.exports,
      require,
      __dirname,
      __filename: filePath,
      console,
      process
    },
    { filename: filePath }
  )
  return module.exports
}

test('createDefaultTaskbarAppearanceSettings prefers blur with the stable default intensity and tint', () => {
  const {
    createDefaultTaskbarAppearanceSettings
  } = loadTaskbarAppearanceModule()

  const defaults = createDefaultTaskbarAppearanceSettings()
  assert.equal(defaults.enabled, false)
  assert.equal(defaults.preset, 'blur')
  assert.equal(defaults.intensity, 60)
  assert.equal(defaults.tintHex, '#FFFFFF33')
})

test('resolveTaskbarAppearanceAvailability pins the Windows 11 and acrylic thresholds', () => {
  const { resolveTaskbarAppearanceAvailability } = loadTaskbarAppearanceModule()

  const preWindows11 = resolveTaskbarAppearanceAvailability({
    platform: 'win32',
    release: '10.0.21999'
  })
  assert.equal(preWindows11.host.isWindows11Capable, false)
  assert.equal(preWindows11.supported, false)
  assert.equal(preWindows11.presets.blur.available, false)
  assert.equal(preWindows11.presets.acrylic.available, false)

  const windows11 = resolveTaskbarAppearanceAvailability({
    platform: 'win32',
    release: '10.0.22000'
  })
  assert.equal(windows11.host.isWindows11Capable, true)
  assert.equal(windows11.supported, true)
  assert.equal(windows11.presets.blur.available, true)
  assert.equal(windows11.presets.acrylic.available, false)

  const acrylicReady = resolveTaskbarAppearanceAvailability({
    platform: 'win32',
    release: '10.0.22621'
  })
  assert.equal(acrylicReady.host.acrylicAvailable, true)
  assert.equal(acrylicReady.presets.acrylic.available, true)

  const unsupported24H2 = resolveTaskbarAppearanceAvailability({
    platform: 'win32',
    release: '10.0.26200'
  })
  assert.equal(unsupported24H2.host.isWindows11Capable, true)
  assert.equal(unsupported24H2.host.acrylicAvailable, false)
  assert.equal(unsupported24H2.supported, false)
  assert.equal(unsupported24H2.presets.transparent.available, false)
  assert.equal(unsupported24H2.presets.blur.available, false)
  assert.equal(unsupported24H2.presets.acrylic.available, false)
  assert.match(
    unsupported24H2.presets.blur.reason,
    /24H2.*兼容性问题/
  )
})

test('resolveTaskbarAppearanceAvailability safely treats malformed releases as unsupported', () => {
  const { resolveTaskbarAppearanceAvailability } = loadTaskbarAppearanceModule()

  const malformed = resolveTaskbarAppearanceAvailability({
    platform: 'win32',
    release: 'not-a-version'
  })

  assert.equal(malformed.host.build, 0)
  assert.equal(malformed.supported, false)
  assert.equal(malformed.presets.blur.available, false)
  assert.equal(malformed.presets.acrylic.available, false)
})
