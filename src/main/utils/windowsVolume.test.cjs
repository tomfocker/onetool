const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadWindowsVolumeModule(overrides = {}) {
  const filePath = path.join(__dirname, 'windowsVolume.ts')
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
    if (specifier === 'child_process') {
      return {
        execFile: overrides.execFile || (() => {
          throw new Error('execFile stub not provided')
        })
      }
    }

    return require(specifier)
  }

  const platform = overrides.platform || process.platform

  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: customRequire,
    __dirname,
    __filename: filePath,
    console,
    process: {
      ...process,
      platform
    },
    Buffer,
    setTimeout,
    clearTimeout
  }, { filename: filePath })

  return module.exports
}

test('getFastScanEligibility accepts only Windows local NTFS root volumes', async () => {
  const { getFastScanEligibility } = loadWindowsVolumeModule({
    platform: 'win32',
    execFile: async () => ({ stdout: '文件系统名称 : NTFS' })
  })

  const eligible = await getFastScanEligibility('D:\\')
  const notRoot = await getFastScanEligibility('D:\\Work')

  assert.equal(eligible.mode, 'ntfs-fast')
  assert.equal(eligible.reason, null)
  assert.equal(notRoot.mode, 'filesystem')
  assert.match(notRoot.reason, /根路径/)
})

test('getFastScanEligibility returns filesystem mode on non-Windows with a Windows-only reason', async () => {
  const { getFastScanEligibility } = loadWindowsVolumeModule({
    platform: 'linux'
  })

  const result = await getFastScanEligibility('D:\\')

  assert.equal(result.mode, 'filesystem')
  assert.match(result.reason, /Windows/)
})

test('getFastScanEligibility returns filesystem mode for non-NTFS volumes with a filesystem-specific reason', async () => {
  const { getFastScanEligibility } = loadWindowsVolumeModule({
    platform: 'win32',
    execFile: async () => ({ stdout: '文件系统名称 : exFAT' })
  })

  const result = await getFastScanEligibility('D:\\')

  assert.equal(result.mode, 'filesystem')
  assert.match(result.reason, /exFAT/i)
})

test('getFastScanEligibility returns filesystem mode when the fsutil probe fails', async () => {
  const { getFastScanEligibility } = loadWindowsVolumeModule({
    platform: 'win32',
    execFile: async () => {
      throw new Error('fsutil failed')
    }
  })

  const result = await getFastScanEligibility('D:\\')

  assert.equal(result.mode, 'filesystem')
  assert.match(result.reason, /fsutil/i)
})
