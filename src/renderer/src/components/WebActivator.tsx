import React, { useState, useEffect, useCallback } from 'react'
import { Globe, Plus, Trash2, Edit2, Check, X, Keyboard, Eye, EyeOff, RefreshCw, Monitor, Layout, Search, Command, ArrowRight, AppWindow, Box } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type TargetType = 'app' | 'tab'

interface ActivatorConfig {
  id: string
  name: string
  type: TargetType
  pattern: string
  shortcut: string
  isActive: boolean
  hwnd?: number 
}

interface WindowInfo {
  id: number
  title: string
  processName: string
  hwnd: number
}

const WebActivator: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TargetType>('app')
  const [configs, setConfigs] = useState<ActivatorConfig[]>(() => {
    const saved = localStorage.getItem('web-activator-v4')
    if (saved) {
      try { return JSON.parse(saved) } catch { return [] }
    }
    return []
  })
  
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<ActivatorConfig>>({})
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newForm, setNewForm] = useState<Partial<ActivatorConfig>>({
    name: '', pattern: '', type: 'app', shortcut: 'Alt+Shift+Q'
  })
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [isListeningShortcut, setIsListeningShortcut] = useState<string | null>(null)
  const [windowList, setWindowList] = useState<WindowInfo[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message)
    setTimeout(() => setStatusMessage(''), 3000)
  }, [])

  useEffect(() => {
    localStorage.setItem('web-activator-v4', JSON.stringify(configs))
  }, [configs])

  useEffect(() => {
    // 组件加载时自动注册一次已保存的快捷键
    if (configs.length > 0) {
      registerShortcuts(configs)
      syncVisibility()
    }
    const timer = setInterval(syncVisibility, 3000)
    return () => clearInterval(timer)
  }, [])

  const syncVisibility = useCallback(async () => {
    if (!window.electron?.webActivator?.checkVisibility || configs.length === 0) return
    try {
      const results = await window.electron.webActivator.checkVisibility(configs)
      setConfigs(prev => prev.map((c, idx) => ({ ...c, isActive: results[idx] })))
    } catch (e) {
      console.error('Failed to sync visibility:', e)
    }
  }, [configs])

  const registerShortcuts = useCallback(async (currentConfigs: ActivatorConfig[]) => {
    if (!window.electron?.webActivator?.registerShortcuts) return
    const result = await window.electron.webActivator.registerShortcuts(currentConfigs)
    if (result.success) showStatus('快捷键配置已更新')
  }, [showStatus])

  useEffect(() => {
    if (!window.electron?.webActivator?.onShortcutTriggered) return
    const unsubscribe = window.electron.webActivator.onShortcutTriggered(({ id, action }) => {
      setConfigs(prev => prev.map(c => 
        c.id === id ? { ...c, isActive: action === 'activated' } : c
      ))
    })
    return () => { if (unsubscribe) unsubscribe() }
  }, [])

  useEffect(() => {
    if (showPicker) {
      fetchWindowList()
      const timer = setInterval(fetchWindowList, 3000)
      return () => clearInterval(timer)
    }
    return undefined
  }, [showPicker])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isListeningShortcut) return
    e.preventDefault()
    e.stopPropagation()
    const modifiers: string[] = []
    if (e.ctrlKey) modifiers.push('CommandOrControl')
    if (e.altKey) modifiers.push('Alt')
    if (e.shiftKey) modifiers.push('Shift')
    
    let key = e.key.toUpperCase()
    if (['CONTROL', 'ALT', 'SHIFT', 'META'].includes(key)) return
    
    // 处理特殊按键
    if (key === ' ') key = 'Space'
    if (key === 'ARROWUP') key = 'Up'
    if (key === 'ARROWDOWN') key = 'Down'
    if (key === 'ARROWLEFT') key = 'Left'
    if (key === 'ARROWRIGHT') key = 'Right'
    if (key === 'ESCAPE') key = 'Esc'
    if (key === 'DELETE') key = 'Delete'
    if (key === 'INSERT') key = 'Insert'
    if (key === 'HOME') key = 'Home'
    if (key === 'END') key = 'End'
    if (key === 'PAGEUP') key = 'PageUp'
    if (key === 'PAGEDOWN') key = 'PageDown'

    const shortcut = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key
    if (isListeningShortcut === 'new') setNewForm(prev => ({ ...prev, shortcut }))
    else setEditForm(prev => ({ ...prev, shortcut }))
    setIsListeningShortcut(null)
  }, [isListeningShortcut])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [handleKeyDown])

  const fetchWindowList = async () => {
    if (!window.electron?.webActivator?.getWindowList) return
    const result = await window.electron.webActivator.getWindowList()
    if (result.success) setWindowList(result.windows || [])
  }

  const toggleTarget = async (config: ActivatorConfig) => {
    if (!window.electron?.webActivator?.toggleWindow) return
    try {
      const result = await window.electron.webActivator.toggleWindow({
        type: config.type,
        pattern: config.pattern,
        id: config.hwnd
      })
      if (result.success) {
        setConfigs(prev => prev.map(c => c.id === config.id ? { ...c, isActive: result.action === 'activated' } : c))
      }
    } catch (error) { console.error(error) }
  }

  const pickWindow = (win: WindowInfo) => {
    const defaultName = win.processName.charAt(0).toUpperCase() + win.processName.slice(1)
    if (editingId) {
      setEditForm(prev => ({ ...prev, name: defaultName, pattern: win.processName, hwnd: win.hwnd }))
    } else {
      setNewForm(prev => ({ ...prev, name: defaultName, pattern: win.processName, hwnd: win.hwnd }))
    }
    setShowPicker(false)
    showStatus('已获取窗口信息')
  }

  const handleSaveEdit = async () => {
    if (!editForm.name?.trim() || !editForm.pattern?.trim()) return
    const newConfigs = configs.map(c => c.id === editingId ? { ...c, ...editForm } as ActivatorConfig : c)
    setConfigs(newConfigs)
    setEditingId(null)
    setEditForm({})
    showStatus('保存成功')
    await registerShortcuts(newConfigs)
  }

  const handleAddNew = async () => {
    if (!newForm.name?.trim() || !newForm.pattern?.trim()) return
    const newConfig: ActivatorConfig = {
      id: Date.now().toString(),
      name: newForm.name.trim(),
      pattern: newForm.pattern.trim(),
      type: activeTab,
      shortcut: newForm.shortcut || 'Alt+Shift+Q',
      isActive: false,
      hwnd: newForm.hwnd
    }
    const newConfigs = [...configs, newConfig]
    setConfigs(newConfigs)
    setIsAddingNew(false)
    setNewForm({ name: '', pattern: '', type: activeTab, shortcut: 'Alt+Shift+Q' })
    showStatus('添加成功')
    await registerShortcuts(newConfigs)
  }

  const filteredWindows = windowList.filter(win => 
    win.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    win.processName.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 relative">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 backdrop-blur-sm">
            <Command className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">一键激活器</h1>
        </div>
        <p className="text-muted-foreground font-medium">绑定快捷键，瞬间呼出常用软件或标签</p>
      </div>

      {statusMessage && (
        <div className="fixed top-24 right-8 z-[100] px-6 py-3 rounded-xl bg-primary text-primary-foreground shadow-2xl border border-white/20 animate-in fade-in zoom-in-95">{statusMessage}</div>
      )}

      {/* 窗口选择器面板 - 改为容器内相对布局，避免遮挡侧边栏 */}
      {showPicker && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:pl-72">
          <div className="fixed inset-0 bg-background/40 backdrop-blur-md" onClick={() => setShowPicker(false)} />
          <Card className="w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl border-white/20 bg-card/90 backdrop-blur-2xl relative z-10 overflow-hidden animate-in zoom-in-95">
            <CardHeader className="pb-4 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Search className="w-5 h-5 text-primary" /> 选择活动窗口
                  </CardTitle>
                  <CardDescription>点击下方卡片自动填充配置信息</CardDescription>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowPicker(false)} className="rounded-full"><X className="w-5 h-5" /></Button>
              </div>
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="搜索进程或标题..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-11 bg-white/5" autoFocus />
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 custom-scrollbar">
              {filteredWindows.length === 0 ? (
                <div className="col-span-full py-20 text-center opacity-40"><Box className="w-12 h-12 mx-auto mb-2" />未发现窗口</div>
              ) : filteredWindows.map((win, idx) => (
                <div key={`${win.id}-${idx}`} onClick={() => pickWindow(win)} className="group p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    {activeTab === 'app' ? <AppWindow className="w-5 h-5 text-primary" /> : <Globe className="w-5 h-5 text-primary" />}
                  </div>
                  <div className="overflow-hidden text-left">
                    <div className="font-bold text-sm truncate">{win.title || '(无标题)'}</div>
                    <div className="text-[10px] text-muted-foreground uppercase mt-1 opacity-60 font-mono">{win.processName}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex justify-center p-1.5 bg-white/5 backdrop-blur-md rounded-2xl w-fit mx-auto border border-white/10 mb-8">
        <button onClick={() => { setActiveTab('app'); setIsAddingNew(false); }} className={cn("px-8 py-2.5 rounded-xl transition-all font-bold text-sm", activeTab === 'app' ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground")}>软件窗口</button>
        <button onClick={() => { setActiveTab('tab'); setIsAddingNew(false); }} className={cn("px-8 py-2.5 rounded-xl transition-all font-bold text-sm", activeTab === 'tab' ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground")}>浏览器标签</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {configs.filter(c => c.type === activeTab).map((config) => (
          <Card key={config.id} className={cn("bg-white/5 border-white/10 rounded-[24px] transition-all group overflow-hidden", config.isActive ? "ring-2 ring-primary/50 bg-primary/5" : "hover:bg-white/10")}>
            <CardContent className="p-6">
              {editingId === config.id ? (
                <div className="space-y-4 animate-in fade-in">
                  <div className="flex justify-between items-center"><span className="text-xs font-bold text-primary">修改配置</span><Button variant="ghost" size="sm" onClick={() => setShowPicker(true)} className="h-7 text-[10px] bg-primary/10">从窗口选取</Button></div>
                  <div className="grid grid-cols-1 gap-3">
                    <Input value={editForm.name || ''} placeholder="名称" onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))} className="bg-white/5" />
                    <Input value={editForm.pattern || ''} placeholder="匹配规则" onChange={(e) => setEditForm(prev => ({ ...prev, pattern: e.target.value }))} className="bg-white/5 font-mono text-xs" />
                    <Button variant="outline" onClick={() => setIsListeningShortcut(editingId)} className="w-full justify-between h-11 bg-white/5 font-mono">
                      <span>{isListeningShortcut === editingId ? '请按键...' : (editForm.shortcut || '未设置')}</span><Keyboard className="h-4 w-4 opacity-40" />
                    </Button>
                  </div>
                  <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>取消</Button><Button size="sm" onClick={handleSaveEdit}>保存配置</Button></div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 overflow-hidden text-left">
                    <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-500", config.isActive ? "bg-primary text-primary-foreground shadow-lg" : "bg-white/5 text-muted-foreground group-hover:bg-white/10")}>
                      {config.type === 'app' ? <Monitor className="w-7 h-7" /> : <Globe className="w-7 h-7" />}
                    </div>
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-2"><h3 className="font-bold text-base truncate">{config.name}</h3><span className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary">{config.shortcut.replace('CommandOrControl', 'Ctrl')}</span></div>
                      <p className="text-[11px] text-muted-foreground truncate mt-1 opacity-60">规则: {config.pattern}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => toggleTarget(config)} className={cn("h-9 w-9 rounded-xl", config.isActive ? "text-primary" : "text-muted-foreground")}>{config.isActive ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</Button>
                    <Button variant="ghost" size="icon" onClick={() => { setEditingId(config.id); setEditForm({...config}); setShowPicker(false); }} className="h-9 w-9 text-muted-foreground"><Edit2 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={async () => { const nc = configs.filter(c => c.id !== config.id); setConfigs(nc); await registerShortcuts(nc); showStatus('已删除'); }} className="h-9 w-9 text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {isAddingNew ? (
          <Card className="bg-primary/5 border-primary/30 rounded-[24px] animate-in zoom-in-95">
            <CardContent className="p-6 space-y-4 text-left">
              <div className="flex justify-between items-center"><span className="text-xs font-bold text-primary uppercase">新增配置</span><Button variant="ghost" size="sm" onClick={() => setShowPicker(true)} className="h-7 text-[10px] bg-primary/10">从窗口选取</Button></div>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">识别名称</label><Input placeholder="手动输入或从上方选取" value={newForm.name || ''} onChange={(e) => setNewForm(prev => ({ ...prev, name: e.target.value }))} className="bg-white/5 h-11" /></div>
                <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">快捷键</label><Button variant="outline" onClick={() => setIsListeningShortcut('new')} className="w-full justify-between h-11 bg-white/5 font-mono rounded-xl"><span>{isListeningShortcut === 'new' ? '请按键...' : (newForm.shortcut || '点击设置')}</span><Keyboard className="h-4 w-4 opacity-40" /></Button></div>
              </div>
              <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" size="sm" onClick={() => setIsAddingNew(false)}>取消</Button><Button size="sm" onClick={handleAddNew} className="px-8">添加</Button></div>
            </CardContent>
          </Card>
        ) : (
          <button onClick={() => { setIsAddingNew(true); setShowPicker(true); }} className="h-full min-h-[160px] rounded-[32px] border-2 border-dashed border-white/10 hover:border-primary/50 hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-3 text-muted-foreground hover:text-primary group">
            <div className="p-4 rounded-full bg-white/5 group-hover:bg-primary/10 group-hover:scale-110 transition-all duration-500"><Plus className="h-8 w-8" /></div>
            <div className="flex flex-col items-center"><span className="text-sm font-bold">快速绑定</span><span className="text-[10px] opacity-40 mt-1 uppercase">Identify Window Instance</span></div>
          </button>
        )}
      </div>
    </div>
  )
}

export default WebActivator
