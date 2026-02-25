export interface ToolComponent {
  id: string
  name: string
  description: string
  category: string
  size: number
  version: string
  icon: string
  installed: boolean
  downloadUrl?: string
}

export const toolCategories = [
  '系统工具',
  '文件处理',
  '多媒体',
  '网络工具',
  '效率工具'
]

export const toolComponents: ToolComponent[] = [
  {
    id: 'quick-installer',
    name: '极速装机',
    description: '一键安装常用软件，支持winget静默批量安装',
    category: '系统工具',
    size: 2,
    version: '1.0.0',
    icon: 'Package',
    installed: true
  },
  {
    id: 'rename-tool',
    name: '批量重命名',
    description: '批量重命名文件，支持序号、替换、前后缀等模式',
    category: '文件处理',
    size: 1,
    version: '1.0.0',
    icon: 'Terminal',
    installed: true
  },
  {
    id: 'autoclicker',
    name: '鼠标连点器',
    description: '自动鼠标点击，支持自定义间隔和按键',
    category: '效率工具',
    size: 1,
    version: '1.0.0',
    icon: 'MousePointer',
    installed: true
  },
  {
    id: 'capswriter',
    name: 'CapsWriter 语音',
    description: '离线语音转文字工具，支持语音输入和语音命令',
    category: '效率工具',
    size: 5,
    version: '1.0.0',
    icon: 'Mic',
    installed: true
  },
  {
    id: 'image-processor',
    name: '图片处理',
    description: '批量图片格式转换、压缩、调整大小',
    category: '多媒体',
    size: 3,
    version: '1.0.0',
    icon: 'Image',
    installed: true
  },
  {
    id: 'web-activator',
    name: '网页激活器',
    description: '自动激活网页元素，支持自定义规则',
    category: '网络工具',
    size: 1,
    version: '1.0.0',
    icon: 'Globe',
    installed: true
  },
  {
    id: 'flip-clock',
    name: '翻页时钟',
    description: '全屏翻页时钟屏保，适合桌面展示',
    category: '效率工具',
    size: 1,
    version: '1.0.0',
    icon: 'Clock',
    installed: true
  },
  {
    id: 'config-checker',
    name: '配置检测',
    description: '检测电脑硬件配置信息，一键生成配置报告',
    category: '系统工具',
    size: 1,
    version: '1.0.0',
    icon: 'Scan',
    installed: true
  },
  {
    id: 'screen-recorder',
    name: '屏幕录制',
    description: '录制屏幕操作，支持 MP4、GIF、WebM 多种格式',
    category: '多媒体',
    size: 8,
    version: '1.0.0',
    icon: 'Video',
    installed: true
  },
  {
    id: 'clipboard-manager',
    name: '剪贴板管理',
    description: '管理剪贴板历史记录，支持文本和图片，置顶收藏',
    category: '效率工具',
    size: 2,
    version: '1.0.0',
    icon: 'Clipboard',
    installed: true
  },
  {
    id: 'qr-generator',
    name: '二维码生成',
    description: '生成自定义二维码，支持添加Logo和样式调整',
    category: '效率工具',
    size: 1,
    version: '1.0.0',
    icon: 'QrCode',
    installed: true
  },
  {
    id: 'color-picker',
    name: '屏幕取色器',
    description: '屏幕取色工具，支持多种颜色格式复制和历史记录',
    category: '效率工具',
    size: 1,
    version: '1.0.0',
    icon: 'Palette',
    installed: true
  },
  {
    id: 'network-radar',
    name: '网络雷达',
    description: '实时监测网络延迟与速度，支持常用网站延迟测试和上下行速度测试',
    category: '网络工具',
    size: 1,
    version: '1.0.0',
    icon: 'Radar',
    installed: true
  },
  {
    id: 'file-dropover',
    name: '文件暂存悬浮球',
    description: '高颜值文件暂存工具，支持拖入拖出文件',
    category: '文件处理',
    size: 1,
    version: '1.0.0',
    icon: 'Inbox',
    installed: true
  },
  {
    id: 'screen-overlay-translator',
    name: '沉浸式截屏翻译',
    description: '全屏透明遮罩框选，OCR识别加翻译，玻璃质感设计',
    category: '效率工具',
    size: 2,
    version: '1.0.0',
    icon: 'Languages',
    installed: true
  }
]

export const getComponentsByCategory = (category: string): ToolComponent[] => {
  return toolComponents.filter(c => c.category === category)
}

export const getInstalledComponents = (): ToolComponent[] => {
  return toolComponents.filter(c => c.installed)
}
