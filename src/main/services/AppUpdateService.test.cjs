const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value))
}

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

test('AppUpdateService disables auto-install-on-app-quit in updater setup', () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule()
  new AppUpdateService()

  assert.equal(autoUpdater.autoInstallOnAppQuit, false)
})

test('checkForUpdates emits checking then available when an update is found', async () => {
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
        autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
        return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
      },
      downloadUpdate: async () => {},
      quitAndInstall: async () => {}
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })
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
        throw new Error('network down')
      },
      downloadUpdate: async () => {},
      quitAndInstall: async () => {}
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })
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

test('failed re-check preserves available update metadata', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  await service.checkForUpdates()

  autoUpdater.checkForUpdates = async () => {
    throw new Error('network down')
  }

  const result = await service.checkForUpdates()

  assert.equal(result.success, false)
  assert.match(result.error, /network down/)
  assert.deepEqual(toPlainObject(service.getState()), {
    status: 'error',
    currentVersion: '1.0.0',
    latestVersion: '1.2.3',
    releaseNotes: 'Release notes',
    progressPercent: null,
    errorMessage: 'network down'
  })
})

test('failed re-check preserves downloaded update metadata', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  autoUpdater.downloadUpdate = async () => {
    autoUpdater.emit('download-progress', { percent: 64.8 })
    autoUpdater.emit('update-downloaded', { version: '1.2.3', releaseNotes: 'Release notes' })
  }

  await service.checkForUpdates()
  await service.downloadUpdate()

  autoUpdater.checkForUpdates = async () => {
    throw new Error('network down')
  }

  const result = await service.checkForUpdates()

  assert.equal(result.success, false)
  assert.match(result.error, /network down/)
  assert.deepEqual(toPlainObject(service.getState()), {
    status: 'error',
    currentVersion: '1.0.0',
    latestVersion: '1.2.3',
    releaseNotes: 'Release notes',
    progressPercent: 100,
    errorMessage: 'network down'
  })
})

test('successful re-check preserves a downloaded update when no new updateInfo is returned', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  autoUpdater.downloadUpdate = async () => {
    autoUpdater.emit('download-progress', { percent: 64.8 })
    autoUpdater.emit('update-downloaded', { version: '1.2.3', releaseNotes: 'Release notes' })
  }

  await service.checkForUpdates()
  await service.downloadUpdate()

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-not-available')
    return { updateInfo: null }
  }

  const result = await service.checkForUpdates()

  assert.equal(result.success, true)
  assert.deepEqual(toPlainObject(service.getState()), {
    status: 'downloaded',
    currentVersion: '1.0.0',
    latestVersion: '1.2.3',
    releaseNotes: 'Release notes',
    progressPercent: 100,
    errorMessage: null
  })
})

test('successful re-check preserves an in-flight download when no new updateInfo is returned', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  await service.checkForUpdates()
  autoUpdater.emit('download-progress', { percent: 64.8 })

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-not-available')
    return { updateInfo: null }
  }

  const result = await service.checkForUpdates()
  autoUpdater.emit('update-downloaded', { version: '1.2.3', releaseNotes: 'Release notes' })

  assert.equal(result.success, true)
  assert.deepEqual(toPlainObject(service.getState()), {
    status: 'downloaded',
    currentVersion: '1.0.0',
    latestVersion: '1.2.3',
    releaseNotes: 'Release notes',
    progressPercent: 100,
    errorMessage: null
  })
})

test('same-version update-available during re-check keeps a downloaded update installable', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  autoUpdater.downloadUpdate = async () => {
    autoUpdater.emit('download-progress', { percent: 64.8 })
    autoUpdater.emit('update-downloaded', { version: '1.2.3', releaseNotes: 'Release notes' })
  }

  await service.checkForUpdates()
  await service.downloadUpdate()

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  const result = await service.checkForUpdates()

  assert.equal(result.success, true)
  assert.deepEqual(toPlainObject(service.getState()), {
    status: 'downloaded',
    currentVersion: '1.0.0',
    latestVersion: '1.2.3',
    releaseNotes: 'Release notes',
    progressPercent: 100,
    errorMessage: null
  })
})

test('same-version update-available during re-check keeps download progress and actionability', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  await service.checkForUpdates()
  autoUpdater.emit('download-progress', { percent: 64.8 })

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  const result = await service.checkForUpdates()

  assert.equal(result.success, true)
  assert.deepEqual(toPlainObject(service.getState()), {
    status: 'downloading',
    currentVersion: '1.0.0',
    latestVersion: '1.2.3',
    releaseNotes: 'Release notes',
    progressPercent: 65,
    errorMessage: null
  })

  autoUpdater.emit('update-downloaded', { version: '1.2.3', releaseNotes: 'Release notes' })

  assert.equal(service.getState().status, 'downloaded')
  assert.equal(service.getState().progressPercent, 100)
})

test('re-check keeps an in-flight download actionable before the updater promise settles', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })
  let releaseCheck
  const deferred = new Promise((resolve) => {
    releaseCheck = resolve
  })

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  await service.checkForUpdates()
  autoUpdater.emit('download-progress', { percent: 64.8 })

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-not-available')
    autoUpdater.emit('update-downloaded', { version: '1.2.3', releaseNotes: 'Release notes' })
    await deferred
    return { updateInfo: null }
  }

  const recheckPromise = service.checkForUpdates()

  assert.deepEqual(toPlainObject(service.getState()), {
    status: 'downloaded',
    currentVersion: '1.0.0',
    latestVersion: '1.2.3',
    releaseNotes: 'Release notes',
    progressPercent: 100,
    errorMessage: null
  })

  releaseCheck()
  const result = await recheckPromise

  assert.equal(result.success, true)
  assert.equal(service.getState().status, 'downloaded')
})

test('re-check keeps a downloaded update installable before the updater promise settles', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })
  let releaseCheck
  const deferred = new Promise((resolve) => {
    releaseCheck = resolve
  })

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  autoUpdater.downloadUpdate = async () => {
    autoUpdater.emit('download-progress', { percent: 64.8 })
    autoUpdater.emit('update-downloaded', { version: '1.2.3', releaseNotes: 'Release notes' })
  }

  await service.checkForUpdates()
  await service.downloadUpdate()

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    await deferred
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  const recheckPromise = service.checkForUpdates()

  assert.deepEqual(toPlainObject(service.getState()), {
    status: 'downloaded',
    currentVersion: '1.0.0',
    latestVersion: '1.2.3',
    releaseNotes: 'Release notes',
    progressPercent: 100,
    errorMessage: null
  })

  releaseCheck()
  const result = await recheckPromise

  assert.equal(result.success, true)
  assert.equal(service.getState().status, 'downloaded')
})

test('re-check keeps an available update actionable before the updater promise settles', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })
  let releaseCheck
  const deferred = new Promise((resolve) => {
    releaseCheck = resolve
  })

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  await service.checkForUpdates()

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-not-available')
    await deferred
    return { updateInfo: null }
  }

  const recheckPromise = service.checkForUpdates()

  assert.deepEqual(toPlainObject(service.getState()), {
    status: 'available',
    currentVersion: '1.0.0',
    latestVersion: '1.2.3',
    releaseNotes: 'Release notes',
    progressPercent: null,
    errorMessage: null
  })

  releaseCheck()
  const result = await recheckPromise

  assert.equal(result.success, true)
  assert.equal(service.getState().status, 'available')
})

test('checkForUpdates deduplicates overlapping calls and shares one updater request', async () => {
  let checkCalls = 0
  let releaseCheck
  const deferred = new Promise((resolve) => {
    releaseCheck = resolve
  })
  const { AppUpdateService } = loadAppUpdateServiceModule({
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
        await deferred
        return { updateInfo: null }
      },
      downloadUpdate: async () => {},
      quitAndInstall: async () => {}
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })

  const first = service.checkForUpdates()
  const second = service.checkForUpdates()
  releaseCheck()

  const [firstResult, secondResult] = await Promise.all([first, second])

  assert.equal(checkCalls, 1)
  assert.equal(firstResult.success, true)
  assert.equal(secondResult.success, true)
})

test('manual checkForUpdates publishes a shared unsupported-runtime state on packaged non-Windows runtimes', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'darwin',
    isDevelopment: false
  })
  const states = []

  service.on('state-changed', (state) => {
    states.push(state)
  })

  const result = await service.checkForUpdates()

  assert.equal(result.success, false)
  assert.match(result.error, /不支持自动更新/)
  assert.equal(autoUpdater.checkForUpdatesCalls, 0)
  assert.equal(service.getState().status, 'error')
  assert.match(service.getState().errorMessage, /不支持自动更新/)
  assert.deepEqual(states.map((state) => state.status), ['error'])
})

test('manual checkForUpdates publishes a shared unsupported-runtime state while unpackaged', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: false,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })

  const result = await service.checkForUpdates()

  assert.equal(result.success, false)
  assert.match(result.error, /不支持自动更新/)
  assert.equal(autoUpdater.checkForUpdatesCalls, 0)
  assert.equal(service.getState().status, 'error')
  assert.match(service.getState().errorMessage, /不支持自动更新/)
})

test('manual checkForUpdates is disabled for portable Windows runtimes', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false,
    env: {
      PORTABLE_EXECUTABLE_FILE: 'D:\\portable\\OneTool.exe'
    }
  })

  const result = await service.checkForUpdates()

  assert.equal(result.success, false)
  assert.match(result.error, /不支持自动更新/)
  assert.equal(autoUpdater.checkForUpdatesCalls, 0)
  assert.equal(service.getState().status, 'error')
})

test('initialize skips auto-check on packaged non-Windows runtimes', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'darwin',
    isDevelopment: false,
    getSettings: async () => ({ autoCheckForUpdates: true })
  })

  const result = await service.initialize()

  assert.equal(result.success, true)
  assert.equal(autoUpdater.checkForUpdatesCalls, 0)
  assert.equal(service.getState().status, 'idle')
})

test('initialize skips auto-check for portable Windows runtimes', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false,
    env: {
      PORTABLE_EXECUTABLE_DIR: 'D:\\portable'
    },
    getSettings: async () => ({ autoCheckForUpdates: true })
  })

  const result = await service.initialize()

  assert.equal(result.success, true)
  assert.equal(autoUpdater.checkForUpdatesCalls, 0)
  assert.equal(service.getState().status, 'idle')
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
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })
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
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })

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

test('downloadUpdate preserves existing metadata when the updater throws', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  autoUpdater.downloadUpdate = async () => {
    autoUpdater.emit('download-progress', { percent: 64.8 })
    throw new Error('download failed')
  }

  await service.checkForUpdates()
  const result = await service.downloadUpdate()

  assert.equal(result.success, false)
  assert.match(result.error, /download failed/)
  assert.deepEqual(toPlainObject(service.getState()), {
    status: 'error',
    currentVersion: '1.0.0',
    latestVersion: '1.2.3',
    releaseNotes: 'Release notes',
    progressPercent: 65,
    errorMessage: 'download failed'
  })
})

test('quitAndInstall preserves a retryable downloaded state when installation fails', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  autoUpdater.downloadUpdate = async () => {
    autoUpdater.emit('download-progress', { percent: 64.8 })
    autoUpdater.emit('update-downloaded', { version: '1.2.3', releaseNotes: 'Release notes' })
  }

  autoUpdater.quitAndInstall = () => {
    throw new Error('install failed')
  }

  await service.checkForUpdates()
  await service.downloadUpdate()
  const firstResult = await service.quitAndInstall()

  autoUpdater.quitAndInstall = () => {
    autoUpdater.quitAndInstallCalls += 1
  }

  const retryResult = await service.quitAndInstall()

  assert.equal(firstResult.success, false)
  assert.match(firstResult.error, /install failed/)
  assert.deepEqual(toPlainObject(service.getState()), {
    status: 'downloaded',
    currentVersion: '1.0.0',
    latestVersion: '1.2.3',
    releaseNotes: 'Release notes',
    progressPercent: 100,
    errorMessage: null
  })
  assert.equal(retryResult.success, true)
  assert.equal(autoUpdater.quitAndInstallCalls, 1)
})

test('quitAndInstall prepares the app to quit before invoking the updater install flow', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })
  const steps = []

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  autoUpdater.downloadUpdate = async () => {
    autoUpdater.emit('download-progress', { percent: 64.8 })
    autoUpdater.emit('update-downloaded', { version: '1.2.3', releaseNotes: 'Release notes' })
  }

  autoUpdater.quitAndInstall = () => {
    steps.push('install')
  }

  service.setBeforeQuitAndInstall(() => {
    steps.push('prepare')
  })

  await service.checkForUpdates()
  await service.downloadUpdate()
  const result = await service.quitAndInstall()

  assert.equal(result.success, true)
  assert.deepEqual(steps, ['prepare', 'install'])
})

test('quitAndInstall rolls back quit preparation when install throws synchronously', async () => {
  const { AppUpdateService, autoUpdater } = loadAppUpdateServiceModule({
    electronModule: {
      app: {
        isPackaged: true,
        getVersion: () => '1.0.0'
      }
    }
  })
  const service = new AppUpdateService({
    platform: 'win32',
    isDevelopment: false
  })
  const steps = []

  autoUpdater.checkForUpdates = async () => {
    autoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: 'Release notes' })
    return { updateInfo: { version: '1.2.3', releaseNotes: 'Release notes' } }
  }

  autoUpdater.downloadUpdate = async () => {
    autoUpdater.emit('download-progress', { percent: 64.8 })
    autoUpdater.emit('update-downloaded', { version: '1.2.3', releaseNotes: 'Release notes' })
  }

  autoUpdater.quitAndInstall = () => {
    steps.push('install')
    throw new Error('install failed')
  }

  service.setBeforeQuitAndInstall(() => {
    steps.push('prepare')
    return () => {
      steps.push('rollback')
    }
  })

  await service.checkForUpdates()
  await service.downloadUpdate()
  const result = await service.quitAndInstall()

  assert.equal(result.success, false)
  assert.match(result.error, /install failed/)
  assert.deepEqual(steps, ['prepare', 'install', 'rollback'])
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

test('default runtime detection treats a packaged Windows app as supported when NODE_ENV is unset', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  delete process.env.NODE_ENV

  try {
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
      return { updateInfo: null }
    }
    const service = new AppUpdateService({
      platform: 'win32',
      getSettings: async () => ({ autoCheckForUpdates: true })
    })

    const result = await service.initialize()

    assert.equal(result.success, true)
    assert.equal(autoUpdater.checkForUpdatesCalls, 1)
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
  }
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

test('shouldTriggerAutoCheckOnSettingsChange only triggers the transition from disabled to enabled in production', async () => {
  const { shouldTriggerAutoCheckOnSettingsChange } = loadAppUpdateServiceModule()

  assert.equal(shouldTriggerAutoCheckOnSettingsChange(false, true, true, false, 'win32'), true)
  assert.equal(shouldTriggerAutoCheckOnSettingsChange(true, true, true, false, 'win32'), false)
  assert.equal(shouldTriggerAutoCheckOnSettingsChange(false, false, true, false, 'win32'), false)
  assert.equal(shouldTriggerAutoCheckOnSettingsChange(false, true, false, false, 'win32'), false)
  assert.equal(shouldTriggerAutoCheckOnSettingsChange(false, true, true, true, 'win32'), false)
  assert.equal(shouldTriggerAutoCheckOnSettingsChange(false, true, true, false, 'darwin'), false)
  assert.equal(shouldTriggerAutoCheckOnSettingsChange(false, true, true, false, 'win32', true), false)
})

test('registerAutoUpdateSettingsChangeHandler follows the real settings changed event path and gates checks to the supported runtime', async () => {
  const { registerAutoUpdateSettingsChangeHandler } = loadAppUpdateServiceModule()
  let win32Handler = null
  let darwinHandler = null
  let portableHandler = null
  let win32CheckCalls = 0
  let darwinCheckCalls = 0
  let portableCheckCalls = 0

  registerAutoUpdateSettingsChangeHandler({
    settingsService: {
      getSettings: () => ({ autoCheckForUpdates: false }),
      on: (_event, handler) => {
        win32Handler = handler
      }
    },
    appUpdateService: {
      checkForUpdates: async () => {
        win32CheckCalls += 1
      }
    },
    runtime: {
      platform: 'win32',
      isPackaged: true,
      isDevelopment: false
    }
  })

  registerAutoUpdateSettingsChangeHandler({
    settingsService: {
      getSettings: () => ({ autoCheckForUpdates: false }),
      on: (_event, handler) => {
        darwinHandler = handler
      }
    },
    appUpdateService: {
      checkForUpdates: async () => {
        darwinCheckCalls += 1
      }
    },
    runtime: {
      platform: 'darwin',
      isPackaged: true,
      isDevelopment: false
    }
  })

  registerAutoUpdateSettingsChangeHandler({
    settingsService: {
      getSettings: () => ({ autoCheckForUpdates: false }),
      on: (_event, handler) => {
        portableHandler = handler
      }
    },
    appUpdateService: {
      checkForUpdates: async () => {
        portableCheckCalls += 1
      }
    },
    runtime: {
      platform: 'win32',
      isPackaged: true,
      isDevelopment: false,
      isPortableWindowsRuntime: true
    }
  })

  win32Handler({ autoCheckForUpdates: false })
  win32Handler({ autoCheckForUpdates: true })
  win32Handler({ autoCheckForUpdates: true })
  darwinHandler({ autoCheckForUpdates: true })
  portableHandler({ autoCheckForUpdates: true })

  assert.equal(win32CheckCalls, 1)
  assert.equal(darwinCheckCalls, 0)
  assert.equal(portableCheckCalls, 0)
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
