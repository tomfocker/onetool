const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const Module = require('node:module')
const ts = require('typescript')

function loadTroubleshootingIpcModule(mocks) {
  const filePath = path.join(__dirname, 'troubleshootingIpc.ts')
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
  const originalLoad = Module._load

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return mocks.electron
    if (request === '../services/TroubleshootingService') return mocks.serviceModule
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    vm.runInNewContext(transpiled, {
      module,
      exports: module.exports,
      require,
      __dirname,
      __filename: filePath,
      console,
      process
    }, { filename: filePath })
  } finally {
    Module._load = originalLoad
  }

  return module.exports
}

test('registerTroubleshootingIpc wires group policy and printer share channels', async () => {
  const handlers = new Map()
  const calls = []
  const mocks = {
    electron: {
      ipcMain: {
        handle(channel, handler) {
          handlers.set(channel, handler)
        }
      }
    },
    serviceModule: {
      troubleshootingService: {
        scanGroupPolicy: async () => {
          calls.push('scan')
          return { success: true, data: { available: true } }
        },
        installGroupPolicy: async () => {
          calls.push('install')
          return { success: true, data: { started: true } }
        },
        openGroupPolicyEditor: async () => {
          calls.push('open')
          return { success: true }
        },
        diagnosePrinterShare: async (request) => {
          calls.push(['printer-diagnose', request])
          return { success: true, data: { targetHost: request.target } }
        },
        repairPrinterShare: async (request) => {
          calls.push(['printer-repair', request])
          return { success: true, data: { actionId: request.actionId } }
        },
        savePrinterShareCredential: async (request) => {
          calls.push(['printer-credential', request])
          return { success: true, data: { saved: true } }
        },
        openPrinterShareTarget: async (request) => {
          calls.push(['printer-open', request])
          return { success: true }
        }
      }
    }
  }

  const { registerTroubleshootingIpc } = loadTroubleshootingIpcModule(mocks)
  registerTroubleshootingIpc()

  assert.deepEqual(Array.from(handlers.keys()), [
    'troubleshooting:group-policy-scan',
    'troubleshooting:group-policy-install',
    'troubleshooting:group-policy-open',
    'troubleshooting:printer-share-diagnose',
    'troubleshooting:printer-share-repair',
    'troubleshooting:printer-share-credential',
    'troubleshooting:printer-share-open'
  ])
  assert.equal((await handlers.get('troubleshooting:group-policy-scan')()).success, true)
  assert.equal((await handlers.get('troubleshooting:group-policy-install')()).success, true)
  assert.equal((await handlers.get('troubleshooting:group-policy-open')()).success, true)
  assert.equal((await handlers.get('troubleshooting:printer-share-diagnose')({}, { target: '192.168.6.7' })).success, true)
  assert.equal((await handlers.get('troubleshooting:printer-share-repair')({}, { actionId: 'restart-client-spooler' })).success, true)
  assert.equal((await handlers.get('troubleshooting:printer-share-credential')({}, { targetHost: '192.168.6.7', username: 'u', password: 'p' })).success, true)
  assert.equal((await handlers.get('troubleshooting:printer-share-open')({}, { target: 'credential-manager' })).success, true)
  assert.deepEqual(calls, [
    'scan',
    'install',
    'open',
    ['printer-diagnose', { target: '192.168.6.7' }],
    ['printer-repair', { actionId: 'restart-client-spooler' }],
    ['printer-credential', { targetHost: '192.168.6.7', username: 'u', password: 'p' }],
    ['printer-open', { target: 'credential-manager' }]
  ])
})
