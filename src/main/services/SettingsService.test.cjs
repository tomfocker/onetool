const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadSettingsServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'SettingsService.ts')
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
      return overrides.electronModule || {
        app: {
          getPath: () => 'C:\\Users\\Test\\AppData\\Roaming\\onetool'
        }
      }
    }

    if (specifier === 'fs') {
      return overrides.fsModule || {
        existsSync: () => false,
        readFileSync: () => '',
        promises: {
          writeFile: async () => undefined
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

test('updateSettings emits changed only after persistence succeeds', async () => {
  const written = []
  const { SettingsService } = loadSettingsServiceModule({
    fsModule: {
      existsSync: () => false,
      readFileSync: () => '',
      promises: {
        writeFile: async (filePath, content) => {
          written.push([filePath, content])
        }
      }
    }
  })

  const service = new SettingsService()
  const changed = []
  service.on('changed', (settings) => {
    changed.push(settings.autoCheckForUpdates)
  })

  const result = await service.updateSettings({ autoCheckForUpdates: false })

  assert.equal(result.success, true)
  assert.equal(changed.length, 1)
  assert.equal(changed[0], false)
  assert.equal(service.getSettings().autoCheckForUpdates, false)
  assert.equal(written.length, 1)
})

test('updateSettings returns a failure and rolls back when persistence fails', async () => {
  const { SettingsService } = loadSettingsServiceModule({
    fsModule: {
      existsSync: () => false,
      readFileSync: () => '',
      promises: {
        writeFile: async () => {
          throw new Error('disk full')
        }
      }
    }
  })

  const service = new SettingsService()
  const changed = []
  service.on('changed', (settings) => {
    changed.push(settings.autoCheckForUpdates)
  })

  const result = await service.updateSettings({ autoCheckForUpdates: false })

  assert.equal(result.success, false)
  assert.match(result.error, /disk full/)
  assert.equal(changed.length, 0)
  assert.equal(service.getSettings().autoCheckForUpdates, true)
})

test('overlapping updateSettings calls do not let an older failed write restore stale settings', async () => {
  const writes = []
  let resolveFirstWrite
  let rejectFirstWrite
  let resolveSecondWrite
  const firstWrite = new Promise((resolve, reject) => {
    resolveFirstWrite = resolve
    rejectFirstWrite = reject
  })
  const secondWrite = new Promise((resolve) => {
    resolveSecondWrite = resolve
  })
  const { SettingsService } = loadSettingsServiceModule({
    fsModule: {
      existsSync: () => false,
      readFileSync: () => '',
      promises: {
        writeFile: async (_filePath, content) => {
          writes.push(content)
          if (writes.length === 1) {
            return firstWrite
          }

          return secondWrite
        }
      }
    }
  })

  const service = new SettingsService()
  const first = service.updateSettings({ autoCheckForUpdates: false })
  const second = service.updateSettings({ minimizeToTray: false })

  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(writes.length, 1)
  rejectFirstWrite(new Error('first failed'))

  const firstResult = await first

  assert.equal(firstResult.success, false)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(writes.length, 2)

  resolveSecondWrite()
  const secondResult = await second

  assert.equal(secondResult.success, true)
  assert.equal(service.getSettings().autoCheckForUpdates, true)
  assert.equal(service.getSettings().minimizeToTray, false)
})
