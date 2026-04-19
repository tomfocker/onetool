const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadProcessUtilsModule(overrides = {}) {
  const filePath = path.join(__dirname, 'processUtils.ts')
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
  const exec = overrides.exec || (() => {
    throw new Error('exec stub not provided')
  })
  const spawn = overrides.spawn || (() => {
    throw new Error('spawn stub not provided')
  })
  const logger = overrides.logger || {
    warn() {},
    error() {}
  }
  const processRegistry = overrides.processRegistry || {
    register() {}
  }
  const selectCommandTextOutput = overrides.selectCommandTextOutput || (() => '')

  const customRequire = (specifier) => {
    if (specifier === 'child_process') {
      return { exec, spawn }
    }

    if (specifier === './logger') {
      return { logger }
    }

    if (specifier === '../services/ProcessRegistry') {
      return { processRegistry }
    }

    if (specifier === './processUtils.helpers') {
      return { selectCommandTextOutput }
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

  return module.exports
}

test('execCommand rejects when the command fails without usable output', async () => {
  const { execCommand } = loadProcessUtilsModule({
    exec: (cmd, options, callback) => {
      callback(new Error('spawn ping ENOENT'), Buffer.alloc(0), Buffer.alloc(0))
      return { pid: 1234 }
    },
    selectCommandTextOutput: () => ''
  })

  await assert.rejects(
    () => execCommand('ping 1.1.1.1', 3000),
    /spawn ping ENOENT/
  )
})
