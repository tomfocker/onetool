import type { IpcRenderer, WebUtils } from 'electron'
import { z } from 'zod'
import {
  AutoClickerConfig,
  RecorderSessionUpdate,
  ScreenRecorderConfig,
  WebActivatorToggleSchema,
  WebActivatorShortcutSchema
} from '../shared/ipc-schemas'
import type { UpdateState } from '../shared/appUpdate'
import type { CalendarEvent, CalendarWidgetBounds, CalendarWidgetState } from '../shared/calendar'
import type { DevEnvironmentId } from '../shared/devEnvironment'
import type { DownloadOrganizerConfig, DownloadOrganizerState } from '../shared/downloadOrganizer'
import type { ModelDownloadRequest, ModelDownloadState } from '../shared/modelDownload'
import type {
  TableOcrChoosePathResult,
  TableOcrRecognizeRequest,
  TableOcrRecognizeResult,
  TableOcrRuntimeStatus
} from '../shared/tableOcr'
import type { SpaceCleanupNode, SpaceCleanupSession } from '../shared/spaceCleanup'
import type {
  RecorderSelectionSessionPayload,
  ScreenshotSelectionSessionPayload
} from '../shared/selectionSession'
import type { TaskbarAppearancePreset } from '../shared/taskbarAppearance'
import type {
  LlmConfigStatus,
  LlmConnectionStatus,
  LlmInsight,
  LlmCalendarAssistantRequest,
  LlmCalendarAssistantResult,
  LlmRenameInputFile,
  LlmRenameSuggestion,
  ScreenOverlayLineResult,
  ScreenOverlayMode,
  ScreenOverlaySessionStartPayload,
  LlmSpaceCleanupSuggestionRequest,
  LlmSystemAnalysisRequest
} from '../shared/llm'
import type {
  BilibiliDownloaderState,
  BilibiliExportMode,
  BilibiliLinkKind,
  BilibiliLoginSession,
  BilibiliParsedLink,
  BilibiliStreamOptionSummary,
  IpcResponse,
  LocalProxyConfig,
  WslBackupFormat,
  WslRestoreMode
} from '../shared/types'

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

  const llmAPI = {
    getConfigStatus: () => ipcRenderer.invoke('llm-get-config-status') as Promise<IpcResponse<LlmConfigStatus>>,
    testConnection: () => ipcRenderer.invoke('llm-test-connection') as Promise<IpcResponse<LlmConnectionStatus>>,
    parseCalendarAssistant: (input: LlmCalendarAssistantRequest) => {
      return ipcRenderer.invoke('llm-parse-calendar-assistant', input) as Promise<IpcResponse<LlmCalendarAssistantResult>>
    },
    analyzeSystem: (input: LlmSystemAnalysisRequest) => {
      return ipcRenderer.invoke('llm-analyze-system', input) as Promise<IpcResponse<LlmInsight>>
    },
    suggestRename: (input: { instructions: string; files: LlmRenameInputFile[] }) => {
      return ipcRenderer.invoke('llm-suggest-rename', input) as Promise<IpcResponse<LlmRenameSuggestion>>
    },
    suggestSpaceCleanup: (input: LlmSpaceCleanupSuggestionRequest) => {
      return ipcRenderer.invoke('llm-suggest-space-cleanup', input) as Promise<IpcResponse<LlmInsight>>
    }
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
    selectOutput: (format: 'mp4' | 'gif' = 'mp4') => ipcRenderer.invoke('screen-recorder-select-output', format),
    startRecording: (config: ScreenRecorderConfig) => ipcRenderer.invoke('screen-recorder-start', config),
    stopRecording: () => ipcRenderer.invoke('screen-recorder-stop'),
    getStatus: () => ipcRenderer.invoke('screen-recorder-status'),
    getDefaultPath: (format: 'mp4' | 'gif' = 'mp4') => ipcRenderer.invoke('screen-recorder-get-default-path', format),
    getSession: () => ipcRenderer.invoke('screen-recorder-get-session'),
    getHotkey: () => ipcRenderer.invoke('recorder-hotkey-get'),
    setHotkey: (hotkey: string) => ipcRenderer.invoke('recorder-hotkey-set', hotkey),
    getWindows: () => ipcRenderer.invoke('screen-recorder-get-windows'),
    getScreens: () => ipcRenderer.invoke('screen-recorder-get-screens'),
    prepareSelection: (bounds: { x: number; y: number; width: number; height: number }) => {
      return ipcRenderer.invoke('screen-recorder-prepare-selection', bounds)
    },
    expandPanel: () => ipcRenderer.invoke('screen-recorder-expand-panel'),
    hideSelectionPreview: () => ipcRenderer.invoke('screen-recorder-hide-selection-preview'),
    moveSelectionBy: (deltaX: number, deltaY: number) => {
      ipcRenderer.send('screen-recorder-move-selection-by', { deltaX, deltaY })
    },
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
    onIndicatorTimeUpdated: (callback: (time: string) => void) => onChannel('update-time', callback),
    onSelectionResult: (callback: (bounds: { x: number; y: number; width: number; height: number } | null) => void) => {
      return onChannel('recorder-selection-result', callback)
    },
    onSelectionSession: (callback: (payload: RecorderSelectionSessionPayload) => void) => {
      return onChannel('recorder-selection:session-start', callback)
    }
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
    beginDrag: (payload: { pointerOffsetX: number; pointerOffsetY: number }) => ipcRenderer.send('floatball-begin-drag', payload),
    dragTo: (payload: { screenX: number; screenY: number }) => ipcRenderer.send('floatball-drag-to', payload),
    endDrag: () => ipcRenderer.invoke('floatball-end-drag', undefined),
    peek: () => ipcRenderer.invoke('floatball-peek', undefined),
    restoreDock: () => ipcRenderer.invoke('floatball-restore-dock', undefined),
    startDrag: (filePath: string) => ipcRenderer.send('ondragstart', filePath),
    hideWindow: () => ipcRenderer.send('floatball-hide-window'),
    showWindow: () => ipcRenderer.send('floatball-show-window'),
    setVisible: (visible: boolean) => ipcRenderer.send('floatball-set-visibility', visible),
    getState: () => ipcRenderer.invoke('floatball-get-state'),
    setHotkey: (hotkey: string) => ipcRenderer.invoke('settings-set-floatball-hotkey', hotkey),
    onVisibilityChanged: (callback: (visible: boolean) => void) => onChannel('floatball-visibility-changed', callback)
  }

  const calendarAPI = {
    getWidgetState: () => ipcRenderer.invoke('calendar-widget-get-state') as Promise<IpcResponse<CalendarWidgetState>>,
    showWidget: () => ipcRenderer.invoke('calendar-widget-show') as Promise<IpcResponse<CalendarWidgetState>>,
    hideWidget: () => ipcRenderer.invoke('calendar-widget-hide') as Promise<IpcResponse<CalendarWidgetState>>,
    toggleWidget: () => ipcRenderer.invoke('calendar-widget-toggle') as Promise<IpcResponse<CalendarWidgetState>>,
    setWidgetBounds: (bounds: CalendarWidgetBounds) => {
      return ipcRenderer.invoke('calendar-widget-set-bounds', bounds) as Promise<IpcResponse<CalendarWidgetState>>
    },
    replaceEvents: (events: CalendarEvent[]) => {
      return ipcRenderer.invoke('calendar-events-replace', events) as Promise<IpcResponse<CalendarEvent[]>>
    },
    onEventsUpdated: (callback: (events: CalendarEvent[]) => void) => onChannel('calendar-events-updated', callback)
  }

  const screenOverlayAPI = {
    start: (mode: ScreenOverlayMode = 'translate') => ipcRenderer.invoke('screen-overlay-start', mode),
    close: () => ipcRenderer.invoke('screen-overlay-close'),
    notifyReady: () => ipcRenderer.send('screen-overlay:ready'),
    onScreenshot: (callback: (dataUrl: string) => void) => onChannel('screen-overlay:screenshot', callback),
    onSessionStart: (callback: (payload: ScreenOverlaySessionStartPayload) => void) => {
      return onChannel('screen-overlay:session-start', callback)
    }
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
    onSelectionResult: (callback: (bounds: any) => void) => onChannel('screenshot-selection-result', callback),
    onSelectionSession: (callback: (payload: ScreenshotSelectionSessionPayload) => void) => {
      return onChannel('screenshot-selection:session-start', callback)
    }
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
    translateImage: (base64Image: string, mode: ScreenOverlayMode = 'translate') => {
      return ipcRenderer.invoke('translate:image', base64Image, mode) as Promise<IpcResponse<ScreenOverlayLineResult[]>>
    }
  }

  const taskbarAppearanceAPI = {
    getStatus: () => ipcRenderer.invoke('taskbar-appearance-get-status'),
    applyPreset: (input: { preset: TaskbarAppearancePreset; intensity: number; tintHex: string }) => {
      return ipcRenderer.invoke('taskbar-appearance-apply-preset', input)
    },
    restoreDefault: () => ipcRenderer.invoke('taskbar-appearance-restore-default')
  }
  const appAPI = {
    onOpenTool: (callback: (toolId: string) => void) => onChannel('open-tool', callback),
    onNotification: (callback: (data: any) => void) => onChannel('app-notification', callback)
  }

  const doctorAPI = {
    runAudit: () => ipcRenderer.invoke('doctor-run-audit')
  }

  const devEnvironmentAPI = {
    getOverview: () => ipcRenderer.invoke('dev-environment-get-overview'),
    refreshAll: () => ipcRenderer.invoke('dev-environment-refresh-all'),
    refreshOne: (id: DevEnvironmentId) => ipcRenderer.invoke('dev-environment-refresh-one', id),
    install: (id: DevEnvironmentId) => ipcRenderer.invoke('dev-environment-install', id),
    update: (id: DevEnvironmentId) => ipcRenderer.invoke('dev-environment-update', id),
    updateAll: () => ipcRenderer.invoke('dev-environment-update-all'),
    openRelatedTool: (id: DevEnvironmentId) => ipcRenderer.invoke('dev-environment-open-related-tool', id),
    onLog: (callback: (data: { type: 'stdout' | 'stderr' | 'info' | 'error' | 'success'; message: string }) => void) => {
      return onChannel('dev-environment-log', callback)
    },
    onProgress: (callback: (data: { current: number; total: number; currentName: string }) => void) => {
      return onChannel('dev-environment-progress', callback)
    },
    onComplete: (callback: (data: { success: boolean; message: string }) => void) => {
      return onChannel('dev-environment-operation-complete', callback)
    }
  }

  const spaceCleanupAPI = {
    chooseRoot: () => ipcRenderer.invoke('space-cleanup-choose-root') as Promise<IpcResponse<{ canceled: boolean; path: string | null }>>,
    startScan: (rootPath: string) => ipcRenderer.invoke('space-cleanup-start-scan', rootPath) as Promise<IpcResponse<SpaceCleanupSession>>,
    cancelScan: () => ipcRenderer.invoke('space-cleanup-cancel-scan') as Promise<IpcResponse<SpaceCleanupSession>>,
    getSession: () => ipcRenderer.invoke('space-cleanup-get-session') as Promise<IpcResponse<SpaceCleanupSession>>,
    scanDirectoryBreakdown: (targetPath: string) => ipcRenderer.invoke('space-cleanup-scan-directory-breakdown', targetPath) as Promise<IpcResponse<SpaceCleanupNode>>,
    openPath: (targetPath: string) => ipcRenderer.invoke('space-cleanup-open-path', targetPath) as Promise<IpcResponse>,
    copyPath: (targetPath: string) => ipcRenderer.invoke('space-cleanup-copy-path', targetPath) as Promise<IpcResponse>,
    deleteToTrash: (targetPath: string) => ipcRenderer.invoke('space-cleanup-delete-to-trash', targetPath) as Promise<IpcResponse>,
    onProgress: (callback: (session: SpaceCleanupSession) => void) => onChannel('space-cleanup-progress', callback),
    onComplete: (callback: (session: SpaceCleanupSession) => void) => onChannel('space-cleanup-complete', callback),
    onError: (callback: (session: SpaceCleanupSession) => void) => onChannel('space-cleanup-error', callback)
  }

  const updatesAPI = {
    getState: () => ipcRenderer.invoke('updates-get-state'),
    checkForUpdates: () => ipcRenderer.invoke('updates-check'),
    downloadUpdate: () => ipcRenderer.invoke('updates-download'),
    quitAndInstall: () => ipcRenderer.invoke('updates-quit-and-install'),
    onStateChanged: (callback: (state: UpdateState) => void) => onChannel('updates-state-changed', callback)
  }

  const downloadOrganizerAPI = {
    getState: () => ipcRenderer.invoke('download-organizer-get-state') as Promise<IpcResponse<DownloadOrganizerState>>,
    updateConfig: (updates: Partial<DownloadOrganizerConfig>) => {
      return ipcRenderer.invoke('download-organizer-update-config', updates) as Promise<IpcResponse<DownloadOrganizerState>>
    },
    preview: () => ipcRenderer.invoke('download-organizer-preview') as Promise<IpcResponse<DownloadOrganizerState>>,
    applyPreview: () => ipcRenderer.invoke('download-organizer-apply-preview') as Promise<IpcResponse<DownloadOrganizerState>>,
    toggleWatch: (enabled: boolean) => {
      return ipcRenderer.invoke('download-organizer-toggle-watch', enabled) as Promise<IpcResponse<DownloadOrganizerState>>
    },
    chooseWatchPath: () => {
      return ipcRenderer.invoke('download-organizer-choose-watch-path') as Promise<IpcResponse<{ canceled: boolean; path: string | null }>>
    },
    chooseDestinationRoot: () => {
      return ipcRenderer.invoke('download-organizer-choose-destination-root') as Promise<IpcResponse<{ canceled: boolean; path: string | null }>>
    },
    onStateChanged: (callback: (state: DownloadOrganizerState) => void) => onChannel('download-organizer-state-changed', callback)
  }

  const modelDownloadAPI = {
    getState: () => ipcRenderer.invoke('model-download-get-state') as Promise<IpcResponse<ModelDownloadState>>,
    startDownload: (request: ModelDownloadRequest) => {
      return ipcRenderer.invoke('model-download-start', request) as Promise<IpcResponse<ModelDownloadState>>
    },
    cancelDownload: () => ipcRenderer.invoke('model-download-cancel') as Promise<IpcResponse<ModelDownloadState>>,
    chooseSavePath: () => {
      return ipcRenderer.invoke('model-download-choose-save-path') as Promise<IpcResponse<{ canceled: boolean; path: string | null }>>
    },
    openPath: (targetPath?: string) => {
      return ipcRenderer.invoke('model-download-open-path', targetPath) as Promise<IpcResponse<{ targetPath: string }>>
    },
    onStateChanged: (callback: (state: ModelDownloadState) => void) => onChannel('model-download-state-changed', callback)
  }

  const tableOcrAPI = {
    getStatus: () => ipcRenderer.invoke('table-ocr-get-status') as Promise<IpcResponse<TableOcrRuntimeStatus>>,
    prepareRuntime: () => {
      return ipcRenderer.invoke('table-ocr-prepare-runtime') as Promise<IpcResponse<TableOcrRuntimeStatus>>
    },
    cancelPrepare: () => {
      return ipcRenderer.invoke('table-ocr-cancel-prepare') as Promise<IpcResponse<TableOcrRuntimeStatus>>
    },
    recognize: (request: TableOcrRecognizeRequest) => {
      return ipcRenderer.invoke('table-ocr-recognize', request) as Promise<IpcResponse<TableOcrRecognizeResult>>
    },
    chooseImage: () => {
      return ipcRenderer.invoke('table-ocr-choose-image') as Promise<IpcResponse<TableOcrChoosePathResult>>
    },
    chooseOutputDirectory: () => {
      return ipcRenderer.invoke('table-ocr-choose-output-dir') as Promise<IpcResponse<TableOcrChoosePathResult>>
    },
    openPath: (targetPath: string) => {
      return ipcRenderer.invoke('table-ocr-open-path', targetPath) as Promise<IpcResponse<{ targetPath: string }>>
    },
    onStateChanged: (callback: (state: TableOcrRuntimeStatus) => void) => onChannel('table-ocr-state-changed', callback)
  }

  const bilibiliDownloaderAPI = {
    getSession: () => ipcRenderer.invoke('bilibili-downloader-get-session') as Promise<IpcResponse<BilibiliLoginSession>>,
    startLogin: () => {
      return ipcRenderer.invoke('bilibili-downloader-start-login') as Promise<IpcResponse<{ qrUrl: string; authCode: string }>>
    },
    pollLogin: () => {
      return ipcRenderer.invoke('bilibili-downloader-poll-login') as Promise<IpcResponse<{
        status: 'pending' | 'scanned' | 'confirmed'
        loginSession?: BilibiliLoginSession
      }>>
    },
    logout: () => ipcRenderer.invoke('bilibili-downloader-logout') as Promise<IpcResponse>,
    parseLink: (link: string) => {
      return ipcRenderer.invoke('bilibili-downloader-parse-link', { link }) as Promise<IpcResponse<BilibiliParsedLink>>
    },
    loadStreamOptions: (kind: BilibiliLinkKind, itemId: string) => {
      return ipcRenderer.invoke('bilibili-downloader-load-stream-options', { kind, itemId }) as Promise<IpcResponse<{
        itemId: string
        qnOptions: Array<{
          qn: number
          label: string
          selected: boolean
          available: boolean
        }>
        summary: BilibiliStreamOptionSummary
      }>>
    },
    startDownload: (exportMode: BilibiliExportMode, outputDirectory?: string) => {
      return ipcRenderer.invoke('bilibili-downloader-start-download', { exportMode, outputDirectory }) as Promise<IpcResponse<{
        outputPaths: string[]
        tempDirectory: string
      }>>
    },
    cancelDownload: () => ipcRenderer.invoke('bilibili-downloader-cancel-download') as Promise<IpcResponse>,
    selectOutputDirectory: () => {
      return ipcRenderer.invoke('bilibili-downloader-select-output-directory') as Promise<IpcResponse<{ canceled: boolean; path: string | null }>>
    },
    onStateChanged: (callback: (state: BilibiliDownloaderState) => void) => onChannel('bilibili-downloader-state-changed', callback)
  }

  return {
    app: appAPI,
    bilibiliDownloader: bilibiliDownloaderAPI,
    doctor: doctorAPI,
    devEnvironment: devEnvironmentAPI,
    downloadOrganizer: downloadOrganizerAPI,
    modelDownload: modelDownloadAPI,
    tableOcr: tableOcrAPI,
    spaceCleanup: spaceCleanupAPI,
    updates: updatesAPI,
    webUtils: webUtilsAPI,
    rename: renameAPI,
    quickInstaller: quickInstallerAPI,
    autoClicker: autoClickerAPI,
    autoStart: autoStartAPI,
    llm: llmAPI,
    settings: settingsAPI,
    store: storeAPI,
    systemConfig: systemConfigAPI,
    screenSaver: screenSaverAPI,
    webActivator: webActivatorAPI,
    clipboard: clipboardAPI,
    screenRecorder: screenRecorderAPI,
    window: windowAPI,
    floatBall: floatBallAPI,
    calendar: calendarAPI,
    screenOverlay: screenOverlayAPI,
    screenshot: screenshotAPI,
    colorPicker: colorPickerAPI,
    localProxy: localProxyAPI,
    network: networkAPI,
    translate: translateAPI,
    taskbarAppearance: taskbarAppearanceAPI,
    wsl: wslAPI
  }
}

