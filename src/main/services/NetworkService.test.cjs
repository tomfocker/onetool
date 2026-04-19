const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadNetworkServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'NetworkService.ts')
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
  const execCommand = overrides.execCommand || (async () => 'Reply from 1.1.1.1: time=25ms')
  const execPowerShell = overrides.execPowerShell || (async () => '[]')
  const parsePingOutput = overrides.parsePingOutput || ((output) => {
    const match = String(output).match(/time[=<](\d+)/i)
    return match ? { alive: true, time: Number(match[1]) } : { alive: false, time: null }
  })
  const logger = overrides.logger || {
    info() {},
    warn() {},
    error() {}
  }
  const taskQueueService = overrides.taskQueueService || {
    enqueue: async (_name, fn) => fn()
  }

  const customRequire = (specifier) => {
    if (specifier === '../utils/processUtils') {
      return { execCommand, execPowerShell }
    }

    if (specifier === '../../shared/networkRadar') {
      return { parsePingOutput }
    }

    if (specifier === '../utils/logger') {
      return { logger }
    }

    if (specifier === './TaskQueueService') {
      return { taskQueueService }
    }

    if (specifier === 'os') {
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

test('ping returns a failure when the ping command throws unexpectedly', async () => {
  const { NetworkService } = loadNetworkServiceModule({
    execCommand: async () => {
      throw new Error('spawn ping ENOENT')
    }
  })
  const service = new NetworkService()

  const result = await service.ping('1.1.1.1')

  assert.equal(result.success, false)
  assert.match(result.error, /ping 服务不可用/)
})

test('pingBatch returns a failure when every ping probe fails internally', async () => {
  const { NetworkService } = loadNetworkServiceModule()
  const service = new NetworkService()
  service.ping = async () => ({ success: false, error: 'ping unavailable' })

  const result = await service.pingBatch(['1.1.1.1', '8.8.8.8'])

  assert.equal(result.success, false)
  assert.match(result.error, /Ping 服务不可用/)
})
