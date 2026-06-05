const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const rendererRoot = path.join(__dirname, '..')

function readSource(relativePath) {
  return fs.readFileSync(path.join(rendererRoot, relativePath), 'utf8')
}

function extractToolEntries() {
  const source = readSource('data/tools.ts')
  return [...source.matchAll(/id: '([^']+)'[\s\S]*?icon: '([^']+)'/g)]
    .map((match) => ({ id: match[1], icon: match[2] }))
}

function extractObjectBody(source, objectName, nextName) {
  const start = source.indexOf(`const ${objectName}`)
  const end = source.indexOf(nextName, start)
  assert.notEqual(start, -1, `${objectName} should exist`)
  assert.notEqual(end, -1, `${nextName} should follow ${objectName}`)
  return source.slice(start, end)
}

test('dashboard and sidebar map every tool icon from the catalog', () => {
  const tools = extractToolEntries()
  const dashboardSource = readSource('components/Dashboard.tsx')
  const sidebarSource = readSource('components/Sidebar.tsx')
  const dashboardIconMap = extractObjectBody(dashboardSource, 'iconMap', 'const toolGradientMap')
  const sidebarIconMap = extractObjectBody(sidebarSource, 'iconMap', 'const categories')

  const missingDashboardIcons = tools
    .filter((tool) => !new RegExp(`\\b${tool.icon}\\b`).test(dashboardIconMap))
    .map((tool) => `${tool.id}:${tool.icon}`)
  const missingSidebarIcons = tools
    .filter((tool) => !new RegExp(`\\b${tool.icon}\\b`).test(sidebarIconMap))
    .map((tool) => `${tool.id}:${tool.icon}`)

  assert.deepEqual(missingDashboardIcons, [])
  assert.deepEqual(missingSidebarIcons, [])
})

test('dashboard gives every catalog tool an explicit visual accent', () => {
  const tools = extractToolEntries()
  const dashboardSource = readSource('components/Dashboard.tsx')
  const gradientIds = new Set([...dashboardSource.matchAll(/'([^']+)': 'from-/g)].map((match) => match[1]))
  const missingGradients = tools
    .filter((tool) => !gradientIds.has(tool.id))
    .map((tool) => tool.id)

  assert.deepEqual(missingGradients, [])
  assert.doesNotMatch(dashboardSource, /'qr-generator':/)
})
