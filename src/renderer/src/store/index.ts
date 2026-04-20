import { create } from 'zustand'
import { AppNotification } from '../../../shared/types'
import { DEFAULT_PINNED_TOOL_IDS, normalizePinnedToolIds } from '../../../shared/devEnvironment'

type Theme = 'light' | 'dark'

interface GlobalState {
    // Theme State
    theme: Theme
    toggleTheme: () => void
    setTheme: (theme: Theme) => void

    // Notification State
    notifications: AppNotification[]
    showNotification: (notification: Omit<AppNotification, 'id'>) => void
    removeNotification: (id: string) => void

    pinnedToolIds: string[]
    hydratePinnedToolIds: (toolIds: string[], validToolIds: string[]) => void
    togglePinnedToolId: (toolId: string, validToolIds: string[]) => Promise<void>
}

const getInitialTheme = (): Theme => {
    const savedTheme = localStorage.getItem('toolbox-theme') as Theme | null
    if (savedTheme) return savedTheme
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
    return 'light'
}

export const useGlobalStore = create<GlobalState>((set) => ({
    // --- Theme ---
    theme: getInitialTheme(),
    toggleTheme: () => set((state) => {
        const newTheme = state.theme === 'light' ? 'dark' : 'light'
        localStorage.setItem('toolbox-theme', newTheme)

        const root = document.documentElement
        if (newTheme === 'dark') {
            root.classList.add('dark')
        } else {
            root.classList.remove('dark')
        }
        return { theme: newTheme }
    }),
    setTheme: (theme) => set(() => {
        localStorage.setItem('toolbox-theme', theme)

        const root = document.documentElement
        if (theme === 'dark') {
            root.classList.add('dark')
        } else {
            root.classList.remove('dark')
        }
        return { theme }
    }),

    // --- Notifications ---
    notifications: [],
    showNotification: (n) => set((state) => {
        const id = Date.now().toString()
        const newNotification = { ...n, id }

        if (n.duration !== 0) {
            setTimeout(() => {
                set((s) => ({
                    notifications: s.notifications.filter((notif) => notif.id !== id)
                }))
            }, n.duration || 4000)
        }

        return {
            notifications: [...state.notifications, newNotification]
        }
    }),
    removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id)
    })),

    pinnedToolIds: [...DEFAULT_PINNED_TOOL_IDS],
    hydratePinnedToolIds: (toolIds, validToolIds) => set(() => ({
        pinnedToolIds: normalizePinnedToolIds(toolIds, validToolIds)
    })),
    togglePinnedToolId: async (toolId, validToolIds) => {
        const currentPinnedToolIds = useGlobalStore.getState().pinnedToolIds
        const nextPinnedToolIds = currentPinnedToolIds.includes(toolId)
            ? currentPinnedToolIds.filter((id) => id !== toolId)
            : [...currentPinnedToolIds, toolId]

        const normalized = normalizePinnedToolIds(nextPinnedToolIds, validToolIds)
        useGlobalStore.setState({ pinnedToolIds: normalized })
        await window.electron.store.set('pinnedToolIds', normalized)
    }
}))

// Theme initialization sidebar effect
if (typeof document !== 'undefined') {
    const initialTheme = getInitialTheme()
    if (initialTheme === 'dark') {
        document.documentElement.classList.add('dark')
    }

    // Optional: Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', (e) => {
        const savedTheme = localStorage.getItem('toolbox-theme')
        if (!savedTheme) {
            useGlobalStore.getState().setTheme(e.matches ? 'dark' : 'light')
        }
    })
}

// Global Notification Listener mapping (once)
if (typeof window !== 'undefined' && window.electron?.app) {
    window.electron.app.onNotification((data: AppNotification) => {
        useGlobalStore.getState().showNotification(data)
    })
}

if (typeof window !== 'undefined' && window.electron?.store) {
    void window.electron.store.get('pinnedToolIds').then((result) => {
        if (result.success && Array.isArray(result.data)) {
            useGlobalStore.setState({ pinnedToolIds: result.data })
        }
    })
}
