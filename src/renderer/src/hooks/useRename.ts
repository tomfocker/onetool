import { useState, useCallback, useEffect } from 'react'
import { RenameFileItem as FileItem, RenameRule, RenamePreset, SortField, SortOrder } from '../../../shared/types'

export { type FileItem, type RenameRule, type RenamePreset, type SortField, type SortOrder }

const defaultPresets: RenamePreset[] = [
  {
    id: '1',
    name: '图片序号',
    rules: [{ type: 'sequence', params: { baseName: 'IMG_', startNum: 1, digits: 4 } }]
  },
  {
    id: '2',
    name: '日期前缀',
    rules: [{ type: 'prefix', params: { prefix: `${new Date().toISOString().slice(0, 10)}_` } }]
  },
  {
    id: '3',
    name: '小写转换',
    rules: [{ type: 'case', params: { caseType: 'lower' } }]
  }
]

export function useRename() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [rules, setRules] = useState<RenameRule[]>([])
  const [presets, setPresets] = useState<RenamePreset[]>(() => {
    const saved = localStorage.getItem('renamePresets')
    return saved ? JSON.parse(saved) : defaultPresets
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [message, setMessage] = useState<string>('')
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  useEffect(() => {
    localStorage.setItem('renamePresets', JSON.stringify(presets))
  }, [presets])

  const applyRules = useCallback((fileName: string, index: number): string => {
    const ext = fileName.split('.').pop() ? `.${fileName.split('.').pop()}` : ''
    const nameWithoutExt = ext ? fileName.slice(0, -ext.length) : fileName
    let result = nameWithoutExt

    for (const rule of rules) {
      switch (rule.type) {
        case 'prefix':
          result = `${rule.params.prefix || ''}${result}`
          break
        case 'suffix':
          result = `${result}${rule.params.suffix || ''}`
          break
        case 'replace':
          result = result.replace(new RegExp(rule.params.find || '', 'g'), rule.params.replace || '')
          break
        case 'sequence':
          const num = (rule.params.startNum || 1) + index
          const digits = rule.params.digits || 1
          const paddedNum = num.toString().padStart(digits, '0')
          result = `${rule.params.baseName || ''}${paddedNum}`
          break
        case 'case':
          switch (rule.params.caseType) {
            case 'upper':
              result = result.toUpperCase()
              break
            case 'lower':
              result = result.toLowerCase()
              break
            case 'title':
              result = result.replace(/\w\S*/g, txt => 
                txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
              )
              break
          }
          break
      }
    }

    return `${result}${ext}`
  }, [rules])

  const sortFiles = useCallback((filesToSort: FileItem[], field: SortField, order: SortOrder): FileItem[] => {
    return [...filesToSort].sort((a, b) => {
      let comparison = 0
      switch (field) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'zh-CN')
          break
        case 'size':
          comparison = a.size - b.size
          break
        case 'mtime':
          comparison = new Date(a.mtime).getTime() - new Date(b.mtime).getTime()
          break
        case 'ctime':
          comparison = (a.ctime ? new Date(a.ctime).getTime() : 0) - (b.ctime ? new Date(b.ctime).getTime() : 0)
          break
        case 'extension':
          const extA = a.name.split('.').pop() || ''
          const extB = b.name.split('.').pop() || ''
          comparison = extA.localeCompare(extB)
          break
      }
      return order === 'asc' ? comparison : -comparison
    })
  }, [])

  const updateNewNames = useCallback(() => {
    if (files.length === 0) return
    const sortedFiles = sortFiles(files, sortField, sortOrder)
    const updatedFiles = sortedFiles.map((file, index) => ({
      ...file,
      newName: applyRules(file.name, index),
      success: undefined,
      error: undefined
    }))
    setFiles(updatedFiles)
  }, [files, applyRules, sortFiles, sortField, sortOrder])

  useEffect(() => {
    updateNewNames()
  }, [rules, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const handleSelectFiles = async () => {
    try {
      const selectResult = await window.electron.rename.selectFilesAndFolders()
      if (!selectResult.success || !selectResult.data) {
        setMessage(`打开选择窗口失败: ${selectResult.error}`)
        setMessageType('error')
        return
      }
      if (selectResult.data.canceled || selectResult.data.filePaths.length === 0) return

      const fileResult = await window.electron.rename.getFileInfo(selectResult.data.filePaths)
      if (fileResult.success && fileResult.data?.fileInfo) {
        const newFiles = fileResult.data.fileInfo.map((file, index) => ({
          ...file,
          newName: applyRules(file.name, index)
        }))
        setFiles(newFiles)
        setMessage(`成功添加 ${newFiles.length} 个文件`)
        setMessageType('success')
      } else {
        setMessage(`添加文件失败: ${fileResult.error}`)
        setMessageType('error')
      }
    } catch (error) {
      setMessage(`添加文件失败: ${error}`)
      setMessageType('error')
    }
  }

  const removeFile = (path: string) => {
    setFiles(prev => prev.filter(f => f.path !== path))
  }

  const clearFiles = () => {
    setFiles([])
    setMessage('已清空文件列表')
    setMessageType('info')
  }

  const addRule = (type: RenameRule['type']) => {
    const newRule: RenameRule = {
      type,
      params: type === 'sequence' 
        ? { baseName: 'file_', startNum: 1, digits: 3 }
        : type === 'case'
        ? { caseType: 'lower' }
        : {}
    }
    setRules(prev => [...prev, newRule])
  }

  const updateRule = (index: number, params: Partial<RenameRule['params']>) => {
    setRules(prev => prev.map((rule, i) => 
      i === index ? { ...rule, params: { ...rule.params, ...params } } : rule
    ))
  }

  const removeRule = (index: number) => {
    setRules(prev => prev.filter((_, i) => i !== index))
  }

  const handleRename = async () => {
    if (files.length === 0) {
      setMessage('请先添加文件')
      setMessageType('error')
      return
    }
    setIsProcessing(true)
    setMessage('正在执行重命名...')
    setMessageType('info')

    try {
      const filePaths = files.map(file => file.path)
      const newNames = files.map(file => file.newName || file.name)
      const result = await window.electron.rename.renameFiles(filePaths, 'custom', { newNames })

      if (result.success && result.data?.results) {
        const updatedFiles = files.map(file => {
          const resultItem = result.data?.results.find(item => item.oldPath === file.path)
          return { ...file, success: resultItem?.success, error: resultItem?.error }
        })
        setFiles(updatedFiles)
        const successCount = updatedFiles.filter(f => f.success).length
        setMessage(`成功重命名 ${successCount} 个文件，失败 ${updatedFiles.length - successCount} 个`)
        setMessageType('success')
      } else {
        setMessage(`重命名失败: ${result.error}`)
        setMessageType('error')
      }
    } catch (error) {
      setMessage(`重命名出错: ${error}`)
      setMessageType('error')
    } finally {
      setIsProcessing(false)
    }
  }

  const savePreset = (name: string) => {
    if (!name.trim()) return
    const newPreset: RenamePreset = {
      id: Date.now().toString(),
      name: name.trim(),
      rules: [...rules]
    }
    setPresets(prev => [...prev, newPreset])
  }

  const applyPreset = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId)
    if (preset) {
      setRules([...preset.rules])
      setMessage(`已应用预设: ${preset.name}`)
      setMessageType('success')
    }
  }

  const deletePreset = (presetId: string) => {
    setPresets(prev => prev.filter(p => p.id !== presetId))
  }

  return {
    files,
    rules,
    presets,
    isProcessing,
    message,
    messageType,
    sortField,
    sortOrder,
    handleSort,
    handleSelectFiles,
    removeFile,
    clearFiles,
    addRule,
    updateRule,
    removeRule,
    handleRename,
    savePreset,
    applyPreset,
    deletePreset,
    setMessage,
    setMessageType
  }
}
