export type SelectionBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type ScreenshotSelectionSessionPayload = {
  restrictBounds: SelectionBounds | null
  enhanced: boolean
}

export type RecorderSelectionSessionPayload = {
  initialBounds: SelectionBounds | null
}
