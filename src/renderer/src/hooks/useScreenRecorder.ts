import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  RecorderBounds,
  RecorderSelectionPreview,
  RecorderSessionUpdate
} from '../../../shared/ipc-schemas'
import {
  ensureRecorderOutputPath,
  getRecorderSelectionValidationError,
  nudgeRecorderBounds
} from '../../../shared/screenRecorderSession'

type RecorderFormat = 'mp4' | 'gif'
type RecorderQuality = 'low' | 'medium' | 'high'
type RecorderMode = 'full' | 'area'
type RecorderSelectionField = keyof RecorderBounds
type ScreenSource = { id: string; name: string; display_id: string; thumbnail: string }
type RecorderSessionDraft = {
  draftMode: RecorderMode
  outputPath: string
}

const INITIAL_SESSION: RecorderSessionUpdate = {
  status: 'idle',
  mode: 'full',
  outputPath: '',
  recordingTime: '00:00:00',
  selectionBounds: null,
  selectionPreviewDataUrl: null,
  selectedDisplayId: null
}

function cloneBounds(bounds: RecorderBounds | null): RecorderBounds | null {
  return bounds ? { ...bounds } : null
}

function getBoundsSignature(bounds: RecorderBounds | null): string {
  if (!bounds) {
    return 'none'
  }

  return `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`
}

export function applyRecorderSessionSnapshot(
  currentDraft: RecorderSessionDraft,
  nextSession: RecorderSessionUpdate
): RecorderSessionDraft {
  return {
    draftMode: nextSession.mode,
    outputPath: nextSession.outputPath || currentDraft.outputPath
  }
}

export function getScreenRecorderViewState(status: RecorderSessionUpdate['status']) {
  const controlsLocked = status === 'recording' || status === 'finishing'

  return {
    controlsLocked,
    showPreStartControls: !controlsLocked,
    showRecordingControls: controlsLocked
  }
}

export function useScreenRecorder() {
  const [outputPath, setOutputPath] = useState('')
  const [format, setFormat] = useState<RecorderFormat>('mp4')
  const [fps, setFps] = useState(30)
  const [quality, setQuality] = useState<RecorderQuality>('medium')
  const [draftMode, setDraftMode] = useState<RecorderMode>('full')
  const [selectedScreen, setSelectedScreen] = useState<ScreenSource | null>(null)
  const [screenList, setScreenList] = useState<ScreenSource[]>([])
  const [session, setSession] = useState<RecorderSessionUpdate>(INITIAL_SESSION)
  const [selectionDraft, setSelectionDraft] = useState<RecorderBounds | null>(null)
  const [selectionDisplayBounds, setSelectionDisplayBounds] = useState<RecorderBounds | null>(null)
  const [isPreparingSelection, setIsPreparingSelection] = useState(false)
  const [recorderHotkey, setRecorderHotkey] = useState('Alt+Shift+R')
  const [isSavingHotkey, setIsSavingHotkey] = useState(false)
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false)
  const hydratedSelectionSignatureRef = useRef<string | null>(null)

  const applyAuthoritativeSession = useCallback((nextSession: RecorderSessionUpdate) => {
    setSession(nextSession)
    setDraftMode((currentDraftMode) => {
      return applyRecorderSessionSnapshot(
        {
          draftMode: currentDraftMode,
          outputPath
        },
        nextSession
      ).draftMode
    })
    setOutputPath((currentOutputPath) => {
      return applyRecorderSessionSnapshot(
        {
          draftMode: nextSession.mode,
          outputPath: currentOutputPath
        },
        nextSession
      ).outputPath
    })
  }, [outputPath])

  const loadScreens = useCallback(async () => {
    if (!window.electron?.screenRecorder?.getScreens) {
      return
    }

    const response = await window.electron.screenRecorder.getScreens()
    if (!response.success || !response.data) {
      return
    }

    const screens = response.data

    setScreenList(screens)
    setSelectedScreen((current) => {
      if (current) {
        const matchedScreen = screens.find((screen) => screen.id === current.id)
        if (matchedScreen) {
          return matchedScreen
        }
      }

      if (session.selectedDisplayId) {
        const matchedByDisplay = screens.find((screen) => screen.display_id === session.selectedDisplayId)
        if (matchedByDisplay) {
          return matchedByDisplay
        }
      }

      return screens[0] ?? null
    })
  }, [session.selectedDisplayId])

  const prepareSelection = useCallback(async (nextBounds: RecorderBounds) => {
    if (!window.electron?.screenRecorder?.prepareSelection) {
      return { success: false, error: '当前环境不支持区域预览' }
    }

    setIsPreparingSelection(true)

    try {
      const response = await window.electron.screenRecorder.prepareSelection(nextBounds)
      if (response.success && response.data) {
        const preparedPreview = response.data as RecorderSelectionPreview
        setSelectionDraft(cloneBounds(preparedPreview.bounds))
        setSelectionDisplayBounds(cloneBounds(preparedPreview.displayBounds))
        hydratedSelectionSignatureRef.current = getBoundsSignature(preparedPreview.bounds)
      }

      return response
    } finally {
      setIsPreparingSelection(false)
    }
  }, [])

  const loadCurrentSession = useCallback(async () => {
    if (!window.electron?.screenRecorder?.getSession) {
      return session
    }

    const response = await window.electron.screenRecorder.getSession()
    if (response.success && response.data) {
      applyAuthoritativeSession(response.data)
      return response.data
    }

    return session
  }, [applyAuthoritativeSession, session])

  const ensureSelectionDisplayContext = useCallback(async () => {
    if (selectionDisplayBounds) {
      return selectionDisplayBounds
    }

    if (!session.selectionBounds) {
      return null
    }

    const response = await prepareSelection(session.selectionBounds)
    if (response.success && response.data) {
      return response.data.displayBounds
    }

    return null
  }, [prepareSelection, selectionDisplayBounds, session.selectionBounds])

  const handleModeChange = useCallback(async (mode: RecorderMode) => {
    if (session.status === 'recording' || session.status === 'finishing') {
      return
    }

    setDraftMode(mode)

    if (mode === 'full') {
      await loadScreens()
      return
    }

    if (session.selectedDisplayId) {
      setSelectedScreen((current) => {
        if (current?.display_id === session.selectedDisplayId) {
          return current
        }

        return screenList.find((screen) => screen.display_id === session.selectedDisplayId) ?? current
      })
    }
  }, [loadScreens, screenList, session.selectedDisplayId, session.status])

  const startAreaSelection = useCallback(async () => {
    if (session.status === 'recording' || session.status === 'finishing') {
      return { success: false, error: '录制进行中，无法重新框选区域' }
    }

    setDraftMode('area')
    const ipcRenderer = (window.electron as typeof window.electron & { ipcRenderer?: { invoke: (channel: string) => Promise<any> } }).ipcRenderer
    if (!ipcRenderer?.invoke) {
      return { success: false, error: '当前环境不支持框选区域' }
    }

    return ipcRenderer.invoke('recorder-selection-open')
  }, [session.status])

  const updateSelectionDraftField = useCallback((field: RecorderSelectionField, value: number) => {
    if (!Number.isFinite(value)) {
      return
    }

    setSelectionDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft
      }

      return {
        ...currentDraft,
        [field]: Math.round(value)
      }
    })
  }, [])

  const commitSelectionDraft = useCallback(async () => {
    if (!selectionDraft) {
      return { success: false, error: '请先框选录制区域' }
    }

    const validationError = getRecorderSelectionValidationError(selectionDraft)
    if (validationError) {
      return { success: false, error: validationError }
    }

    return prepareSelection(selectionDraft)
  }, [prepareSelection, selectionDraft])

  const nudgeSelectionField = useCallback(async (field: RecorderSelectionField, delta: number) => {
    const baseBounds = selectionDraft ?? session.selectionBounds
    if (!baseBounds) {
      return { success: false, error: '请先框选录制区域' }
    }

    const displayBounds = await ensureSelectionDisplayContext()
    if (!displayBounds) {
      return { success: false, error: '无法读取选区所在屏幕' }
    }

    const nextBounds = nudgeRecorderBounds(baseBounds, field, delta, displayBounds)
    return prepareSelection(nextBounds)
  }, [ensureSelectionDisplayContext, prepareSelection, selectionDraft, session.selectionBounds])

  const startRecording = useCallback(async () => {
    if (!outputPath) {
      return { success: false, error: '请先选择保存位置' }
    }

    const finalOutputPath = ensureRecorderOutputPath(outputPath, format)
    if (finalOutputPath !== outputPath) {
      setOutputPath(finalOutputPath)
    }

    let activeSession = session
    const areaDraftChanged =
      draftMode === 'area' && getBoundsSignature(selectionDraft) !== getBoundsSignature(session.selectionBounds)

    if (draftMode === 'area' && selectionDraft) {
      const validationError = getRecorderSelectionValidationError(selectionDraft)
      if (validationError) {
        return { success: false, error: validationError }
      }

      if (areaDraftChanged) {
        const prepareResult = await prepareSelection(selectionDraft)
        if (!prepareResult.success) {
          return { success: false, error: prepareResult.error || '无法更新选区预览' }
        }

        activeSession = await loadCurrentSession()
      }
    }

    const config: {
      outputPath: string
      format: RecorderFormat
      fps: number
      quality: RecorderQuality
      bounds?: NonNullable<RecorderSessionUpdate['selectionBounds']>
      displayId?: string
    } = {
      outputPath: finalOutputPath,
      format,
      fps,
      quality
    }

    if (draftMode === 'area') {
      if (!activeSession.selectionBounds) {
        return { success: false, error: '请先框选录制区域' }
      }

      config.bounds = activeSession.selectionBounds

      if (activeSession.selectedDisplayId) {
        config.displayId = activeSession.selectedDisplayId
      }
    } else if (selectedScreen) {
      config.displayId = selectedScreen.display_id
    }

    return window.electron.screenRecorder.startRecording(config)
  }, [
    draftMode,
    format,
    fps,
    loadCurrentSession,
    outputPath,
    prepareSelection,
    quality,
    selectedScreen,
    selectionDraft,
    session
  ])

  const stopRecording = useCallback(async () => {
    return window.electron.screenRecorder.stopRecording()
  }, [])

  const setSelectionRect = useCallback((nextBounds: RecorderSessionUpdate['selectionBounds']) => {
    if (!nextBounds) {
      return Promise.resolve({ success: false, error: '请先框选录制区域' })
    }

    return prepareSelection(nextBounds)
  }, [prepareSelection])

  useEffect(() => {
    const init = async () => {
      if (window.electron?.screenRecorder?.getDefaultPath) {
        const response = await window.electron.screenRecorder.getDefaultPath()
        if (response.success && response.data) {
          setOutputPath(response.data)
        }
      }

      if (window.electron?.screenRecorder?.getHotkey) {
        const response = await window.electron.screenRecorder.getHotkey()
        if (response.success && response.data) {
          setRecorderHotkey(response.data)
        }
      }

      if (window.electron?.screenRecorder?.getSession) {
        const response = await window.electron.screenRecorder.getSession()
        if (response.success && response.data) {
          applyAuthoritativeSession(response.data)
        }
      }

      await loadScreens()
    }

    void init()
  }, [applyAuthoritativeSession, loadScreens])

  useEffect(() => {
    if (!window.electron?.screenRecorder?.onSessionUpdated) {
      return
    }

    const unsubscribe = window.electron.screenRecorder.onSessionUpdated((nextSession) => {
      applyAuthoritativeSession(nextSession)
    })

    return () => {
      unsubscribe()
    }
  }, [applyAuthoritativeSession])

  useEffect(() => {
    if (draftMode !== 'full') {
      return
    }

    if (screenList.length === 0) {
      return
    }

    setSelectedScreen((current) => {
      if (current) {
        const matchedScreen = screenList.find((screen) => screen.id === current.id)
        if (matchedScreen) {
          return matchedScreen
        }
      }

      if (session.selectedDisplayId) {
        const matchedByDisplay = screenList.find((screen) => screen.display_id === session.selectedDisplayId)
        if (matchedByDisplay) {
          return matchedByDisplay
        }
      }

      return screenList[0] ?? null
    })
  }, [draftMode, screenList, session.selectedDisplayId])

  useEffect(() => {
    if (!session.selectionBounds) {
      setSelectionDraft(null)
      setSelectionDisplayBounds(null)
      hydratedSelectionSignatureRef.current = null
      return
    }

    setSelectionDraft(cloneBounds(session.selectionBounds))
  }, [session.selectionBounds])

  useEffect(() => {
    if (session.mode !== 'area' || !session.selectionBounds) {
      return
    }

    const selectionSignature = getBoundsSignature(session.selectionBounds)
    if (selectionDisplayBounds || hydratedSelectionSignatureRef.current === selectionSignature) {
      return
    }

    hydratedSelectionSignatureRef.current = selectionSignature
    void prepareSelection(session.selectionBounds)
  }, [prepareSelection, selectionDisplayBounds, session.mode, session.selectionBounds])

  const {
    controlsLocked,
    showPreStartControls,
    showRecordingControls
  } = getScreenRecorderViewState(session.status)
  const isRecording = controlsLocked
  const recordingMode = draftMode
  const selectionRect = recordingMode === 'area' ? session.selectionBounds : null
  const selectionPreviewDataUrl = recordingMode === 'area' ? session.selectionPreviewDataUrl : null
  const recordingTime = session.recordingTime
  const selectionValidationError = selectionDraft
    ? getRecorderSelectionValidationError(selectionDraft)
    : null
  const selectionDirty =
    recordingMode === 'area' &&
    getBoundsSignature(selectionDraft) !== getBoundsSignature(session.selectionBounds)
  const canStartRecording =
    !controlsLocked &&
    Boolean(outputPath) &&
    (recordingMode === 'full' || Boolean(session.selectionBounds && !selectionValidationError))

  return {
    outputPath, setOutputPath,
    format, setFormat,
    fps, setFps,
    quality, setQuality,
    recordingMode, handleModeChange,
    selectedScreen, setSelectedScreen,
    screenList,
    isRecording,
    recordingTime,
    selectionRect,
    setSelectionRect,
    recorderHotkey, setRecorderHotkey,
    isSavingHotkey, setIsSavingHotkey,
    isRecordingHotkey, setIsRecordingHotkey,
    startRecording,
    stopRecording,
    sessionStatus: session.status,
    controlsLocked,
    showPreStartControls,
    showRecordingControls,
    canStartRecording,
    isPreparingSelection,
    selectionDraft,
    selectionDirty,
    selectionPreviewDataUrl,
    selectionValidationError,
    updateSelectionDraftField,
    commitSelectionDraft,
    nudgeSelectionField,
    startAreaSelection
  }
}
