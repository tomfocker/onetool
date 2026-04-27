export type BootstrapRoute =
  | 'app'
  | 'floatball'
  | 'screen-overlay'
  | 'color-picker-overlay'
  | 'recorder-selection'
  | 'screenshot-selection'
  | 'calendar-widget'

export function resolveBootstrapRoute(hash: string): BootstrapRoute {
  const normalizedHash = hash || ''

  if (normalizedHash === '#/floatball' || normalizedHash === '#/float-ball') {
    return 'floatball'
  }

  if (normalizedHash.startsWith('#/screen-overlay')) {
    return 'screen-overlay'
  }

  if (normalizedHash.startsWith('#/color-picker-overlay')) {
    return 'color-picker-overlay'
  }

  if (normalizedHash.startsWith('#/recorder-selection')) {
    return 'recorder-selection'
  }

  if (normalizedHash.startsWith('#/screenshot-selection')) {
    return 'screenshot-selection'
  }

  if (normalizedHash.startsWith('#/calendar-widget')) {
    return 'calendar-widget'
  }

  return 'app'
}
