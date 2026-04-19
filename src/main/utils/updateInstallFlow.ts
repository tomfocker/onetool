type QuittingStateController = {
  setIsQuitting: (value: boolean) => void
}

export function createBeforeQuitAndInstallHook(
  controller: QuittingStateController
): () => () => void {
  return () => {
    controller.setIsQuitting(true)

    return () => {
      controller.setIsQuitting(false)
    }
  }
}
