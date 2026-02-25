export interface Software {
  id: string
  name: string
  description: string
  category: string
  source: 'winget' | 'msstore'
  icon?: string
  size?: number
}

export const softwareCategories = [
  '社交与通讯',
  '影音与娱乐',
  '系统增强与文件管理',
  '生产力与效率',
  '开发与运维',
  '网络、传输与浏览器',
  '输入法',
  '下载工具',
  '安全防护'
]

export const softwareList: Software[] = [
  {
    id: 'Tencent.WeChat.Universal',
    name: '微信',
    description: '国民通讯软件',
    category: '社交与通讯',
    source: 'winget',
    size: 180
  },
  {
    id: 'Tencent.QQ',
    name: 'QQ',
    description: '办公与文件传输',
    category: '社交与通讯',
    source: 'winget',
    size: 220
  },
  {
    id: 'NetEase.MailMaster',
    name: '网易邮箱大师',
    description: '全能邮箱客户端',
    category: '社交与通讯',
    source: 'winget',
    size: 85
  },
  {
    id: 'NetEase.CloudMusic',
    name: '网易云音乐',
    description: '听歌必备',
    category: '影音与娱乐',
    source: 'winget',
    size: 150
  },
  {
    id: 'voidtools.Everything',
    name: 'Everything',
    description: '秒搜全盘文件',
    category: '系统增强与文件管理',
    source: 'winget',
    size: 3
  },
  {
    id: 'Bopsoft.Listary',
    name: 'Listary',
    description: '双击Ctrl快速搜索',
    category: '系统增强与文件管理',
    source: 'winget',
    size: 15
  },
  {
    id: 'Bandisoft.Bandizip',
    name: 'Bandizip',
    description: '纯净无广解压缩',
    category: '系统增强与文件管理',
    source: 'winget',
    size: 45
  },
  {
    id: 'LiErHeXun.Quicker',
    name: 'Quicker',
    description: '指尖工具箱/效率神器',
    category: '生产力与效率',
    source: 'winget',
    size: 80
  },
  {
    id: 'ogdesign.Eagle',
    name: 'Eagle',
    description: '设计师素材管理',
    category: '生产力与效率',
    source: 'winget',
    size: 120
  },
  {
    id: 'ByteDance.Doubao',
    name: '豆包',
    description: '字节跳动AI助手',
    category: '生产力与效率',
    source: 'winget',
    size: 95
  },
  {
    id: 'Youdao.YoudaoTranslate',
    name: '有道翻译',
    description: '屏幕取词/翻译',
    category: '生产力与效率',
    source: 'winget',
    size: 65
  },
  {
    id: 'JetBrains.PyCharm.Community',
    name: 'PyCharm',
    description: 'Python开发/社区版',
    category: '开发与运维',
    source: 'winget',
    size: 350
  },
  {
    id: 'Baidu.BaiduNetdisk',
    name: '百度网盘',
    description: '云存储下载',
    category: '网络、传输与浏览器',
    source: 'winget',
    size: 110
  },
  {
    id: 'Alibaba.QuarkCloudDrive',
    name: '夸克网盘',
    description: '极速云盘/资源备份',
    category: '网络、传输与浏览器',
    source: 'winget',
    size: 90
  },
  {
    id: 'Youqu.ToDesk',
    name: 'ToDesk',
    description: '流畅的远程控制',
    category: '网络、传输与浏览器',
    source: 'winget',
    size: 25
  },
  {
    id: 'iFlytek.iFlyIME',
    name: '讯飞输入法',
    description: '高效语音输入/智能识别',
    category: '输入法',
    source: 'winget',
    size: 75
  },
  {
    id: 'Thunder.Thunder',
    name: '迅雷',
    description: '高速下载工具/资源加速',
    category: '下载工具',
    source: 'winget',
    size: 130
  },
  {
    id: 'XPDNH1FMW7NB40',
    name: '火绒安全',
    description: '安静不打扰的防护',
    category: '安全防护',
    source: 'msstore',
    size: 55
  }
]

export const getSoftwareByCategory = (category: string): Software[] => {
  return softwareList.filter(s => s.category === category)
}
