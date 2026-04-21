const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countTags(source, tagName) {
  const matches = source.match(new RegExp(`<${tagName}\\b`, 'gi'))
  return matches ? matches.length : 0
}

function findStartTags(source, tagName) {
  return [...source.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'g'))].map((match) => match[0])
}

function findStartTag(source, tagName, predicate, description) {
  for (const tag of findStartTags(source, tagName)) {
    if (predicate(tag)) {
      return tag
    }
  }

  assert.fail(`Could not find ${description}`)
}

function findStartTagById(source, tagName, id) {
  const idPattern = new RegExp(`\\bid="${escapeRegExp(id)}"`)
  return findStartTag(source, tagName, (tag) => idPattern.test(tag), `<${tagName}> with id="${id}"`)
}

function getAttribute(tag, attributeName) {
  const match = tag.match(new RegExp(`\\b${escapeRegExp(attributeName)}="([^"]*)"`))
  return match ? match[1] : null
}

function getSectionContent(source, id) {
  const pattern = new RegExp(
    `<section\\b[^>]*\\bid="${escapeRegExp(id)}"[^>]*>([\\s\\S]*?)<\\/section>`
  )
  const match = source.match(pattern)

  assert.ok(match, `Could not extract section content for id="${id}"`)
  return match[1]
}

function getStartTagForSectionBody(source, id, tagName) {
  const sectionContent = getSectionContent(source, id)
  return findStartTag(sectionContent, tagName, () => true, `<${tagName}> inside section "${id}"`)
}

test('homepage keeps only hero, tools, and download sections', () => {
  assert.equal(countTags(html, 'section'), 3)
  findStartTagById(html, 'section', 'hero')
  findStartTagById(html, 'section', 'tools')
  findStartTagById(html, 'section', 'download')
  assert.doesNotMatch(html, /id="scenarios"/)
  assert.doesNotMatch(html, /id="system"/)
  assert.doesNotMatch(html, /value-strip/)
})

test('top navigation exposes only three in-page anchors', () => {
  const navLinks = html.match(/<div class="nav-links">([\s\S]*?)<\/div>/)

  assert.ok(navLinks, 'expected .nav-links container')
  const navAnchors = [...navLinks[1].matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].map(
    (match) => match[1]
  )

  assert.deepEqual(navAnchors, ['#hero', '#tools', '#download'])
})

test('tool section is validly labelled and has three tool-group receivers', () => {
  const toolsSection = findStartTagById(html, 'section', 'tools')
  const toolsLabelId = getAttribute(toolsSection, 'aria-labelledby')

  assert.ok(toolsLabelId, 'expected tools section to have aria-labelledby')
  findStartTagById(html, 'h2', toolsLabelId)

  const toolSectionContent = getSectionContent(html, 'tools')
  const toolGroupTags = findStartTags(toolSectionContent, 'article').filter((tag) =>
    /data-flight-target=/.test(tag)
  )

  assert.match(toolSectionContent, /class="tool-matrix-intro"/)
  assert.equal(toolGroupTags.length, 3)

  const toolGroupByTarget = new Map(
    toolGroupTags.map((tag) => [getAttribute(tag, 'data-flight-target'), tag])
  )

  assert.match(toolGroupByTarget.get('capture') ?? '', /class="tool-group tool-group-primary"/)
  assert.match(toolGroupByTarget.get('capture') ?? '', /data-flight-dock="capture"/)
  assert.match(toolGroupByTarget.get('organize') ?? '', /class="tool-group"/)
  assert.match(toolGroupByTarget.get('organize') ?? '', /data-flight-dock="organize"/)
  assert.match(toolGroupByTarget.get('utility') ?? '', /class="tool-group"/)
  assert.match(toolGroupByTarget.get('utility') ?? '', /data-flight-dock="utility"/)
  assert.doesNotMatch(html, /data-flight-target="matrix"/)
  assert.doesNotMatch(html, /data-flight-target="clipboard"/)
})
