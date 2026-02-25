import React, { useState, useEffect } from 'react'
import { Inbox, Power, Trash2, Eye } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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

export const FileDropoverTool: React.FC = () => {
  const [autoRemoveAfterDrag, setAutoRemoveAfterDrag] = useState(false)
  const [isFloatBallVisible, setIsFloatBallVisible] = useState(true)

  useEffect(() => {
    const savedAutoRemove = localStorage.getItem('floatball-autoRemoveAfterDrag')
    if (savedAutoRemove !== null) {
      setAutoRemoveAfterDrag(savedAutoRemove === 'true')
    }
    
    const savedVisible = localStorage.getItem('floatball-visible')
    if (savedVisible !== null) {
      setIsFloatBallVisible(savedVisible === 'true')
    }
  }, [])

  const handleAutoRemoveChange = (checked: boolean) => {
    setAutoRemoveAfterDrag(checked)
    localStorage.setItem('floatball-autoRemoveAfterDrag', checked.toString())
  }

  const handleToggleVisibility = () => {
    const newVisible = !isFloatBallVisible
    setIsFloatBallVisible(newVisible)
    localStorage.setItem('floatball-visible', newVisible.toString())
    
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.send('floatball-toggle-visibility', newVisible)
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
            <p className="font-medium">拖入文件</p>
            <p className="text-sm text-muted-foreground">将文件或文件夹拖到悬浮球上即可暂存</p>
          </div>
          <div className="space-y-2">
            <p className="font-medium">查看和拖出文件</p>
            <p className="text-sm text-muted-foreground">点击悬浮球展开文件列表，可直接拖出文件使用</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
