const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadAppRoutingModule() {
  const filePath = path.join(__dirname, 'appRouting.ts')
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

  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require,
    __dirname,
    __filename: filePath,
    console,
    process
  }, { filename: filePath })

  return module.exports
}

function loadToolsModule() {
  const filePath = path.join(__dirname, 'data', 'tools.ts')
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

  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require,
    __dirname: path.dirname(filePath),
    __filename: filePath,
    console,
    process
  }, { filename: filePath })

  return module.exports
}

const { createToolRouteModuleMap } = loadAppRoutingModule()
const { tools: actualTools } = loadToolsModule()

const tools = [
  {
    id: 'quick-installer',
    componentPath: 'QuickInstaller'
  },
  {
    id: 'screenshot-tool',
    componentPath: 'SuperScreenshotTool'
  },
  {
    id: 'screen-recorder',
    componentPath: 'ScreenRecorderTool'
  },
  {
    id: 'web-activator',
    componentPath: '../components/WebActivator'
  }
]

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value))
}

function captureWarnings(run) {
  const warnings = []
  const originalWarn = console.warn
  console.warn = (message) => {
    warnings.push(String(message))
  }

  try {
    return {
      result: run(),
      warnings
    }
  } finally {
    console.warn = originalWarn
  }
}

test('createToolRouteModuleMap keeps screenshot and recorder tools routable in the main shell', () => {
  const { result: map, warnings } = captureWarnings(() => createToolRouteModuleMap(tools, {
    './components/ConfigChecker.tsx': () => 'config',
    './components/SettingsPage.tsx': () => 'settings',
    './components/WebActivator.tsx': () => 'web-activator'
  }, {
    './tools/QuickInstaller.tsx': () => 'quick-installer',
    './tools/NetworkRadarTool.tsx': () => 'network-radar',
    './tools/LocalProxyManagerTool.tsx': () => 'local-proxy-manager',
    './tools/WslManagerTool.tsx': () => 'wsl-manager',
    './tools/RenameTool.tsx': () => 'rename-tool',
    './tools/ClipboardManager.tsx': () => 'clipboard-manager',
    './tools/FileDropoverTool.tsx': () => 'file-dropover',
    './tools/SuperScreenshotTool.tsx': () => 'screenshot-tool',
    './tools/ScreenRecorderTool.tsx': () => 'screen-recorder',
    './tools/ColorPickerTool.tsx': () => 'color-picker',
    './tools/ImageProcessorTool.tsx': () => 'image-processor',
    './tools/AutoClickerTool.tsx': () => 'autoclicker',
    './tools/CapsWriterTool.tsx': () => 'capswriter',
    './tools/ScreenOverlayTranslatorTool.tsx': () => 'translator',
    './tools/QRCodeTool.tsx': () => 'qrcode-tool',
    './tools/ScreenSaverTool.tsx': () => 'flip-clock',
    './tools/ServerMonitorTool.tsx': () => 'server-monitor',
    './tools/WindowsManagerTool.tsx': () => 'windows-manager'
  }))

  assert.equal(typeof map['screenshot-tool'], 'function')
  assert.equal(typeof map['screen-recorder'], 'function')
  assert.equal(typeof map.settings, 'function')
  assert.equal(warnings.length, 0)
})

test('createToolRouteModuleMap reports missing modules without dropping valid routes', () => {
  const { result: map, warnings } = captureWarnings(() => createToolRouteModuleMap(tools, {
    './components/ConfigChecker.tsx': () => 'config',
    './components/SettingsPage.tsx': () => 'settings',
    './components/WebActivator.tsx': () => 'web-activator'
  }, {
    './tools/SuperScreenshotTool.tsx': () => 'screenshot-tool',
    './tools/ScreenRecorderTool.tsx': () => 'screen-recorder'
  }))

  assert.deepEqual(
    toPlainObject({
      screenshot: typeof map['screenshot-tool'],
      recorder: typeof map['screen-recorder'],
      settings: typeof map.settings,
      quickInstaller: map['quick-installer'] ?? null
    }),
    {
      screenshot: 'function',
      recorder: 'function',
      settings: 'function',
      quickInstaller: null
    }
  )
  assert.equal(warnings.length, 1)
})

test('tools registry exposes the taskbar appearance tool through the main shell route map', () => {
  const taskbarAppearanceTool = actualTools.find((tool) => tool.id === 'taskbar-appearance')

  assert.ok(taskbarAppearanceTool)
  assert.deepEqual(
    toPlainObject(taskbarAppearanceTool),
    {
      id: 'taskbar-appearance',
      name: '任务栏外观',
      description: '预设任务栏透明、模糊与亚克力效果',
      category: '系统维护',
      icon: 'PanelTop',
      componentPath: 'TaskbarAppearanceTool'
    }
  )

  const { result: map, warnings } = captureWarnings(() => createToolRouteModuleMap([taskbarAppearanceTool], {
    './components/ConfigChecker.tsx': () => 'config',
    './components/SettingsPage.tsx': () => 'settings',
    './components/WebActivator.tsx': () => 'web-activator'
  }, {
    './tools/TaskbarAppearanceTool.tsx': () => 'taskbar-appearance'
  }))

  assert.equal(typeof map['taskbar-appearance'], 'function')
  assert.equal(typeof map.settings, 'function')
  assert.equal(warnings.length, 0)
})
