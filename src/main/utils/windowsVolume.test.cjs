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

test('getFastScanEligibility keeps Windows local NTFS root volumes eligible by default', async () => {
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

test('getFastScanEligibility allows Windows local NTFS directories when directory fast scan is requested', async () => {
  const calls = []
  const { getFastScanEligibility } = loadWindowsVolumeModule({
    platform: 'win32',
    execFile: async (file, args) => {
      calls.push([file, args])
      return { stdout: '文件系统名称 : NTFS' }
    }
  })

  const result = await getFastScanEligibility('D:\\vmware', { preferNtfsFastForDirectories: true })

  assert.equal(result.mode, 'ntfs-fast')
  assert.equal(result.reason, null)
  assert.equal(calls.length, 1)
  assert.deepEqual(Array.from(calls[0][1]), ['fsinfo', 'volumeinfo', 'D:'])
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

test('getFastScanEligibility still attempts ntfs-fast mode when the fsutil probe fails', async () => {
  const { getFastScanEligibility } = loadWindowsVolumeModule({
    platform: 'win32',
    execFile: async () => {
      throw new Error('fsutil failed')
    }
  })

  const result = await getFastScanEligibility('D:\\')

  assert.equal(result.mode, 'ntfs-fast')
  assert.match(result.reason, /fsutil/i)
  assert.match(result.reason, /自动回退/)
})

test('getFastScanEligibility probes root volumes with a drive specifier instead of a backslash path', async () => {
  const calls = []
  const { getFastScanEligibility } = loadWindowsVolumeModule({
    platform: 'win32',
    execFile: async (file, args) => {
      calls.push([file, args])
      return { stdout: '文件系统名称 : NTFS' }
    }
  })

  const result = await getFastScanEligibility('D:\\')

  assert.equal(result.mode, 'ntfs-fast')
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'fsutil')
  assert.deepEqual(Array.from(calls[0][1]), ['fsinfo', 'volumeinfo', 'D:'])
})

test('listWindowsDriveRoots returns sorted logical drives with fast-scan metadata', async () => {
  const calls = []
  const { listWindowsDriveRoots } = loadWindowsVolumeModule({
    platform: 'win32',
    execFile: async (file, args) => {
      calls.push([file, args])
      return {
        stdout: JSON.stringify([
          {
            DeviceID: 'E:',
            VolumeName: 'Backup',
            FileSystem: 'exFAT',
            DriveType: 2,
            Size: '2000',
            FreeSpace: '500'
          },
          {
            DeviceID: 'D:',
            VolumeName: '本地磁盘',
            FileSystem: 'NTFS',
            DriveType: 3,
            Size: 1000,
            FreeSpace: 400
          }
        ])
      }
    }
  })

  const roots = await listWindowsDriveRoots()

  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'powershell.exe')
  assert.match(Array.from(calls[0][1]).join(' '), /UTF8Encoding/)
  assert.deepEqual(Array.from(roots.map((root) => root.path)), ['D:\\', 'E:\\'])
  assert.deepEqual(JSON.parse(JSON.stringify(roots[0])), {
    path: 'D:\\',
    label: 'D:',
    name: '本地磁盘',
    filesystem: 'NTFS',
    driveType: 'fixed',
    totalBytes: 1000,
    freeBytes: 400,
    supportsNtfsFast: true
  })
  assert.equal(roots[1].supportsNtfsFast, false)
})

test('listWindowsDriveRoots returns an empty list outside Windows', async () => {
  const { listWindowsDriveRoots } = loadWindowsVolumeModule({
    platform: 'linux'
  })

  assert.deepEqual(Array.from(await listWindowsDriveRoots()), [])
})
