import React, { useEffect, useState } from 'react'
import { Rocket, Moon, Minimize2, Info, Github, Heart, Inbox, Camera, Save } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, isLoading } = useSettings()
  const [autoStartEnabled, setAutoStartEnabled] = useState(false)
  const [minimizeToTray, setMinimizeToTray] = useState(true)
  const [autoRemoveAfterDrag, setAutoRemoveAfterDrag] = useState(false)

  useEffect(() => {
    const checkAutoStart = async () => {
      if (window.electron?.autoStart) {
        const status = await window.electron.autoStart.getStatus()
        if (status.success && status.data) setAutoStartEnabled(status.data.enabled)
      }
    }
    checkAutoStart()
    
    const savedAutoRemove = localStorage.getItem('floatball-autoRemoveAfterDrag')
    if (savedAutoRemove !== null) setAutoRemoveAfterDrag(savedAutoRemove === 'true')
  }, [])

  const handleAutoStartChange = async (checked: boolean) => {
    if (window.electron?.autoStart) {
      const result = await window.electron.autoStart.set(checked)
      if (result.success) setAutoStartEnabled(checked)
    }
  }

  const handleAutoRemoveChange = (checked: boolean) => {
    setAutoRemoveAfterDrag(checked)
    localStorage.setItem('floatball-autoRemoveAfterDrag', checked.toString())
  }

  const handleSelectScreenshotPath = async () => {
    if (!window.electron?.screenshot) return
    const res = await window.electron.screenshot.selectDirectory()
    if (res.success && res.data && !res.data.canceled && res.data.path) {
      updateSettings({ screenshotSavePath: res.data.path })
    }
  }

  if (isLoading || !settings) {
    return <div className="p-8 text-center text-muted-foreground">加载设置中...</div>
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      <div>
        <h2 className="text-2xl font-bold mb-2 tracking-tight">全局设置</h2>
        <p className="text-muted-foreground text-sm">管理应用通用行为与各工具偏好</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-none shadow-xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md rounded-3xl">
          <CardHeader>
            <CardTitle className="text-lg font-bold">通用</CardTitle>
            <CardDescription>应用级基本行为配置</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <SettingItem
              icon={<Rocket size={18} className="text-blue-500" />}
              title="开机自启"
              description="系统启动时自动运行 onetool"
              checked={autoStartEnabled}
              onCheckedChange={handleAutoStartChange}
            />
            <SettingItem
              icon={<Minimize2 size={18} className="text-purple-500" />}
              title="最小化到托盘"
              description="点击关闭按钮时隐藏到托盘"
              checked={minimizeToTray}
              onCheckedChange={setMinimizeToTray}
            />
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md rounded-3xl">
          <CardHeader>
            <CardTitle className="text-lg font-bold">截图设置</CardTitle>
            <CardDescription>自动化与存储偏好</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <SettingItem
                icon={<Camera size={18} className="text-cyan-500" />}
                title="自动保存"
                description="截图完成后自动写入文件"
                checked={settings.autoSaveScreenshot}
                onCheckedChange={(val) => updateSettings({ autoSaveScreenshot: val })}
              />
              
              <div className="space-y-2 pt-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1">默认保存目录</label>
                <div className="flex gap-2">
                  <Input 
                    value={settings.screenshotSavePath} 
                    readOnly 
                    placeholder="系统图片目录 (默认)"
                    className="rounded-xl border-none bg-muted/50 text-xs font-mono"
                  />
                  <Button variant="outline" size="sm" onClick={handleSelectScreenshotPath} className="rounded-xl">更改</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <Inbox className="w-5 h-5 text-indigo-500" />
            文件传送门 (Dropover)
          </CardTitle>
          <CardDescription>配置悬浮窗与文件处理逻辑</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingItem
            icon={<Save size={18} className="text-indigo-500" />}
            title="拖拽后自动移除"
            description="文件成功拖出到其他应用后，自动从传送门列表中移除"
            checked={autoRemoveAfterDrag}
            onCheckedChange={handleAutoRemoveChange}
          />
        </CardContent>
      </Card>

      <Card className="border-none shadow-2xl bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-[2rem] overflow-hidden">
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center backdrop-blur-xl">
              <Info size={40} className="text-white" />
            </div>
            <div className="flex-1 text-center md:text-left space-y-2">
              <h3 className="text-2xl font-black italic">OneTool Toolbox v1.0</h3>
              <p className="text-white/70 text-sm font-medium leading-relaxed">
                感谢支持开源项目。如果您喜欢这个工具，可以在 Github 上为我们点个 Star 或者通过下方的按钮进行赞赏。您的支持是我们持续更新的最大动力。
              </p>
              <div className="flex flex-wrap justify-center md:justify-start gap-3 pt-4">
                <Button variant="secondary" size="sm" className="rounded-xl font-bold gap-2 text-indigo-600">
                  <Github size={16} /> GitHub
                </Button>
                <Button variant="secondary" size="sm" className="rounded-xl font-bold gap-2 bg-pink-500 hover:bg-pink-600 text-white border-none">
                  <Heart size={16} fill="white" /> 赞赏支持
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
