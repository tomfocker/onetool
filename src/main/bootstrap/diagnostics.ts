type ProcessLike = {
  on(event: 'uncaughtException' | 'unhandledRejection', handler: (...args: unknown[]) => void): void
}

type AppLike = {
  on(event: 'child-process-gone', handler: (...args: unknown[]) => void): void
}

export function registerProcessDiagnostics(input: {
  processLike: ProcessLike
  app: AppLike
  logger: {
    error(message: string, details?: unknown): void
  }
  serializeUnhandledReason(reason: unknown): unknown
}): void {
  const { processLike, app, logger, serializeUnhandledReason } = input

  processLike.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', error)
  })

  processLike.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
      promise: String(promise),
      reason: serializeUnhandledReason(reason)
    })
  })

  app.on('child-process-gone', (_event, details) => {
    logger.error('Child process gone', details)
  })
}
