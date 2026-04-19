export type SystemToolCategory = 'System' | 'Network' | 'Hardware' | 'Advanced'

export interface SystemTool {
  id: string
  name: string
  description: string
  command: string
  iconKey: string
  category: SystemToolCategory
}

export const categoryOrder: SystemToolCategory[] = ['System', 'Network', 'Hardware', 'Advanced']

export const categoryNames: Record<SystemToolCategory, string> = {
  System: '系统管理',
  Network: '网络配置',
  Hardware: '硬件管理',
  Advanced: '高级工具'
}

export const defaultPinnedToolIds = [
  'control',
  'taskmgr',
  'powershell',
  'services',
  'devmgmt',
  'diskmgmt',
  'appwiz',
  'sysdm'
]

export const systemTools: SystemTool[] = [
  { id: 'control', name: '控制面板', description: 'Windows 经典控制中心', command: 'control', iconKey: 'Settings', category: 'System' },
  { id: 'taskmgr', name: '任务管理器', description: '查看进程、性能与启动项', command: 'taskmgr', iconKey: 'Activity', category: 'System' },
  { id: 'appwiz', name: '程序和功能', description: '卸载程序或启用 Windows 功能', command: 'appwiz.cpl', iconKey: 'List', category: 'System' },
  { id: 'sysdm', name: '系统属性', description: '环境变量、远程与高级设置', command: 'sysdm.cpl', iconKey: 'Monitor', category: 'System' },
  { id: 'winver', name: '系统版本', description: '查看当前 Windows 版本信息', command: 'winver', iconKey: 'Info', category: 'System' },
  { id: 'services', name: '系统服务', description: '管理后台运行的服务', command: 'services.msc', iconKey: 'List', category: 'System' },
  { id: 'msconfig', name: '系统配置', description: '管理启动项与引导配置', command: 'msconfig', iconKey: 'SlidersHorizontal', category: 'System' },
  { id: 'eventvwr', name: '事件查看器', description: '查看系统日志与错误记录', command: 'eventvwr.msc', iconKey: 'Info', category: 'System' },
  { id: 'compmgmt', name: '计算机管理', description: '综合管理控制台入口', command: 'compmgmt.msc', iconKey: 'Monitor', category: 'System' },
  { id: 'regedit', name: '注册表编辑器', description: '修改系统核心配置', command: 'regedit', iconKey: 'Database', category: 'System' },
  { id: 'gpedit', name: '组策略编辑器', description: '配置系统策略（专业版/企业版）', command: 'gpedit.msc', iconKey: 'ShieldCheck', category: 'System' },
  { id: 'netplwiz', name: '用户账户', description: '管理本机登录账户与自动登录', command: 'netplwiz', iconKey: 'Users', category: 'System' },
  { id: 'cleanmgr', name: '磁盘清理', description: '清理系统临时文件与更新缓存', command: 'cleanmgr', iconKey: 'Sparkles', category: 'System' },

  { id: 'ncpa', name: '网络连接', description: '管理适配器与网络设置', command: 'ncpa.cpl', iconKey: 'Network', category: 'Network' },
  { id: 'inetcpl', name: 'Internet 选项', description: '代理、连接与浏览器基础设置', command: 'inetcpl.cpl', iconKey: 'Globe', category: 'Network' },
  { id: 'firewall', name: 'Windows 防火墙', description: '查看和调整防火墙状态', command: 'firewall.cpl', iconKey: 'Shield', category: 'Network' },
  { id: 'wf', name: '高级防火墙', description: '高级安全规则与入站出站策略', command: 'wf.msc', iconKey: 'ShieldCheck', category: 'Network' },

  { id: 'devmgmt', name: '设备管理器', description: '管理驱动与硬件设备', command: 'devmgmt.msc', iconKey: 'Cpu', category: 'Hardware' },
  { id: 'diskmgmt', name: '磁盘管理', description: '分区、格式化与卷管理', command: 'diskmgmt.msc', iconKey: 'HardDrive', category: 'Hardware' },
  { id: 'resmon', name: '资源监视器', description: '深度分析 CPU、磁盘与网络占用', command: 'resmon', iconKey: 'Activity', category: 'Hardware' },
  { id: 'mmsys', name: '声音设置', description: '播放、录音与默认设备管理', command: 'mmsys.cpl', iconKey: 'Volume2', category: 'Hardware' },
  { id: 'mouse', name: '鼠标属性', description: '按键、指针与滚轮行为设置', command: 'main.cpl', iconKey: 'MousePointer', category: 'Hardware' },

  { id: 'powershell', name: 'PowerShell', description: '现代化脚本终端', command: 'powershell', iconKey: 'TerminalSquare', category: 'Advanced' },
  { id: 'cmd', name: '命令提示符', description: '经典命令行终端', command: 'cmd', iconKey: 'Terminal', category: 'Advanced' },
  { id: 'optionalfeatures', name: '可选功能', description: '启用或关闭 Windows 可选功能', command: 'optionalfeatures', iconKey: 'Layout', category: 'Advanced' },
  { id: 'certmgr', name: '证书管理', description: '查看当前用户证书存储', command: 'certmgr.msc', iconKey: 'KeyRound', category: 'Advanced' },
  { id: 'lusrmgr', name: '本地用户和组', description: '管理本地账户与组（非家庭版）', command: 'lusrmgr.msc', iconKey: 'Users', category: 'Advanced' },
  { id: 'secpol', name: '本地安全策略', description: '调整安全策略（非家庭版）', command: 'secpol.msc', iconKey: 'LockKeyhole', category: 'Advanced' }
]

const systemToolIds = new Set(systemTools.map((tool) => tool.id))

export function getPinnedToolIds(savedIds?: string[] | null) {
  if (savedIds == null) {
    return [...defaultPinnedToolIds]
  }

  return savedIds.filter((id) => systemToolIds.has(id))
}

export function getPinnedSystemTools(savedIds?: string[] | null) {
  return getPinnedToolIds(savedIds)
    .map((id) => systemTools.find((tool) => tool.id === id))
    .filter((tool): tool is SystemTool => Boolean(tool))
}

export function groupSystemToolsByCategory() {
  const groups = Object.fromEntries(categoryOrder.map((category) => [category, [] as SystemTool[]])) as Record<
    SystemToolCategory,
    SystemTool[]
  >

  for (const tool of systemTools) {
    groups[tool.category].push(tool)
  }

  return groups
}
