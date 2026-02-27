import fs from 'fs'
import path from 'path'
import { IpcResponse } from '../../shared/types'

export class RenameService {
  constructor() {}

  private getAllFiles(dir: string): string[] {
    let files: string[] = []
    const items = fs.readdirSync(dir, { withFileTypes: true })
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name)
      if (item.isDirectory()) {
        files = [...files, ...this.getAllFiles(fullPath)]
      } else if (item.isFile()) {
        files.push(fullPath)
      }
    }
    return files
  }

  async getFileInfo(filePaths: string[]): Promise<IpcResponse<{ fileInfo: Array<{ path: string; name: string; size: number; mtime: Date }> }>> {
    try {
      const fileInfo: Array<{ path: string; name: string; size: number; mtime: Date }> = []
      
      for (const filePath of filePaths) {
        if (!fs.existsSync(filePath)) continue
        const stats = fs.statSync(filePath)
        
        if (stats.isDirectory()) {
          const filesInDir = this.getAllFiles(filePath)
          for (const file of filesInDir) {
            const fileStats = fs.statSync(file)
            fileInfo.push({
              path: file,
              name: path.basename(file),
              size: fileStats.size,
              mtime: fileStats.mtime
            })
          }
        } else if (stats.isFile()) {
          fileInfo.push({
            path: filePath,
            name: path.basename(filePath),
            size: stats.size,
            mtime: stats.mtime
          })
        }
      }
      
      return { success: true, data: { fileInfo } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  async renameFiles(files: string[], mode: string, options: any): Promise<IpcResponse<{ results: Array<{ oldPath: string; newPath: string; success: boolean; error?: string }> }>> {
    try {
      const results: Array<{ oldPath: string; newPath: string; success: boolean; error?: string }> = []
      
      for (const file of files) {
        let newName = ''
        const dirName = path.dirname(file)
        const baseName = path.basename(file)
        const ext = path.extname(file)
        const nameWithoutExt = path.basename(file, ext)
        
        switch (mode) {
          case 'sequential':
            const { baseName: seqBase, startNum } = options
            const index = files.indexOf(file)
            newName = `${seqBase}${startNum + index}${ext}`
            break
          
          case 'replace':
            const { find, replace } = options
            newName = baseName.replace(find, replace)
            break
          
          case 'prefix_suffix':
            const { prefix, suffix } = options
            newName = `${prefix}${nameWithoutExt}${suffix}${ext}`
            break
          
          case 'custom':
            const { newNames } = options
            const fileIndex = files.indexOf(file)
            newName = newNames[fileIndex] || baseName
            break
          default:
            newName = baseName
        }
        
        const newPath = path.join(dirName, newName)
        
        if (fs.existsSync(newPath) && newPath !== file) {
          results.push({
            oldPath: file,
            newPath: newPath,
            success: false,
            error: '目标文件已存在'
          })
          continue
        }
        
        fs.renameSync(file, newPath)
        results.push({
          oldPath: file,
          newPath: newPath,
          success: true
        })
      }
      
      return { success: true, data: { results } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

export const renameService = new RenameService()
