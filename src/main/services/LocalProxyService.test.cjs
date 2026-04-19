const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadLocalProxyServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'LocalProxyService.ts')
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
  const execPowerShellEncoded = overrides.execPowerShellEncoded || (async () => 'ok')
  const spawn = overrides.spawn || (() => ({ unref() {} }))
  const logger = overrides.logger || {
    error() {},
    warn() {}
  }

  const customRequire = (specifier) => {
    if (specifier === '../utils/processUtils') {
      return { execPowerShellEncoded }
    }

    if (specifier === 'child_process') {
      return { spawn }
    }

    if (specifier === '../utils/logger') {
      return { logger }
    }

    if (specifier === '../../shared/types') {
      return {}
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

test('setConfig returns a failure when the proxy apply script resolves empty output', async () => {
  const { LocalProxyService } = loadLocalProxyServiceModule({
    execPowerShellEncoded: async () => ''
  })
  const service = new LocalProxyService()
  service.getStatus = async () => ({ success: true, data: { enabled: true } })

  const result = await service.setConfig({
    host: '127.0.0.1',
    port: 7890,
    protocol: 'http',
    bypass: []
  })

  assert.equal(result.success, false)
  assert.match(result.error, /代理设置应用失败/)
})

test('disable returns a failure when the proxy disable script resolves empty output', async () => {
  const { LocalProxyService } = loadLocalProxyServiceModule({
    execPowerShellEncoded: async () => ''
  })
  const service = new LocalProxyService()
  service.getStatus = async () => ({ success: true, data: { enabled: false } })

  const result = await service.disable()

  assert.equal(result.success, false)
  assert.match(result.error, /代理设置应用失败/)
})
