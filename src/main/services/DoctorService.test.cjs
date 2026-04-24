const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadDoctorServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'DoctorService.ts')
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
  const execSync = overrides.execSync || (() => {
    throw new Error('execSync stub not provided')
  })
  const execFileSync = overrides.execFileSync || (() => {
    throw new Error('execFileSync stub not provided')
  })
  const logger = overrides.logger || {
    info() {},
    warn() {},
    error() {}
  }
  const screenRecorderService = overrides.screenRecorderService || {
    getFfmpegPath() {
      return ''
    }
  }
  const mockFs = overrides.fs || {
    existsSync() {
      return false
    },
    writeFileSync() {},
    unlinkSync() {}
  }
  const electron = overrides.electron || {
    app: {
      getPath() {
        return 'C:\\mock-user-data'
      }
    }
  }

  const customRequire = (specifier) => {
    if (specifier === 'child_process') {
      return { execSync, execFileSync }
    }

    if (specifier === 'fs') {
      return mockFs
    }

    if (specifier === '../utils/logger') {
      return { logger }
    }

    if (specifier === './ScreenRecorderService') {
      return { screenRecorderService }
    }

    if (specifier === '../../shared/types') {
      return {}
    }

    if (specifier === 'electron') {
      return electron
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

test('runFullAudit checks PowerShell with a no-profile process invocation', async () => {
  const execFileCalls = []
  const { DoctorService } = loadDoctorServiceModule({
    execSync(command) {
      if (command === 'winget --version') return Buffer.from('v1.8.220\r\n')
      throw new Error(`unexpected execSync command: ${command}`)
    },
    execFileSync(command, args) {
      execFileCalls.push([command, args])
      if (command === 'powershell.exe') return Buffer.from('RemoteSigned\r\n')
      if (command === 'C:\\ffmpeg\\bin\\ffmpeg.exe') return Buffer.from('ffmpeg version 6.1\r\n')
      throw new Error(`unexpected execFileSync command: ${command}`)
    },
    screenRecorderService: {
      getFfmpegPath() {
        return 'C:\\ffmpeg\\bin\\ffmpeg.exe'
      }
    },
    fs: {
      existsSync(targetPath) {
        return targetPath === 'C:\\ffmpeg\\bin\\ffmpeg.exe'
      },
      writeFileSync() {},
      unlinkSync() {}
    }
  })

  const service = new DoctorService()
  const result = await service.runFullAudit()

  assert.equal(result.success, true)
  assert.equal(result.data.powershell.ok, true)
  assert.equal(result.data.powershell.executionPolicy, 'RemoteSigned')
  assert.deepEqual(JSON.parse(JSON.stringify(execFileCalls[0])), [
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    ['-version']
  ])
  assert.deepEqual(JSON.parse(JSON.stringify(execFileCalls[1])), [
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', 'Get-ExecutionPolicy']
  ])
})

test('runFullAudit returns the resolved ffmpeg path when the binary is missing', async () => {
  const { DoctorService } = loadDoctorServiceModule({
    execSync(command) {
      if (command === 'winget --version') return Buffer.from('v1.8.220\r\n')
      throw new Error(`unexpected execSync command: ${command}`)
    },
    execFileSync(command) {
      if (command === 'powershell.exe') return Buffer.from('RemoteSigned\r\n')
      throw new Error(`unexpected execFileSync command: ${command}`)
    },
    screenRecorderService: {
      getFfmpegPath() {
        return 'C:\\missing\\ffmpeg.exe'
      }
    },
    fs: {
      existsSync() {
        return false
      },
      writeFileSync() {},
      unlinkSync() {}
    }
  })

  const service = new DoctorService()
  const result = await service.runFullAudit()

  assert.equal(result.success, true)
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.ffmpeg)), {
    ok: false,
    path: 'C:\\missing\\ffmpeg.exe',
    error: 'FFmpeg 二进制缺失'
  })
})
