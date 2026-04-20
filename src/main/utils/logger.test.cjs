const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadLoggerModule() {
  const filePath = path.join(__dirname, 'logger.ts')
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
    if (specifier === 'electron') {
      return {
        app: {
          getPath() {
            return path.join(__dirname, '__logger_test_userdata__')
          }
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

  return module.exports
}

test('writeConsoleEntry swallows broken pipe console writes', () => {
  const { LogLevel, writeConsoleEntry } = loadLoggerModule()
  const consoleLike = {
    log() {
      const error = new Error('broken pipe')
      error.code = 'EPIPE'
      throw error
    },
    warn() {
      throw new Error('warn should not be used')
    },
    error() {
      throw new Error('error should not be used')
    }
  }

  assert.doesNotThrow(() => {
    writeConsoleEntry(LogLevel.INFO, '[test] hello', consoleLike)
  })
})

test('writeConsoleEntry still throws unexpected console failures', () => {
  const { LogLevel, writeConsoleEntry } = loadLoggerModule()
  const consoleLike = {
    log() {
      throw new Error('unexpected')
    },
    warn() {},
    error() {}
  }

  assert.throws(() => {
    writeConsoleEntry(LogLevel.INFO, '[test] hello', consoleLike)
  }, /unexpected/)
})
