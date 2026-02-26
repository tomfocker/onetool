import 'react'

interface ClipboardItem {
  id: string
  type: 'text' | 'image'
  content: string
  preview?: string
  timestamp: number
  pinned: boolean
}

type IpcRendererListener = (event: any, ...args: any[]) => void

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        on: (channel: string, listener: IpcRendererListener) => () => void
        once: (channel: string, listener: IpcRendererListener) => () => void
        removeAllListeners: (channel: string) => void
        removeListener: (channel: string, listener: IpcRendererListener) => void
        send: (channel: string, ...args: any[]) => void
        invoke: (channel: string, ...args: any[]) => Promise<any>
        sendSync: (channel: string, ...args: any[]) => any
      }
      webFrame: any
      webUtils: any
      process: {
        platform: string
        versions: { [key: string]: string | undefined }
        env: { [key: string]: string | undefined }
      }
      rename: {
        renameFiles: (files: string[], mode: string, options: any) => Promise<{
          success: boolean
          results?: Array<{
            oldPath: string
            newPath: string
            success: boolean
            error?: string
          }>
          error?: string
        }>
        getFileInfo: (filePaths: string[]) => Promise<{
          success: boolean
          fileInfo?: Array<{
            path: string
            name: string
            size: number
            mtime: Date
          }>
          error?: string
        }>
        selectFilesAndFolders: () => Promise<{
          success: boolean
          canceled: boolean
          filePaths: string[]
          error?: string
        }>
      }
      capswriter: {
        startServer: () => Promise<{ success: boolean; error?: string }>
        startClient: () => Promise<{ success: boolean; error?: string }>
        stopServer: () => Promise<{ success: boolean; error?: string }>
        stopClient: () => Promise<{ success: boolean; error?: string }>
        getStatus: () => Promise<{
          success: boolean
          serverRunning: boolean
          clientRunning: boolean
        }>
        startAll: () => Promise<{
          success: boolean
          serverSuccess: boolean
          clientSuccess: boolean
          serverError?: string
          clientError?: string
          error?: string
        }>
        stopAll: () => Promise<{ success: boolean; error?: string }>
      }
      quickInstaller: {
        installSoftware: (softwareList: { id: string; name: string; source: string }[]) => Promise<{ success: boolean; error?: string }>
        onInstallLog: (callback: (data: { type: 'stdout' | 'stderr' | 'info' | 'error' | 'success'; message: string }) => void) => () => void
        onInstallProgress: (callback: (data: { current: number; total: number; currentName: string }) => void) => () => void
        onInstallComplete: (callback: (data: { success: boolean; message: string }) => void) => () => void
      }
      autoClicker: {
        start: (config: { interval: number; button: string }) => Promise<{ success: boolean; error?: string }>
        stop: () => Promise<{ success: boolean; error?: string }>
        getStatus: () => Promise<{
          running: boolean
          config: {
            interval: number
            button: string
          }
        }>
      }
      autoStart: {
        getStatus: () => Promise<{
          success: boolean
          enabled: boolean
          error?: string
        }>
        set: (enabled: boolean) => Promise<{
          success: boolean
          error?: string
        }>
      }
      systemConfig: {
        getSystemConfig: () => Promise<{
          success: boolean
          config: {
            cpu: string
            motherboard: string
            memory: string
            gpu: string
            monitor: string
            disk: string
            audio: string
            network: string
            os: string
          } | null
          error?: string
        }>
      }
      screenSaver: {
        start: () => Promise<{
          success: boolean
          error?: string
        }>
      }
      webActivator: {
        getWindowList: () => Promise<{
          success: boolean
          windows: Array<{
            id: number
            title: string
            processName: string
          }>
          error?: string
        }>
        toggleWindow: (config: { titlePattern: string; browserType?: string; shortcut?: string }) => Promise<{
          success: boolean
          action?: 'activated' | 'minimized'
          error?: string
        }>
        registerShortcuts: (configs: Array<{ id: string; name: string; titlePattern: string; browserType?: string; shortcut: string }>) => Promise<{
          success: boolean
          error?: string
        }>
        onShortcutTriggered: (callback: (data: { id: string; action: string }) => void) => () => void
      }
      clipboard: {
        getHistory: () => void
        deleteItem: (id: string) => void
        togglePin: (id: string) => void
        clearHistory: () => void
        copyImage: (dataUrl: string) => void
        onChange: (callback: (item: ClipboardItem) => void) => () => void
        onHistory: (callback: (history: ClipboardItem[]) => void) => () => void
      }
      screenRecorder: {
        selectOutput: () => Promise<{
          success: boolean
          canceled: boolean
          filePath: string | null
          error?: string
        }>
        startRecording: (config: {
          outputPath: string
          format: string
          fps?: number
          quality?: string
        }) => Promise<{ success: boolean; error?: string }>
        stopRecording: () => Promise<{ success: boolean; error?: string }>
        getStatus: () => Promise<{ recording: boolean }>
        onStarted: (callback: () => void) => () => void
        onProgress: (callback: (data: { timemark: string }) => void) => () => void
        onStopped: (callback: (data: {
          success: boolean
          outputPath?: string
          error?: string
        }) => void) => () => void
      }
      window: {
        minimize: () => Promise<{ success: boolean }>
        maximize: () => Promise<{ success: boolean; maximized: boolean }>
        close: () => Promise<{ success: boolean }>
        isMaximized: () => Promise<{ maximized: boolean }>
      }
      floatBall: {
        move: (x: number, y: number) => void
        resize: (width: number, height: number) => void
        startDrag: (filePath: string) => void
      }
      screenOverlay: {
        start: () => Promise<{ success: boolean; screenDataUrl?: string; error?: string }>
        close: () => Promise<{ success: boolean; error?: string }>
      }
      colorPicker: {
        enable: () => Promise<{ success: boolean }>
        disable: () => Promise<{ success: boolean }>
        pick: () => Promise<{ success: boolean; color?: { hex: string; rgb: string; r: number; g: number; b: number; x: number; y: number }; error?: string }>
        onUpdate: (callback: (data: { hex: string; rgb: string; r: number; g: number; b: number; x: number; y: number }) => void) => () => void
      }
    }
  }

  interface FileWithPath extends File {
    path: string
  }
}

export {}
