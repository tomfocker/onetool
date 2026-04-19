const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadWebActivatorServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'WebActivatorService.ts')
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
  const execPowerShell = overrides.execPowerShell || (async () => '')
  const execPowerShellEncoded = overrides.execPowerShellEncoded || (async () => '')
  const electronModule = overrides.electronModule || {
    app: {},
    BrowserWindow: function BrowserWindow() {},
    globalShortcut: { register: () => true, unregister() {} }
  }

  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return electronModule
    }

    if (specifier === '../utils/processUtils') {
      return { execPowerShell, execPowerShellEncoded }
    }

    if (specifier === '../../shared/types') {
      return {}
    }

    if (specifier === './ProcessRegistry') {
      return { processRegistry: {} }
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

function extractBrowserRegex(script) {
  const getProcessMatch = script.match(/ProcessName -match "(\^\([^)]+\)\$)"/)
  if (getProcessMatch) return getProcessMatch[1]

  const variableMatch = script.match(/\$browserNameRegex = "(\^\([^)]+\)\$)"/)
  if (variableMatch) return variableMatch[1]

  return null
}

function decodeEmbeddedConfig(script) {
  const match = script.match(/FromBase64String\("([^"]+)"\)/)
  if (!match) return null

  return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'))
}

test('toggleTab scopes activation to the selected browser window handle', async () => {
  const encodedScripts = []
  const { WebActivatorService } = loadWebActivatorServiceModule({
    execPowerShellEncoded: async (script) => {
      encodedScripts.push(script)
      return 'NOT_FOUND'
    }
  })
  const service = new WebActivatorService()

  await service.toggleTab('Docs', 4242)

  const embeddedConfig = decodeEmbeddedConfig(encodedScripts[0])
  assert.equal(embeddedConfig.hwnd, 4242)
})

test('checkVisibility uses the saved hwnd for tab targets', async () => {
  const encodedScripts = []
  const { WebActivatorService } = loadWebActivatorServiceModule({
    execPowerShellEncoded: async (script) => {
      encodedScripts.push(script)
      return 'false'
    }
  })
  const service = new WebActivatorService()

  await service.checkVisibility([{ type: 'tab', pattern: 'Docs', hwnd: 5151 }])

  const embeddedConfig = decodeEmbeddedConfig(encodedScripts[0])
  assert.equal(embeddedConfig[0].hwnd, 5151)
})

test('getWindowList keeps duplicate titles when hwnd differs', async () => {
  const { WebActivatorService } = loadWebActivatorServiceModule({
    execPowerShell: async () => JSON.stringify([
      { id: 1, title: 'Docs', processName: 'msedge', hwnd: 101, type: 'window' },
      { id: 2, title: 'Docs', processName: 'msedge', hwnd: 202, type: 'window' }
    ]),
    execPowerShellEncoded: async () => '---TAB_JSON_START---[]---TAB_JSON_END---'
  })
  const service = new WebActivatorService()

  const result = await service.getWindowList()

  assert.equal(result.success, true)
  assert.equal(result.data.windows.length, 2)
  assert.deepEqual(Array.from(result.data.windows, (item) => item.hwnd), [101, 202])
})

test('browser discovery, activation, and visibility share the same browser support list', async () => {
  const stdinScripts = []
  const encodedScripts = []
  const { WebActivatorService } = loadWebActivatorServiceModule({
    execPowerShell: async (script) => {
      stdinScripts.push(script)
      return '[]'
    },
    execPowerShellEncoded: async (script) => {
      encodedScripts.push(script)
      if (script.includes('TAB_JSON_START')) {
        return '---TAB_JSON_START---[]---TAB_JSON_END---'
      }

      return 'false'
    }
  })
  const service = new WebActivatorService()

  await service.getWindowList()
  await service.toggleTab('Docs', 6161)
  await service.checkVisibility([{ type: 'tab', pattern: 'Docs', hwnd: 6161 }])

  const discoveryRegex = extractBrowserRegex(encodedScripts[0])
  const activationRegex = extractBrowserRegex(encodedScripts[1])
  const visibilityRegex = extractBrowserRegex(encodedScripts[2])

  assert.equal(discoveryRegex, activationRegex)
  assert.equal(visibilityRegex, activationRegex)
})

test('getWindowList returns a failure when every discovery source throws', async () => {
  const { WebActivatorService } = loadWebActivatorServiceModule({
    execPowerShell: async () => {
      throw new Error('window discovery failed')
    },
    execPowerShellEncoded: async () => {
      throw new Error('tab discovery failed')
    }
  })
  const service = new WebActivatorService()

  const result = await service.getWindowList()

  assert.equal(result.success, false)
  assert.match(result.error, /无法获取窗口列表/)
})

test('checkVisibility returns a failure when the visibility script throws', async () => {
  const { WebActivatorService } = loadWebActivatorServiceModule({
    execPowerShellEncoded: async () => {
      throw new Error('visibility probe failed')
    }
  })
  const service = new WebActivatorService()

  const result = await service.checkVisibility([{ type: 'app', pattern: 'notepad' }])

  assert.equal(result.success, false)
  assert.match(result.error, /无法检测窗口激活状态/)
})
