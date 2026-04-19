import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UpdateState } from '../../../shared/appUpdate'

export type AppUpdateAction = 'download' | 'install'

type UpdatePromptState =
  | {
      kind: 'confirm-download'
      title: string
      message: string
      progressPercent: null
      primaryActionLabel: string
    }
  | {
      kind: 'progress'
      title: string
      message: string
      progressPercent: number
      primaryActionLabel: null
    }
  | {
      kind: 'restart'
      title: string
      message: string
      progressPercent: number
      primaryActionLabel: string
    }
  | {
      kind: 'error'
      title: string
      message: string
      progressPercent: null
      primaryActionLabel: string
    }

function getLatestVersionLabel(state: UpdateState): string {
  return state.latestVersion || '新版本'
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return '更新服务暂时不可用，请稍后重试。'
}

function getUpdatesBridgeMethod(methodName: 'getState' | 'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall') {
  const method = window.electron?.updates?.[methodName]
  if (typeof method !== 'function') {
    throw new Error('更新服务暂时不可用，请稍后重试。')
  }

  return method as (...args: any[]) => Promise<any>
}

export function canInvokeAppUpdateAction(pendingAction: AppUpdateAction | null, requestedAction: AppUpdateAction): boolean {
  return pendingAction === null || pendingAction !== requestedAction
}

export function createAppUpdateErrorState(errorMessage: string, previousState?: UpdateState | null): UpdateState {
  return {
    status: 'error',
    currentVersion: previousState?.currentVersion ?? '',
    latestVersion: previousState?.latestVersion ?? null,
    releaseNotes: previousState?.releaseNotes ?? null,
    progressPercent: previousState?.progressPercent ?? null,
    errorMessage
  }
}

export function deriveAppUpdatePromptState(state: UpdateState | null | undefined): UpdatePromptState | null {
  if (!state) {
    return null
  }

  if (state.status === 'available') {
    return {
      kind: 'confirm-download',
      title: '发现新版本',
      message: `当前版本 ${state.currentVersion}，可下载 ${getLatestVersionLabel(state)}。`,
      progressPercent: null,
      primaryActionLabel: '下载更新'
    }
  }

  if (state.status === 'downloading') {
    return {
      kind: 'progress',
      title: '正在下载更新',
      message: `版本 ${getLatestVersionLabel(state)} 正在下载。`,
      progressPercent: state.progressPercent ?? 0,
      primaryActionLabel: null
    }
  }

  if (state.status === 'downloaded') {
    return {
      kind: 'restart',
      title: '更新已准备就绪',
      message: `版本 ${getLatestVersionLabel(state)} 已下载完成。`,
      progressPercent: state.progressPercent ?? 100,
      primaryActionLabel: '重新启动并安装'
    }
  }

  if (state.status === 'error') {
    return {
      kind: 'error',
      title: '更新失败',
      message: state.errorMessage || '更新服务暂时不可用，请稍后重试。',
      progressPercent: null,
      primaryActionLabel: '重新检查更新'
    }
  }

  return null
}

export function useAppUpdate() {
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const [pendingAction, setPendingAction] = useState<AppUpdateAction | null>(null)
  const pendingActionRef = useRef<AppUpdateAction | null>(null)

  const setErrorState = useCallback((error: unknown, previousState?: UpdateState | null) => {
    setUpdateState(createAppUpdateErrorState(getErrorMessage(error), previousState))
  }, [])

  const checkForUpdates = useCallback(async () => {
    try {
      return await getUpdatesBridgeMethod('checkForUpdates')()
    } catch (error) {
      setErrorState(error, updateState)
      return undefined
    }
  }, [setErrorState, updateState])

  const clearPendingAction = useCallback(() => {
    pendingActionRef.current = null
    setPendingAction(null)
  }, [])

  const runDownloadUpdate = useCallback(async () => {
    if (!canInvokeAppUpdateAction(pendingActionRef.current, 'download')) {
      return
    }

    pendingActionRef.current = 'download'
    setPendingAction('download')

    try {
      await getUpdatesBridgeMethod('downloadUpdate')()
    } catch (error) {
      clearPendingAction()
      setErrorState(error, updateState)
    }
  }, [clearPendingAction, setErrorState, updateState])

  const runQuitAndInstall = useCallback(async () => {
    if (!canInvokeAppUpdateAction(pendingActionRef.current, 'install')) {
      return
    }

    pendingActionRef.current = 'install'
    setPendingAction('install')

    try {
      await getUpdatesBridgeMethod('quitAndInstall')()
    } catch (error) {
      clearPendingAction()
      setErrorState(error, updateState)
    }
  }, [clearPendingAction, setErrorState, updateState])

  useEffect(() => {
    let isActive = true
    void (async () => {
      try {
        const result = await getUpdatesBridgeMethod('getState')()
        if (isActive && result?.success && result.data) {
          setUpdateState(result.data)
        }
      } catch (error) {
        if (isActive) {
          setUpdateState(createAppUpdateErrorState(getErrorMessage(error)))
        }
      }
    })()

    const unsubscribe = window.electron?.updates?.onStateChanged?.((nextState: UpdateState) => {
      if (isActive) {
        setUpdateState(nextState)
      }
    })

    return () => {
      isActive = false
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [])

  useEffect(() => {
    if (!pendingAction) {
      return
    }

    if (updateState?.status === 'error') {
      clearPendingAction()
      return
    }

    if (pendingAction === 'download') {
      if (updateState?.status === 'downloading' || updateState?.status === 'downloaded') {
        clearPendingAction()
      }
    }
  }, [clearPendingAction, pendingAction, updateState?.status])

  return useMemo(() => {
    return {
      updateState,
      promptState: deriveAppUpdatePromptState(updateState),
      pendingAction,
      checkForUpdates,
      downloadUpdate: runDownloadUpdate,
      quitAndInstall: runQuitAndInstall
    }
  }, [checkForUpdates, pendingAction, runDownloadUpdate, runQuitAndInstall, updateState])
}

export type { UpdatePromptState }
