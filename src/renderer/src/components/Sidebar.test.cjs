const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadSidebarModule() {
  const filePath = path.join(__dirname, 'Sidebar.tsx')
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: filePath
  }).outputText

  const module = { exports: {} }
  const customRequire = (specifier) => {
    if (specifier === 'react') {
      return { createElement() {}, Fragment: 'fragment' }
    }
    if (specifier === 'react/jsx-runtime') {
      return { jsx() {}, jsxs() {}, Fragment: 'fragment' }
    }
    if (specifier === 'lucide-react') {
      return new Proxy({}, { get: () => function Icon() {} })
    }
    if (specifier === '@/lib/utils') {
      return { cn: (...classes) => classes.filter(Boolean).join(' ') }
    }
    if (specifier === '@/data/tools') {
      return {
        tools: [
          { id: 'quick-installer', name: '极速装机', category: '系统维护', icon: 'Package' },
          { id: 'screen-recorder', name: '屏幕录制', category: '媒体处理', icon: 'Video' },
          { id: 'clipboard-manager', name: '剪贴板', category: '日常办公', icon: 'Clipboard' }
        ]
      }
    }
    if (specifier === '@/store') {
      return { useGlobalStore: () => [] }
    }
    if (specifier === '../../../shared/devEnvironment') {
      return require(path.join(__dirname, '../../../shared/devEnvironment.ts'))
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
    process
  }, { filename: filePath })

  return module.exports
}

const { buildSidebarSections } = loadSidebarModule()

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value))
}

test('buildSidebarSections lifts pinned tools into the top section and removes them from categories', () => {
  const sections = buildSidebarSections(
    [
      { id: 'quick-installer', name: '极速装机', category: '系统维护', icon: 'Package' },
      { id: 'screen-recorder', name: '屏幕录制', category: '媒体处理', icon: 'Video' },
      { id: 'clipboard-manager', name: '剪贴板', category: '日常办公', icon: 'Clipboard' }
    ],
    ['screen-recorder', 'clipboard-manager']
  )

  assert.deepEqual(
    toPlainObject(sections[0].items.map((item) => item.id)),
    ['screen-recorder', 'clipboard-manager']
  )
  assert.equal(
    sections.find((section) => section.id === 'category-媒体处理').items.some((item) => item.id === 'screen-recorder'),
    false
  )
})
