const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadElevatedNtfsScanRunnerModule(overrides = {}) {
  const filePath = path.join(__dirname, 'ElevatedNtfsScanRunner.ts')
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
          isPackaged: false
        }
      }
    }

    if (specifier === './NtfsFastScannerBridge') {
      return {}
    }

    if (specifier === 'node:child_process' || specifier === 'child_process') {
      return {
        execFile() {
          throw new Error('default execFile should not run in this unit test')
        }
      }
    }

    if (specifier === 'node:os' || specifier === 'os') {
      return overrides.osModule || require(specifier)
    }

    if (specifier === 'node:fs/promises' || specifier === 'fs/promises') {
      return overrides.fsPromises || require(specifier)
    }

    if (specifier === 'node:path' || specifier === 'path') {
      return overrides.pathModule || require(specifier)
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
    clearTimeout,
    setInterval,
    clearInterval
  }, { filename: filePath })

  return module.exports
}

test('start creates manifest and requests elevated helper launch', async () => {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'elevated-ntfs-runner-test-'))
  const launches = []
  const { ElevatedNtfsScanRunner } = loadElevatedNtfsScanRunnerModule()

  const runner = new ElevatedNtfsScanRunner({
    osModule: {
      ...os,
      tmpdir: () => tempRoot
    },
    scannerPath: 'C:\\native\\ntfs-fast-scan.exe',
    helperScriptPath: 'C:\\helpers\\run-elevated-ntfs-fast-scan.ps1',
    launchElevated: async (manifestPath, helperScriptPath) => {
      launches.push({ manifestPath, helperScriptPath })
      await fs.promises.writeFile(path.join(path.dirname(manifestPath), 'exit-code.txt'), '0', 'utf8')
      return { pid: 1234 }
    }
  })

  const handle = await runner.start('D:\\', () => {})
  await handle.done

  assert.equal(launches.length, 1)
  assert.match(launches[0].manifestPath, /space-cleanup-fast-scan-/)
  assert.equal(launches[0].helperScriptPath, 'C:\\helpers\\run-elevated-ntfs-fast-scan.ps1')

  const manifest = JSON.parse(await fs.promises.readFile(launches[0].manifestPath, 'utf8'))
  assert.equal(manifest.rootPath, 'D:\\')
  assert.equal(manifest.scannerPath, 'C:\\native\\ntfs-fast-scan.exe')

  await fs.promises.rm(tempRoot, { recursive: true, force: true })
})

test('start replays JSON lines from the elevated helper events file', async () => {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'elevated-ntfs-runner-events-'))
  const { ElevatedNtfsScanRunner } = loadElevatedNtfsScanRunnerModule()

  const runner = new ElevatedNtfsScanRunner({
    osModule: {
      ...os,
      tmpdir: () => tempRoot
    },
    launchElevated: async (manifestPath) => {
      const workDir = path.dirname(manifestPath)
      await fs.promises.writeFile(
        path.join(workDir, 'events.jsonl'),
        '{"type":"volume-info","mode":"ntfs-fast"}\n{"type":"complete"}\n',
        'utf8'
      )
      await fs.promises.writeFile(path.join(workDir, 'exit-code.txt'), '0', 'utf8')
      return { pid: 5678 }
    }
  })

  const events = []
  const handle = await runner.start('D:\\', (event) => {
    events.push(event)
  })
  await handle.done

  assert.deepEqual(events.map((event) => event.type), ['volume-info', 'complete'])
  await fs.promises.rm(tempRoot, { recursive: true, force: true })
})

test('start rejects with scanner stderr when elevated helper reports a non-zero exit code', async () => {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'elevated-ntfs-runner-fail-'))
  const { ElevatedNtfsScanRunner } = loadElevatedNtfsScanRunnerModule()

  const runner = new ElevatedNtfsScanRunner({
    osModule: {
      ...os,
      tmpdir: () => tempRoot
    },
    launchElevated: async (manifestPath) => {
      const workDir = path.dirname(manifestPath)
      await fs.promises.writeFile(path.join(workDir, 'stderr.log'), 'access denied', 'utf8')
      await fs.promises.writeFile(path.join(workDir, 'exit-code.txt'), '1', 'utf8')
      return { pid: 1001 }
    }
  })

  const handle = await runner.start('D:\\', () => {})
  await assert.rejects(handle.done, /access denied/)
  await fs.promises.rm(tempRoot, { recursive: true, force: true })
})
