import {
  IpcResponse,
  SystemConfig,
  RenameFileItem,
  ActivatorConfig,
  WindowInfo,
  ClipboardItem,
  NetworkInterfaceInfo,
  LanDevice,
  AppSettings,
  GlobalStore
} from '../../../shared/types'

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        on: (channel: string, func: (...args: any[]) => void) => () => void
        send: (channel: string, ...args: any[]) => void
        invoke: (channel: string, ...args: any[]) => Promise<any>
      }
      webUtils: {
        getPathForFile: (file: File) => string
      }
      autoClicker: {
        start: (config: { interval: number; button: string }) => Promise<IpcResponse>
        stop: () => Promise<IpcResponse>
        updateConfig: (config: { interval?: number; button?: string; shortcut?: string }) => Promise<IpcResponse>
        getStatus: () => Promise<IpcResponse<{ running: boolean; config: { interval: number; button: string; shortcut?: string } }>>
      }
      autoStart: {
        getStatus: () => Promise<IpcResponse<{ enabled: boolean }>>
        set: (enabled: boolean) => Promise<IpcResponse>
      }
      settings: {
        getAll: () => Promise<IpcResponse<AppSettings>>
        update: (updates: Partial<AppSettings>) => Promise<IpcResponse>
        onChanged: (callback: (newSettings: AppSettings) => void) => () => void
      }
      store: {
        getAll: () => Promise<IpcResponse<GlobalStore>>
        get: (key: keyof GlobalStore) => Promise<IpcResponse<any>>
        set: <K extends keyof GlobalStore>(key: K, value: GlobalStore[K]) => Promise<IpcResponse>
        onChanged: (callback: (newStore: GlobalStore) => void) => () => void
      }
      capswriter: {
        startServer: () => Promise<IpcResponse>
        startClient: () => Promise<IpcResponse>
        stopServer: () => Promise<IpcResponse>
        stopClient: () => Promise<IpcResponse>
        getStatus: () => Promise<IpcResponse<{ serverRunning: boolean; clientRunning: boolean }>>
        startAll: () => Promise<IpcResponse<{ serverSuccess: boolean; clientSuccess: boolean; serverError?: string; clientError?: string }>>
        stopAll: () => Promise<IpcResponse>
      }
      quickInstaller: {
        installSoftware: (softwareList: { id: string; name: string; source: string }[]) => Promise<IpcResponse>
        onInstallLog: (callback: (data: { type: 'success' | 'error' | 'info' | 'stdout' | 'stderr'; message: string }) => void) => () => void
        onInstallProgress: (callback: (data: { current: number; total: number; currentName: string }) => void) => () => void
        onInstallComplete: (callback: (data: { success: boolean; message: string }) => void) => () => void
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
      colorPicker: {
        enable: () => Promise<IpcResponse>
        disable: () => Promise<IpcResponse>
        pick: () => Promise<IpcResponse<{ color?: { hex: string; rgb: string; r: number; g: number; b: number; x: number; y: number } }>>
        confirm: (color: { hex: string; rgb: string; r: number; g: number; b: number; x: number; y: number }) => void
        cancel: () => void
        notifyReady: () => void
        onUpdate: (callback: (data: { hex: string; rgb: string; r: number; g: number; b: number; x: number; y: number }) => void) => () => void
        onScreenshot: (callback: (dataUrl: string) => void) => () => void
        onSelected: (callback: (data: any) => void) => () => void
      }
      network: {
        scanLan: (subnet: string) => Promise<IpcResponse<{ devices: LanDevice[] }>>
        getInfo: () => Promise<IpcResponse<{ interfaces: NetworkInterfaceInfo[] }>>
        ping: (host: string) => Promise<IpcResponse<{ time: number | null; alive: boolean }>>
        pingBatch: (hosts: string[]) => Promise<IpcResponse<Array<{ host: string; alive: boolean; time: number | null }>>>
      }
      rename: {
        renameFiles: (files: string[], mode: string, options: any) => Promise<IpcResponse<{ results: Array<{ oldPath: string; newPath: string; success: boolean; error?: string }> }>>
        getFileInfo: (filePaths: string[]) => Promise<IpcResponse<{ fileInfo: RenameFileItem[] }>>
        selectFilesAndFolders: () => Promise<IpcResponse<{ canceled: boolean; filePaths: string[] }>>
        getPathForFile: (file: File) => string
      }
      screenOverlay: {
        start: () => Promise<IpcResponse<{ screenDataUrl?: string }>>
        close: () => Promise<IpcResponse>
        notifyReady: () => void
        onScreenshot: (callback: (dataUrl: string) => void) => () => void
      }
      screenshot: {
        getSettings: () => Promise<IpcResponse<{ savePath: string; autoSave: boolean }>>
        setSettings: (settings: { savePath: string; autoSave: boolean }) => Promise<IpcResponse>
        selectDirectory: () => Promise<IpcResponse<{ canceled: boolean; path: string | null }>>
        capture: (bounds: { x: number; y: number; width: number; height: number }) => Promise<IpcResponse<string>>
        saveImage: (dataUrl: string, customPath?: string) => Promise<IpcResponse<{ filePath?: string; canceled?: boolean }>>
        copyToClipboard: (dataUrl: string) => Promise<IpcResponse>
        getHotkey: () => Promise<IpcResponse<string>>
        setHotkey: (hotkey: string) => Promise<IpcResponse>
      }
      screenRecorder: {
        setHotkey: (hotkey: string) => Promise<IpcResponse>
        getHotkey: () => Promise<IpcResponse<string>>
        getWindows: () => Promise<IpcResponse<Array<{ id: string; name: string; thumbnail: string }>>>
        getScreens: () => Promise<IpcResponse<Array<{ id: string; name: string; display_id: string; thumbnail: string }>>>
        getDefaultPath: () => Promise<IpcResponse<string>>
        onToggleHotkey: (callback: () => void) => () => void
        selectOutput: () => Promise<IpcResponse<{ canceled: boolean; filePath: string | null }>>
        startRecording: (config: {
          outputPath: string
          format: string
          fps?: number
          quality?: string
          bounds?: { x: number; y: number; width: number; height: number }
          windowTitle?: string
          displayId?: string
        }) => Promise<IpcResponse>
        stopRecording: () => Promise<IpcResponse>
        getStatus: () => Promise<IpcResponse<{ recording: boolean }>>
        onStarted: (callback: () => void) => () => void
        onProgress: (callback: (data: { timemark: string }) => void) => () => void
        onStopped: (callback: (data: {
          success: boolean
          outputPath?: string
          error?: string
        }) => void) => () => void
      }
      screenSaver: {
        start: () => Promise<IpcResponse>
      }
      systemConfig: {
        getSystemConfig: () => Promise<IpcResponse<SystemConfig>>
      }
      webActivator: {
        checkVisibility: (configs: ActivatorConfig[]) => Promise<IpcResponse<{ results: boolean[] }>>
        getWindowList: () => Promise<IpcResponse<{ windows: WindowInfo[] }>>
        toggleWindow: (config: { type: 'app' | 'tab'; pattern: string; id?: number }) => Promise<IpcResponse<{ action?: 'activated' | 'minimized' }>>
        registerShortcuts: (configs: ActivatorConfig[]) => Promise<IpcResponse<{ registeredCount: number }>>
        onShortcutTriggered: (callback: (data: { id: string; action: string }) => void) => () => void
      }
      window: {
        minimize: () => Promise<IpcResponse>
        maximize: () => Promise<IpcResponse<{ maximized: boolean }>>
        close: () => Promise<IpcResponse>
        isMaximized: () => Promise<IpcResponse<{ maximized: boolean }>>
      }
      floatBall: {
        move: (x: number, y: number) => void
        resize: (width: number, height: number) => void
        startDrag: (filePath: string) => void
      }
      translate: {
        translateImage: (base64Image: string) => Promise<IpcResponse<{ originalText: string; translatedText: string }>>
      }
    }
  }

  interface FileWithPath extends File {
    path: string
  }
}

export { }
