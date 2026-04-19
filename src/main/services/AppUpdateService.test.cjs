const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadAppUpdateServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'AppUpdateService.ts')
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
  const listeners = {}
  let checkForUpdatesCalls = 0
  let downloadUpdateCalls = 0
  let quitAndInstallCalls = 0
  const autoUpdater = overrides.autoUpdater || {
    autoDownload: false,
    checkForUpdatesCalls: 0,
    downloadUpdateCalls: 0,
    quitAndInstallCalls: 0,
    checkForUpdates: async () => {
      checkForUpdatesCalls += 1
      autoUpdater.checkForUpdatesCalls = checkForUpdatesCalls
      return { updateInfo: { version: '1.2.3', releaseNotes: 'Notes' } }
    },
    downloadUpdate: async () => {
      downloadUpdateCalls += 1
      autoUpdater.downloadUpdateCalls = downloadUpdateCalls
    },
    quitAndInstall: async () => {
      quitAndInstallCalls += 1
      autoUpdater.quitAndInstallCalls = quitAndInstallCalls
    },
    on(event, handler) {
      listeners[event] = handler
    },
    emit(event, ...args) {
      listeners[event]?.(...args)
    }
  }

  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return overrides.electronModule || {
        app: {
          isPackaged: false,
          getVersion: () => '1.0.0'
        }
      }
    }

    if (specifier === 'electron-updater') {
      return { autoUpdater }
    }

    if (specifier === '../../shared/types') {
      return {}
    }

    if (specifier === '../../shared/appUpdate') {
      const sharedPath = path.join(__dirname, '../../shared/appUpdate.ts')
      const sharedSource = fs.readFileSync(sharedPath, 'utf8')
      const sharedTranspiled = ts.transpileModule(sharedSource, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          esModuleInterop: true
        },
        fileName: sharedPath
      }).outputText
      const sharedModule = { exports: {} }
      vm.runInNewContext(sharedTranspiled, {
        module: sharedModule,
        exports: sharedModule.exports,
        require,
        __dirname: path.dirname(sharedPath),
        __filename: sharedPath,
        console,
        process,
        Buffer,
        setTimeout,
        clearTimeout
      }, { filename: sharedPath })
      return sharedModule.exports
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

  return {
    ...module.exports,
    autoUpdater,
    listeners,
    getCheckForUpdatesCalls: () => checkForUpdatesCalls,
    getDownloadUpdateCalls: () => downloadUpdateCalls,
    getQuitAndInstallCalls: () => quitAndInstallCalls
  }
}

test('startup auto-check is skipped while the app is unpackaged', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule()
  const service = new AppUpdateService()

  const result = await service.initialize()

  assert.equal(result.success, true)
  assert.equal(autoUpdater.checkForUpdatesCalls, 0)
})

test('checkForUpdates emits checking then available when an update is found', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    autoUpdater: {
      autoDownload: false,
      on(event, handler) {
        this.listeners = this.listeners || {}
        this.listeners[event] = handler
      },
      emit(event, ...args) {
        this.listeners?.[event]?.(...args)
      },
      checkForUpdates: async () => {
        autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
        return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
      },
      downloadUpdate: async () => {},
      quitAndInstall: async () => {}
    }
  })
  const service = new AppUpdateService()
  const states = []

  service.on('state-changed', (state) => {
    states.push(state.status)
  })

  const result = await service.checkForUpdates()

  assert.equal(result.success, true)
  assert.deepEqual(states, ['checking', 'available'])
  assert.equal(service.getState().status, 'available')
  assert.equal(service.getState().latestVersion, '1.2.3')
})

test('checkForUpdates records an error state when the updater throws', async () => {
  const { AppUpdateService } = loadAppUpdateServiceModule({
    autoUpdater: {
      autoDownload: false,
      on(event, handler) {
        this.listeners = this.listeners || {}
        this.listeners[event] = handler
      },
      emit(event, ...args) {
        this.listeners?.[event]?.(...args)
      },
      checkForUpdates: async () => {
        throw new Error('network down')
      },
      downloadUpdate: async () => {},
      quitAndInstall: async () => {}
    }
  })
  const service = new AppUpdateService()
  const states = []

  service.on('state-changed', (state) => {
    states.push(state.status)
  })

  const result = await service.checkForUpdates()

  assert.equal(result.success, false)
  assert.match(result.error, /network down/)
  assert.deepEqual(states, ['checking', 'error'])
  assert.equal(service.getState().status, 'error')
})

test('downloadUpdate refuses before an update is available', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule()
  const service = new AppUpdateService()

  const result = await service.downloadUpdate()

  assert.equal(result.success, false)
  assert.match(result.error, /没有可下载的更新/)
  assert.equal(autoUpdater.downloadUpdateCalls, 0)
  assert.equal(service.getState().status, 'idle')
})

test('update-downloaded marks the service ready to install', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule()
  const service = new AppUpdateService()
  const states = []

  service.on('state-changed', (state) => {
    states.push(state.status)
  })

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  autoUpdater.downloadUpdate = async () => {
    autoUpdater.downloadUpdateCalls += 1
    autoUpdater.emit('download-progress', { percent: 64.8 })
    autoUpdater.emit('update-downloaded', { version: '1.2.3', releaseNotes: 'Release notes' })
  }

  autoUpdater.quitAndInstall = async () => {
    autoUpdater.quitAndInstallCalls += 1
  }

  const checkResult = await service.checkForUpdates()
  const downloadResult = await service.downloadUpdate()
  const installResult = await service.quitAndInstall()

  assert.equal(checkResult.success, true)
  assert.equal(downloadResult.success, true)
  assert.equal(installResult.success, true)
  assert.equal(service.getState().status, 'downloaded')
  assert.equal(service.getState().progressPercent, 100)
  assert.deepEqual(states, ['checking', 'available', 'downloading', 'downloaded'])
  assert.equal(autoUpdater.downloadUpdateCalls, 1)
  assert.equal(autoUpdater.quitAndInstallCalls, 1)
})

test('release notes survive update-downloaded when no new notes are provided', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule()
  const service = new AppUpdateService()

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  autoUpdater.downloadUpdate = async () => {
    autoUpdater.emit('download-progress', { percent: 64.8 })
    autoUpdater.emit('update-downloaded', { version: '1.2.3' })
  }

  await service.checkForUpdates()
  await service.downloadUpdate()

  assert.equal(service.getState().status, 'downloaded')
  assert.equal(service.getState().latestVersion, '1.2.3')
  assert.equal(service.getState().releaseNotes, 'Release notes')
})

test('stray download-progress and update-downloaded events do not move the service from idle', () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule()
  const service = new AppUpdateService()
  const states = []

  service.on('state-changed', (state) => {
    states.push(state.status)
  })

  autoUpdater.emit('download-progress', { percent: 33 })
  autoUpdater.emit('update-downloaded', { version: '1.2.3' })

  assert.equal(service.getState().status, 'idle')
  assert.equal(service.getState().latestVersion, null)
  assert.deepEqual(states, [])
})

test('initialize runs auto-check in packaged production when enabled', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  autoUpdater.checkForUpdatesCalls = 0
  autoUpdater.checkForUpdates = async () => {
    autoUpdater.checkForUpdatesCalls += 1
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }
  const service = new AppUpdateService({
    isDevelopment: false,
    getSettings: async () => ({ autoCheckForUpdates: true })
  })

  const result = await service.initialize()

  assert.equal(result.success, true)
  assert.equal(autoUpdater.checkForUpdatesCalls, 1)
  assert.equal(service.getState().status, 'available')
})

test('initialize skips auto-check in packaged production when disabled', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    isDevelopment: false,
    getSettings: async () => ({ autoCheckForUpdates: false })
  })

  const result = await service.initialize()

  assert.equal(result.success, true)
  assert.equal(autoUpdater.checkForUpdatesCalls, 0)
  assert.equal(service.getState().status, 'idle')
})

test('initialize can retry after a startup settings failure', async () => {
  let attempts = 0
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    isDevelopment: false,
    getSettings: async () => {
      attempts += 1
      if (attempts === 1) {
        throw new Error('settings unavailable')
      }

      return { autoCheckForUpdates: true }
    }
  })

  const first = await service.initialize()
  const second = await service.initialize()

  assert.equal(first.success, false)
  assert.match(first.error, /settings unavailable/)
  assert.equal(second.success, true)
  assert.equal(autoUpdater.checkForUpdatesCalls, 1)
})

test('initialize only runs one startup auto-check when called concurrently', async () => {
  let checkCalls = 0
  const deferred = new Promise((resolve) => {
    setImmediate(resolve)
  })
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    },
    autoUpdater: {
      autoDownload: false,
      on(event, handler) {
        this.listeners = this.listeners || {}
        this.listeners[event] = handler
      },
      emit(event, ...args) {
        this.listeners?.[event]?.(...args)
      },
      checkForUpdates: async () => {
        checkCalls += 1
        autoUpdater.checkForUpdatesCalls = checkCalls
        await deferred
        return { updateInfo: null }
      },
      downloadUpdate: async () => {},
      quitAndInstall: async () => {}
    }
  })
  const service = new AppUpdateService({
    isDevelopment: false,
    getSettings: async () => ({ autoCheckForUpdates: true })
  })

  const first = service.initialize()
  const second = service.initialize()

  await Promise.all([first, second])

  assert.equal(checkCalls, 1)
})
