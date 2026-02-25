import React, { useState, useCallback, useEffect } from 'react'
import { 
  FileText, 
  Play, 
  FolderOpen, 
  File, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Trash2,
  Save,
  Download,
  Settings2,
  X,
  Plus,
  Hash,
  Type,
  CaseSensitive,
  ArrowRightLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Calendar,
  HardDrive
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface FileItem {
  path: string
  name: string
  size: number
  mtime: Date
  ctime?: Date
  newName?: string
  success?: boolean
  error?: string
}

type SortField = 'name' | 'size' | 'mtime' | 'ctime' | 'extension'
type SortOrder = 'asc' | 'desc'

interface RenameRule {
  type: 'prefix' | 'suffix' | 'replace' | 'sequence' | 'case'
  params: {
    prefix?: string
    suffix?: string
    find?: string
    replace?: string
    baseName?: string
    startNum?: number
    digits?: number
    caseType?: 'upper' | 'lower' | 'title'
  }
}

interface RenamePreset {
  id: string
  name: string
  rules: RenameRule[]
}

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

export const RenameTool: React.FC = () => {
  const [files, setFiles] = useState<FileItem[]>([])
  const [rules, setRules] = useState<RenameRule[]>([])
  const [presets, setPresets] = useState<RenamePreset[]>(() => {
    const saved = localStorage.getItem('renamePresets')
    return saved ? JSON.parse(saved) : defaultPresets
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [message, setMessage] = useState<string>('')
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info')
  const [showPresetManager, setShowPresetManager] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
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
      
      if (!selectResult.success) {
        setMessage(`打开选择窗口失败: ${selectResult.error}`)
        setMessageType('error')
        return
      }

      if (selectResult.canceled || selectResult.filePaths.length === 0) {
        return
      }

      const fileResult = await window.electron.rename.getFileInfo(selectResult.filePaths)
      
      if (fileResult.success && fileResult.fileInfo) {
        const newFiles = fileResult.fileInfo.map((file, index) => ({
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

  const handleRemoveFile = (path: string) => {
    setFiles(prev => prev.filter(f => f.path !== path))
  }

  const handleClearFiles = () => {
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

      if (result.success && result.results) {
        const updatedFiles = files.map(file => {
          const resultItem = result.results?.find(item => item.oldPath === file.path)
          return {
            ...file,
            success: resultItem?.success,
            error: resultItem?.error
          }
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
      setMessage(`重命名失败: ${error}`)
      setMessageType('error')
    } finally {
      setIsProcessing(false)
    }
  }

  const savePreset = () => {
    if (!newPresetName.trim() || rules.length === 0) return
    
    const newPreset: RenamePreset = {
      id: Date.now().toString(),
      name: newPresetName.trim(),
      rules: [...rules]
    }
    setPresets(prev => [...prev, newPreset])
    setNewPresetName('')
    setShowPresetManager(false)
    setMessage(`预设 "${newPreset.name}" 已保存`)
    setMessageType('success')
  }

  const loadPreset = (preset: RenamePreset) => {
    setRules([...preset.rules])
    setMessage(`已加载预设 "${preset.name}"`)
    setMessageType('info')
  }

  const deletePreset = (id: string) => {
    setPresets(prev => prev.filter(p => p.id !== id))
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const SortButton: React.FC<{ field: SortField; label: string; icon: React.ReactNode }> = ({ field, label, icon }) => (
    <Button
      variant={sortField === field ? 'default' : 'outline'}
      size='sm'
      onClick={() => handleSort(field)}
      className='gap-1'
    >
      {icon}
      {label}
      {sortField === field && (
        sortOrder === 'asc' ? <ArrowUp className='h-3 w-3' /> : <ArrowDown className='h-3 w-3' />
      )}
    </Button>
  )

  return (
    <div className='space-y-6'>
      <div className='text-center mb-8'>
        <h1 className='text-3xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent mb-2'>
          批量重命名
        </h1>
        <p className='text-muted-foreground'>选择文件 → 排序 → 设置规则 → 执行重命名</p>
      </div>

      {message && (
        <Alert className={cn(
          messageType === 'success' ? 'bg-green-500/10 border-green-500 text-green-500' :
          messageType === 'error' ? 'bg-red-500/10 border-red-500 text-red-500' :
          'bg-blue-500/10 border-blue-500 text-blue-500'
        )}>
          {messageType === 'success' && <CheckCircle className='h-4 w-4' />}
          {messageType === 'error' && <AlertCircle className='h-4 w-4' />}
          {messageType === 'info' && <FileText className='h-4 w-4' />}
          <AlertTitle>{message}</AlertTitle>
        </Alert>
      )}

      <Card className='bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-white/20'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <FolderOpen className='w-5 h-5 text-primary' />
            选择文件
          </CardTitle>
          <CardDescription>从资源管理器选择要重命名的文件</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleSelectFiles} className='w-full' size='lg'>
            <File className='mr-2 h-5 w-5' />
            选择文件或文件夹
          </Button>

          {files.length > 0 && (
            <div className='mt-4 flex items-center justify-between'>
              <p className='text-sm text-muted-foreground'>
                已添加 <span className='text-primary font-semibold'>{files.length}</span> 个文件
              </p>
              <Button variant='ghost' size='sm' onClick={handleClearFiles}>
                <Trash2 className='mr-2 h-4 w-4' />
                清空
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card className='bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-white/20'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <ArrowUpDown className='w-5 h-5 text-primary' />
              文件排序
            </CardTitle>
            <CardDescription>选择排序方式后，重命名将按此顺序执行</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='flex flex-wrap gap-2'>
              <SortButton field='name' label='名称' icon={<FileText className='h-4 w-4' />} />
              <SortButton field='size' label='大小' icon={<HardDrive className='h-4 w-4' />} />
              <SortButton field='mtime' label='修改时间' icon={<Calendar className='h-4 w-4' />} />
              <SortButton field='ctime' label='创建时间' icon={<Calendar className='h-4 w-4' />} />
              <SortButton field='extension' label='扩展名' icon={<Type className='h-4 w-4' />} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card className='bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-white/20'>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle className='flex items-center gap-2'>
                <Settings2 className='w-5 h-5 text-primary' />
                重命名规则
              </CardTitle>
              <CardDescription>添加一个或多个规则，按顺序执行</CardDescription>
            </div>
            <Button 
              variant='outline' 
              size='sm' 
              onClick={() => setShowPresetManager(!showPresetManager)}
            >
              <Save className='mr-2 h-4 w-4' />
              预设
            </Button>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {showPresetManager && (
            <div className='p-4 rounded-xl bg-muted/50 space-y-3'>
              <div className='flex items-center gap-2'>
                <Input
                  placeholder='预设名称'
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  className='flex-1'
                />
                <Button onClick={savePreset} disabled={!newPresetName.trim() || rules.length === 0}>
                  <Plus className='mr-2 h-4 w-4' />
                  保存
                </Button>
              </div>
              <div className='flex flex-wrap gap-2'>
                {presets.map(preset => (
                  <div key={preset.id} className='flex items-center gap-1 bg-background rounded-lg p-1'>
                    <Button 
                      variant='ghost' 
                      size='sm' 
                      onClick={() => loadPreset(preset)}
                      className='h-7'
                    >
                      <Download className='mr-1 h-3 w-3' />
                      {preset.name}
                    </Button>
                    <Button 
                      variant='ghost' 
                      size='sm' 
                      onClick={() => deletePreset(preset.id)}
                      className='h-7 w-7 p-0 text-muted-foreground hover:text-red-500'
                    >
                      <X className='h-3 w-3' />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className='flex flex-wrap gap-2'>
            <Button variant='outline' size='sm' onClick={() => addRule('prefix')}>
              <Type className='mr-2 h-4 w-4' />
              前缀
            </Button>
            <Button variant='outline' size='sm' onClick={() => addRule('suffix')}>
              <Type className='mr-2 h-4 w-4' />
              后缀
            </Button>
            <Button variant='outline' size='sm' onClick={() => addRule('replace')}>
              <ArrowRightLeft className='mr-2 h-4 w-4' />
              替换
            </Button>
            <Button variant='outline' size='sm' onClick={() => addRule('sequence')}>
              <Hash className='mr-2 h-4 w-4' />
              序号
            </Button>
            <Button variant='outline' size='sm' onClick={() => addRule('case')}>
              <CaseSensitive className='mr-2 h-4 w-4' />
              大小写
            </Button>
          </div>

          {rules.length === 0 && (
            <div className='text-center py-8 text-muted-foreground'>
              点击上方按钮添加重命名规则
            </div>
          )}

          {rules.map((rule, index) => (
            <div key={index} className='p-4 rounded-xl bg-muted/30 border border-white/10 space-y-3'>
              <div className='flex items-center justify-between'>
                <span className='font-medium text-sm'>
                  {rule.type === 'prefix' && '前缀'}
                  {rule.type === 'suffix' && '后缀'}
                  {rule.type === 'replace' && '替换'}
                  {rule.type === 'sequence' && '序号'}
                  {rule.type === 'case' && '大小写'}
                </span>
                <Button 
                  variant='ghost' 
                  size='sm' 
                  onClick={() => removeRule(index)}
                  className='h-7 w-7 p-0 text-muted-foreground hover:text-red-500'
                >
                  <X className='h-4 w-4' />
                </Button>
              </div>

              {rule.type === 'prefix' && (
                <div className='space-y-2'>
                  <Label>添加前缀</Label>
                  <Input
                    value={rule.params.prefix || ''}
                    onChange={(e) => updateRule(index, { prefix: e.target.value })}
                    placeholder='输入前缀文本'
                  />
                </div>
              )}

              {rule.type === 'suffix' && (
                <div className='space-y-2'>
                  <Label>添加后缀</Label>
                  <Input
                    value={rule.params.suffix || ''}
                    onChange={(e) => updateRule(index, { suffix: e.target.value })}
                    placeholder='输入后缀文本'
                  />
                </div>
              )}

              {rule.type === 'replace' && (
                <div className='grid grid-cols-2 gap-3'>
                  <div className='space-y-2'>
                    <Label>查找</Label>
                    <Input
                      value={rule.params.find || ''}
                      onChange={(e) => updateRule(index, { find: e.target.value })}
                      placeholder='要查找的文本'
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label>替换为</Label>
                    <Input
                      value={rule.params.replace || ''}
                      onChange={(e) => updateRule(index, { replace: e.target.value })}
                      placeholder='替换后的文本'
                    />
                  </div>
                </div>
              )}

              {rule.type === 'sequence' && (
                <div className='grid grid-cols-3 gap-3'>
                  <div className='space-y-2'>
                    <Label>基础名称</Label>
                    <Input
                      value={rule.params.baseName || ''}
                      onChange={(e) => updateRule(index, { baseName: e.target.value })}
                      placeholder='file_'
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label>起始编号</Label>
                    <Input
                      type='number'
                      value={rule.params.startNum || 1}
                      onChange={(e) => updateRule(index, { startNum: parseInt(e.target.value) || 1 })}
                      min='0'
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label>位数</Label>
                    <Input
                      type='number'
                      value={rule.params.digits || 1}
                      onChange={(e) => updateRule(index, { digits: parseInt(e.target.value) || 1 })}
                      min='1'
                      max='10'
                    />
                  </div>
                </div>
              )}

              {rule.type === 'case' && (
                <div className='flex gap-2'>
                  <Button 
                    variant={rule.params.caseType === 'lower' ? 'default' : 'outline'}
                    size='sm'
                    onClick={() => updateRule(index, { caseType: 'lower' })}
                  >
                    小写
                  </Button>
                  <Button 
                    variant={rule.params.caseType === 'upper' ? 'default' : 'outline'}
                    size='sm'
                    onClick={() => updateRule(index, { caseType: 'upper' })}
                  >
                    大写
                  </Button>
                  <Button 
                    variant={rule.params.caseType === 'title' ? 'default' : 'outline'}
                    size='sm'
                    onClick={() => updateRule(index, { caseType: 'title' })}
                  >
                    首字母大写
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card className='bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-white/20'>
          <CardHeader>
            <CardTitle>文件预览</CardTitle>
            <CardDescription>查看重命名前后的文件名对比</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10'>#</TableHead>
                    <TableHead>原始文件名</TableHead>
                    <TableHead className='w-10'></TableHead>
                    <TableHead>新文件名</TableHead>
                    <TableHead className='w-20'>状态</TableHead>
                    <TableHead className='w-10'></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((file, index) => (
                    <TableRow key={file.path}>
                      <TableCell className='font-medium'>{index + 1}</TableCell>
                      <TableCell>
                        <div className='flex items-center gap-2'>
                          <FileText className='h-4 w-4 text-muted-foreground' />
                          <div>
                            <div className='font-medium'>{file.name}</div>
                            <div className='text-xs text-muted-foreground flex gap-2'>
                              <span>{formatFileSize(file.size)}</span>
                              <span>{formatDate(file.mtime)}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ArrowRightLeft className='h-4 w-4 text-muted-foreground' />
                      </TableCell>
                      <TableCell>
                        <span className={file.newName !== file.name ? 'text-primary font-medium' : ''}>
                          {file.newName}
                        </span>
                      </TableCell>
                      <TableCell>
                        {file.success !== undefined ? (
                          file.success ? (
                            <span className='flex items-center gap-1 text-green-500'>
                              <CheckCircle className='h-4 w-4' />
                              成功
                            </span>
                          ) : (
                            <span className='flex items-center gap-1 text-red-500' title={file.error}>
                              <AlertCircle className='h-4 w-4' />
                              失败
                            </span>
                          )
                        ) : (
                          <span className='flex items-center gap-1 text-muted-foreground'>
                            <Clock className='h-4 w-4' />
                            待处理
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!isProcessing && file.success === undefined && (
                          <Button 
                            variant='ghost' 
                            size='sm' 
                            onClick={() => handleRemoveFile(file.path)}
                            className='h-7 w-7 p-0 text-muted-foreground hover:text-red-500'
                          >
                            <X className='h-4 w-4' />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className='flex gap-4'>
        <Button
          className='flex-1'
          size='lg'
          onClick={handleRename}
          disabled={isProcessing || files.length === 0 || rules.length === 0}
        >
          <Play className='mr-2 h-5 w-5' />
          开始重命名
        </Button>
        <Button
          variant='outline'
          size='lg'
          onClick={handleClearFiles}
          disabled={isProcessing || files.length === 0}
        >
          <Trash2 className='mr-2 h-5 w-5' />
          清空
        </Button>
      </div>

      {isProcessing && (
        <Card className='bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-white/20'>
          <CardContent className='pt-6'>
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <span className='text-sm font-medium'>处理进度</span>
                <span className='text-sm text-muted-foreground animate-pulse'>处理中...</span>
              </div>
              <Progress value={50} className='h-2' />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
