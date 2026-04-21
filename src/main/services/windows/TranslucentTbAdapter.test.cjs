const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadTranslucentTbAdapterModule() {
  const filePath = path.join(__dirname, 'TranslucentTbAdapter.ts')
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
    if (specifier === '../../utils/processUtils') {
      return {
        execPowerShellEncoded: async () => ''
      }
    }

    if (specifier === 'electron') {
      return {
        app: {
          getPath() {
            return 'C:\\Users\\Admin\\AppData\\Roaming\\onetool'
          }
        }
      }
    }

    return require(specifier)
  }

  vm.runInNewContext(
    transpiled,
    {
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
    },
    { filename: filePath }
  )

  return module.exports
}

test('TranslucentTbAdapter installs the managed helper, writes mapped settings, and launches it on apply', async () => {
  const { TranslucentTbAdapter } = loadTranslucentTbAdapterModule()
  const createdDirectories = []
  const writtenFiles = []
  const powerShellCalls = []
  const spawned = []

  let helperInstalled = false
  let helperRunning = false

  const adapter = new TranslucentTbAdapter({
    userDataPath: 'C:\\Users\\Admin\\AppData\\Roaming\\onetool',
    fsModule: {
      existsSync(targetPath) {
        return helperInstalled && targetPath.endsWith('TranslucentTB.exe')
      }
    },
    fsPromises: {
      async mkdir(targetPath, options) {
        createdDirectories.push({ targetPath, options })
      },
      async writeFile(targetPath, contents) {
        writtenFiles.push({
          targetPath,
          contents: JSON.parse(contents)
        })
      },
      async rm() {}
    },
    execPowerShellEncoded: async (script) => {
      powerShellCalls.push(script)

      if (script.includes('Invoke-WebRequest')) {
        helperInstalled = true
        return 'install-success'
      }

      if (script.includes('running:true-marker')) {
        return helperRunning ? 'running:true-marker' : 'running:false-marker'
      }

      if (script.includes('stop-success')) {
        helperRunning = false
        return 'stop-success'
      }

      return ''
    },
    spawn: (command, args, options) => {
      helperRunning = true
      spawned.push({ command, args, options })
      return {
        unref() {}
      }
    }
  })

  const result = await adapter.applyAppearance({
    preset: 'blur',
    intensity: 60,
    tintHex: '#22446688'
  })

  assert.equal(result.success, true)
  assert.equal(createdDirectories.length >= 1, true)
  assert.equal(
    createdDirectories.every(({ targetPath }) => /taskbar-appearance-helper\\translucenttb$/.test(targetPath)),
    true
  )
  assert.equal(powerShellCalls.some((script) => script.includes('Invoke-WebRequest')), true)
  assert.equal(writtenFiles.length, 1)
  assert.equal(writtenFiles[0].contents.desktop_appearance.accent, 'blur')
  assert.equal(writtenFiles[0].contents.desktop_appearance.color, '#22446688')
  assert.equal(writtenFiles[0].contents.desktop_appearance.blur_radius, 450)
  assert.equal(writtenFiles[0].contents.desktop_appearance.show_line, false)
  assert.equal(writtenFiles[0].contents.hide_tray, true)
  assert.equal(writtenFiles[0].contents.disable_saving, true)
  assert.equal(spawned.length, 1)
  assert.match(spawned[0].command, /TranslucentTB\.exe$/)
  assert.equal(spawned[0].options.detached, true)
  assert.equal(spawned[0].options.windowsHide, true)
})

test('TranslucentTbAdapter maps the transparent preset to the helper clear accent', async () => {
  const { TranslucentTbAdapter } = loadTranslucentTbAdapterModule()
  const writtenFiles = []

  const adapter = new TranslucentTbAdapter({
    userDataPath: 'C:\\Users\\Admin\\AppData\\Roaming\\onetool',
    fsModule: {
      existsSync() {
        return true
      }
    },
    fsPromises: {
      async mkdir() {},
      async writeFile(targetPath, contents) {
        writtenFiles.push({
          targetPath,
          contents: JSON.parse(contents)
        })
      },
      async rm() {}
    },
    execPowerShellEncoded: async (script) => {
      if (script.includes('running:true-marker')) {
        return 'running:true-marker'
      }

      return 'ok'
    },
    spawn: () => {
      throw new Error('spawn should not be called when helper is already running')
    }
  })

  const result = await adapter.applyAppearance({
    preset: 'transparent',
    intensity: 35,
    tintHex: '#AABBCCDD'
  })

  assert.equal(result.success, true)
  assert.equal(writtenFiles.length, 1)
  assert.equal(writtenFiles[0].contents.desktop_appearance.accent, 'clear')
  assert.equal('blur_radius' in writtenFiles[0].contents.desktop_appearance, false)
})

test('TranslucentTbAdapter stops the managed helper and clears its settings on restore', async () => {
  const { TranslucentTbAdapter } = loadTranslucentTbAdapterModule()
  const removedPaths = []
  const powerShellCalls = []

  const adapter = new TranslucentTbAdapter({
    userDataPath: 'C:\\Users\\Admin\\AppData\\Roaming\\onetool',
    fsModule: {
      existsSync(targetPath) {
        return targetPath.endsWith('TranslucentTB.exe') || targetPath.endsWith('settings.json')
      }
    },
    fsPromises: {
      async mkdir() {},
      async writeFile() {},
      async rm(targetPath, options) {
        removedPaths.push({ targetPath, options })
      }
    },
    execPowerShellEncoded: async (script) => {
      powerShellCalls.push(script)

      if (script.includes('stop-success')) {
        return 'stop-success'
      }

      return ''
    },
    spawn: () => {
      throw new Error('spawn should not be called during restore')
    }
  })

  const result = await adapter.restoreDefault()

  assert.equal(result.success, true)
  assert.equal(powerShellCalls.some((script) => script.includes('Stop-Process')), true)
  assert.equal(removedPaths.length, 1)
  assert.match(removedPaths[0].targetPath, /settings\.json$/)
  assert.equal(removedPaths[0].options.force, true)
})
