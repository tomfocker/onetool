const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('Windows installer and portable artifacts use distinct names', () => {
  const packageJsonPath = path.join(__dirname, '../../../package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  assert.equal(
    packageJson.build?.nsis?.artifactName,
    '${productName}-${version}-win-${arch}-setup.${ext}'
  )
  assert.equal(
    packageJson.build?.portable?.artifactName,
    '${productName}-${version}-win-${arch}-portable.${ext}'
  )
  assert.notEqual(packageJson.build?.nsis?.artifactName, packageJson.build?.portable?.artifactName)
})
