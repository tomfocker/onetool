import { create } from 'zustand'
import { AppNotification } from '../../../shared/types'

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
    }))
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
if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.on('app-notification', (data: any) => {
        useGlobalStore.getState().showNotification(data)
    })
}
