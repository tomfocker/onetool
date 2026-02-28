import React, { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Globe, RefreshCw, ExternalLink, Settings2, ShieldCheck, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

const ServerMonitorTool: React.FC = () => {
    const [monitorUrl, setMonitorUrl] = useState<string>(() => {
        return localStorage.getItem('onitool-server-monitor-url') || ''
    })
    const [tempUrl, setTempUrl] = useState(monitorUrl)
    const [isConfiguring, setIsConfiguring] = useState(!monitorUrl)
    const [refreshKey, setRefreshKey] = useState(0)

    const handleSave = () => {
        let formattedUrl = tempUrl.trim()
        if (formattedUrl && !/^https?:\/\//i.test(formattedUrl)) {
            formattedUrl = 'https://' + formattedUrl
        }

        setMonitorUrl(formattedUrl)
        localStorage.setItem('onitool-server-monitor-url', formattedUrl)
        setIsConfiguring(false)
    }

    const handleRefresh = () => {
        setRefreshKey(prev => prev + 1)
    }

    return (
        <div className="h-[calc(100vh-160px)] flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
                        <Globe className="text-indigo-500" size={24} />
                        服务器监控
                    </h2>
                    <p className="text-muted-foreground font-bold text-sm opacity-70">
                        {monitorUrl ? `正在监控：${new URL(monitorUrl).hostname}` : '配置您的监控面板地址'}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {monitorUrl && !isConfiguring && (
                        <>
                            <button
                                onClick={handleRefresh}
                                className="p-2.5 bg-white/40 dark:bg-white/5 backdrop-blur-md rounded-xl border border-zinc-200/50 dark:border-white/10 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all group"
                                title="刷新面板"
                            >
                                <RefreshCw size={18} className={cn("text-muted-foreground group-hover:text-indigo-500 transition-colors", refreshKey > 0 && "animate-spin-once")} />
                            </button>
                            <a
                                href={monitorUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2.5 bg-white/40 dark:bg-white/5 backdrop-blur-md rounded-xl border border-zinc-200/50 dark:border-white/10 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all group"
                                title="外部打开"
                            >
                                <ExternalLink size={18} className="text-muted-foreground group-hover:text-indigo-500 transition-colors" />
                            </a>
                        </>
                    )}
                    <button
                        onClick={() => setIsConfiguring(!isConfiguring)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all",
                            isConfiguring
                                ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                                : "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:scale-105"
                        )}
                    >
                        <Settings2 size={16} />
                        {isConfiguring ? '取消配置' : '配置地址'}
                    </button>
                </div>
            </div>

            <Card className="flex-1 overflow-hidden border-zinc-200/50 dark:border-white/10 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl shadow-2xl rounded-3xl relative">
                <CardContent className="p-0 h-full flex flex-col">
                    {isConfiguring ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-md mx-auto text-center space-y-6">
                            <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center text-indigo-500">
                                <ShieldCheck size={40} />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-black">设置监控面板地址</h3>
                                <p className="text-sm text-muted-foreground font-medium">
                                    输入您反代好的哪吒监控、Uptime Kuma 或任何 Web 监控页面的 URL。
                                </p>
                            </div>
                            <div className="w-full space-y-4">
                                <Input
                                    placeholder="例如: monitor.example.com"
                                    value={tempUrl}
                                    onChange={(e) => setTempUrl(e.target.value)}
                                    className="h-12 bg-white/50 dark:bg-zinc-800/50 rounded-2xl border-zinc-200 dark:border-zinc-700 font-bold text-center"
                                />
                                <Button
                                    onClick={handleSave}
                                    className="w-full h-12 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl font-black text-base shadow-xl shadow-indigo-500/20 transition-all"
                                    disabled={!tempUrl.trim()}
                                >
                                    保存并加载
                                </Button>
                            </div>
                            <div className="flex items-start gap-2 p-4 bg-zinc-500/5 rounded-2xl text-left border border-zinc-200/50 dark:border-white/5">
                                <Info size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                                <p className="text-[11px] leading-relaxed text-muted-foreground font-medium">
                                    提示：为了获得最佳体验，请确保目标域名支持 HTTPS，并允许在 Iframe 中嵌入（未设置 X-Frame-Options: DENY）。
                                </p>
                            </div>
                        </div>
                    ) : monitorUrl ? (
                        <iframe
                            key={refreshKey}
                            src={monitorUrl}
                            className="w-full h-full border-none"
                            title="Server Monitor"
                            style={{ filter: 'contrast(1.02) saturate(1.05)' }}
                        />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                            <Globe size={48} className="text-zinc-300 dark:text-zinc-700" />
                            <p className="text-muted-foreground font-bold">尚未配置监控地址</p>
                            <Button onClick={() => setIsConfiguring(true)} variant="outline" className="rounded-xl">立即配置</Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[11px] font-bold text-emerald-600/80 uppercase tracking-widest">
                    Multi-Node Realtime Status Monitoring System v1.1
                </p>
            </div>
        </div>
    )
}

export default ServerMonitorTool
