import React, { useState, useLayoutEffect, Suspense, useMemo, useCallback } from 'react'
import { ThemeProvider } from '@/context/ThemeContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { TitleBar } from '@/components/TitleBar'
import { Dashboard } from '@/components/Dashboard'
import { ScreenOverlay } from '@/components/ScreenOverlay'
import { ColorPickerOverlay } from '@/components/ColorPickerOverlay'
import { RecorderSelectionOverlay } from '@/tools/ScreenRecorderTool'
import { tools } from '@/data/tools'
import { ToolErrorBoundary } from '@/components/ui/tool-error-boundary'

// 动态导入组件的辅助函数
const loadToolComponent = (path: string) => {
  if (path.startsWith('../components/')) {
    const componentName = path.split('/').pop();
    // 针对 components 目录的动态映射
    if (componentName === 'ConfigChecker') return React.lazy(() => import('./components/ConfigChecker'));
    if (componentName === 'WebActivator') return React.lazy(() => import('./components/WebActivator'));
    if (componentName === 'SettingsPage') return React.lazy(() => import('./components/SettingsPage'));
  }
  // 针对 tools 目录的动态导入
  return React.lazy(() => import(`./tools/${path}`));
};

function AppContent(): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState<string>('dashboard')
  const [searchQuery, setSearchQuery] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [isScreenOverlay, setIsScreenOverlay] = useState(false)
  const [isColorPickerOverlay, setIsColorPickerOverlay] = useState(false)
  const [isRecorderSelection, setIsRecorderSelection] = useState(false)

  const handleToolReset = useCallback(() => {
    setRetryKey(prev => prev + 1)
  }, [])

  // 预加载所有工具组件映射
  const ToolComponentsMap = useMemo(() => {
    const map: Record<string, React.LazyExoticComponent<any>> = {};
    tools.forEach(tool => {
      map[tool.id] = loadToolComponent(tool.componentPath);
    });
    // 补齐非工具类的标准页面
    map['settings'] = React.lazy(() => import('./components/SettingsPage'));
    return map;
  }, []);

  useLayoutEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash
      setIsScreenOverlay(hash.startsWith('#/screen-overlay'))
      setIsColorPickerOverlay(hash.startsWith('#/color-picker-overlay'))
      setIsRecorderSelection(hash.startsWith('#/recorder-selection'))
    }
    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (isScreenOverlay) return <ScreenOverlay />
  if (isColorPickerOverlay) return <ColorPickerOverlay />
  if (isRecorderSelection) return <RecorderSelectionOverlay />

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
    </div>
  )
}

export default function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </ThemeProvider>
  )
}
