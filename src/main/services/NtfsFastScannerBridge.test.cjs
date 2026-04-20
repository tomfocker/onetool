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
  const killCalls = []

  return {
    stdout,
    stderr,
    kill(signal) {
      killCalls.push(signal)
      return true
    },
    killCalls,
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
  const run = bridge.start('D:\\', (event) => {
    events.push(event)
  })

  fakeChild.stdout.write('{"type":"volume-info","mode":"ntfs-fast"}\n{"type":"progress","filesScanned":12}\n')
  fakeChild.stdout.end()
  fakeChild.stderr.end()
  fakeChild.emit('close', 0)

  await run.done

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

  const run = bridge.start('D:\\', () => {})
  fakeChild.stderr.write('native scanner failed\n')
  fakeChild.stdout.write('{"type":"progress"}\n')
  fakeChild.stderr.end()
  fakeChild.emit('close', 2)

  await assert.rejects(run.done, /native scanner failed/)
})

test('NtfsFastScannerBridge cancellation kills the spawned process', async () => {
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

  const run = bridge.start('D:\\', () => {})
  run.cancel()

  assert.equal(fakeChild.killCalls.length, 1)
  assert.equal(fakeChild.killCalls[0], undefined)
  await assert.rejects(run.done, /NtfsFastScannerBridge cancelled/)
})

test('NtfsFastScannerBridge prefers non-zero exit over trailing stdout junk', async () => {
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

  const run = bridge.start('D:\\', () => {})
  fakeChild.stderr.write('boom\n')
  fakeChild.stdout.write('{"type":"progress"}\npartial-json')
  fakeChild.stderr.end()
  fakeChild.emit('close', 4)

  await assert.rejects(run.done, /ntfs-fast-scan exited with code 4: boom/)
})

test('NtfsFastScannerBridge wraps malformed JSON with scanner context', async () => {
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

  const run = bridge.start('D:\\', () => {})
  fakeChild.stdout.write('{"type":"progress"}\n{bad json}\n')
  fakeChild.stdout.end()
  fakeChild.stderr.end()
  fakeChild.emit('close', 0)

  await assert.rejects(run.done, /NtfsFastScannerBridge JSON parse error/)
})
