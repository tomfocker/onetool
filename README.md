# onetool - 高颜值本地小工具箱

一个基于 Electron + React + Tailwind CSS + shadcn/ui 构建的现代化本地工具箱应用，包含 15+ 实用工具。

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## ✨ 特性

- 🎨 **现代化界面** - 深色主题，玻璃质感设计
- 🚀 **15+ 实用工具** - 涵盖系统、文件、多媒体、网络、效率等多个类别
- 💻 **跨平台支持** - Windows、macOS、Linux
- 🔒 **本地运行** - 所有工具本地执行，保护隐私
- ⚡ **高性能** - 基于 Electron + Vite，快速响应

## 🛠️ 技术栈

- **Electron** - 桌面应用框架
- **React 18** - UI 库
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Tailwind CSS** - 样式框架
- **shadcn/ui** - UI 组件库
- **Lucide React** - 图标库

## 📦 工具列表

### 系统工具
- ⚡ **极速装机** - 一键安装常用软件，支持 winget 静默批量安装
- 🔍 **配置检测** - 检测电脑硬件配置信息，一键生成配置报告

### 文件处理
- 📝 **批量重命名** - 批量重命名文件，支持序号、替换、前后缀等模式
- 📦 **文件暂存悬浮球** - 高颜值文件暂存工具，支持拖入拖出文件

### 多媒体
- 🖼️ **图片处理** - 批量图片格式转换、压缩、调整大小
- 🎨 **取色器** - 屏幕取色工具，支持多种颜色格式
- 🎬 **屏幕录制** - 录制屏幕操作，支持 MP4、GIF、WebM 多种格式

### 网络工具
- 🌐 **网页激活器** - 自动激活网页元素，支持自定义规则
- 📡 **网络雷达** - 实时监测网络延迟与速度，支持常用网站延迟测试和上下行速度测试

### 效率工具
- 🖱️ **鼠标连点器** - 自动鼠标点击，支持自定义间隔和按键
- 🎤 **CapsWriter 语音** - 离线语音转文字工具，支持语音输入和语音命令
- 📋 **剪贴板管理** - 管理剪贴板历史记录，支持文本和图片，置顶收藏
- 📱 **二维码生成** - 生成自定义二维码，支持添加 Logo 和样式调整
- 🕐 **翻页时钟** - 全屏翻页时钟屏保，适合桌面展示
- 🌍 **沉浸式截屏翻译** - 全屏透明遮罩框选，OCR 识别加翻译，玻璃质感设计

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建应用

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## 📂 项目结构

```
tool/
├── src/
│   ├── main/           # Electron 主进程
│   ├── preload/        # 预加载脚本
│   └── renderer/       # 渲染进程
│       └── src/
│           ├── components/  # React 组件
│           │   ├── ui/      # shadcn/ui 组件
│           │   ├── Sidebar.tsx
│           │   ├── Header.tsx
│           │   └── Dashboard.tsx
│           ├── tools/       # 工具组件
│           ├── data/        # 数据定义
│           ├── lib/         # 工具函数
│           ├── App.tsx
│           ├── main.tsx
│           └── index.css
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── electron.vite.config.ts
```

## 👤 作者

**八骏马**

- Bilibili: [https://space.bilibili.com/35149135](https://space.bilibili.com/35149135)

## 📄 许可证

MIT License
