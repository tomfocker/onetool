const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

test('run-elevated-ntfs-fast-scan preserves UTF-8 JSON emitted by the scanner', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('PowerShell helper is Windows-only')
    return
  }

  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'onetool-ntfs-helper-test-'))
  t.after(async () => {
    await fs.promises.rm(tempRoot, { recursive: true, force: true })
  })

  const fakeScannerScript = path.join(tempRoot, 'fake-scanner.js')
  const fakeScannerCmd = path.join(tempRoot, 'fake-scanner.cmd')
  const eventsPath = path.join(tempRoot, 'events.jsonl')
  const stderrPath = path.join(tempRoot, 'stderr.log')
  const exitCodePath = path.join(tempRoot, 'exit-code.txt')
  const manifestPath = path.join(tempRoot, 'manifest.json')
  const expectedPath = 'D:\\虚拟机共享存储\\软件仓库'

  await fs.promises.writeFile(
    fakeScannerScript,
    [
      'const event = {',
      '  type: "largest-files",',
      `  largestFiles: [{ path: ${JSON.stringify(expectedPath)}, name: "软件仓库", sizeBytes: 1, extension: null }]`,
      '}',
      'process.stdout.write(JSON.stringify(event) + "\\n")',
    ].join('\n'),
    'utf8'
  )
  await fs.promises.writeFile(
    fakeScannerCmd,
    `@echo off\r\n"${process.execPath}" "${fakeScannerScript}" %*\r\n`,
    'ascii'
  )
  await fs.promises.writeFile(
    manifestPath,
    JSON.stringify(
      {
        scannerPath: fakeScannerCmd,
        rootPath: 'D:\\',
        eventsPath,
        stderrPath,
        exitCodePath
      },
      null,
      2
    ),
    'utf8'
  )

  const helperScriptPath = path.resolve(__dirname, '../../../resources/space-scan/run-elevated-ntfs-fast-scan.ps1')
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helperScriptPath, '-ManifestPath', manifestPath],
    {
      encoding: 'utf8',
      windowsHide: true
    }
  )

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal((await fs.promises.readFile(exitCodePath, 'utf8')).trim(), '0')

  const eventLine = (await fs.promises.readFile(eventsPath, 'utf8')).trim()
  const event = JSON.parse(eventLine)
  assert.equal(event.largestFiles[0].path, expectedPath)
  assert.equal(event.largestFiles[0].name, '软件仓库')
})
