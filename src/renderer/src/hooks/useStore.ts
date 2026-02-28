import { useState, useEffect, useCallback } from 'react'
import { GlobalStore } from '../../../shared/types'

export function useStore() {
  const [store, setStore] = useState<GlobalStore | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchStore = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await window.electron.store.getAll()
      if (res.success && res.data) {
        setStore(res.data)
      }
    } catch (e) {
      console.error('useStore: Failed to fetch store:', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const setStoreValue = async <K extends keyof GlobalStore>(key: K, value: GlobalStore[K]) => {
    try {
      const res = await window.electron.store.set(key, value)
      if (res.success) {
        setStore(prev => prev ? { ...prev, [key]: value } : null)
      }
      return res
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  useEffect(() => {
    fetchStore()

    const unsubscribe = window.electron.store.onChanged((newStore: GlobalStore) => {
      setStore(newStore)
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [fetchStore])

  return {
    store,
    isLoading,
    setStoreValue,
    refresh: fetchStore
  }
}
