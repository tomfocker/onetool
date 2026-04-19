import { useState, useEffect, useCallback } from 'react'
import type { RecorderSessionUpdate } from '../../../shared/ipc-schemas'
import { ensureRecorderOutputPath } from '../../../shared/screenRecorderSession'

type RecorderFormat = 'mp4' | 'gif'
type RecorderQuality = 'low' | 'medium' | 'high'
type RecorderMode = 'full' | 'area'
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

export function applyRecorderSessionSnapshot(
  currentDraft: RecorderSessionDraft,
  nextSession: RecorderSessionUpdate
): RecorderSessionDraft {
  return {
    draftMode: nextSession.mode,
    outputPath: nextSession.outputPath || currentDraft.outputPath
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
  const [recorderHotkey, setRecorderHotkey] = useState('Alt+Shift+R')
  const [isSavingHotkey, setIsSavingHotkey] = useState(false)
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false)

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

  const handleModeChange = useCallback(async (mode: RecorderMode) => {
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
  }, [loadScreens, screenList, session.selectedDisplayId])

  const startRecording = useCallback(async () => {
    if (!outputPath) {
      return { success: false, error: '请先选择保存位置' }
    }

    const finalOutputPath = ensureRecorderOutputPath(outputPath, format)
    if (finalOutputPath !== outputPath) {
      setOutputPath(finalOutputPath)
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
      if (!session.selectionBounds) {
        return { success: false, error: '请先选择录制区域' }
      }

      config.bounds = session.selectionBounds

      if (session.selectedDisplayId) {
        config.displayId = session.selectedDisplayId
      }
    } else if (selectedScreen) {
      config.displayId = selectedScreen.display_id
    }

    return window.electron.screenRecorder.startRecording(config)
  }, [draftMode, format, fps, outputPath, quality, selectedScreen, session.selectedDisplayId, session.selectionBounds])

  const stopRecording = useCallback(async () => {
    return window.electron.screenRecorder.stopRecording()
  }, [])

  const setSelectionRect = useCallback((nextBounds: RecorderSessionUpdate['selectionBounds']) => {
    if (!nextBounds || !window.electron?.screenRecorder?.prepareSelection) {
      return
    }

    void window.electron.screenRecorder.prepareSelection(nextBounds)
  }, [])

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

    init()
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
    if (draftMode === 'full' && screenList.length === 0) {
      return
    }

    if (draftMode !== 'full') {
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

  const isRecording = session.status === 'recording' || session.status === 'finishing'
  const recordingMode = draftMode
  const selectionRect = recordingMode === 'area' ? session.selectionBounds : null
  const recordingTime = session.recordingTime

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
    stopRecording
  }
}
