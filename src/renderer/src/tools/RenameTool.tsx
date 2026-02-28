import React, { useState, useCallback } from 'react'
import {
  FileText,
  Play,
  FolderOpen,
  File as FileIcon,
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
  HardDrive,
  RefreshCw
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useRename, SortField } from '../hooks/useRename'

export const RenameTool: React.FC = () => {
  const {
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
    handleDropFiles,
    removeFile,
    clearFiles,
    addRule,
    updateRule,
    removeRule,
    handleRename,
    savePreset,
    applyPreset,
    deletePreset
  } = useRename()

  const [showPresetManager, setShowPresetManager] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // 扩展标准 File 类型以支持 Electron 的 path 属性
      const paths = Array.from(e.dataTransfer.files as Iterable<File & { path: string }>).map(f => f.path)
      if (handleDropFiles) {
        handleDropFiles(paths)
      }
    }
  }, [handleDropFiles])

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
    <div className='max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20'>
      <div className='text-center space-y-2 mb-10'>
        <h1 className='text-4xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent'>
          批量重命名
        </h1>
        <p className='text-muted-foreground text-sm font-medium'>
          智能、高效的文件重命名工具，支持多规则叠加与实时预览
        </p>
      </div>

      {message && (
        <Alert className={cn(
          'border-none shadow-xl rounded-3xl backdrop-blur-md transition-all duration-500',
          messageType === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
            messageType === 'error' ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
              'bg-blue-500/10 text-blue-600 dark:text-blue-400'
        )}>
          {messageType === 'success' ? <CheckCircle className='h-5 w-5' /> :
            messageType === 'error' ? <AlertCircle className='h-5 w-5' /> : <FileText className='h-5 w-5' />}
          <AlertTitle className='font-bold ml-2'>{message}</AlertTitle>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 space-y-6">
          <Card className='glass-card border-none overflow-hidden'>
            <CardHeader className="pb-4">
              <CardTitle className='flex items-center gap-2 text-lg font-bold'>
                <FolderOpen className='w-5 h-5 text-blue-500' />
                选取源文件
              </CardTitle>
              <CardDescription>支持拖入文件夹或手动选择</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  'w-full h-32 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all bg-muted/5',
                  isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-muted-foreground/20 hover:border-blue-500/50 hover:bg-blue-500/5'
                )}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false) }}
                onDrop={handleDrop}
                onClick={handleSelectFiles}
              >
                <div className="flex flex-col items-center gap-2 pointer-events-none">
                  <div className="p-3 bg-blue-500/10 rounded-2xl">
                    <ArrowDown className="h-6 w-6 text-blue-500" />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-bold text-sm">点击选择，或将文件 / 文件夹拖拽到此处</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Drop files here</span>
                  </div>
                </div>
              </div>

              {files.length > 0 && (
                <div className='mt-6 flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-white/5'>
                  <p className='text-xs font-bold text-muted-foreground ml-2 flex items-center gap-2'>
                    已加载 <Badge className='bg-blue-500 text-white font-mono hover:bg-blue-600'>{files.length}</Badge> 个项目
                  </p>
                  <Button variant='ghost' size='sm' onClick={clearFiles} className="hover:bg-red-500/10 hover:text-red-500 rounded-xl">
                    <Trash2 className='mr-2 h-4 w-4' />
                    清空列表
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className='glass-card border-none overflow-hidden'>
            <CardHeader className="pb-4">
              <CardTitle className='flex items-center gap-2 text-lg font-bold'>
                <Settings2 className='w-5 h-5 text-indigo-500' />
                配置重命名规则
              </CardTitle>
              <CardDescription>添加多个规则，系统将按序依次执行</CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              <div className='flex flex-wrap gap-2'>
                <Button variant='secondary' size='sm' onClick={() => addRule('prefix')} className="rounded-xl font-bold"><Type className='mr-2 h-4 w-4' />前缀</Button>
                <Button variant='secondary' size='sm' onClick={() => addRule('suffix')} className="rounded-xl font-bold"><Type className='mr-2 h-4 w-4' />后缀</Button>
                <Button variant='secondary' size='sm' onClick={() => addRule('replace')} className="rounded-xl font-bold"><ArrowRightLeft className='mr-2 h-4 w-4' />替换</Button>
                <Button variant='secondary' size='sm' onClick={() => addRule('sequence')} className="rounded-xl font-bold"><Hash className='mr-2 h-4 w-4' />序号</Button>
                <Button variant='secondary' size='sm' onClick={() => addRule('case')} className="rounded-xl font-bold"><CaseSensitive className='mr-2 h-4 w-4' />大小写</Button>
              </div>

              <div className='space-y-4'>
                {rules.length === 0 ? (
                  <div className='text-center py-12 bg-muted/20 rounded-[2rem] border-2 border-dashed border-muted-foreground/10'>
                    <div className="w-12 h-12 bg-muted/50 rounded-2xl flex items-center justify-center mx-auto mb-3 opacity-50">
                      <Plus className="text-muted-foreground" />
                    </div>
                    <p className="text-xs font-bold text-muted-foreground">点击上方按钮添加规则</p>
                  </div>
                ) : (
                  rules.map((rule, index) => (
                    <div key={index} className='p-5 rounded-3xl bg-white/5 border border-white/10 space-y-4 relative group'>
                      <div className='flex items-center justify-between'>
                        <Badge variant="outline" className="rounded-lg uppercase tracking-widest text-[10px] font-black border-blue-500/30 text-blue-500">
                          {rule.type === 'prefix' ? '前缀' : rule.type === 'suffix' ? '后缀' : rule.type === 'replace' ? '替换' : rule.type === 'sequence' ? '序号' : '大小写'}
                        </Badge>
                        <Button variant='ghost' size='sm' onClick={() => removeRule(index)} className='h-8 w-8 p-0 text-muted-foreground hover:text-red-500 rounded-full'>
                          <X className='h-4 w-4' />
                        </Button>
                      </div>

                      {rule.type === 'prefix' && (
                        <Input value={rule.params.prefix || ''} onChange={(e) => updateRule(index, { prefix: e.target.value })} placeholder='输入前缀文本' className="rounded-xl border-none bg-muted/50" />
                      )}
                      {rule.type === 'suffix' && (
                        <Input value={rule.params.suffix || ''} onChange={(e) => updateRule(index, { suffix: e.target.value })} placeholder='输入后缀文本' className="rounded-xl border-none bg-muted/50" />
                      )}
                      {rule.type === 'replace' && (
                        <div className='grid grid-cols-2 gap-3'>
                          <Input value={rule.params.find || ''} onChange={(e) => updateRule(index, { find: e.target.value })} placeholder='查找文本' className="rounded-xl border-none bg-muted/50 text-xs" />
                          <Input value={rule.params.replace || ''} onChange={(e) => updateRule(index, { replace: e.target.value })} placeholder='替换为' className="rounded-xl border-none bg-muted/50 text-xs" />
                        </div>
                      )}
                      {rule.type === 'sequence' && (
                        <div className='grid grid-cols-2 gap-3'>
                          <Input value={rule.params.baseName || ''} onChange={(e) => updateRule(index, { baseName: e.target.value })} placeholder='基础名' className="rounded-xl border-none bg-muted/50 text-xs" />
                          <div className="flex gap-2">
                            <Input type='number' value={rule.params.startNum || 1} onChange={(e) => updateRule(index, { startNum: parseInt(e.target.value) || 1 })} className="rounded-xl border-none bg-muted/50 text-xs" title="起始号" />
                            <Input type='number' value={rule.params.digits || 3} onChange={(e) => updateRule(index, { digits: parseInt(e.target.value) || 1 })} className="rounded-xl border-none bg-muted/50 text-xs" title="位数" />
                          </div>
                        </div>
                      )}
                      {rule.type === 'case' && (
                        <div className='flex justify-between bg-muted/30 p-1 rounded-xl'>
                          {(['upper', 'lower', 'title'] as const).map(ct => (
                            <button key={ct} onClick={() => updateRule(index, { caseType: ct })} className={cn("flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all", rule.params.caseType === ct ? "bg-white dark:bg-zinc-800 shadow-sm text-blue-500" : "text-muted-foreground")}>
                              {ct === 'upper' ? '大写' : ct === 'lower' ? '小写' : '词首'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <Card className='glass-card border-none overflow-hidden flex flex-col h-full min-h-[600px]'>
            <CardHeader className="flex flex-row items-center justify-between shrink-0">
              <CardTitle className='text-lg font-bold flex items-center gap-2'>
                <Play className="w-5 h-5 text-emerald-500" />
                预览与执行
              </CardTitle>
              {files.length > 0 && (
                <div className='flex gap-2 bg-muted/20 p-1 rounded-xl items-center'>
                  <span className='text-[10px] text-muted-foreground mr-1 uppercase font-bold tracking-widest'>排序:</span>
                  <Button
                    variant={sortField === 'name' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => handleSort('name')}
                    className="rounded-lg text-xs h-7 px-2"
                  >
                    名称 {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </Button>
                  <Button
                    variant={sortField === 'size' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => handleSort('size')}
                    className="rounded-lg text-xs h-7 px-2"
                  >
                    大小 {sortField === 'size' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </Button>
                  <Button
                    variant={sortField === 'mtime' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => handleSort('mtime')}
                    className="rounded-lg text-xs h-7 px-2"
                  >
                    时间 {sortField === 'mtime' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </Button>
                  <Button
                    variant={sortField === 'extension' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => handleSort('extension')}
                    className="rounded-lg text-xs h-7 px-2"
                  >
                    类型 {sortField === 'extension' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className='flex-1 overflow-hidden p-0 px-6'>
              <div className='h-[500px] overflow-y-auto pr-2 scrollbar-thin'>
                <Table>
                  <TableHeader className="sticky top-0 bg-background/80 backdrop-blur-md z-10">
                    <TableRow className="border-none hover:bg-transparent">
                      <TableHead className='w-[45%] text-[10px] font-black uppercase opacity-50'>原文件名</TableHead>
                      <TableHead className='w-[45%] text-[10px] font-black uppercase opacity-50'>新文件名</TableHead>
                      <TableHead className='w-[10%] text-right text-[10px] font-black uppercase opacity-50'>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map((file) => (
                      <TableRow key={file.path} className="border-white/5 hover:bg-white/5 transition-colors group">
                        <TableCell className='py-4 font-medium text-xs truncate max-w-[200px]'>{file.name}</TableCell>
                        <TableCell className='py-4 font-black text-xs text-blue-500 truncate max-w-[200px]'>{file.newName}</TableCell>
                        <TableCell className="text-right">
                          {file.success === true ? <CheckCircle className='h-4 w-4 text-emerald-500 ml-auto' /> :
                            file.success === false ? <AlertCircle className='h-4 w-4 text-red-500 ml-auto' /> :
                              <Clock className='h-4 w-4 text-muted-foreground/30 ml-auto' />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
            <div className="p-6 shrink-0 bg-gradient-to-t from-background via-background to-transparent pt-10">
              <Button
                className='w-full h-16 text-xl font-black rounded-3xl shadow-2xl shadow-blue-500/30'
                onClick={handleRename}
                disabled={isProcessing || rules.length === 0 || files.length === 0}
              >
                {isProcessing ? <RefreshCw className='mr-3 animate-spin' /> : <Play className='mr-3 fill-current' />}
                {isProcessing ? '重命名处理中...' : '开始重命名任务'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default RenameTool
