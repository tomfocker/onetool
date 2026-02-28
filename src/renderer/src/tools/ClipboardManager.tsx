import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Clipboard,
  Copy,
  Trash2,
  Search,
  X,
  Image,
  FileText,
  Clock,
  Pin,
  PinOff,
  ChevronDown,
  Check,
  AlertCircle,
  Settings as SettingsIcon,
  Keyboard
} from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'

interface ClipboardItem {
  id: string
  type: 'text' | 'image'
  content: string
  preview?: string
  timestamp: number
  pinned: boolean
  copied?: boolean
}

type FilterType = 'all' | 'text' | 'image'
type SortType = 'newest' | 'oldest' | 'pinned'

const ClipboardManager: React.FC = () => {
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [sortBy, setSortBy] = useState<SortType>('newest')
  const [isListening, setIsListening] = useState(true)
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const { settings, updateSettings } = useSettings()

  const [isEditingHotkey, setIsEditingHotkey] = useState(false)
  const [tempHotkey, setTempHotkey] = useState('')
  const [columns, setColumns] = useState(1)

  useEffect(() => {
    const updateColumns = () => {
      if (window.innerWidth >= 1400) setColumns(3)
      else if (window.innerWidth >= 860) setColumns(2)
      else setColumns(1)
    }
    updateColumns()
    window.addEventListener('resize', updateColumns)
    return () => window.removeEventListener('resize', updateColumns)
  }, [])

  const handleSaveHotkey = async () => {
    if (!tempHotkey.trim()) {
      setIsEditingHotkey(false)
      return
    }
    const res = await window.electron.ipcRenderer.invoke('clipboard-hotkey-set', tempHotkey)
    if (res.success) {
      updateSettings({ clipboardHotkey: tempHotkey })
      setIsEditingHotkey(false)
    } else {
      window.electron.ipcRenderer.send('app-notification', {
        type: 'error',
        message: res.error || '快捷键设置失败'
      })
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setShowSortMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    console.log('ClipboardManager: Component mounted, setting up listeners');

    const handleClipboardChange = (newItem: ClipboardItem) => {
      console.log('ClipboardManager: Received new item', newItem.id);
      if (!isListening) return
      setItems(prev => {
        const exists = prev.some(item => item.content === newItem.content)
        if (exists) return prev
        return [newItem, ...prev].slice(0, 100)
      })
    }

    const handleClipboardHistory = (history: ClipboardItem[]) => {
      console.log('ClipboardManager: Received history, count:', history?.length);
      setItems(history || [])
    }

    const unsubChange = window.electron.clipboard.onChange(handleClipboardChange)
    const unsubHistory = window.electron.clipboard.onHistory(handleClipboardHistory)

    // 延迟请求历史记录，确保监听器已在 IPC 通道上就绪
    const timer = setTimeout(() => {
      console.log('ClipboardManager: Requesting history...');
      window.electron.clipboard.getHistory()
    }, 100)

    return () => {
      console.log('ClipboardManager: Cleaning up listeners');
      unsubChange()
      unsubHistory()
      clearTimeout(timer)
    }
  }, [isListening])

  const copyToClipboard = useCallback((item: ClipboardItem) => {
    if (item.type === 'text') {
      navigator.clipboard.writeText(item.content)
    } else {
      window.electron.clipboard.copyImage(item.content)
    }
    setCopiedId(item.id)
    setTimeout(() => setCopiedId(null), 1500)
  }, [])

  const deleteItem = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id))
    window.electron.clipboard.deleteItem(id)
  }, [])

  const togglePin = useCallback((id: string) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, pinned: !item.pinned } : item))
    )
    window.electron.clipboard.togglePin(id)
  }, [])

  const clearAll = useCallback(() => {
    const pinnedItems = items.filter(item => item.pinned)
    setItems(pinnedItems)
    window.electron.clipboard.clearHistory()
  }, [items])

  const filteredItems = (items || [])
    .filter(item => {
      if (!item || !item.content) return false
      if (filter === 'text' && item.type !== 'text') return false
      if (filter === 'image' && item.type !== 'image') return false
      if (searchQuery && item.type === 'text') {
        return (item.content || '').toLowerCase().includes(searchQuery.toLowerCase())
      }
      return true
    })
    .sort((a, b) => {
      const aPinned = !!a.pinned
      const bPinned = !!b.pinned
      if (sortBy === 'pinned') {
        if (aPinned && !bPinned) return -1
        if (!aPinned && bPinned) return 1
      }
      const aTime = a.timestamp || 0
      const bTime = b.timestamp || 0
      if (sortBy === 'oldest') {
        return aTime - bTime
      }
      return bTime - aTime
    })

  // 计算 Masonry 列数据 (按从左到右，然后从上到下的顺序)
  const masonryColumns = React.useMemo(() => {
    const cols: ClipboardItem[][] = Array.from({ length: columns }, () => [])
    filteredItems.forEach((item, idx) => {
      cols[idx % columns].push(item)
    })
    return cols
  }, [filteredItems, columns])

  const formatTime = (timestamp: number) => {
    if (!timestamp) return '未知时间'
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return '无效时间'

    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    return date.toLocaleDateString('zh-CN')
  }

  const truncateText = (text: string, maxLength: number = 150) => {
    if (!text) return ''
    const str = String(text)
    if (str.length <= maxLength) return str
    return str.slice(0, maxLength) + '...'
  }

  return (
    <div className="clipboard-manager">
      <style>{`
        .clipboard-manager {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.3) 100%);
          backdrop-filter: blur(20px);
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.3);
          overflow: hidden;
        }

        .dark .clipboard-manager {
          background: linear-gradient(135deg, rgba(30,30,40,0.6) 0%, rgba(20,20,30,0.3) 100%);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .cm-header {
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.2);
        }

        .dark .cm-header {
          background: rgba(0,0,0,0.2);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .cm-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .cm-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 20px;
          font-weight: 600;
          color: hsl(224, 71.4%, 4.1%);
        }

        .dark .cm-title {
          color: hsl(213, 31%, 91%);
        }

        .cm-title-icon {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, hsl(217.2, 91.2%, 59.8%) 0%, hsl(262, 83%, 58%) 100%);
          border-radius: 10px;
          color: white;
        }

        .cm-header-actions {
          display: flex;
          gap: 8px;
        }

        .cm-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
          outline: none;
        }

        .cm-btn-primary {
          background: linear-gradient(135deg, hsl(217.2, 91.2%, 59.8%) 0%, hsl(217.2, 91.2%, 50%) 100%);
          color: white;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
        }

        .cm-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }

        .cm-btn-secondary {
          background: rgba(255,255,255,0.5);
          color: hsl(224, 71.4%, 4.1%);
          border: 1px solid rgba(255,255,255,0.3);
        }

        .dark .cm-btn-secondary {
          background: rgba(255,255,255,0.1);
          color: hsl(213, 31%, 91%);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .cm-btn-secondary:hover {
          background: rgba(255,255,255,0.7);
        }

        .dark .cm-btn-secondary:hover {
          background: rgba(255,255,255,0.15);
        }

        .cm-btn-danger {
          background: rgba(239, 68, 68, 0.1);
          color: hsl(0, 84.2%, 60.2%);
          border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .cm-btn-danger:hover {
          background: rgba(239, 68, 68, 0.2);
        }

        .cm-btn-icon {
          width: 36px;
          height: 36px;
          padding: 0;
          border-radius: 10px;
        }

        .cm-listening-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
        }

        .cm-listening-badge.active {
          background: rgba(34, 197, 94, 0.15);
          color: hsl(142, 71%, 45%);
        }

        .cm-listening-badge.inactive {
          background: rgba(239, 68, 68, 0.15);
          color: hsl(0, 84.2%, 60.2%);
        }

        .cm-listening-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        .cm-listening-badge.active .cm-listening-dot {
          background: hsl(142, 71%, 45%);
        }

        .cm-listening-badge.inactive .cm-listening-dot {
          background: hsl(0, 84.2%, 60.2%);
          animation: none;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }

        .cm-search-row {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .cm-search-wrapper {
          flex: 1;
          position: relative;
        }

        .cm-search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          width: 18px;
          height: 18px;
          color: hsl(220, 8.9%, 46.1%);
        }

        .cm-search-input {
          width: 100%;
          padding: 10px 12px 10px 40px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.5);
          font-size: 14px;
          color: hsl(224, 71.4%, 4.1%);
          outline: none;
          transition: all 0.2s ease;
        }

        .cm-search-input::placeholder {
          color: hsl(220, 8.9%, 46.1%);
        }

        .cm-search-input:focus {
          border-color: hsl(217.2, 91.2%, 59.8%);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }

        .dark .cm-search-input {
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.1);
          color: hsl(213, 31%, 91%);
        }

        .dark .cm-search-input:focus {
          border-color: hsl(217.2, 91.2%, 59.8%);
        }

        .cm-filter-group {
          display: flex;
          gap: 4px;
          padding: 4px;
          background: rgba(255,255,255,0.3);
          border-radius: 10px;
        }

        .dark .cm-filter-group {
          background: rgba(255,255,255,0.1);
        }

        .cm-filter-btn {
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          color: hsl(220, 8.9%, 46.1%);
          background: transparent;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .cm-filter-btn:hover {
          color: hsl(224, 71.4%, 4.1%);
        }

        .dark .cm-filter-btn:hover {
          color: hsl(213, 31%, 91%);
        }

        .cm-filter-btn.active {
          background: white;
          color: hsl(217.2, 91.2%, 59.8%);
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .dark .cm-filter-btn.active {
          background: rgba(255,255,255,0.2);
          color: hsl(217.2, 91.2%, 59.8%);
        }

        .cm-sort-wrapper {
          position: relative;
        }

        .cm-sort-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 500;
          background: rgba(255,255,255,0.3);
          border: 1px solid rgba(255,255,255,0.2);
          color: hsl(224, 71.4%, 4.1%);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .dark .cm-sort-btn {
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.1);
          color: hsl(213, 31%, 91%);
        }

        .cm-sort-btn:hover {
          background: rgba(255,255,255,0.5);
        }

        .dark .cm-sort-btn:hover {
          background: rgba(255,255,255,0.15);
        }

        .cm-sort-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 140px;
          padding: 6px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.15);
          border: 1px solid rgba(255,255,255,0.3);
          z-index: 50;
        }

        .dark .cm-sort-menu {
          background: hsl(224, 71.4%, 8%);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .cm-sort-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 13px;
          color: hsl(224, 71.4%, 4.1%);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .dark .cm-sort-option {
          color: hsl(213, 31%, 91%);
        }

        .cm-sort-option:hover {
          background: rgba(59, 130, 246, 0.1);
        }

        .cm-sort-option.active {
          background: rgba(59, 130, 246, 0.15);
          color: hsl(217.2, 91.2%, 59.8%);
        }

        .cm-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        .cm-content::-webkit-scrollbar {
          width: 6px;
        }

        .cm-content::-webkit-scrollbar-track {
          background: transparent;
        }

        .cm-content::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.15);
          border-radius: 3px;
        }

        .dark .cm-content::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.15);
        }

        .cm-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 300px;
          color: hsl(220, 8.9%, 46.1%);
          text-align: center;
        }

        .cm-empty-icon {
          width: 64px;
          height: 64px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .cm-empty-title {
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 8px;
          color: hsl(224, 71.4%, 4.1%);
        }

        .dark .cm-empty-title {
          color: hsl(213, 31%, 91%);
        }

        .cm-empty-desc {
          font-size: 14px;
          max-width: 280px;
        }

        .cm-list {
          display: flex;
          gap: 16px;
          align-items: flex-start;
        }

        .cm-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-width: 0;
        }

        .cm-item {
          width: 100%;
          background: rgba(255,255,255,0.6);
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.3);
          overflow: hidden;
          transition: all 0.2s ease;
        }

        .cm-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08);
        }

        .dark .cm-item {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .dark .cm-item:hover {
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }

        .cm-item.pinned {
          border-color: rgba(59, 130, 246, 0.3);
          background: rgba(59, 130, 246, 0.05);
        }

        .cm-item-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.15);
        }

        .dark .cm-item-header {
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .cm-item-meta {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .cm-item-type {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 8px;
        }

        .cm-item-type.text {
          background: rgba(59, 130, 246, 0.15);
          color: hsl(217.2, 91.2%, 59.8%);
        }

        .cm-item-type.image {
          background: rgba(168, 85, 247, 0.15);
          color: hsl(262, 83%, 58%);
        }

        .cm-item-time {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: hsl(220, 8.9%, 46.1%);
        }

        .cm-item-actions {
          display: flex;
          gap: 4px;
        }

        .cm-item-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: hsl(220, 8.9%, 46.1%);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .cm-item-btn:hover {
          background: rgba(0,0,0,0.05);
          color: hsl(224, 71.4%, 4.1%);
        }

        .dark .cm-item-btn:hover {
          background: rgba(255,255,255,0.1);
          color: hsl(213, 31%, 91%);
        }

        .cm-item-btn.pin {
          color: hsl(217.2, 91.2%, 59.8%);
        }

        .cm-item-btn.pin:hover {
          background: rgba(59, 130, 246, 0.15);
        }

        .cm-item-btn.delete:hover {
          background: rgba(239, 68, 68, 0.15);
          color: hsl(0, 84.2%, 60.2%);
        }

        .cm-item-btn.copied {
          color: hsl(142, 71%, 45%);
          background: rgba(34, 197, 94, 0.15);
        }

        .cm-item-content {
          padding: 16px;
        }

        .cm-item-text {
          font-size: 14px;
          line-height: 1.6;
          color: hsl(224, 71.4%, 4.1%);
          word-break: break-word;
          white-space: pre-wrap;
        }

        .dark .cm-item-text {
          color: hsl(213, 31%, 91%);
        }

        .cm-item-image-wrapper {
          display: flex;
          justify-content: center;
          align-items: center;
          background: rgba(0,0,0,0.02);
          border-radius: 8px;
          overflow: hidden;
          max-height: 200px;
        }

        .dark .cm-item-image-wrapper {
          background: rgba(255,255,255,0.02);
        }

        .cm-item-image {
          max-width: 100%;
          max-height: 200px;
          object-fit: contain;
        }

        .cm-stats {
          padding: 12px 24px;
          border-top: 1px solid rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          color: hsl(220, 8.9%, 46.1%);
        }

        .dark .cm-stats {
          background: rgba(0,0,0,0.2);
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        .cm-stats-count {
          display: flex;
          align-items: center;
          gap: 6px;
        }
      `}</style>

      <div className="cm-header">
        <div className="cm-title-row">
          <div className="cm-title">
            <div className="cm-title-icon">
              <Clipboard size={20} />
            </div>
            <span>剪贴板管理</span>

            <div className="ml-4 flex items-center gap-2">
              {isEditingHotkey ? (
                <div className="flex items-center gap-1 bg-white/50 dark:bg-black/20 p-1 rounded-xl backdrop-blur-md border border-white/20">
                  <Input
                    autoFocus
                    className="h-7 w-32 text-xs bg-transparent border-none shadow-none focus-visible:ring-0 px-2"
                    placeholder="如 Alt+Shift+C"
                    value={tempHotkey}
                    onChange={(e) => setTempHotkey(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveHotkey()
                      if (e.key === 'Escape') setIsEditingHotkey(false)
                    }}
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 rounded-lg hover:bg-green-500/10 text-green-600" onClick={handleSaveHotkey}>
                    <Check size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 rounded-lg hover:bg-red-500/10 text-red-600" onClick={() => setIsEditingHotkey(false)}>
                    <X size={14} />
                  </Button>
                </div>
              ) : (
                <button
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors cursor-pointer group"
                  onClick={() => {
                    setTempHotkey(settings?.clipboardHotkey || '')
                    setIsEditingHotkey(true)
                  }}
                  title="点击修改快捷键"
                >
                  <Keyboard size={12} className="opacity-70 group-hover:opacity-100" />
                  <span className="text-[11px] font-black uppercase tracking-widest">{settings?.clipboardHotkey || '未设置'}</span>
                </button>
              )}
            </div>
          </div>
          <div className="cm-header-actions">
            <div className={`cm-listening-badge ${isListening ? 'active' : 'inactive'}`}>
              <div className="cm-listening-dot" />
              {isListening ? '监听中' : '已暂停'}
            </div>
            <button
              className={`cm-btn cm-btn-secondary cm-btn-icon ${!isListening ? 'cm-btn-primary' : ''}`}
              onClick={() => setIsListening(!isListening)}
              title={isListening ? '暂停监听' : '开始监听'}
            >
              {isListening ? <AlertCircle size={16} /> : <Check size={16} />}
            </button>
            <button
              className="cm-btn cm-btn-danger"
              onClick={clearAll}
              disabled={items.filter(i => !i.pinned).length === 0}
            >
              <Trash2 size={14} />
              清空
            </button>
          </div>
        </div>

        <div className="cm-search-row">
          <div className="cm-search-wrapper">
            <Search className="cm-search-icon" />
            <input
              type="text"
              className="cm-search-input"
              placeholder="搜索剪贴板内容..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="cm-filter-group">
            <button
              className={`cm-filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              全部
            </button>
            <button
              className={`cm-filter-btn ${filter === 'text' ? 'active' : ''}`}
              onClick={() => setFilter('text')}
            >
              文本
            </button>
            <button
              className={`cm-filter-btn ${filter === 'image' ? 'active' : ''}`}
              onClick={() => setFilter('image')}
            >
              图片
            </button>
          </div>
          <div className="cm-sort-wrapper" ref={sortMenuRef}>
            <button className="cm-sort-btn" onClick={() => setShowSortMenu(!showSortMenu)}>
              排序
              <ChevronDown size={14} />
            </button>
            {showSortMenu && (
              <div className="cm-sort-menu">
                <div
                  className={`cm-sort-option ${sortBy === 'newest' ? 'active' : ''}`}
                  onClick={() => {
                    setSortBy('newest')
                    setShowSortMenu(false)
                  }}
                >
                  最新优先
                  {sortBy === 'newest' && <Check size={14} />}
                </div>
                <div
                  className={`cm-sort-option ${sortBy === 'oldest' ? 'active' : ''}`}
                  onClick={() => {
                    setSortBy('oldest')
                    setShowSortMenu(false)
                  }}
                >
                  最旧优先
                  {sortBy === 'oldest' && <Check size={14} />}
                </div>
                <div
                  className={`cm-sort-option ${sortBy === 'pinned' ? 'active' : ''}`}
                  onClick={() => {
                    setSortBy('pinned')
                    setShowSortMenu(false)
                  }}
                >
                  置顶优先
                  {sortBy === 'pinned' && <Check size={14} />}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="cm-content">
        {filteredItems.length === 0 ? (
          <div className="cm-empty">
            <Clipboard className="cm-empty-icon" />
            <div className="cm-empty-title">
              {searchQuery ? '未找到匹配内容' : '剪贴板为空'}
            </div>
            <div className="cm-empty-desc">
              {searchQuery
                ? '尝试其他搜索关键词'
                : '复制文本或图片后，内容会自动出现在这里'}
            </div>
          </div>
        ) : (
          <div className="cm-list">
            {masonryColumns.map((col, colIdx) => (
              <div key={colIdx} className="cm-col">
                {col.map(item => (
                  <div key={item.id} className={`cm-item ${item.pinned ? 'pinned' : ''}`}>
                    <div className="cm-item-header">
                      <div className="cm-item-meta">
                        <div className={`cm-item-type ${item.type}`}>
                          {item.type === 'text' ? <FileText size={14} /> : <Image size={14} />}
                        </div>
                        <div className="cm-item-time">
                          <Clock size={12} />
                          {formatTime(item.timestamp)}
                        </div>
                      </div>
                      <div className="cm-item-actions">
                        <button
                          className="cm-item-btn pin"
                          onClick={() => togglePin(item.id)}
                          title={item.pinned ? '取消置顶' : '置顶'}
                        >
                          {item.pinned ? <Pin size={14} /> : <PinOff size={14} />}
                        </button>
                        <button
                          className={`cm-item-btn copy ${copiedId === item.id ? 'copied' : ''}`}
                          onClick={() => copyToClipboard(item)}
                          title="复制"
                        >
                          {copiedId === item.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                        <button
                          className="cm-item-btn delete"
                          onClick={() => deleteItem(item.id)}
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="cm-item-content">
                      {item.type === 'text' ? (
                        <div className="cm-item-text">
                          {truncateText(item.content, 500)}
                        </div>
                      ) : (
                        <div className="cm-item-image-wrapper">
                          <img src={item.preview || item.content} alt="Clipboard Image" className="cm-item-image" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="cm-stats">
        <div className="cm-stats-count">
          <Clipboard size={14} />
          共 {items.length} 条记录
          {items.filter(i => i.pinned).length > 0 && ` · ${items.filter(i => i.pinned).length} 条置顶`}
        </div>
        <div>
          {filteredItems.length !== items.length && `显示 ${filteredItems.length} 条`}
        </div>
      </div>
    </div>
  )
}

export default ClipboardManager
