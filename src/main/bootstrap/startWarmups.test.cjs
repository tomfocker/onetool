const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadStartWarmupsModule() {
  const filePath = path.join(__dirname, 'startWarmups.ts')
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
    __dirname: path.dirname(filePath),
    __filename: filePath,
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout
  }, { filename: filePath })

  return module.exports
}

test('startWarmups runs startup state loading and deferred runtime warmups', async () => {
  const { startWarmups } = loadStartWarmupsModule()
  const calls = []

  startWarmups({
    settingsService: {
      loadSettings() {
        calls.push('settings.loadSettings')
      }
    },
    screenRecorderService: {
      initFfmpeg() {
        calls.push('screenRecorder.initFfmpeg')
      }
    },
    restoreTaskbarAppearanceOnStartup() {
      calls.push('restoreTaskbarAppearanceOnStartup')
      return Promise.resolve()
    },
    scheduleDoctorAudit() {
      calls.push('scheduleDoctorAudit')
    }
  })

  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(calls, [
    'settings.loadSettings',
    'screenRecorder.initFfmpeg',
    'restoreTaskbarAppearanceOnStartup',
    'scheduleDoctorAudit'
  ])
})
