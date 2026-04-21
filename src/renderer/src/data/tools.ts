import { ToolDefinition } from '../../../shared/types'

export const tools: ToolDefinition[] = [
  {
    id: 'quick-installer',
    name: '极速装机',
    description: '基于 winget 的一键软件安装器',
    category: '系统维护',
    icon: 'Package',
    componentPath: 'QuickInstaller'
  },
  {
    id: 'dev-environment-manager',
    name: '开发环境',
    description: '检测、安装和更新常见开发环境',
    category: '系统维护',
    icon: 'Code',
    componentPath: 'DevEnvironmentManagerTool'
  },
  {
    id: 'space-cleanup',
    name: '空间分析',
    description: '扫描目录体积并快速清理大文件',
    category: '系统维护',
    icon: 'HardDrive',
    componentPath: 'SpaceCleanupTool'
  },
  {
    id: 'network-radar',
    name: '网络雷达',
    description: '局域网设备扫描与网络延迟监控',
    category: '系统维护',
    icon: 'Radar',
    componentPath: 'NetworkRadarTool'
  },
  {
    id: 'local-proxy-manager',
    name: '本地代理',
    description: '管理 Windows 系统代理与本地代理端口',
    category: '系统维护',
    icon: 'ShieldCheck',
    componentPath: 'LocalProxyManagerTool'
  },
  {
    id: 'wsl-manager',
    name: 'WSL 管理',
    description: '查看、切换和控制 WSL 发行版运行状态',
    category: '系统维护',
    icon: 'TerminalSquare',
    componentPath: 'WslManagerTool'
  },
  {
    id: 'config-checker',
    name: '配置检测',
    description: '深度硬件信息审计与导出',
    category: '系统维护',
    icon: 'Settings',
    componentPath: '../components/ConfigChecker'
  },
  {
    id: 'rename-tool',
    name: '批量重命名',
    description: '多规则文件批量处理引擎',
    category: '日常办公',
    icon: 'Inbox',
    componentPath: 'RenameTool'
  },
  {
    id: 'clipboard-manager',
    name: '剪贴板',
    description: '历史记录追踪与永久置顶',
    category: '日常办公',
    icon: 'Clipboard',
    componentPath: 'ClipboardManager'
  },
  {
    id: 'file-dropover',
    name: '传送门',
    description: '悬浮暂存区与跨屏文件流',
    category: '日常办公',
    icon: 'Inbox',
    componentPath: 'FileDropoverTool'
  },
  {
    id: 'download-organizer',
    name: '下载整理',
    description: '组合规则自动归档下载目录，并支持手动补扫',
    category: '日常办公',
    icon: 'Inbox',
    componentPath: 'DownloadOrganizerTool'
  },
  {
    id: 'bilibili-downloader',
    name: 'B站下载',
    description: '登录 Bilibili、解析链接并导出音视频文件',
    category: '媒体处理',
    icon: 'Download',
    componentPath: 'BilibiliDownloaderTool'
  },
  {
    id: 'screenshot-tool',
    name: '叠加截图',
    description: '支持聚焦叠加的高级截图工具',
    category: '媒体处理',
    icon: 'Camera',
    componentPath: 'SuperScreenshotTool'
  },
  {
    id: 'screen-recorder',
    name: '屏幕录制',
    description: '基于 FFmpeg 的极速录屏',
    category: '媒体处理',
    icon: 'Video',
    componentPath: 'ScreenRecorderTool'
  },
  {
    id: 'color-picker',
    name: '屏幕取色',
    description: '像素级取色与调色板管理',
    category: '媒体处理',
    icon: 'Palette',
    componentPath: 'ColorPickerTool'
  },
  {
    id: 'image-processor',
    name: '图片处理',
    description: '格式转换与批量压缩',
    category: '媒体处理',
    icon: 'Image',
    componentPath: 'ImageProcessorTool'
  },
  {
    id: 'bilibili-downloader',
    name: 'B站下载',
    description: '扫码登录后下载当前账号可访问的 B 站视频或剧集条目',
    category: '媒体处理',
    icon: 'Download',
    componentPath: 'BilibiliDownloaderTool'
  },
  {
    id: 'autoclicker',
    name: '连点器',
    description: '极速模拟鼠标连点操作',
    category: '实用工具',
    icon: 'MousePointer',
    componentPath: 'AutoClickerTool'
  },
  {
    id: 'capswriter',
    name: '语音输入',
    description: '高效离线语音转文字方案',
    category: '实用工具',
    icon: 'Mic',
    componentPath: 'CapsWriterTool'
  },
  {
    id: 'web-activator',
    name: '网页激活',
    description: '全局唤醒浏览器特定标签页',
    category: '实用工具',
    icon: 'Globe',
    componentPath: '../components/WebActivator'
  },
  {
    id: 'translator',
    name: '截屏翻译',
    description: '沉浸式屏幕区域识别与翻译',
    category: '实用工具',
    icon: 'Languages',
    componentPath: 'ScreenOverlayTranslatorTool'
  },
  {
    id: 'qrcode-tool',
    name: '二维码',
    description: '快速生成与实时扫码识别',
    category: '实用工具',
    icon: 'QrCode',
    componentPath: 'QRCodeTool'
  },
  {
    id: 'flip-clock',
    name: '时钟屏保',
    description: '经典极简翻页时钟效果',
    category: '实用工具',
    icon: 'Clock',
    componentPath: 'ScreenSaverTool'
  },
  {
    id: 'server-monitor',
    name: '服务器监控',
    description: '支持自定义域名的云端服务器监控看板',
    category: '系统维护',
    icon: 'Globe',
    componentPath: 'ServerMonitorTool'
  },
  {
    id: 'windows-manager',
    name: '管理面板',
    description: '快速唤起 Windows 常用管理面板',
    category: '系统维护',
    icon: 'LayoutGrid',
    componentPath: 'WindowsManagerTool'
  }
]
