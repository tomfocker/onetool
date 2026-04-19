import type { IpcRenderer, WebUtils } from 'electron'
import { z } from 'zod'
import {
  AutoClickerConfig,
  RecorderSessionUpdate,
  ScreenRecorderConfig,
  WebActivatorToggleSchema,
  WebActivatorShortcutSchema
} from '../shared/ipc-schemas'
import { LocalProxyConfig, WslBackupFormat, WslRestoreMode } from '../shared/types'

type IpcRendererLike = Pick<IpcRenderer, 'invoke' | 'send' | 'on' | 'removeListener'>
type WebUtilsLike = Pick<WebUtils, 'getPathForFile'>

type CreateElectronBridgeDependencies = {
  ipcRenderer: IpcRendererLike
  webUtils: WebUtilsLike
}

interface ClipboardItem {
  id: string
  type: 'text' | 'image'
  content: string
  preview?: string
  timestamp: number
  pinned: boolean
}

function createChannelSubscription(ipcRenderer: IpcRendererLike) {
  return <TArgs extends any[]>(channel: string, callback: (...args: TArgs) => void) => {
    const handler = (_event: unknown, ...args: TArgs) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }
}

export function createElectronBridge({ ipcRenderer, webUtils }: CreateElectronBridgeDependencies) {
  const onChannel = createChannelSubscription(ipcRenderer)

  const renameAPI = {
    renameFiles: (files: string[], mode: string, options: any) => {
      return ipcRenderer.invoke('rename-files', { files, mode, options })
    },
    getFileInfo: (filePaths: string[]) => {
      return ipcRenderer.invoke('get-file-info', filePaths)
    },
    selectFilesAndFolders: () => {
      return ipcRenderer.invoke('select-files-folders')
    },
    getPathForFile: (file: File): string => {
      return webUtils.getPathForFile(file)
    }
  }

  const webUtilsAPI = {
    getPathForFile: (file: File) => {
      return webUtils.getPathForFile(file)
    }
  }

  const capswriterAPI = {
    startServer: () => ipcRenderer.invoke('capswriter-start-server'),
    startClient: () => ipcRenderer.invoke('capswriter-start-client'),
    stopServer: () => ipcRenderer.invoke('capswriter-stop-server'),
    stopClient: () => ipcRenderer.invoke('capswriter-stop-client'),
    getStatus: () => ipcRenderer.invoke('capswriter-get-status'),
    startAll: () => ipcRenderer.invoke('capswriter-start-all'),
    stopAll: () => ipcRenderer.invoke('capswriter-stop-all')
  }

  const quickInstallerAPI = {
    installSoftware: (softwareList: { id: string; name: string; source: string }[]) => {
      return ipcRenderer.invoke('quick-installer-install', softwareList)
    },
    onInstallLog: (callback: (data: { type: 'stdout' | 'stderr' | 'info' | 'error' | 'success'; message: string }) => void) => {
      return onChannel('quick-installer-log', callback)
    },
    onInstallProgress: (callback: (data: { current: number; total: number; currentName: string }) => void) => {
      return onChannel('quick-installer-progress', callback)
    },
    onInstallComplete: (callback: (data: { success: boolean; message: string }) => void) => {
      return onChannel('quick-installer-complete', callback)
    }
  }

  const autoClickerAPI = {
    start: (config: AutoClickerConfig) => ipcRenderer.invoke('autoclicker-start', config),
    stop: () => ipcRenderer.invoke('autoclicker-stop'),
    getStatus: () => ipcRenderer.invoke('autoclicker-status'),
    updateConfig: (config: any) => ipcRenderer.invoke('autoclicker-update-config', config),
    onStarted: (callback: () => void) => onChannel('autoclicker-started', callback),
    onStopped: (callback: () => void) => onChannel('autoclicker-stopped', callback)
  }

  const autoStartAPI = {
    getStatus: () => ipcRenderer.invoke('autostart-get-status'),
    set: (enabled: boolean) => ipcRenderer.invoke('autostart-set', enabled)
  }

  const settingsAPI = {
    getAll: () => ipcRenderer.invoke('settings-get-all'),
    update: (updates: any) => ipcRenderer.invoke('settings-update', updates),
    onChanged: (callback: (newSettings: any) => void) => onChannel('settings-changed', callback)
  }

  const storeAPI = {
    getAll: () => ipcRenderer.invoke('store-get-all'),
    get: (key: string) => ipcRenderer.invoke('store-get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store-set', { key, value }),
    onChanged: (callback: (newStore: any) => void) => onChannel('store-changed', callback)
  }

  const systemConfigAPI = {
    getSystemConfig: () => ipcRenderer.invoke('get-system-config'),
    getRealtimeStats: () => ipcRenderer.invoke('get-realtime-stats'),
    executeCommand: (command: string) => ipcRenderer.invoke('execute-command', command)
  }

  const screenSaverAPI = {
    start: () => ipcRenderer.invoke('start-screen-saver')
  }

  const webActivatorAPI = {
    getWindowList: () => ipcRenderer.invoke('web-activator-get-window-list'),
    toggleWindow: (config: z.infer<typeof WebActivatorToggleSchema>) => ipcRenderer.invoke('web-activator-toggle-window', config),
    registerShortcuts: (configs: Array<z.infer<typeof WebActivatorShortcutSchema>>) => ipcRenderer.invoke('web-activator-register-shortcuts', configs),
    checkVisibility: (configs: Array<{ type: 'app' | 'tab'; pattern: string; hwnd?: number }>) => {
      return ipcRenderer.invoke('web-activator-check-visibility', configs)
    },
    onShortcutTriggered: (callback: (data: { id: string; action: string }) => void) => {
      return onChannel('web-activator-shortcut-triggered', callback)
    }
  }

  const clipboardAPI = {
    getHistory: () => ipcRenderer.send('get-clipboard-history'),
    deleteItem: (id: string) => ipcRenderer.send('delete-clipboard-item', id),
    togglePin: (id: string) => ipcRenderer.send('toggle-clipboard-pin', id),
    clearHistory: () => ipcRenderer.send('clear-clipboard-history'),
    copyImage: (dataUrl: string) => ipcRenderer.send('copy-image-to-clipboard', dataUrl),
    onChange: (callback: (item: ClipboardItem) => void) => onChannel('clipboard-change', callback),
    onHistory: (callback: (history: ClipboardItem[]) => void) => onChannel('clipboard-history', callback),
    getHotkey: () => ipcRenderer.invoke('clipboard-hotkey-get'),
    setHotkey: (hotkey: string) => ipcRenderer.invoke('clipboard-hotkey-set', hotkey)
  }

  const screenRecorderAPI = {
    selectOutput: () => ipcRenderer.invoke('screen-recorder-select-output'),
    startRecording: (config: ScreenRecorderConfig) => ipcRenderer.invoke('screen-recorder-start', config),
    stopRecording: () => ipcRenderer.invoke('screen-recorder-stop'),
    getStatus: () => ipcRenderer.invoke('screen-recorder-status'),
    getDefaultPath: () => ipcRenderer.invoke('screen-recorder-get-default-path'),
    getSession: () => ipcRenderer.invoke('screen-recorder-get-session'),
    getHotkey: () => ipcRenderer.invoke('recorder-hotkey-get'),
    setHotkey: (hotkey: string) => ipcRenderer.invoke('recorder-hotkey-set', hotkey),
    getWindows: () => ipcRenderer.invoke('screen-recorder-get-windows'),
    getScreens: () => ipcRenderer.invoke('screen-recorder-get-screens'),
    prepareSelection: (bounds: { x: number; y: number; width: number; height: number }) => {
      return ipcRenderer.invoke('screen-recorder-prepare-selection', bounds)
    },
    expandPanel: () => ipcRenderer.invoke('screen-recorder-expand-panel'),
    openSelection: () => ipcRenderer.invoke('recorder-selection-open'),
    closeSelection: (bounds: { x: number; y: number; width: number; height: number } | null) => {
      return ipcRenderer.invoke('recorder-selection-close', bounds)
    },
    onStarted: (callback: () => void) => onChannel('screen-recorder-started', callback),
    onProgress: (callback: (data: { timemark: string }) => void) => onChannel('screen-recorder-progress', callback),
    onStopped: (callback: (data: { success: boolean; outputPath?: string; error?: string }) => void) => {
      return onChannel('screen-recorder-stopped', callback)
    },
    onError: (callback: (data: { message: string }) => void) => onChannel('screen-recorder-error', callback),
    onToggleHotkey: (callback: () => void) => onChannel('screen-recorder-toggle-hotkey', callback),
    onSessionUpdated: (callback: (data: RecorderSessionUpdate) => void) => onChannel('screen-recorder-session-updated', callback),
    onIndicatorTimeUpdated: (callback: (time: string) => void) => onChannel('update-time', callback)
  }

  const windowAPI = {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized')
  }

  const floatBallAPI = {
    move: (x: number, y: number) => ipcRenderer.send('floatball-move', { x, y }),
    setPosition: (x: number, y: number) => ipcRenderer.send('floatball-set-position', { x, y }),
    resize: (width: number, height: number) => ipcRenderer.send('floatball-resize', { width, height }),
    startDrag: (filePath: string) => ipcRenderer.send('ondragstart', filePath),
    hideWindow: () => ipcRenderer.send('floatball-hide-window'),
    showWindow: () => ipcRenderer.send('floatball-show-window'),
    setVisible: (visible: boolean) => ipcRenderer.send('floatball-set-visibility', visible),
    getState: () => ipcRenderer.invoke('floatball-get-state'),
    setHotkey: (hotkey: string) => ipcRenderer.invoke('settings-set-floatball-hotkey', hotkey),
    onVisibilityChanged: (callback: (visible: boolean) => void) => onChannel('floatball-visibility-changed', callback)
  }

  const screenOverlayAPI = {
    start: () => ipcRenderer.invoke('screen-overlay-start'),
    close: () => ipcRenderer.invoke('screen-overlay-close'),
    notifyReady: () => ipcRenderer.send('screen-overlay:ready'),
    onScreenshot: (callback: (dataUrl: string) => void) => onChannel('screen-overlay:screenshot', callback)
  }

  const screenshotAPI = {
    getSettings: () => ipcRenderer.invoke('screenshot-settings-get'),
    setSettings: (settings: { savePath: string; autoSave: boolean }) => ipcRenderer.invoke('screenshot-settings-set', settings),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    capture: (bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke('screenshot-capture', bounds),
    saveImage: (dataUrl: string, customPath?: string) => ipcRenderer.invoke('save-image', dataUrl, customPath),
    copyToClipboard: (dataUrl: string) => ipcRenderer.invoke('copy-to-clipboard-image', dataUrl),
    getHotkey: () => ipcRenderer.invoke('screenshot-hotkey-get'),
    setHotkey: (hotkey: string) => ipcRenderer.invoke('screenshot-hotkey-set', hotkey),
    openSelection: (
      restrictBounds?: { x: number; y: number; width: number; height: number } | null,
      enhanced: boolean = false
    ) => ipcRenderer.invoke('screenshot-selection-open', restrictBounds ?? null, enhanced),
    closeSelection: (bounds: { x: number; y: number; width: number; height: number } | null) => {
      return ipcRenderer.invoke('screenshot-selection-close', bounds)
    },
    onTrigger: (callback: () => void) => onChannel('super-screenshot-trigger', callback),
    onSelectionResult: (callback: (bounds: any) => void) => onChannel('screenshot-selection-result', callback)
  }

  const colorPickerAPI = {
    pick: () => ipcRenderer.invoke('color-picker:pick'),
    confirm: (data: any) => ipcRenderer.send('color-picker:confirm-pick', data),
    cancel: () => ipcRenderer.send('color-picker:cancel-pick'),
    notifyReady: () => ipcRenderer.send('color-picker:overlay-ready'),
    onScreenshot: (callback: (dataUrl: string) => void) => onChannel('color-picker:screenshot', callback)
  }

  const networkAPI = {
    ping: (host: string) => ipcRenderer.invoke('network:ping', host),
    pingBatch: (hosts: string[]) => ipcRenderer.invoke('network:ping-batch', hosts),
    getInfo: () => ipcRenderer.invoke('network:get-info'),
    scanLan: (subnet: string) => ipcRenderer.invoke('network:scan-lan', subnet)
  }

  const localProxyAPI = {
    getStatus: () => ipcRenderer.invoke('local-proxy:get-status'),
    setConfig: (config: LocalProxyConfig) => ipcRenderer.invoke('local-proxy:set-config', config),
    disable: () => ipcRenderer.invoke('local-proxy:disable'),
    openSystemSettings: () => ipcRenderer.invoke('local-proxy:open-system-settings')
  }

  const wslAPI = {
    getOverview: () => ipcRenderer.invoke('wsl:get-overview'),
    getBackups: () => ipcRenderer.invoke('wsl:get-backups'),
    setDefault: (name: string) => ipcRenderer.invoke('wsl:set-default', name),
    terminate: (name: string) => ipcRenderer.invoke('wsl:terminate', name),
    shutdownAll: () => ipcRenderer.invoke('wsl:shutdown-all'),
    createBackup: (name: string, format: WslBackupFormat) => ipcRenderer.invoke('wsl:create-backup', name, format),
    deleteBackup: (id: string) => ipcRenderer.invoke('wsl:delete-backup', id),
    restoreBackup: (id: string, mode: WslRestoreMode, targetName?: string) => {
      return ipcRenderer.invoke('wsl:restore-backup', id, mode, targetName)
    },
    reclaimSpace: (name: string) => ipcRenderer.invoke('wsl:reclaim-space', name),
    launchShell: (name: string) => ipcRenderer.invoke('wsl:launch-shell', name)
  }

  const translateAPI = {
    translateImage: (base64Image: string) => ipcRenderer.invoke('translate:image', base64Image)
  }

  const appAPI = {
    onOpenTool: (callback: (toolId: string) => void) => onChannel('open-tool', callback),
    onNotification: (callback: (data: any) => void) => onChannel('app-notification', callback)
  }

  const doctorAPI = {
    runAudit: () => ipcRenderer.invoke('doctor-run-audit')
  }

  return {
    app: appAPI,
    doctor: doctorAPI,
    webUtils: webUtilsAPI,
    rename: renameAPI,
    capswriter: capswriterAPI,
    quickInstaller: quickInstallerAPI,
    autoClicker: autoClickerAPI,
    autoStart: autoStartAPI,
    settings: settingsAPI,
    store: storeAPI,
    systemConfig: systemConfigAPI,
    screenSaver: screenSaverAPI,
    webActivator: webActivatorAPI,
    clipboard: clipboardAPI,
    screenRecorder: screenRecorderAPI,
    window: windowAPI,
    floatBall: floatBallAPI,
    screenOverlay: screenOverlayAPI,
    screenshot: screenshotAPI,
    colorPicker: colorPickerAPI,
    localProxy: localProxyAPI,
    network: networkAPI,
    translate: translateAPI,
    wsl: wslAPI
  }
}
