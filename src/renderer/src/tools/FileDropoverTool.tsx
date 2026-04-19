import React, { useState, useEffect } from 'react'
import { Inbox, Power, Trash2, Eye } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useSettings } from '../hooks/useSettings'

interface SettingItemProps {
  icon: React.ReactNode
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

const SettingItem: React.FC<SettingItemProps> = ({ icon, title, description, checked, onCheckedChange }) => (
  <div className="flex items-center justify-between py-4 border-b border-white/10 last:border-0">
    <div className="flex items-center gap-3">
      <div className="p-2 bg-primary/10 rounded-lg">
        {icon}
      </div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
    <Checkbox
      checked={checked}
      onCheckedChange={onCheckedChange}
    />
  </div>
)

export const FileDropoverTool: React.FC = () => {
  const { settings, updateSettings } = useSettings()
  const [autoRemoveAfterDrag, setAutoRemoveAfterDrag] = useState(false)
  const [isFloatBallVisible, setIsFloatBallVisible] = useState(true)

  const [localHotkey, setLocalHotkey] = useState('')
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false)
  const [isSavingHotkey, setIsSavingHotkey] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const syncFloatBallVisibility = async () => {
    if (!window.electron?.floatBall?.getState) {
      return
    }

    try {
      const res = await window.electron.floatBall.getState()
      if (res.success && typeof res.data?.visible === 'boolean') {
        setIsFloatBallVisible(res.data.visible)
      }
    } catch (_error) {
    }
  }

  useEffect(() => {
    if (settings?.floatBallHotkey && !isRecordingHotkey) {
      setLocalHotkey(settings.floatBallHotkey)
    }
  }, [settings?.floatBallHotkey, isRecordingHotkey])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isRecordingHotkey) return
      e.preventDefault()

      const keys: string[] = []
      if (e.ctrlKey || e.metaKey) keys.push('CommandOrControl')
      if (e.altKey) keys.push('Alt')
      if (e.shiftKey) keys.push('Shift')

      const key = e.key.toUpperCase()
      if (!['CONTROL', 'ALT', 'SHIFT', 'META'].includes(key)) {
        if (key === ' ') keys.push('Space')
        else if (key.length === 1 || key.startsWith('F')) keys.push(key)

        if (keys.length > 0) {
          setLocalHotkey(keys.join('+'))
          setIsRecordingHotkey(false)
        }
      }
    }

    if (isRecordingHotkey) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isRecordingHotkey])

  useEffect(() => {
    const savedAutoRemove = localStorage.getItem('floatball-autoRemoveAfterDrag')
    if (savedAutoRemove !== null) {
      setAutoRemoveAfterDrag(savedAutoRemove === 'true')
    }

    void syncFloatBallVisibility()
  }, [])

  useEffect(() => {
    const unsubscribe = window.electron?.floatBall?.onVisibilityChanged?.((visible: boolean) => {
      setIsFloatBallVisible(visible)
    })
    return () => {
      unsubscribe?.()
    }
  }, [])

  const handleSaveHotkey = async () => {
    if (!window.electron?.floatBall?.setHotkey) return
    setIsSavingHotkey(true)
    try {
      const res = await window.electron.floatBall.setHotkey(localHotkey)
      if (res.success) {
        updateSettings({ floatBallHotkey: localHotkey })
        showToast('快捷键已更新', 'success')
      } else {
        showToast(`设置失败: ${res.error}`, 'error')
        setLocalHotkey(settings?.floatBallHotkey || 'Alt+Shift+F')
      }
    } catch (e) {
      showToast(`保存出错: ${(e as Error).message}`, 'error')
      setLocalHotkey(settings?.floatBallHotkey || 'Alt+Shift+F')
    } finally {
      setIsSavingHotkey(false)
    }
  }

  const handleAutoRemoveChange = (checked: boolean) => {
    setAutoRemoveAfterDrag(checked)
    localStorage.setItem('floatball-autoRemoveAfterDrag', checked.toString())
  }

  const handleToggleVisibility = async () => {
    let currentVisible = isFloatBallVisible

    if (window.electron?.floatBall?.getState) {
      try {
        const res = await window.electron.floatBall.getState()
        if (res.success && typeof res.data?.visible === 'boolean') {
          currentVisible = res.data.visible
        }
      } catch (_error) {
      }
    }

    const newVisible = !currentVisible
    setIsFloatBallVisible(newVisible)

    if (window.electron?.floatBall?.setVisible) {
      window.electron.floatBall.setVisible(newVisible)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">文件暂存悬浮球</h2>
        <p className="text-muted-foreground">高颜值文件暂存工具，支持拖入拖出文件</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox size={20} className="text-primary" />
            悬浮球状态
          </CardTitle>
          <CardDescription>控制悬浮球的显示和隐藏</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Eye size={18} className="text-primary" />
              </div>
              <div>
                <p className="font-medium">显示悬浮球</p>
                <p className="text-sm text-muted-foreground">在桌面上显示文件暂存悬浮球</p>
              </div>
            </div>
            <Button
              variant={isFloatBallVisible ? "default" : "secondary"}
              onClick={handleToggleVisibility}
              className="flex items-center gap-2"
            >
              <Power size={16} />
              {isFloatBallVisible ? '已启用' : '已禁用'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox size={20} className="text-primary" />
            功能设置
          </CardTitle>
          <CardDescription>配置悬浮球的行为</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingItem
            icon={<Trash2 size={18} className="text-primary" />}
            title="拖出文件后自动从暂存区移除记录"
            description="从悬浮球拖出文件后自动删除该文件记录"
            checked={autoRemoveAfterDrag}
            onCheckedChange={handleAutoRemoveChange}
          />

          <div className="pt-4 border-t border-white/10 mt-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-medium">全局快捷键</p>
                <p className="text-sm text-muted-foreground">随时随地通过快捷键呼出或隐藏悬浮球</p>
              </div>
              <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">全局生效</span>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={isRecordingHotkey ? '正在录入...' : localHotkey.replace('CommandOrControl+', 'Ctrl+')}
                  readOnly
                  onClick={() => setIsRecordingHotkey(true)}
                  className={`w-full bg-black/20 border-2 rounded-xl px-4 py-3 text-center font-mono font-bold transition-all cursor-pointer ${isRecordingHotkey ? 'border-primary shadow-lg shadow-primary/20 text-primary scale-[1.02]' : 'border-white/10 hover:border-white/30'
                    }`}
                />
                {!isRecordingHotkey && (
                  <div className="absolute top-1/2 -translate-y-1/2 right-3 text-white/20">
                    🖱️
                  </div>
                )}
              </div>
              <Button
                onClick={handleSaveHotkey}
                disabled={isSavingHotkey || isRecordingHotkey || localHotkey === settings?.floatBallHotkey}
                className="h-auto font-bold px-6 rounded-xl"
              >
                {isSavingHotkey ? '...' : (localHotkey === settings?.floatBallHotkey ? '已保存' : '保存')}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-2 italic">
              {isRecordingHotkey ? '请在键盘上按下组合键' : '点击输入框可重新设置快捷键'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox size={20} className="text-primary" />
            使用说明
          </CardTitle>
          <CardDescription>如何使用文件暂存悬浮球</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="font-medium">拖拽移动</p>
            <p className="text-sm text-muted-foreground">按住悬浮球可以在桌面上任意拖动位置</p>
          </div>
          <div className="space-y-2">
            <p className="font-medium">全局快捷键</p>
            <p className="text-sm text-muted-foreground">您可以通过全局快捷键在任意界面快速召唤悬浮球，支持优雅淡入淡出动画</p>
          </div>
          <div className="space-y-2">
            <p className="font-medium">拖入文件</p>
            <p className="text-sm text-muted-foreground">将文件或文件夹拖到悬浮球上即可暂存</p>
          </div>
          <div className="space-y-2">
            <p className="font-medium">查看和拖出文件</p>
            <p className="text-sm text-muted-foreground">点击悬浮球展开文件列表，可直接拖出文件使用</p>
          </div>
        </CardContent>
      </Card>

      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg z-50 transition-all ${toast.type === 'success' ? 'bg-green-500/90' : 'bg-red-500/90'
          }`}>
          <div className="flex items-center gap-2 text-white text-sm">
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default FileDropoverTool
