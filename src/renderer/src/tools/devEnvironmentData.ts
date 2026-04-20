import type { DevEnvironmentId } from '../../../shared/devEnvironment'

export const DEV_ENVIRONMENT_DISPLAY_LIST: Array<{
  id: DevEnvironmentId
  name: string
  description: string
  relatedToolId?: string
}> = [
  { id: 'nodejs', name: 'Node.js', description: 'JavaScript 运行时与 npm 生态基础' },
  { id: 'npm', name: 'npm', description: '随 Node.js 提供的默认包管理器' },
  { id: 'git', name: 'Git', description: '版本控制基础工具' },
  { id: 'python', name: 'Python', description: '通用脚本与开发运行时' },
  { id: 'pip', name: 'pip', description: '随 Python 提供的默认包管理器' },
  { id: 'go', name: 'Go', description: 'Go 编译器与工具链' },
  { id: 'java', name: 'Java', description: '固定为 Microsoft OpenJDK 17' },
  { id: 'wsl', name: 'WSL', description: 'Windows Subsystem for Linux 关联环境状态', relatedToolId: 'wsl-manager' }
]

export function getDevEnvironmentActionLabel(action: 'install' | 'update' | 'refresh' | 'open-related-tool') {
  if (action === 'install') return '安装'
  if (action === 'update') return '更新'
  if (action === 'open-related-tool') return '前往 WSL 管理'
  return '重新检测'
}
