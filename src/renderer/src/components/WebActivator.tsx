import React, { useState, useEffect, useCallback } from 'react'
import { Globe, Plus, Trash2, Edit2, Check, X, Keyboard, Eye, EyeOff, RefreshCw, Chrome, Monitor } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type BrowserType = 'chrome' | 'edge' | 'firefox' | 'any'

interface WebPageConfig {
  id: string
  name: string
  titlePattern: string
  browserType: BrowserType
  shortcut: string
  isActive: boolean
}

interface WindowInfo {
  id: number
  title: string
  processName: string
}

const defaultWebPages: WebPageConfig[] = [
  { id: '1', name: 'YouTube', titlePattern: 'YouTube', browserType: 'any', shortcut: 'Alt+Y', isActive: false },
  { id: '2', name: 'Bilibili', titlePattern: 'bilibili', browserType: 'any', shortcut: 'Alt+B', isActive: false },
  { id: '3', name: 'GitHub', titlePattern: 'GitHub', browserType: 'any', shortcut: 'Alt+G', isActive: false },
]

const browserOptions = [
  { value: 'any', label: '任意浏览器', icon: Monitor },
  { value: 'chrome', label: 'Chrome', icon: Chrome },
  { value: 'edge', label: 'Edge', icon: Monitor },
  { value: 'firefox', label: 'Firefox', icon: Monitor },
]

const WebActivator: React.FC = () => {
  const [webPages, setWebPages] = useState<WebPageConfig[]>(() => {
    const saved = localStorage.getItem('web-activator-config')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return defaultWebPages
      }
    }
    return defaultWebPages
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<WebPageConfig>>({})
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newForm, setNewForm] = useState<Partial<WebPageConfig>>({
    name: '',
    titlePattern: '',
    browserType: 'any',
    shortcut: 'Alt+'
  })
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [isListeningShortcut, setIsListeningShortcut] = useState<string | null>(null)
  const [windowList, setWindowList] = useState<WindowInfo[]>([])
  const [showWindowList, setShowWindowList] = useState(false)

  useEffect(() => {
    localStorage.setItem('web-activator-config', JSON.stringify(webPages))
  }, [webPages])

  useEffect(() => {
    if (!isListeningShortcut) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      
      const modifiers: string[] = []
      if (e.ctrlKey) modifiers.push('Ctrl')
      if (e.altKey) modifiers.push('Alt')
      if (e.shiftKey) modifiers.push('Shift')
      
      const key = e.key.toUpperCase()
      if (['CONTROL', 'ALT', 'SHIFT', 'META'].includes(key)) return
      
      const shortcut = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key
      
      if (isListeningShortcut === 'new') {
        setNewForm(prev => ({ ...prev, shortcut }))
      } else {
        setEditForm(prev => ({ ...prev, shortcut }))
      }
      setIsListeningShortcut(null)
    }
    
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isListeningShortcut])

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message)
    setTimeout(() => setStatusMessage(''), 3000)
  }, [])

  const fetchWindowList = async () => {
    if (!window.electron?.webActivator?.getWindowList) {
      showStatus('功能暂不可用')
      return
    }
    const result = await window.electron.webActivator.getWindowList()
    if (result.success) {
      setWindowList(result.windows || [])
    } else {
      showStatus(result.error || '获取窗口列表失败')
    }
  }

  const toggleWindow = async (config: WebPageConfig) => {
    if (!window.electron?.webActivator?.toggleWindow) {
      showStatus('功能暂未集成到主进程')
      return
    }

    try {
      const result = await window.electron.webActivator.toggleWindow({
        titlePattern: config.titlePattern,
        browserType: config.browserType
      })
      
      if (result.success) {
        const action = result.action === 'activated' ? '已激活到前台' : '已最小化到后台'
        showStatus(`${config.name} ${action}`)
        setWebPages(prev => prev.map(p => 
          p.id === config.id 
            ? { ...p, isActive: result.action === 'activated' }
            : p
        ))
      } else {
        showStatus(result.error || '未找到匹配窗口')
      }
    } catch (error) {
      showStatus('操作失败: ' + (error as Error).message)
    }
  }

  const handleEdit = (config: WebPageConfig) => {
    setEditingId(config.id)
    setEditForm({ ...config })
  }

  const handleSaveEdit = () => {
    if (!editForm.name?.trim() || !editForm.titlePattern?.trim()) {
      showStatus('请填写名称和标题匹配规则')
      return
    }
    
    setWebPages(prev => prev.map(p => 
      p.id === editingId ? { ...p, ...editForm } as WebPageConfig : p
    ))
    setEditingId(null)
    setEditForm({})
    showStatus('保存成功')
  }

  const handleDelete = (id: string) => {
    setWebPages(prev => prev.filter(p => p.id !== id))
    showStatus('已删除')
  }

  const handleAddNew = () => {
    if (!newForm.name?.trim() || !newForm.titlePattern?.trim()) {
      showStatus('请填写名称和标题匹配规则')
      return
    }
    
    const newConfig: WebPageConfig = {
      id: Date.now().toString(),
      name: newForm.name.trim(),
      titlePattern: newForm.titlePattern.trim(),
      browserType: newForm.browserType || 'any',
      shortcut: newForm.shortcut || 'Alt+',
      isActive: false
    }
    
    setWebPages(prev => [...prev, newConfig])
    setIsAddingNew(false)
    setNewForm({ name: '', titlePattern: '', browserType: 'any', shortcut: 'Alt+' })
    showStatus('添加成功')
  }

  const registerShortcuts = async () => {
    if (!window.electron?.webActivator?.registerShortcuts) {
      showStatus('快捷键注册功能暂未集成')
      return
    }
    
    const result = await window.electron.webActivator.registerShortcuts(webPages)
    if (result.success) {
      showStatus('快捷键注册成功')
    } else {
      showStatus(result.error || '注册失败')
    }
  }

  const getBrowserIcon = (type: BrowserType) => {
    const option = browserOptions.find(o => o.value === type)
    const Icon = option?.icon || Monitor
    return <Icon className="h-4 w-4" />
  }

  const getBrowserLabel = (type: BrowserType) => {
    return browserOptions.find(o => o.value === type)?.label || '任意浏览器'
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-sm border border-white/10">
            <Globe className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            网页激活器
          </h1>
        </div>
        <p className="text-muted-foreground">按快捷键一键激活/隐藏网页窗口</p>
      </div>

      {statusMessage && (
        <div className="fixed top-20 right-8 z-50 px-4 py-2 rounded-lg bg-green-500/90 text-white shadow-lg animate-in fade-in slide-in-from-top-2">
          {statusMessage}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button 
          variant="outline" 
          onClick={() => { setShowWindowList(!showWindowList); fetchWindowList() }}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          查看窗口
        </Button>
        <Button onClick={registerShortcuts} className="gap-2">
          <Keyboard className="h-4 w-4" />
          注册快捷键
        </Button>
      </div>

      {showWindowList && (
        <Card className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-white/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-400" />
              当前窗口列表
            </CardTitle>
            <CardDescription>显示当前打开的窗口，可用于确定标题匹配规则</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {windowList.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">点击"查看窗口"刷新列表</p>
              ) : (
                windowList.map((win) => (
                  <div key={win.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{win.title || '(无标题)'}</p>
                      <p className="text-xs text-muted-foreground">{win.processName}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(win.title)
                        showStatus('标题已复制')
                      }}
                    >
                      复制
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-white/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            网页配置
            <span className="text-xs font-normal text-muted-foreground bg-muted/50 px-2 py-1 rounded">
              {webPages.length} 个配置
            </span>
          </CardTitle>
          <CardDescription>配置要控制的网页窗口，设置标题匹配规则和快捷键</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {webPages.map((config) => (
            <div 
              key={config.id}
              className={cn(
                "p-4 rounded-xl border transition-all",
                config.isActive 
                  ? "border-green-500/50 bg-green-500/5" 
                  : "border-border/50 bg-card/50",
                editingId === config.id && "ring-2 ring-primary/50"
              )}
            >
              {editingId === config.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Input
                      placeholder="名称"
                      value={editForm.name || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                    <Input
                      placeholder="标题匹配"
                      value={editForm.titlePattern || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, titlePattern: e.target.value }))}
                    />
                    <select
                      value={editForm.browserType || 'any'}
                      onChange={(e) => setEditForm(prev => ({ ...prev, browserType: e.target.value as BrowserType }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {browserOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      onClick={() => setIsListeningShortcut(editingId)}
                      className={cn(isListeningShortcut === editingId && "border-blue-500 bg-blue-500/10")}
                    >
                      <Keyboard className="h-4 w-4 mr-2" />
                      {isListeningShortcut === editingId ? '按下...' : (editForm.shortcut || '快捷键')}
                    </Button>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setEditingId(null); setEditForm({}) }}>
                      <X className="h-4 w-4 mr-1" />
                      取消
                    </Button>
                    <Button size="sm" onClick={handleSaveEdit}>
                      <Check className="h-4 w-4 mr-1" />
                      保存
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-3 h-3 rounded-full",
                      config.isActive ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "bg-muted-foreground/30"
                    )} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{config.name}</span>
                        <span className="px-2 py-0.5 rounded text-xs font-mono bg-blue-500/10 border border-blue-500/30 text-blue-500">
                          {config.shortcut}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <span>匹配: <code className="text-xs bg-muted/50 px-1.5 py-0.5 rounded">{config.titlePattern}</code></span>
                        <span className="flex items-center gap-1 text-xs bg-muted/50 px-1.5 py-0.5 rounded">
                          {getBrowserIcon(config.browserType)}
                          {getBrowserLabel(config.browserType)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleWindow(config)}
                      className={cn(
                        config.isActive
                          ? "border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                          : "border-green-500/30 text-green-400 hover:bg-green-500/10"
                      )}
                    >
                      {config.isActive ? (
                        <><EyeOff className="h-4 w-4 mr-1" />隐藏</>
                      ) : (
                        <><Eye className="h-4 w-4 mr-1" />激活</>
                      )}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(config)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(config.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          
          {isAddingNew ? (
            <div className="p-4 rounded-xl border border-primary/50 bg-primary/5 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Input
                  placeholder="名称 (如: YouTube)"
                  value={newForm.name || ''}
                  onChange={(e) => setNewForm(prev => ({ ...prev, name: e.target.value }))}
                />
                <Input
                  placeholder="标题匹配 (如: YouTube)"
                  value={newForm.titlePattern || ''}
                  onChange={(e) => setNewForm(prev => ({ ...prev, titlePattern: e.target.value }))}
                />
                <select
                  value={newForm.browserType || 'any'}
                  onChange={(e) => setNewForm(prev => ({ ...prev, browserType: e.target.value as BrowserType }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {browserOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  onClick={() => setIsListeningShortcut('new')}
                  className={cn(isListeningShortcut === 'new' && "border-blue-500 bg-blue-500/10")}
                >
                  <Keyboard className="h-4 w-4 mr-2" />
                  {isListeningShortcut === 'new' ? '按下...' : (newForm.shortcut || '快捷键')}
                </Button>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setIsAddingNew(false); setNewForm({ name: '', titlePattern: '', browserType: 'any', shortcut: 'Alt+' }) }}>
                  <X className="h-4 w-4 mr-1" />
                  取消
                </Button>
                <Button size="sm" onClick={handleAddNew}>
                  <Check className="h-4 w-4 mr-1" />
                  添加
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingNew(true)}
              className="w-full p-4 rounded-xl border-2 border-dashed border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-center gap-2 text-muted-foreground hover:text-primary"
            >
              <Plus className="h-5 w-5" />
              添加新网页配置
            </button>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-white/20">
        <CardHeader>
          <CardTitle>使用说明</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
            <div className="space-y-2">
              <p className="font-medium text-foreground">基本操作</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>点击"激活"按钮将匹配的窗口置于前台</li>
                <li>再次点击"隐藏"将窗口最小化</li>
                <li>配置会自动保存到本地</li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-foreground">浏览器选择</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>选择特定浏览器可提高匹配精度</li>
                <li>"任意浏览器"会搜索所有浏览器窗口</li>
                <li>点击"查看窗口"可看到当前所有窗口</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default WebActivator
