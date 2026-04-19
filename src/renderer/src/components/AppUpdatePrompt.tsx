import React from 'react'
import { AlertTriangle, Download, Loader2, RotateCw } from 'lucide-react'
import { useAppUpdate } from '@/hooks/useAppUpdate'

export const AppUpdatePrompt: React.FC = () => {
  const { promptState, pendingAction, checkForUpdates, downloadUpdate, quitAndInstall } = useAppUpdate()

  if (!promptState) {
    return null
  }

  const primaryActionLabel = promptState.kind === 'error'
    ? promptState.primaryActionLabel
    : promptState.kind === 'restart' && pendingAction === 'install'
      ? '正在安装...'
      : promptState.kind === 'confirm-download' && pendingAction === 'download'
        ? '正在下载...'
        : promptState.primaryActionLabel

  const primaryActionDisabled =
    (promptState.kind === 'confirm-download' && pendingAction === 'download') ||
    (promptState.kind === 'restart' && pendingAction === 'install')

  const handlePrimaryAction = () => {
    if (promptState.kind === 'confirm-download') {
      void downloadUpdate()
      return
    }

    if (promptState.kind === 'restart') {
      void quitAndInstall()
      return
    }

    if (promptState.kind === 'error') {
      void checkForUpdates()
    }
  }

  const isError = promptState.kind === 'error'

  return (
    <div className="fixed bottom-6 right-6 z-[9998] w-[min(92vw,20rem)] pointer-events-none">
      <div
        className={[
          'pointer-events-auto rounded-2xl border backdrop-blur-xl overflow-hidden shadow-[0_18px_40px_-24px_rgba(15,23,42,0.4)]',
          isError
            ? 'border-red-200/80 bg-red-50/95 text-red-950'
            : 'border-slate-200/80 bg-white/95 text-slate-900'
        ].join(' ')}
      >
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-start gap-3">
            <div className={[
              'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white',
              isError ? 'bg-red-600' : 'bg-slate-900'
            ].join(' ')}>
              {promptState.kind === 'progress' ? (
                <Loader2 size={18} className="animate-spin" strokeWidth={2.25} />
              ) : promptState.kind === 'error' ? (
                <AlertTriangle size={18} strokeWidth={2.25} />
              ) : promptState.kind === 'restart' ? (
                <RotateCw size={18} strokeWidth={2.25} />
              ) : (
                <Download size={18} strokeWidth={2.25} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className={[
                'text-sm font-semibold tracking-tight',
                isError ? 'text-red-950' : 'text-slate-900'
              ].join(' ')}>{promptState.title}</div>
              <div className={[
                'mt-1 text-xs leading-relaxed',
                isError ? 'text-red-700' : 'text-slate-600'
              ].join(' ')}>{promptState.message}</div>
            </div>
          </div>

          {promptState.kind === 'progress' ? (
            <div className="mt-4 space-y-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-900 transition-[width] duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, promptState.progressPercent))}%` }}
                />
              </div>
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                {Math.max(0, Math.min(100, promptState.progressPercent))}% complete
              </div>
            </div>
          ) : (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={primaryActionDisabled}
                onClick={handlePrimaryAction}
                className={[
                  'inline-flex flex-1 items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-white transition-transform duration-150 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70',
                  isError ? 'bg-red-600 hover:-translate-y-px' : 'bg-slate-900 hover:-translate-y-px'
                ].join(' ')}
              >
                {primaryActionLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
