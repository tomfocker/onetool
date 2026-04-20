import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DevEnvironmentOverview, DevEnvironmentRecord } from '../../../shared/devEnvironment'
import { getDevEnvironmentSummary, sanitizeDevEnvironmentPath } from '../../../shared/devEnvironment'

export function resolveDevEnvironmentActionAvailability(record: Pick<DevEnvironmentRecord, 'id' | 'status' | 'canInstall' | 'canUpdate'>) {
  return {
    canInstall: record.canInstall && record.status === 'missing',
    canUpdate: record.canUpdate && record.status === 'available-update',
    canOpenRelatedTool: record.id === 'wsl',
    canRefresh: true
  }
}

export function buildDevEnvironmentViewModel(overview: DevEnvironmentOverview | null) {
  const summary = overview?.summary ?? getDevEnvironmentSummary([])
  const records = (overview?.records ?? []).map((record) => ({
    ...record,
    resolvedPath: sanitizeDevEnvironmentPath(record.resolvedPath)
  }))
  return {
    records,
    summaryCards: [
      { id: 'installed', label: '已安装', value: summary.installedCount },
      { id: 'missing', label: '缺失', value: summary.missingCount },
      { id: 'broken', label: '异常', value: summary.brokenCount },
      { id: 'updates', label: '可更新', value: summary.updateCount }
    ],
    checkedAt: overview?.checkedAt ?? null,
    wingetAvailable: overview?.wingetAvailable ?? false
  }
}

export function useDevEnvironmentManager() {
  const [overview, setOverview] = useState<DevEnvironmentOverview | null>(null)
  const [logs, setLogs] = useState<Array<{ type: string; message: string }>>([])
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const hasBootstrappedRef = useRef(false)

  const refreshAll = useCallback(async () => {
    setPendingAction('refresh-all')
    const result = await window.electron.devEnvironment.refreshAll()
    if (result.success && result.data) {
      setOverview(result.data)
    }
    setPendingAction(null)
    return result
  }, [])

  const refreshOne = useCallback(async (id: DevEnvironmentRecord['id']) => {
    setPendingAction(`refresh-${id}`)
    const result = await window.electron.devEnvironment.refreshOne(id)
    if (result.success && result.data) {
      setOverview((current) => {
        if (!current) return current
        const nextRecords = current.records.map((record) => record.id === id ? result.data! : record)
        return {
          ...current,
          records: nextRecords,
          summary: getDevEnvironmentSummary(nextRecords)
        }
      })
    }
    setPendingAction(null)
    return result
  }, [])

  const install = useCallback(async (id: DevEnvironmentRecord['id']) => {
    setPendingAction(`install-${id}`)
    const result = await window.electron.devEnvironment.install(id)
    setPendingAction(null)
    return result
  }, [])

  const update = useCallback(async (id: DevEnvironmentRecord['id']) => {
    setPendingAction(`update-${id}`)
    const result = await window.electron.devEnvironment.update(id)
    setPendingAction(null)
    return result
  }, [])

  const updateAll = useCallback(async () => {
    setPendingAction('update-all')
    const result = await window.electron.devEnvironment.updateAll()
    setPendingAction(null)
    return result
  }, [])

  useEffect(() => {
    if (hasBootstrappedRef.current) return
    hasBootstrappedRef.current = true
    void window.electron.devEnvironment.getOverview().then((result) => {
      if (result.success && result.data) {
        setOverview(result.data)
      }
    })
  }, [])

  useEffect(() => {
    const unsubscribeLog = window.electron.devEnvironment.onLog((entry) => {
      setLogs((current) => [...current, entry])
    })
    const unsubscribeComplete = window.electron.devEnvironment.onComplete(() => {
      void refreshAll()
    })

    return () => {
      unsubscribeLog()
      unsubscribeComplete()
    }
  }, [refreshAll])

  const viewModel = useMemo(() => buildDevEnvironmentViewModel(overview), [overview])

  return {
    overview,
    logs,
    pendingAction,
    viewModel,
    refreshAll,
    refreshOne,
    install,
    update,
    updateAll,
    clearLogs: () => setLogs([])
  }
}
