import React from 'react'
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGlobalStore } from '@/store'

export const NotificationContainer: React.FC = () => {
    const notifications = useGlobalStore((state) => state.notifications)
    const removeNotification = useGlobalStore((state) => state.removeNotification)

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
            {notifications.map(n => (
                <div
                    key={n.id}
                    className={cn(
                        "pointer-events-auto min-w-[300px] max-w-[450px] p-4 rounded-2xl shadow-2xl border backdrop-blur-xl animate-in slide-in-from-right-10 flex gap-3 group relative overflow-hidden",
                        n.type === 'success' ? "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400" :
                            n.type === 'error' ? "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400" :
                                n.type === 'warning' ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400" :
                                    "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
                    )}
                >
                    <div className="shrink-0 mt-0.5">
                        {n.type === 'success' && <CheckCircle size={18} />}
                        {n.type === 'error' && <AlertCircle size={18} />}
                        {n.type === 'warning' && <AlertTriangle size={18} />}
                        {n.type === 'info' && <Info size={18} />}
                    </div>
                    <div className="flex-1 space-y-1">
                        {n.title && <div className="text-sm font-black tracking-tight">{n.title}</div>}
                        <div className="text-xs font-medium leading-relaxed opacity-90">{n.message}</div>
                    </div>
                    <button
                        onClick={() => removeNotification(n.id)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg"
                    >
                        <X size={14} />
                    </button>
                    <div
                        className={cn(
                            "absolute bottom-0 left-0 h-1 bg-current opacity-20 transition-all duration-[4000ms] ease-linear",
                            notifications.some(notif => notif.id === n.id) ? "w-0" : "w-full"
                        )}
                        style={{ width: '100%', transitionDuration: `${n.duration || 4000}ms` }}
                    />
                </div>
            ))}
        </div>
    )
}
