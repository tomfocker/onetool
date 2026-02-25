import { useState, useEffect, useCallback } from 'react'

export interface ToolUsage {
  id: string
  name: string
  icon: string
  lastUsed: number
  useCount: number
}

const STORAGE_KEY = 'toolbox-tool-usage'

const getDefaultUsages = (): ToolUsage[] => []

export const useToolUsage = () => {
  const [usages, setUsages] = useState<ToolUsage[]>([])

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        setUsages(JSON.parse(stored))
      } catch {
        setUsages(getDefaultUsages())
      }
    }
  }, [])

  const saveUsages = useCallback((newUsages: ToolUsage[]) => {
    setUsages(newUsages)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newUsages))
  }, [])

  const recordUsage = useCallback((tool: { id: string; name: string; icon: string }) => {
    setUsages(prev => {
      const existing = prev.find(u => u.id === tool.id)
      let newUsages: ToolUsage[]
      
      if (existing) {
        newUsages = prev.map(u => 
          u.id === tool.id 
            ? { ...u, lastUsed: Date.now(), useCount: u.useCount + 1 }
            : u
        )
      } else {
        newUsages = [...prev, {
          id: tool.id,
          name: tool.name,
          icon: tool.icon,
          lastUsed: Date.now(),
          useCount: 1
        }]
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newUsages))
      return newUsages
    })
  }, [])

  const getRecentTools = useCallback((limit: number = 8): ToolUsage[] => {
    return [...usages]
      .sort((a, b) => b.useCount - a.useCount || b.lastUsed - a.lastUsed)
      .slice(0, limit)
  }, [usages])

  const clearUsages = useCallback(() => {
    setUsages([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return {
    usages,
    recordUsage,
    getRecentTools,
    clearUsages
  }
}
