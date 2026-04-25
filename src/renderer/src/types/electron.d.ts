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
  GlobalStore,
  LocalProxyConfig,
  LocalProxyStatus,
  WslBackupFormat,
  WslBackupInfo,
  WslOverview,
  WslRestoreMode,
  WslSpaceReclaimResult,
  AppNotification,
  BilibiliDownloaderState,
  BilibiliExportMode,
  BilibiliLinkKind,
  BilibiliLoginSession,
  BilibiliParsedLink,
  BilibiliStreamOptionSummary
} from '../../../shared/types'
import type { UpdateState } from '../../../shared/appUpdate'
import type { DevEnvironmentId, DevEnvironmentOverview, DevEnvironmentRecord } from '../../../shared/devEnvironment'
import type { ModelDownloadRequest, ModelDownloadState } from '../../../shared/modelDownload'
import type {
  TableOcrChoosePathResult,
  TableOcrRecognizeRequest,
  TableOcrRecognizeResult,
  TableOcrRuntimeStatus
} from '../../../shared/tableOcr'
import type { RecorderBounds, RecorderSelectionPreview, RecorderSessionUpdate } from '../../../shared/ipc-schemas'
import type {
  RecorderSelectionSessionPayload,
  ScreenshotSelectionSessionPayload
} from '../../../shared/selectionSession'
import type { SpaceCleanupNode, SpaceCleanupSession } from '../../../shared/spaceCleanup'
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
} from '../../../shared/llm'

declare global {
  interface Window {
    electron: {
      app: {
        onOpenTool: (callback: (toolId: string) => void) => () => void
        onNotification: (callback: (data: AppNotification) => void) => () => void
      }
      doctor: {
        runAudit: () => Promise<IpcResponse<any>>
      }
      devEnvironment: {
        getOverview: () => Promise<IpcResponse<DevEnvironmentOverview>>
        refreshAll: () => Promise<IpcResponse<DevEnvironmentOverview>>
        refreshOne: (id: DevEnvironmentId) => Promise<IpcResponse<DevEnvironmentRecord>>
        install: (id: DevEnvironmentId) => Promise<IpcResponse>
        update: (id: DevEnvironmentId) => Promise<IpcResponse>
        updateAll: () => Promise<IpcResponse<{ updated: number }>>
        openRelatedTool: (id: DevEnvironmentId) => Promise<IpcResponse<{ toolId: string }>>
        onLog: (callback: (data: { type: 'success' | 'error' | 'info' | 'stdout' | 'stderr'; message: string }) => void) => () => void
        onProgress: (callback: (data: { current: number; total: number; currentName: string }) => void) => () => void
        onComplete: (callback: (data: { success: boolean; message: string }) => void) => () => void
      }
      modelDownload: {
        getState: () => Promise<IpcResponse<ModelDownloadState>>
        startDownload: (request: ModelDownloadRequest) => Promise<IpcResponse<ModelDownloadState>>
        cancelDownload: () => Promise<IpcResponse<ModelDownloadState>>
        chooseSavePath: () => Promise<IpcResponse<{ canceled: boolean; path: string | null }>>
        openPath: (targetPath?: string) => Promise<IpcResponse<{ targetPath: string }>>
        onStateChanged: (callback: (state: ModelDownloadState) => void) => () => void
      }
      tableOcr: {
        getStatus: () => Promise<IpcResponse<TableOcrRuntimeStatus>>
        prepareRuntime: () => Promise<IpcResponse<TableOcrRuntimeStatus>>
        cancelPrepare: () => Promise<IpcResponse<TableOcrRuntimeStatus>>
        recognize: (request: TableOcrRecognizeRequest) => Promise<IpcResponse<TableOcrRecognizeResult>>
        chooseImage: () => Promise<IpcResponse<TableOcrChoosePathResult>>
        chooseOutputDirectory: () => Promise<IpcResponse<TableOcrChoosePathResult>>
        openPath: (targetPath: string) => Promise<IpcResponse<{ targetPath: string }>>
        onStateChanged: (callback: (state: TableOcrRuntimeStatus) => void) => () => void
      }
      spaceCleanup: {
        chooseRoot: () => Promise<IpcResponse<{ canceled: boolean; path: string | null }>>
        startScan: (rootPath: string) => Promise<IpcResponse<SpaceCleanupSession>>
        cancelScan: () => Promise<IpcResponse<SpaceCleanupSession>>
        getSession: () => Promise<IpcResponse<SpaceCleanupSession>>
        scanDirectoryBreakdown: (targetPath: string) => Promise<IpcResponse<SpaceCleanupNode>>
        openPath: (targetPath: string) => Promise<IpcResponse>
        copyPath: (targetPath: string) => Promise<IpcResponse>
        deleteToTrash: (targetPath: string) => Promise<IpcResponse>
        onProgress: (callback: (session: SpaceCleanupSession) => void) => () => void
        onComplete: (callback: (session: SpaceCleanupSession) => void) => () => void
        onError: (callback: (session: SpaceCleanupSession) => void) => () => void
      }
      updates: {
        getState: () => Promise<IpcResponse<UpdateState>>
        checkForUpdates: () => Promise<IpcResponse>
        downloadUpdate: () => Promise<IpcResponse>
        quitAndInstall: () => Promise<IpcResponse>
        onStateChanged: (callback: (state: UpdateState) => void) => () => void
      }
      bilibiliDownloader: {
        getSession: () => Promise<IpcResponse<BilibiliLoginSession>>
        startLogin: () => Promise<IpcResponse<{ qrUrl: string; authCode: string }>>
        pollLogin: () => Promise<IpcResponse<{ status: 'pending' | 'scanned' | 'confirmed'; loginSession?: BilibiliLoginSession }>>
        logout: () => Promise<IpcResponse>
        parseLink: (link: string) => Promise<IpcResponse<BilibiliParsedLink>>
        loadStreamOptions: (kind: BilibiliLinkKind, itemId: string) => Promise<IpcResponse<{
          itemId: string
          qnOptions: Array<{
            qn: number
            label: string
            selected: boolean
            available: boolean
          }>
          summary: BilibiliStreamOptionSummary
        }>>
        startDownload: (exportMode: BilibiliExportMode, outputDirectory?: string) => Promise<IpcResponse<{
          outputPaths: string[]
          tempDirectory: string
        }>>
        cancelDownload: () => Promise<IpcResponse>
        selectOutputDirectory: () => Promise<IpcResponse<{ canceled: boolean; path: string | null }>>
        onStateChanged: (callback: (state: BilibiliDownloaderState) => void) => () => void
      }
      webUtils: {
        getPathForFile: (file: File) => string
      }
      autoClicker: {
        start: (config: { interval: number; button: string }) => Promise<IpcResponse>
        stop: () => Promise<IpcResponse>
        updateConfig: (config: { interval?: number; button?: string; shortcut?: string }) => Promise<IpcResponse>
        getStatus: () => Promise<IpcResponse<{ running: boolean; config: { interval: number; button: string; shortcut?: string } }>>
        onStarted: (callback: () => void) => () => void
        onStopped: (callback: () => void) => () => void
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
      llm: {
        getConfigStatus: () => Promise<IpcResponse<LlmConfigStatus>>
        testConnection: () => Promise<IpcResponse<LlmConnectionStatus>>
        parseCalendarAssistant: (input: LlmCalendarAssistantRequest) => Promise<IpcResponse<LlmCalendarAssistantResult>>
        analyzeSystem: (input: LlmSystemAnalysisRequest) => Promise<IpcResponse<LlmInsight>>
        suggestRename: (input: { instructions: string; files: LlmRenameInputFile[] }) => Promise<IpcResponse<LlmRenameSuggestion>>
        suggestSpaceCleanup: (input: LlmSpaceCleanupSuggestionRequest) => Promise<IpcResponse<LlmInsight>>
      }
      store: {
        getAll: () => Promise<IpcResponse<GlobalStore>>
        get: (key: keyof GlobalStore) => Promise<IpcResponse<any>>
        set: <K extends keyof GlobalStore>(key: K, value: GlobalStore[K]) => Promise<IpcResponse>
        onChanged: (callback: (newStore: GlobalStore) => void) => () => void
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
        getHotkey: () => Promise<IpcResponse<string>>
        setHotkey: (hotkey: string) => Promise<IpcResponse>
      }
      colorPicker: {
        pick: () => Promise<IpcResponse<{ color?: { hex: string; rgb: string; r: number; g: number; b: number; x: number; y: number } }>>
        confirm: (color: { hex: string; rgb: string; r: number; g: number; b: number; x: number; y: number }) => void
        cancel: () => void
        notifyReady: () => void
        onScreenshot: (callback: (dataUrl: string) => void) => () => void
      }
      network: {
        scanLan: (subnet: string) => Promise<IpcResponse<{ devices: LanDevice[] }>>
        getInfo: () => Promise<IpcResponse<{ interfaces: NetworkInterfaceInfo[] }>>
        ping: (host: string) => Promise<IpcResponse<{ time: number | null; alive: boolean }>>
        pingBatch: (hosts: string[]) => Promise<IpcResponse<Array<{ host: string; alive: boolean; time: number | null }>>>
      }
      localProxy: {
        getStatus: () => Promise<IpcResponse<LocalProxyStatus>>
        setConfig: (config: LocalProxyConfig) => Promise<IpcResponse<LocalProxyStatus>>
        disable: () => Promise<IpcResponse<LocalProxyStatus>>
        openSystemSettings: () => Promise<IpcResponse>
      }
      rename: {
        renameFiles: (files: string[], mode: string, options: any) => Promise<IpcResponse<{ results: Array<{ oldPath: string; newPath: string; success: boolean; error?: string }> }>>
        getFileInfo: (filePaths: string[]) => Promise<IpcResponse<{ fileInfo: RenameFileItem[] }>>
        selectFilesAndFolders: () => Promise<IpcResponse<{ canceled: boolean; filePaths: string[] }>>
        getPathForFile: (file: File) => string
      }
      screenOverlay: {
        start: (mode?: ScreenOverlayMode) => Promise<IpcResponse<{ screenDataUrl?: string }>>
        close: () => Promise<IpcResponse>
        notifyReady: () => void
        onScreenshot: (callback: (dataUrl: string) => void) => () => void
        onSessionStart: (callback: (payload: ScreenOverlaySessionStartPayload) => void) => () => void
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
        openSelection: (restrictBounds?: RecorderBounds | null, enhanced?: boolean) => Promise<IpcResponse>
        closeSelection: (bounds: RecorderBounds | null) => Promise<IpcResponse>
        onTrigger: (callback: () => void) => () => void
        onSelectionResult: (callback: (bounds: RecorderBounds | null) => void) => () => void
        onSelectionSession: (callback: (payload: ScreenshotSelectionSessionPayload) => void) => () => void
      }
      screenRecorder: {
        setHotkey: (hotkey: string) => Promise<IpcResponse>
        getHotkey: () => Promise<IpcResponse<string>>
        getWindows: () => Promise<IpcResponse<Array<{ id: string; name: string; thumbnail: string }>>>
        getScreens: () => Promise<IpcResponse<Array<{ id: string; name: string; display_id: string; thumbnail: string }>>>
          getDefaultPath: (format?: 'mp4' | 'gif') => Promise<IpcResponse<string>>
        getSession: () => Promise<IpcResponse<RecorderSessionUpdate>>
        onToggleHotkey: (callback: () => void) => () => void
          selectOutput: (format?: 'mp4' | 'gif') => Promise<IpcResponse<{ canceled: boolean; filePath: string | null }>>
        prepareSelection: (bounds: RecorderBounds) => Promise<IpcResponse<RecorderSelectionPreview>>
        expandPanel: () => Promise<IpcResponse>
        hideSelectionPreview: () => Promise<IpcResponse>
        moveSelectionBy: (deltaX: number, deltaY: number) => void
        openSelection: () => Promise<IpcResponse>
        closeSelection: (bounds: RecorderBounds | null) => Promise<IpcResponse>
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
        onSessionUpdated: (callback: (data: RecorderSessionUpdate) => void) => () => void
        onIndicatorTimeUpdated: (callback: (time: string) => void) => () => void
        onSelectionResult: (callback: (bounds: RecorderBounds | null) => void) => () => void
        onSelectionSession: (callback: (payload: RecorderSelectionSessionPayload) => void) => () => void
      }
      screenSaver: {
        start: () => Promise<IpcResponse>
      }
      systemConfig: {
        getSystemConfig: () => Promise<IpcResponse<SystemConfig>>
        getRealtimeStats: () => Promise<IpcResponse<any>>
        executeCommand: (command: string) => Promise<IpcResponse>
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
        setPosition: (x: number, y: number) => void
        resize: (width: number, height: number) => void
        startDrag: (filePath: string) => void
        hideWindow: () => void
        showWindow: () => void
        setVisible: (visible: boolean) => void
        getState: () => Promise<IpcResponse<{ exists: boolean; visible: boolean }>>
        setHotkey: (hotkey: string) => Promise<IpcResponse>
        onVisibilityChanged: (callback: (visible: boolean) => void) => () => void
      }
      translate: {
        translateImage: (base64Image: string, mode?: ScreenOverlayMode) => Promise<IpcResponse<ScreenOverlayLineResult[]>>
      }
      wsl: {
        getOverview: () => Promise<IpcResponse<WslOverview>>
        getBackups: () => Promise<IpcResponse<WslBackupInfo[]>>
        setDefault: (name: string) => Promise<IpcResponse<WslOverview>>
        terminate: (name: string) => Promise<IpcResponse<WslOverview>>
        shutdownAll: () => Promise<IpcResponse<WslOverview>>
        createBackup: (name: string, format: WslBackupFormat) => Promise<IpcResponse<WslBackupInfo[]>>
        deleteBackup: (id: string) => Promise<IpcResponse<WslBackupInfo[]>>
        restoreBackup: (id: string, mode: WslRestoreMode, targetName?: string) => Promise<IpcResponse<WslOverview>>
        reclaimSpace: (name: string) => Promise<IpcResponse<WslSpaceReclaimResult>>
        launchShell: (name: string) => Promise<IpcResponse>
      }
    }
  }

  interface FileWithPath extends File {
    path: string
  }
}

export { }
