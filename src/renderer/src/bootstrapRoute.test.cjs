const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadBootstrapRouteModule() {
  const filePath = path.join(__dirname, 'bootstrapRoute.ts')
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
    require,
    __dirname,
    __filename: filePath,
    console,
    process
  }, { filename: filePath })

  return module.exports
}

test('resolveBootstrapRoute detects screen overlay routes as a lightweight entry', () => {
  const { resolveBootstrapRoute } = loadBootstrapRouteModule()
  assert.equal(resolveBootstrapRoute('#/screen-overlay?mode=ocr'), 'screen-overlay')
})

test('resolveBootstrapRoute keeps floatball on the dedicated entry', () => {
  const { resolveBootstrapRoute } = loadBootstrapRouteModule()
  assert.equal(resolveBootstrapRoute('#/float-ball'), 'floatball')
})

test('resolveBootstrapRoute detects color picker overlays as a lightweight entry', () => {
  const { resolveBootstrapRoute } = loadBootstrapRouteModule()
  assert.equal(resolveBootstrapRoute('#/color-picker-overlay?display=1'), 'color-picker-overlay')
})

test('resolveBootstrapRoute detects recorder selection overlays as a lightweight entry', () => {
  const { resolveBootstrapRoute } = loadBootstrapRouteModule()
  assert.equal(resolveBootstrapRoute('#/recorder-selection?display=1'), 'recorder-selection')
})

test('resolveBootstrapRoute detects screenshot selection overlays as a lightweight entry', () => {
  const { resolveBootstrapRoute } = loadBootstrapRouteModule()
  assert.equal(resolveBootstrapRoute('#/screenshot-selection?display=1'), 'screenshot-selection')
})

test('resolveBootstrapRoute falls back to the main app for normal routes', () => {
  const { resolveBootstrapRoute } = loadBootstrapRouteModule()
  assert.equal(resolveBootstrapRoute('#/settings'), 'app')
})
