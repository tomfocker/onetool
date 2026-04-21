import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BILIBILI_EXPORT_MODE_VALUES,
  createDefaultBilibiliDownloaderState
} from '../../../shared/bilibiliDownloader'
import type {
  BilibiliDownloadStage,
  BilibiliDownloaderState,
  BilibiliExportMode,
  BilibiliLinkKind,
  BilibiliLoginSession,
  BilibiliParsedItem
} from '../../../shared/types'

type BilibiliQnOption = {
  qn: number
  label: string
  selected: boolean
  available: boolean
}

type LoadedStreamOptions = {
  itemId: string | null
  qnOptions: BilibiliQnOption[]
}

type LoginPollStatus = 'idle' | 'pending' | 'scanned' | 'confirmed'

type DownloadResult = {
  outputPaths: string[]
  tempDirectory: string
} | null

type LoginQrPayload = {
  qrUrl: string
  authCode: string
} | null

function getStageLabel(stage: BilibiliDownloadStage) {
  switch (stage) {
    case 'parsing':
      return '正在解析链接'
    case 'loading-stream-options':
      return '正在加载流信息'
    case 'downloading-video':
      return '正在下载视频流'
    case 'downloading-audio':
      return '正在下载音频流'
    case 'merging':
      return '正在合并 MP4'
    case 'cancelled':
      return '下载已取消'
    case 'completed':
      return '下载完成'
    case 'failed':
      return '任务失败'
    default:
      return '等待操作'
  }
}

function getExportModeLabel(mode: BilibiliExportMode) {
  switch (mode) {
    case 'video-only':
      return '仅视频'
    case 'audio-only':
      return '仅音频'
    case 'split-streams':
      return '音视频分离'
    case 'merge-mp4':
      return '合并 MP4'
    default:
      return mode
  }
}

export function useBilibiliDownloader() {
  const [state, setState] = useState<BilibiliDownloaderState>(createDefaultBilibiliDownloaderState())
  const [linkInput, setLinkInput] = useState('')
  const [outputDirectory, setOutputDirectory] = useState('')
  const [exportMode, setExportMode] = useState<BilibiliExportMode | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [loginPollStatus, setLoginPollStatus] = useState<LoginPollStatus>('idle')
  const [loginQrPayload, setLoginQrPayload] = useState<LoginQrPayload>(null)
  const [loadedStreamOptions, setLoadedStreamOptions] = useState<LoadedStreamOptions>({
    itemId: null,
    qnOptions: []
  })
  const [lastDownloadResult, setLastDownloadResult] = useState<DownloadResult>(null)
  const hasBootstrappedRef = useRef(false)

  const applyState = useCallback((nextState: BilibiliDownloaderState) => {
    setState(nextState)
  }, [])

  const mergeLoginSession = useCallback((loginSession: BilibiliLoginSession, error: string | null = null) => {
    setState((current) => ({
      ...current,
      loginSession,
      error
    }))
  }, [])

  const loadStreamOptionsFor = useCallback(async (kind: BilibiliLinkKind, itemId: string) => {
    setPendingAction('load-stream-options')
    const result = await window.electron.bilibiliDownloader.loadStreamOptions(kind, itemId)

    if (result.success && result.data) {
      setLoadedStreamOptions({
        itemId: result.data.itemId,
        qnOptions: result.data.qnOptions
      })
      setExportMode((current) => {
        if (current && result.data?.summary.exportModes[current]?.available) {
          return current
        }

        return result.data?.summary.availableExportModes[0] ?? null
      })
    } else {
      setLoadedStreamOptions({
        itemId,
        qnOptions: []
      })
    }

    setPendingAction(null)
    return result
  }, [])

  const startLogin = useCallback(async () => {
    setPendingAction('start-login')
    const result = await window.electron.bilibiliDownloader.startLogin()

    if (result.success && result.data) {
      setLoginQrPayload(result.data)
      setLoginPollStatus('pending')
    }

    setPendingAction(null)
    return result
  }, [])

  const pollLogin = useCallback(async () => {
    setPendingAction('poll-login')
    const result = await window.electron.bilibiliDownloader.pollLogin()

    if (result.success && result.data) {
      setLoginPollStatus(result.data.status)
      if (result.data.loginSession) {
        mergeLoginSession(result.data.loginSession, null)
      }
      if (result.data.status === 'confirmed') {
        setLoginQrPayload(null)
      }
    } else if (result.error?.toLowerCase().includes('expired')) {
      setLoginQrPayload(null)
      setLoginPollStatus('idle')
    }

    setPendingAction(null)
    return result
  }, [mergeLoginSession])

  const logout = useCallback(async () => {
    setPendingAction('logout')
    const result = await window.electron.bilibiliDownloader.logout()

    if (result.success) {
      setLoginQrPayload(null)
      setLoginPollStatus('idle')
    }

    setPendingAction(null)
    return result
  }, [])

  const parseLink = useCallback(async (input?: string) => {
    const normalizedLink = (input ?? linkInput).trim()

    if (!normalizedLink) {
      return { success: false, error: '请先输入 Bilibili 链接' }
    }

    setPendingAction('parse-link')
    setLastDownloadResult(null)
    setLoadedStreamOptions({
      itemId: null,
      qnOptions: []
    })
    setExportMode(null)

    const result = await window.electron.bilibiliDownloader.parseLink(normalizedLink)
    if (result.success && result.data) {
      setLinkInput(normalizedLink)
      setPendingAction(null)
      await loadStreamOptionsFor(result.data.kind, result.data.selectedItemId)
      return result
    }

    setPendingAction(null)
    return result
  }, [linkInput, loadStreamOptionsFor])

  const selectItem = useCallback(async (itemId: string) => {
    if (!state.parsedLink) {
      return { success: false, error: '请先解析链接' }
    }

    if (
      state.streamOptionSummary &&
      state.parsedLink.selectedItemId === itemId &&
      loadedStreamOptions.itemId === itemId &&
      loadedStreamOptions.qnOptions.length > 0
    ) {
      return {
        success: true,
        data: {
          itemId,
          qnOptions: loadedStreamOptions.qnOptions,
          summary: state.streamOptionSummary
        }
      }
    }

    return loadStreamOptionsFor(state.parsedLink.kind, itemId)
  }, [loadStreamOptionsFor, loadedStreamOptions.itemId, loadedStreamOptions.qnOptions, state.parsedLink, state.streamOptionSummary])

  const chooseOutputDirectory = useCallback(async () => {
    setPendingAction('select-output-directory')
    const result = await window.electron.bilibiliDownloader.selectOutputDirectory()

    if (result.success && result.data?.path) {
      setOutputDirectory(result.data.path)
    }

    setPendingAction(null)
    return result
  }, [])

  const startDownload = useCallback(async () => {
    if (!exportMode) {
      return { success: false, error: '请先选择导出方式' }
    }

    setPendingAction('start-download')
    const result = await window.electron.bilibiliDownloader.startDownload(
      exportMode,
      outputDirectory.trim() || undefined
    )

    if (result.success && result.data) {
      setLastDownloadResult(result.data)
    }

    setPendingAction(null)
    return result
  }, [exportMode, outputDirectory])

  const cancelDownload = useCallback(async () => {
    setPendingAction('cancel-download')
    const result = await window.electron.bilibiliDownloader.cancelDownload()
    setPendingAction(null)
    return result
  }, [])

  useEffect(() => {
    if (hasBootstrappedRef.current) {
      return
    }

    hasBootstrappedRef.current = true
    void window.electron.bilibiliDownloader.getSession().then((result) => {
      if (result.data) {
        mergeLoginSession(result.data, result.success ? null : result.error ?? null)
      }
    })
  }, [mergeLoginSession])

  useEffect(() => {
    const unsubscribe = window.electron.bilibiliDownloader.onStateChanged((nextState) => {
      applyState(nextState)
    })

    return () => {
      unsubscribe()
    }
  }, [applyState])

  useEffect(() => {
    if (!state.parsedLink || !state.streamOptionSummary) {
      setLoadedStreamOptions({
        itemId: null,
        qnOptions: []
      })
      setExportMode(null)
      return
    }

    if (loadedStreamOptions.itemId && loadedStreamOptions.itemId !== state.parsedLink.selectedItemId) {
      setLoadedStreamOptions({
        itemId: state.parsedLink.selectedItemId,
        qnOptions: []
      })
    }
  }, [loadedStreamOptions.itemId, state.parsedLink, state.streamOptionSummary])

  useEffect(() => {
    if (state.selection.exportMode) {
      setExportMode(state.selection.exportMode)
    }
  }, [state.selection.exportMode])

  useEffect(() => {
    if (state.loginSession.isLoggedIn) {
      setLoginQrPayload(null)
      setLoginPollStatus('confirmed')
    } else if (!loginQrPayload) {
      setLoginPollStatus('idle')
    }
  }, [loginQrPayload, state.loginSession.isLoggedIn])

  const selectedItem = useMemo<BilibiliParsedItem | null>(() => {
    return state.parsedLink?.items.find((item) => item.id === state.parsedLink?.selectedItemId) ?? null
  }, [state.parsedLink])

  const stageLabel = useMemo(() => getStageLabel(state.taskStage), [state.taskStage])
  const isDownloading =
    state.taskStage === 'downloading-video' ||
    state.taskStage === 'downloading-audio' ||
    state.taskStage === 'merging'
  const isBusy =
    isDownloading ||
    state.taskStage === 'parsing' ||
    state.taskStage === 'loading-stream-options' ||
    pendingAction !== null

  const exportModeOptions = useMemo(() => {
    return BILIBILI_EXPORT_MODE_VALUES.map((mode) => ({
      value: mode,
      label: getExportModeLabel(mode),
      available: state.streamOptionSummary?.exportModes[mode]?.available ?? false,
      disabledReason: state.streamOptionSummary?.exportModes[mode]?.disabledReason ?? null
    }))
  }, [state.streamOptionSummary])

  const loginStatusLabel = useMemo(() => {
    if (state.loginSession.isLoggedIn) {
      return state.loginSession.nickname ? `已登录 ${state.loginSession.nickname}` : '已登录'
    }

    if (loginPollStatus === 'scanned') {
      return '已扫码，等待确认'
    }

    if (loginQrPayload) {
      return '等待扫码登录'
    }

    return '未登录'
  }, [loginPollStatus, loginQrPayload, state.loginSession.isLoggedIn, state.loginSession.nickname])

  return {
    state,
    linkInput,
    outputDirectory,
    exportMode,
    pendingAction,
    loginPollStatus,
    loginQrPayload,
    selectedItem,
    loadedStreamOptions,
    lastDownloadResult,
    stageLabel,
    loginStatusLabel,
    exportModeOptions,
    isBusy,
    isDownloading,
    hasParsedLink: Boolean(state.parsedLink),
    hasMultipleItems: (state.parsedLink?.items.length ?? 0) > 1,
    canPollLogin: Boolean(loginQrPayload) && !state.loginSession.isLoggedIn,
    canStartDownload: Boolean(state.parsedLink && state.streamOptionSummary && exportMode) && !isDownloading,
    setLinkInput,
    setOutputDirectory,
    setExportMode,
    startLogin,
    pollLogin,
    logout,
    parseLink,
    selectItem,
    chooseOutputDirectory,
    startDownload,
    cancelDownload
  }
}
