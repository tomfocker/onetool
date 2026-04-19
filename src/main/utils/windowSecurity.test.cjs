const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadWindowSecurityModule() {
  const filePath = path.join(__dirname, 'windowSecurity.ts')
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

test('createIsolatedPreloadWebPreferences returns the standard preload security profile', () => {
  const { createIsolatedPreloadWebPreferences } = loadWindowSecurityModule()
  const profile = JSON.parse(JSON.stringify(
    createIsolatedPreloadWebPreferences('D:/code/onetool/out/preload/index.js')
  ))

  assert.deepEqual(
    profile,
    {
      preload: 'D:/code/onetool/out/preload/index.js',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  )
})
