import React, { useEffect, useState } from 'react'
import { Rocket, Moon, Minimize2, Info, Github, Heart, Inbox } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'

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
  const [autoStartEnabled, setAutoStartEnabled] = useState(false)
  const [minimizeToTray, setMinimizeToTray] = useState(true)
  const [autoRemoveAfterDrag, setAutoRemoveAfterDrag] = useState(false)

  useEffect(() => {
    const loadSettings = async () => {
      if (window.electron?.autoStart) {
        const status = await window.electron.autoStart.getStatus()
        setAutoStartEnabled(status.enabled)
      }
      
      const savedAutoRemove = localStorage.getItem('floatball-autoRemoveAfterDrag')
      if (savedAutoRemove !== null) {
        setAutoRemoveAfterDrag(savedAutoRemove === 'true')
      }
    }
    loadSettings()
  }, [])

  const handleAutoStartChange = async (checked: boolean) => {
    if (window.electron?.autoStart) {
      const result = await window.electron.autoStart.set(checked)
      if (result.success) {
        setAutoStartEnabled(checked)
      }
    }
  }

  const handleAutoRemoveChange = (checked: boolean) => {
    setAutoRemoveAfterDrag(checked)
    localStorage.setItem('floatball-autoRemoveAfterDrag', checked.toString())
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">设置</h2>
        <p className="text-muted-foreground">管理应用偏好设置</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>通用设置</CardTitle>
          <CardDescription>配置应用的基本行为</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingItem
            icon={<Rocket size={18} className="text-primary" />}
            title="开机自启"
            description="系统启动时自动运行 onetool"
            checked={autoStartEnabled}
            onCheckedChange={handleAutoStartChange}
          />
          <SettingItem
            icon={<Minimize2 size={18} className="text-primary" />}
            title="最小化到托盘"
            description="关闭窗口时最小化到系统托盘而不是退出"
            checked={minimizeToTray}
            onCheckedChange={setMinimizeToTray}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox size={20} className="text-primary" />
            悬浮球设置
          </CardTitle>
          <CardDescription>配置文件暂存悬浮球</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingItem
            icon={<Inbox size={18} className="text-primary" />}
            title="拖出文件后自动从暂存区移除记录"
            description="从悬浮球拖出文件后自动删除该文件记录"
            checked={autoRemoveAfterDrag}
            onCheckedChange={handleAutoRemoveChange}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>外观设置</CardTitle>
          <CardDescription>自定义应用外观（开发中）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Moon size={18} className="text-primary" />
              </div>
              <div>
                <p className="font-medium">深色模式</p>
                <p className="text-sm text-muted-foreground">切换应用主题（即将支持）</p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">敬请期待</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info size={20} className="text-primary" />
            关于
          </CardTitle>
          <CardDescription>应用信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-muted-foreground">应用名称</p>
              <p className="font-medium">onetool</p>
            </div>
            <div className="p-2 bg-primary/10 rounded-lg">
              <Rocket size={18} className="text-primary" />
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-muted-foreground">版本</p>
              <p className="font-medium">1.0.0</p>
            </div>
            <div className="p-2 bg-primary/10 rounded-lg">
              <Info size={18} className="text-primary" />
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-muted-foreground">作者</p>
              <p className="font-medium">八骏马</p>
            </div>
            <div className="p-2 bg-primary/10 rounded-lg">
              <Github size={18} className="text-primary" />
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-muted-foreground">B站空间</p>
              <a 
                href="https://space.bilibili.com/35149135" 
                target="_blank" 
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline"
              >
                space.bilibili.com/35149135
              </a>
            </div>
            <div className="p-2 bg-primary/10 rounded-lg">
              <Heart size={18} className="text-primary" />
            </div>
          </div>
          <div className="pt-4 border-t border-white/10">
            <p className="text-xs text-muted-foreground text-center">
              © 2025 八骏马. All rights reserved.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
