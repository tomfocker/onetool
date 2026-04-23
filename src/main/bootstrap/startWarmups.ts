type WarmupDependencies = {
  settingsService: {
    loadSettings(): void
  }
  screenRecorderService: {
    initFfmpeg(): void
  }
  restoreTaskbarAppearanceOnStartup(): Promise<unknown> | void
  scheduleDoctorAudit(): void
}

export function startWarmups(dependencies: WarmupDependencies): void {
  dependencies.settingsService.loadSettings()
  dependencies.screenRecorderService.initFfmpeg()
  void dependencies.restoreTaskbarAppearanceOnStartup()
  dependencies.scheduleDoctorAudit()
}
