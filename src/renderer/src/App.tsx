import React, { useState, useLayoutEffect, Suspense, useMemo, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { TitleBar } from '@/components/TitleBar'
import { Dashboard } from '@/components/Dashboard'
import { ScreenOverlay } from '@/components/ScreenOverlay'
import { ColorPickerOverlay } from '@/components/ColorPickerOverlay'
import { RecorderSelectionOverlay } from '@/tools/ScreenRecorderTool'
import { ScreenshotSelectionOverlay } from '@/tools/SuperScreenshotTool'
import { tools } from '@/data/tools'
import { ToolErrorBoundary } from '@/components/ui/tool-error-boundary'
import { NotificationContainer } from '@/components/NotificationContainer'

// 自动收集 components 和 tools 目录下的所有常规页面和工具组件
// 使用 eager: false 保持代码分割懒加载策略
const componentModules = import.meta.glob('./components/*.tsx')
const toolModules = import.meta.glob('./tools/*.tsx')

function AppContent(): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState<string>('dashboard')
  const [searchQuery, setSearchQuery] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [isScreenOverlay, setIsScreenOverlay] = useState(false)
  const [isColorPickerOverlay, setIsColorPickerOverlay] = useState(false)
  const [isRecorderSelection, setIsRecorderSelection] = useState(false)
  const [isScreenshotSelection, setIsScreenshotSelection] = useState(false)

  const handleToolReset = useCallback(() => {
    setRetryKey(prev => prev + 1)
  }, [])

  // 通过 import.meta.glob 自动挂载工具路由，不再使用硬编码和危险的模板字符串导入
  const ToolComponentsMap = useMemo(() => {
    const map: Record<string, React.LazyExoticComponent<any>> = {}

    tools.forEach(tool => {
      // 提取文件名，处理遗留的带有路径前缀的情况
      const componentName = tool.componentPath.split('/').pop()
      const isComponentDir = tool.componentPath.includes('../components/')

      const modulePath = isComponentDir
        ? `./components/${componentName}.tsx`
        : `./tools/${componentName}.tsx`

      const loader = isComponentDir ? componentModules[modulePath] : toolModules[modulePath]

      if (loader) {
        map[tool.id] = React.lazy(loader as any)
      } else {
        console.warn(`[Router] Could not find component file for tool: ${tool.id} at path ${modulePath}`)
      }
    })

    // 单独注册不是工具卡片的特定页面
    if (componentModules['./components/SettingsPage.tsx']) {
      map['settings'] = React.lazy(componentModules['./components/SettingsPage.tsx'] as any)
    }

    return map
  }, [])

  useLayoutEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash
      setIsScreenOverlay(hash.startsWith('#/screen-overlay'))
      setIsColorPickerOverlay(hash.startsWith('#/color-picker-overlay'))
      setIsRecorderSelection(hash.startsWith('#/recorder-selection'))
      setIsScreenshotSelection(hash.startsWith('#/screenshot-selection'))
    }
    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)

    // 注册全局系统进程唤出特定工具界面的 IPC 监听
    const unsubOpenTool = window.electron.ipcRenderer.on('open-tool', (toolId: string) => {
      setCurrentPage(toolId)
      setRetryKey(0)
      setSearchQuery('')
    })

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      unsubOpenTool()
    }
  }, [])

  if (isScreenOverlay) return <ScreenOverlay />
  if (isColorPickerOverlay) return <ColorPickerOverlay />
  if (isRecorderSelection) return <RecorderSelectionOverlay />
  if (isScreenshotSelection) return <ScreenshotSelectionOverlay />

  const ActiveComponent = currentPage === 'dashboard' ? Dashboard : ToolComponentsMap[currentPage];

  return (
    <div className='flex h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans selection:bg-primary/10'>
      <Sidebar currentPage={currentPage} onNavigate={(page) => { setCurrentPage(page); setRetryKey(0); setSearchQuery(''); }} />
      <div className='flex-1 flex flex-col min-w-0 relative'>
        <TitleBar />
        <Header showSearch={currentPage === 'dashboard'} searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <main className='flex-1 overflow-y-auto overflow-x-hidden p-6 pt-20 scrollbar-thin'>
          <div className='max-w-[1600px] mx-auto'>
            <Suspense fallback={
              <div className="flex items-center justify-center h-full py-20">
                <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
              </div>
            }>
              <ToolErrorBoundary key={`${currentPage}-${retryKey}`} toolId={currentPage} onReset={handleToolReset}>
                {currentPage === 'dashboard' ? (
                  <Dashboard onNavigate={setCurrentPage} searchTerm={searchQuery} />
                ) : ActiveComponent ? (
                  <ActiveComponent />
                ) : (
                  <div className="text-center py-20 text-muted-foreground">页面不存在</div>
                )}
              </ToolErrorBoundary>
            </Suspense>
          </div>
        </main>
      </div>
      <NotificationContainer />
    </div>
  )
}

export default function App(): React.JSX.Element {
  return <AppContent />
}
