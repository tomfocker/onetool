import { useCallback, useEffect, useMemo, useState } from 'react'
import type { UpdateState } from '../../../shared/appUpdate'

type UpdatePromptState =
  | {
      kind: 'confirm-download'
      title: string
      message: string
      progressPercent: null
      primaryActionLabel: string
      secondaryActionLabel: string | null
    }
  | {
      kind: 'progress'
      title: string
      message: string
      progressPercent: number
      primaryActionLabel: null
      secondaryActionLabel: null
    }
  | {
      kind: 'restart'
      title: string
      message: string
      progressPercent: number
      primaryActionLabel: string
      secondaryActionLabel: string | null
    }

function getLatestVersionLabel(state: UpdateState): string {
  return state.latestVersion || '新版本'
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
      primaryActionLabel: '下载更新',
      secondaryActionLabel: '稍后再说'
    }
  }

  if (state.status === 'downloading') {
    return {
      kind: 'progress',
      title: '正在下载更新',
      message: `版本 ${getLatestVersionLabel(state)} 正在下载。`,
      progressPercent: state.progressPercent ?? 0,
      primaryActionLabel: null,
      secondaryActionLabel: null
    }
  }

  if (state.status === 'downloaded') {
    return {
      kind: 'restart',
      title: '更新已准备就绪',
      message: `版本 ${getLatestVersionLabel(state)} 已下载完成。`,
      progressPercent: state.progressPercent ?? 100,
      primaryActionLabel: '重新启动并安装',
      secondaryActionLabel: '稍后重启'
    }
  }

  return null
}

export function useAppUpdate() {
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)

  const checkForUpdates = useCallback(() => {
    return window.electron?.updates?.checkForUpdates?.() ?? Promise.resolve(undefined)
  }, [])

  const downloadUpdate = useCallback(() => {
    return window.electron?.updates?.downloadUpdate?.() ?? Promise.resolve(undefined)
  }, [])

  const quitAndInstall = useCallback(() => {
    return window.electron?.updates?.quitAndInstall?.() ?? Promise.resolve(undefined)
  }, [])

  useEffect(() => {
    let isActive = true
    void (async () => {
      const result = await window.electron?.updates?.getState?.()
      if (isActive && result?.success && result.data) {
        setUpdateState(result.data)
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

  return useMemo(() => {
    return {
      updateState,
      promptState: deriveAppUpdatePromptState(updateState),
      checkForUpdates,
      downloadUpdate,
      quitAndInstall
    }
  }, [checkForUpdates, downloadUpdate, quitAndInstall, updateState])
}

export type { UpdatePromptState }
