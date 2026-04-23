import type { ScreenOverlayLineResult, ScreenOverlayMode } from './llm'

export type UtilityWindowSessionStatus = 'idle' | 'loading' | 'completed' | 'error'

export interface UtilityWindowSessionSnapshot {
  mode: ScreenOverlayMode
  status: UtilityWindowSessionStatus
  error: string | null
  copied: boolean
  overlayResults: ScreenOverlayLineResult[]
}

export function beginUtilityWindowSession(input: {
  previous?: Partial<UtilityWindowSessionSnapshot>
  incoming: { mode: ScreenOverlayMode }
}): UtilityWindowSessionSnapshot {
  return {
    mode: input.incoming.mode,
    status: 'idle',
    error: null,
    copied: false,
    overlayResults: []
  }
}
