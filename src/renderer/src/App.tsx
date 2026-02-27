import React, { useState, useEffect, useLayoutEffect } from 'react'
import { ThemeProvider } from '@/context/ThemeContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { TitleBar } from '@/components/TitleBar'
import { Dashboard } from '@/components/Dashboard'
import { RenameTool } from '@/tools/RenameTool'
import { CapsWriterTool } from '@/tools/CapsWriterTool'
import { QuickInstaller } from '@/tools/QuickInstaller'
import { AutoClickerTool } from '@/tools/AutoClickerTool'
import { SettingsPage } from '@/components/SettingsPage'
import ConfigChecker from '@/components/ConfigChecker'
import ScreenSaverTool from '@/tools/ScreenSaverTool'
import WebActivator from '@/components/WebActivator'
import { ImageProcessorTool } from '@/tools/ImageProcessorTool'
import NetworkRadarTool from '@/tools/NetworkRadarTool'
import ClipboardManager from '@/tools/ClipboardManager'
import { QRCodeTool } from '@/tools/QRCodeTool'
import { ColorPickerTool } from '@/tools/ColorPickerTool'
import { FileDropoverTool } from '@/tools/FileDropoverTool'
import { ScreenOverlay } from '@/components/ScreenOverlay'
import { ColorPickerOverlay } from '@/components/ColorPickerOverlay'
import { ScreenOverlayTranslatorTool } from '@/tools/ScreenOverlayTranslatorTool'
import { ScreenRecorderTool, RecorderSelectionOverlay } from '@/tools/ScreenRecorderTool'
import { SuperScreenshotTool } from '@/tools/SuperScreenshotTool'

function AppContent(): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState<string>('dashboard')
  const [isScreenOverlay, setIsScreenOverlay] = useState(false)
  const [isColorPickerOverlay, setIsColorPickerOverlay] = useState(false)
  const [isRecorderSelection, setIsRecorderSelection] = useState(false)

  useLayoutEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash
      setIsScreenOverlay(hash.startsWith('#/screen-overlay'))
      setIsColorPickerOverlay(hash.startsWith('#/color-picker-overlay'))
      setIsRecorderSelection(hash.startsWith('#/recorder-selection'))
    }

    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)

    const registerShortcutsOnStartup = async () => {
      try {
        const saved = localStorage.getItem('web-activator-v4')
        if (saved) {
          const configs = JSON.parse(saved)
          if (Array.isArray(configs) && configs.length > 0 && window.electron?.webActivator?.registerShortcuts) {
            await window.electron.webActivator.registerShortcuts(configs)
          }
        }
      } catch (e) { console.error('App: Failed to register shortcuts:', e) }
    }
    registerShortcutsOnStartup()

    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (isScreenOverlay) return <ScreenOverlay />
  if (isColorPickerOverlay) return <ColorPickerOverlay />
  if (isRecorderSelection) return <RecorderSelectionOverlay />

  const renderContent = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard onNavigate={setCurrentPage} />
      case 'quick-installer': return <QuickInstaller />
      case 'rename-tool': return <RenameTool />
      case 'autoclicker': return <AutoClickerTool />
      case 'capswriter': return <CapsWriterTool />
      case 'web-activator': return <WebActivator />
      case 'flip-clock': return <ScreenSaverTool />
      case 'config-checker': return <ConfigChecker />
      case 'settings': return <SettingsPage />
      case 'image-processor': return <ImageProcessorTool />
      case 'network-radar': return <NetworkRadarTool />
      case 'clipboard-manager': return <ClipboardManager />
      case 'qrcode-tool': return <QRCodeTool />
      case 'color-picker': return <ColorPickerTool />
      case 'file-dropover': return <FileDropoverTool />
      case 'screenshot-tool': return <SuperScreenshotTool />
      case 'screen-recorder': return <ScreenRecorderTool />
      case 'translator': return <ScreenOverlayTranslatorTool />
      default: return <Dashboard onNavigate={setCurrentPage} />
    }
  }

  return (
    <div className='flex h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans selection:bg-primary/10'>
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div className='flex-1 flex flex-col min-w-0 relative'>
        <TitleBar />
        <Header />
        <main className='flex-1 overflow-y-auto overflow-x-hidden p-6 scrollbar-thin'>
          <div className='max-w-[1600px] mx-auto animate-in fade-in duration-500'>
            {renderContent()}
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
