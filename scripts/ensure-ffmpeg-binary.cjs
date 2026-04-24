const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function resolveFfmpegPackageRoot() {
  const packageJsonPath = require.resolve('ffmpeg-static/package.json')
  return path.dirname(packageJsonPath)
}

function ensureBinaryInstalled(packageRoot, binaryPath) {
  if (fs.existsSync(binaryPath)) {
    return
  }

  const installScriptPath = path.join(packageRoot, 'install.js')
  const installResult = spawnSync(process.execPath, [installScriptPath], {
    cwd: packageRoot,
    stdio: 'inherit',
    env: process.env
  })

  if (installResult.status !== 0) {
    throw new Error(`ffmpeg-static install failed with exit code ${installResult.status ?? 'unknown'}`)
  }

  if (!fs.existsSync(binaryPath)) {
    throw new Error(`ffmpeg-static did not produce a binary at ${binaryPath}`)
  }
}

function copyPreparedRuntime(binaryPath, destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
  fs.copyFileSync(binaryPath, destinationPath)
}

function main() {
  const projectRoot = path.resolve(__dirname, '..')
  const packageRoot = resolveFfmpegPackageRoot()
  const binaryPath = require('ffmpeg-static')

  if (!binaryPath || path.extname(binaryPath).toLowerCase() !== '.exe') {
    throw new Error(`Unexpected ffmpeg-static binary path: ${binaryPath || '<empty>'}`)
  }

  ensureBinaryInstalled(packageRoot, binaryPath)

  const preparedRuntimePath = path.join(projectRoot, 'resources', 'ffmpeg', 'ffmpeg.exe')
  copyPreparedRuntime(binaryPath, preparedRuntimePath)

  console.log(`Prepared FFmpeg runtime: ${preparedRuntimePath}`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
