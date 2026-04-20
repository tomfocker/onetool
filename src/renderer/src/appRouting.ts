import type { ToolDefinition } from '../../shared/types'

type ModuleLoader = () => Promise<unknown>
type ModuleRegistry = Record<string, ModuleLoader | undefined>

function getToolModulePath(tool: ToolDefinition): string {
  const componentName = tool.componentPath.split('/').pop()
  const isComponentDir = tool.componentPath.includes('../components/')

  return isComponentDir
    ? `./components/${componentName}.tsx`
    : `./tools/${componentName}.tsx`
}

export function createToolRouteModuleMap(
  tools: ToolDefinition[],
  componentModules: ModuleRegistry,
  toolModules: ModuleRegistry
): Record<string, ModuleLoader> {
  const map: Record<string, ModuleLoader> = {}

  tools.forEach((tool) => {
    const modulePath = getToolModulePath(tool)
    const loader = modulePath.startsWith('./components/')
      ? componentModules[modulePath]
      : toolModules[modulePath]

    if (loader) {
      map[tool.id] = loader
      return
    }

    console.warn(`[Router] Could not find component file for tool: ${tool.id} at path ${modulePath}`)
  })

  const settingsLoader = componentModules['./components/SettingsPage.tsx']
  if (settingsLoader) {
    map.settings = settingsLoader
  }

  return map
}
