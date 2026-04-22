const fs = require('node:fs/promises')
const path = require('node:path')

async function removeIfExists(targetPath) {
  try {
    await fs.rm(targetPath, { force: true })
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      throw error
    }
  }
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  const keyListenerBinDir = path.join(
    context.appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'node-global-key-listener',
    'bin'
  )

  await removeIfExists(path.join(keyListenerBinDir, 'MacKeyServer'))
  await removeIfExists(path.join(keyListenerBinDir, 'X11KeyServer'))
}
