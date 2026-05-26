import type { MemoryDiaryRuntimeStatus } from '../../../shared/memoryDiary'

export type MemoryDiaryScreenpipePrimaryAction = {
  action: 'start' | 'refresh'
  label: '启动' | '刷新状态'
}

export function getMemoryDiaryScreenpipePrimaryAction(
  status: Pick<MemoryDiaryRuntimeStatus, 'apiReachable'> | null
): MemoryDiaryScreenpipePrimaryAction {
  if (status?.apiReachable) {
    return {
      action: 'refresh',
      label: '刷新状态'
    }
  }

  return {
    action: 'start',
    label: '启动'
  }
}
