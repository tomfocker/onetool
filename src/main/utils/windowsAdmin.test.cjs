const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadWindowsAdminModule(overrides = {}) {
  const filePath = path.join(__dirname, 'windowsAdmin.ts')
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
  const customRequire = (specifier) => {
    if (specifier === 'node:child_process' || specifier === 'child_process') {
      return {
        execFile() {
          throw new Error('default execFile should not run in this unit test')
        }
      }
    }

    return require(specifier)
  }

  const contextProcess = {
    ...process,
    platform: overrides.platform || process.platform
  }

  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: customRequire,
    __dirname,
    __filename: filePath,
    console,
    process: contextProcess,
    Buffer,
    setTimeout,
    clearTimeout
  }, { filename: filePath })

  return module.exports
}

test('isProcessElevated reports false on non-Windows platforms', async () => {
  const { isProcessElevated } = loadWindowsAdminModule({ platform: 'linux' })
  const result = await isProcessElevated()

  assert.equal(result, false)
})

test('isProcessElevated reports false when PowerShell probe returns False', async () => {
  const { isProcessElevated } = loadWindowsAdminModule()
  const result = await isProcessElevated({
    execFile: async () => ({ stdout: 'False\r\n', stderr: '' })
  })

  assert.equal(result, false)
})

test('isProcessElevated reports true when PowerShell probe returns True', async () => {
  const { isProcessElevated } = loadWindowsAdminModule()
  const result = await isProcessElevated({
    execFile: async () => ({ stdout: 'True\r\n', stderr: '' })
  })

  assert.equal(result, true)
})

test('isProcessElevated gracefully falls back to false when probe throws', async () => {
  const { isProcessElevated } = loadWindowsAdminModule()
  const result = await isProcessElevated({
    execFile: async () => {
      throw new Error('probe failed')
    }
  })

  assert.equal(result, false)
})
