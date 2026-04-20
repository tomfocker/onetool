const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { PassThrough } = require('node:stream')
const ts = require('typescript')

function loadNtfsFastScannerBridgeModule(overrides = {}) {
  const filePath = path.join(__dirname, 'NtfsFastScannerBridge.ts')
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
    if (specifier === 'child_process' || specifier === 'node:child_process') {
      return overrides.childProcessModule || {
        spawn() {
          throw new Error('spawn should not run in this unit test')
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

function createFakeChildProcess() {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const listeners = new Map()

  return {
    stdout,
    stderr,
    on(event, handler) {
      listeners.set(event, handler)
      return this
    },
    emit(event, ...args) {
      const handler = listeners.get(event)
      if (handler) {
        handler(...args)
      }
    }
  }
}

test('NtfsFastScannerBridge parses stdout JSON Lines and emits each event', async () => {
  const fakeChild = createFakeChildProcess()
  const spawnCalls = []
  const { NtfsFastScannerBridge } = loadNtfsFastScannerBridgeModule({
    childProcessModule: {
      spawn(command, args, options) {
        spawnCalls.push({ command, args, options })
        return fakeChild
      }
    }
  })

  const bridge = new NtfsFastScannerBridge({
    scannerPath: 'C:\\native\\ntfs-fast-scan.exe'
  })

  const events = []
  const startPromise = bridge.start('D:\\', (event) => {
    events.push(event)
  })

  fakeChild.stdout.write('{"type":"volume-info","mode":"ntfs-fast"}\n{"type":"progress","filesScanned":12}\n')
  fakeChild.stdout.end()
  fakeChild.stderr.end()
  fakeChild.emit('close', 0)

  await startPromise

  assert.equal(spawnCalls.length, 1)
  assert.equal(spawnCalls[0].command, 'C:\\native\\ntfs-fast-scan.exe')
  assert.equal(JSON.stringify(spawnCalls[0].args), JSON.stringify(['scan', '--root', 'D:\\']))
  assert.equal(events.length, 2)
  assert.equal(events[0].type, 'volume-info')
  assert.equal(events[1].type, 'progress')
})

test('NtfsFastScannerBridge rejects on non-zero exit and includes stderr output', async () => {
  const fakeChild = createFakeChildProcess()
  const { NtfsFastScannerBridge } = loadNtfsFastScannerBridgeModule({
    childProcessModule: {
      spawn() {
        return fakeChild
      }
    }
  })

  const bridge = new NtfsFastScannerBridge({
    scannerPath: 'C:\\native\\ntfs-fast-scan.exe'
  })

  const startPromise = bridge.start('D:\\', () => {})
  fakeChild.stderr.write('native scanner failed\n')
  fakeChild.stdout.end()
  fakeChild.stderr.end()
  fakeChild.emit('close', 2)

  await assert.rejects(startPromise, /native scanner failed/)
})
