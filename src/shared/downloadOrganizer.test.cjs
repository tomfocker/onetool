const test = require('node:test')
const assert = require('node:assert/strict')

const {
  classifyDownloadOrganizerCategory,
  matchDownloadOrganizerRule,
  renderDownloadOrganizerTargetPath,
  createConflictResolvedPath,
  createDefaultDownloadOrganizerRules
} = require('./downloadOrganizer.ts')

test('classifyDownloadOrganizerCategory maps common extensions into stable categories', () => {
  assert.equal(classifyDownloadOrganizerCategory('installer.MSI'), 'installer')
  assert.equal(classifyDownloadOrganizerCategory('holiday.JPG'), 'image')
  assert.equal(classifyDownloadOrganizerCategory('archive.7z'), 'archive')
  assert.equal(classifyDownloadOrganizerCategory('report.pdf'), 'document')
  assert.equal(classifyDownloadOrganizerCategory('unknown.bin'), 'other')
})

test('matchDownloadOrganizerRule requires all configured conditions to pass', () => {
  const candidate = {
    sourcePath: 'C:\\Users\\Admin\\Downloads\\OBS-Studio-30.2.3-x64-Installer.exe',
    fileName: 'OBS-Studio-30.2.3-x64-Installer.exe',
    extension: '.exe',
    sizeBytes: 96 * 1024 * 1024,
    modifiedAt: '2026-04-21T08:00:00.000Z',
    category: 'installer'
  }

  const now = new Date('2026-04-21T12:00:00.000Z').getTime()

  assert.equal(matchDownloadOrganizerRule(candidate, {
    id: 'rule-1',
    name: 'Installers',
    enabled: true,
    conditions: {
      categories: ['installer'],
      nameIncludes: ['installer'],
      minSizeBytes: 20 * 1024 * 1024,
      maxAgeDays: 2
    },
    action: {
      targetPathTemplate: '安装包/{yyyy-mm}'
    }
  }, now), true)

  assert.equal(matchDownloadOrganizerRule(candidate, {
    id: 'rule-2',
    name: 'Too old',
    enabled: true,
    conditions: {
      categories: ['installer'],
      maxAgeDays: 0
    },
    action: {
      targetPathTemplate: '安装包/{yyyy-mm}'
    }
  }, now), false)
})

test('renderDownloadOrganizerTargetPath expands category, extension, and date tokens', () => {
  const targetPath = renderDownloadOrganizerTargetPath('归档/{category}/{yyyy-mm}/{ext}', {
    fileName: 'wallpaper.png',
    extension: '.png',
    category: 'image',
    modifiedAt: '2026-03-02T10:30:00.000Z'
  })

  assert.equal(targetPath, '归档/image/2026-03/png')
})

test('createConflictResolvedPath appends an incrementing suffix before the extension', () => {
  assert.equal(
    createConflictResolvedPath('D:\\Sorted\\安装包\\setup.exe', 1),
    'D:\\Sorted\\安装包\\setup (1).exe'
  )
  assert.equal(
    createConflictResolvedPath('D:\\Sorted\\文档\\README', 2),
    'D:\\Sorted\\文档\\README (2)'
  )
})

test('createDefaultDownloadOrganizerRules covers audio and fallback categories out of the box', () => {
  const rules = createDefaultDownloadOrganizerRules()

  assert.equal(rules.some((rule) => rule.conditions.categories?.includes('audio')), true)
  assert.equal(rules.some((rule) => rule.conditions.categories?.includes('other')), true)
})
