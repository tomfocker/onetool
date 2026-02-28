import React, { useState, useEffect, useCallback } from 'react'
import { Globe, Plus, Trash2, Edit2, X, Keyboard, ArrowRight, AppWindow, Box, Search, Command, Layout } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWebActivator, ActivatorConfig, WindowInfo, TargetType } from '../hooks/useWebActivator'

const WebActivator: React.FC = () => {
  const {
    configs, setConfigs,
    windowList, fetchWindowList,
    statusMessage, showStatus,
    registerShortcuts,
    toggleTarget
  } = useWebActivator()

  const [activeTab, setActiveTab] = useState<TargetType>('app')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<ActivatorConfig>>({})
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newForm, setNewForm] = useState<Partial<ActivatorConfig>>({
    name: '', pattern: '', type: 'app', shortcut: 'Alt+Shift+Q'
  })
  const [isListeningShortcut, setIsListeningShortcut] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (showPicker) {
      fetchWindowList()
      const timer = setInterval(fetchWindowList, 3000)
      return () => clearInterval(timer)
    }
    return undefined
  }, [showPicker, fetchWindowList])

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
    setNewForm({ name: '', pattern: '', type: 'app', shortcut: 'Alt+Shift+Q' })
    await registerShortcuts(newConfigs)
  }

  const handleDelete = async (id: string) => {
    const newConfigs = configs.filter(c => String(c.id) !== String(id))
    setConfigs(newConfigs)
    localStorage.setItem('web-activator-v4', JSON.stringify(newConfigs))
    await registerShortcuts(newConfigs)
  }

  const startEdit = (config: ActivatorConfig) => {
    setEditingId(config.id)
    setEditForm({ ...config })
  }

  const saveEdit = async () => {
    if (!editingId || !editForm.name?.trim() || !editForm.pattern?.trim()) return
    const newConfigs = configs.map(c => c.id === editingId ? { ...c, ...editForm } as ActivatorConfig : c)
    setConfigs(newConfigs)
    setEditingId(null)
    await registerShortcuts(newConfigs)
  }

  const pickFromList = (win: WindowInfo) => {
    let cleanTitle = win.title.trim()
    let pattern = cleanTitle
    let targetType: TargetType = 'app'
    if (win.type === 'tab') {
      cleanTitle = cleanTitle.replace(/ - (Microsoft Edge|Google Chrome|Firefox|Brave)$/, '')
      const parts = cleanTitle.split(' - ')
      pattern = parts[0].trim()
      cleanTitle = pattern
      targetType = 'tab'
      setActiveTab('tab')
    } else {
      pattern = win.processName
      targetType = 'app'
      setActiveTab('app')
    }

    if (editingId) {
      setEditForm(prev => ({ ...prev, name: cleanTitle, pattern: pattern, hwnd: win.hwnd, type: targetType }))
    } else {
      setNewForm(prev => ({ ...prev, name: cleanTitle, pattern: pattern, hwnd: win.hwnd, type: targetType }))
    }
    setShowPicker(false)
  }

  const filteredWindows = windowList.filter(w =>
    (w.type === activeTab || (activeTab === 'app' && w.type === 'window')) &&
    (w.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.processName.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in p-4 pb-20">
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-4xl font-black bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">
          网页与应用唤醒
        </h1>
        <p className="text-muted-foreground text-sm font-medium">为任何网页标签或本地应用绑定全局快捷键，一键切换</p>
      </div>

      <div className="flex justify-center mb-6">
        <div className="flex bg-muted/50 p-1.5 rounded-2xl w-full max-w-sm shadow-inner">
          <button
            onClick={() => setActiveTab('app')}
            className={cn("flex-1 py-2.5 rounded-xl text-sm font-black transition-all", activeTab === 'app' ? "bg-white dark:bg-zinc-800 shadow-md text-blue-500" : "text-muted-foreground hover:bg-muted/50")}
          >
            <AppWindow className="w-4 h-4 inline mr-1.5" /> 本地应用
          </button>
          <button
            onClick={() => setActiveTab('tab')}
            className={cn("flex-1 py-2.5 rounded-xl text-sm font-black transition-all", activeTab === 'tab' ? "bg-white dark:bg-zinc-800 shadow-md text-blue-500" : "text-muted-foreground hover:bg-muted/50")}
          >
            <Globe className="w-4 h-4 inline mr-1.5" /> 浏览器标签
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-none shadow-xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md overflow-hidden rounded-3xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-500" />
                添加新{activeTab === 'app' ? '应用' : '标签页'}
              </CardTitle>
              <CardDescription>配置一个新的唤醒目标</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">显示名称</label>
                  <Input
                    placeholder="例如：开发文档"
                    value={newForm.name}
                    onChange={e => setNewForm({ ...newForm, name: e.target.value })}
                    className="rounded-xl border-none bg-muted/50 focus-visible:ring-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">匹配模式 (正则)</label>
                    <button onClick={() => setShowPicker(true)} className="text-[10px] font-bold text-blue-500 hover:underline">从当前打开项选取</button>
                  </div>
                  <Input
                    placeholder={activeTab === 'app' ? "例如：Code.exe" : "例如：Github"}
                    value={newForm.pattern}
                    onChange={e => setNewForm({ ...newForm, pattern: e.target.value })}
                    className="rounded-xl border-none bg-muted/50 focus-visible:ring-blue-500 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">全局快捷键</label>
                  <div
                    onClick={() => setIsListeningShortcut('new')}
                    className={cn(
                      "w-full h-10 rounded-xl flex items-center justify-center font-mono font-bold text-sm cursor-pointer border-2 transition-all",
                      isListeningShortcut === 'new' ? "border-blue-500 bg-blue-500/10 text-blue-500" : "border-transparent bg-muted/50 text-muted-foreground"
                    )}
                  >
                    <Keyboard className="w-4 h-4 mr-2" />
                    {isListeningShortcut === 'new' ? "请在键盘按下..." : newForm.shortcut}
                  </div>
                </div>

                <Button
                  className="w-full mt-4 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                  onClick={handleAddNew}
                  disabled={!newForm.name || !newForm.pattern}
                >
                  确认添加
                </Button>
              </div>
            </CardContent>
          </Card>

          {statusMessage && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-500 text-xs font-bold text-center animate-bounce">
              {statusMessage}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {configs.filter(c => c.type === activeTab).length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center bg-muted/20 border-2 border-dashed border-muted-foreground/10 rounded-[2rem]">
              <Box className="w-12 h-12 text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground text-sm font-medium">暂无{activeTab === 'app' ? '本地应用' : '标签页'}配置项，请在左侧添加</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {configs.filter(c => c.type === activeTab).map(config => (
                <Card key={config.id + "-" + configs.length} className={cn(
                  "group border-none shadow-sm transition-all duration-300 rounded-3xl overflow-hidden hover:shadow-xl",
                  config.isActive ? "bg-blue-500/5 ring-2 ring-blue-500/20" : "bg-white dark:bg-zinc-900"
                )}>
                  <div className="p-5 flex flex-col h-full relative group/card overflow-hidden">
                    {/* 按钮组 - 绝对定位并置顶 */}
                    <div className="absolute top-4 right-4 flex items-center gap-1.5 z-40">
                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(config) }}
                        className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-xl text-muted-foreground bg-white dark:bg-zinc-800 shadow-md border border-border transition-all hover:scale-110 active:scale-95"
                        title="编辑"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(config.id) }}
                        className="w-8 h-8 flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 rounded-xl text-red-500 bg-white dark:bg-zinc-800 shadow-md border border-red-500/20 transition-all hover:scale-110 active:scale-95"
                        title="删除"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="flex items-start mb-4">
                      <div className="flex items-center gap-3 min-w-0 w-full pr-20">
                        <div className={cn("p-2.5 rounded-2xl shrink-0 shadow-sm", config.type === 'app' ? "bg-amber-500/10 text-amber-500" : "bg-blue-500/10 text-blue-500")}>
                          {config.type === 'app' ? <AppWindow size={20} /> : <Globe size={20} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-black text-sm truncate leading-tight mb-1" title={config.name}>{config.name}</h3>
                          <div className="flex items-center gap-1.5">
                            {config.isActive ? (
                              <span className="flex items-center gap-1 text-[9px] font-black text-emerald-500 uppercase">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> 活跃
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">待命中</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-muted/30 rounded-2xl p-3 mb-4 space-y-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground font-bold">匹配</span>
                        <span className="font-mono truncate max-w-[120px] text-foreground/70">{config.pattern}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">唤醒热键</span>
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-background rounded-md border border-border shadow-sm">
                          <Command size={10} className="text-muted-foreground" />
                          <span className="text-[10px] font-black font-mono">{config.shortcut}</span>
                        </div>
                      </div>
                    </div>

                    <Button
                      variant={config.isActive ? "default" : "outline"}
                      className={cn("mt-auto rounded-xl font-black text-xs h-10 border-2 transition-all", config.isActive ? "bg-blue-500 hover:bg-blue-600 border-transparent shadow-lg shadow-blue-500/20" : "hover:bg-blue-500/5 hover:border-blue-500/30 hover:text-blue-500")}
                      onClick={() => toggleTarget(config)}
                    >
                      {config.isActive ? "最小化 / 返回" : "立即唤醒"}
                      <ArrowRight size={14} className="ml-2" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col border-none shadow-2xl rounded-[2.5rem] bg-white dark:bg-zinc-900 overflow-hidden">
            <CardHeader className="border-b border-border/50 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black">选取目标</CardTitle>
                  <CardDescription>从当前打开的{activeTab === 'app' ? '系统窗口' : '浏览器标签'}中快速选择</CardDescription>
                </div>
                <button onClick={() => setShowPicker(false)} className="p-2 hover:bg-muted rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="搜索窗口标题或进程名..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10 rounded-2xl border-none bg-muted focus-visible:ring-blue-500"
                />
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin">
              {filteredWindows.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground font-medium">未找到匹配项</div>
              ) : (
                filteredWindows.map((win, idx) => (
                  <div
                    key={`${win.id}-${idx}`}
                    onClick={() => pickFromList(win)}
                    className="group flex items-center justify-between p-4 rounded-2xl hover:bg-blue-500/5 border-2 border-transparent hover:border-blue-500/20 cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-4 overflow-hidden">
                      <div className={cn("p-2.5 rounded-xl shrink-0", win.type === 'tab' ? "bg-blue-500/10 text-blue-500" : "bg-zinc-500/10 text-zinc-500")}>
                        {win.type === 'tab' ? <Globe size={18} /> : <Layout size={18} />}
                      </div>
                      <div className="overflow-hidden">
                        <div className="font-bold text-sm truncate group-hover:text-blue-500 transition-colors">{win.title}</div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{win.processName} · {win.type === 'tab' ? '网页标签' : '系统窗口'}</div>
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-muted-foreground opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-md border-none shadow-2xl rounded-[2.5rem] bg-white dark:bg-zinc-900 overflow-hidden">
            <CardHeader>
              <CardTitle className="font-black text-xl">编辑唤醒项</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">显示名称</label>
                <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="rounded-xl border-none bg-muted focus-visible:ring-blue-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">匹配模式</label>
                <Input value={editForm.pattern} onChange={e => setEditForm({ ...editForm, pattern: e.target.value })} className="rounded-xl border-none bg-muted focus-visible:ring-blue-500 font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">快捷键</label>
                <div
                  onClick={() => setIsListeningShortcut('edit')}
                  className={cn(
                    "w-full h-10 rounded-xl flex items-center justify-center font-mono font-bold text-sm cursor-pointer border-2",
                    isListeningShortcut === 'edit' ? "border-blue-500 bg-blue-500/10 text-blue-500" : "border-transparent bg-muted text-muted-foreground"
                  )}
                >
                  {isListeningShortcut === 'edit' ? "请在键盘按下..." : editForm.shortcut}
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setEditingId(null)}>取消</Button>
                <Button className="flex-1 rounded-xl font-bold bg-blue-600" onClick={saveEdit}>保存修改</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export default WebActivator
