import React, { useState, useEffect } from 'react'
import { ThemeProvider } from '@/context/ThemeContext'
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
import { ScreenRecorderTool } from '@/tools/ScreenRecorderTool'
import { FileDropoverTool } from '@/tools/FileDropoverTool'
import { ScreenOverlay } from '@/components/ScreenOverlay'
import { ScreenOverlayTranslatorTool } from '@/tools/ScreenOverlayTranslatorTool'

function AppContent(): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState<string>('dashboard')
  const [isScreenOverlay, setIsScreenOverlay] = useState(false)

  useEffect(() => {
    const hash = window.location.hash
    if (hash.startsWith('#/screen-overlay')) {
      setIsScreenOverlay(true)
    }
  }, [])

  if (isScreenOverlay) {
    return <ScreenOverlay />
  }

  const renderContent = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} />
      case 'quick-installer':
        return <QuickInstaller />
      case 'rename-tool':
        return <RenameTool />
      case 'autoclicker':
        return <AutoClickerTool />
      case 'capswriter':
        return <CapsWriterTool />
      case 'web-activator':
        return <WebActivator />
      case 'flip-clock':
        return <ScreenSaverTool />
      case 'config-checker':
        return <ConfigChecker />
      case 'settings':
        return <SettingsPage />
      case 'image-processor':
        return <ImageProcessorTool />
      case 'network-radar':
        return <NetworkRadarTool />
      case 'clipboard-manager':
        return <ClipboardManager />
      case 'qr-generator':
        return <QRCodeTool />
      case 'color-picker':
        return <ColorPickerTool />
      case 'screen-recorder':
        return <ScreenRecorderTool />
      case 'file-dropover':
        return <FileDropoverTool />
      case 'screen-overlay-translator':
        return <ScreenOverlayTranslatorTool />
      default:
        return <QuickInstaller />
    }
  }

  return (
    <div className='min-h-screen bg-background mesh-gradient'>
      <TitleBar />
      <Sidebar onNavigate={setCurrentPage} />
      <Header />
      <main className='ml-64 pt-20 p-8 relative z-10'>
        {renderContent()}
      </main>
    </div>
  )
}

function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

export default App
