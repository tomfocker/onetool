const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadNetworkRadarModule() {
  const filePath = path.join(__dirname, 'networkRadar.ts')
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
    if (specifier === './types') {
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
    Buffer
  }, { filename: filePath })

  return module.exports
}

test('mapLatencyProbeResults marks service failures as error states', () => {
  const { mapLatencyProbeResults } = loadNetworkRadarModule()
  const probeHosts = [{ host: '1.1.1.1', name: 'Cloudflare DNS' }]

  const result = JSON.parse(JSON.stringify(mapLatencyProbeResults(probeHosts, { success: false })))

  assert.deepEqual(result, [
    { host: '1.1.1.1', name: 'Cloudflare DNS', latency: null, status: 'error' }
  ])
})

test('mapLatencyProbeResults keeps unreachable hosts as timeout states', () => {
  const { mapLatencyProbeResults } = loadNetworkRadarModule()
  const probeHosts = [{ host: '1.1.1.1', name: 'Cloudflare DNS' }]

  const result = JSON.parse(JSON.stringify(mapLatencyProbeResults(probeHosts, {
    success: true,
    data: [{ host: '1.1.1.1', alive: false, time: null }]
  })))

  assert.deepEqual(result, [
    { host: '1.1.1.1', name: 'Cloudflare DNS', latency: null, status: 'timeout' }
  ])
})
