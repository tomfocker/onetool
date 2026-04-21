const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getClassNames(tag) {
  const match = tag.match(/\bclass="([^"]*)"/)
  return new Set(match ? match[1].trim().split(/\s+/).filter(Boolean) : [])
}

function hasClasses(tag, classNames) {
  const actualClasses = getClassNames(tag)
  return classNames.every((className) => actualClasses.has(className))
}

function findStartTag(source, tagName, predicate, description) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, 'g')

  for (const match of source.matchAll(pattern)) {
    if (predicate(match[0])) {
      return match[0]
    }
  }

  assert.fail(`Could not find ${description}`)
}

function findStartTagById(source, tagName, id) {
  const idPattern = new RegExp(`\\bid="${escapeRegExp(id)}"`)
  return findStartTag(source, tagName, (tag) => idPattern.test(tag), `<${tagName}> with id="${id}"`)
}

function findStartTagByClassesAndAttribute(source, tagName, classNames, attributeName, attributeValue) {
  const attributePattern = new RegExp(
    `\\b${escapeRegExp(attributeName)}="${escapeRegExp(attributeValue)}"`
  )

  return findStartTag(
    source,
    tagName,
    (tag) => hasClasses(tag, classNames) && attributePattern.test(tag),
    `<${tagName}> with classes "${classNames.join(' ')}" and ${attributeName}="${attributeValue}"`
  )
}

function extractElementContentById(source, tagName, id) {
  const pattern = new RegExp(
    `<${tagName}\\b[^>]*\\bid="${escapeRegExp(id)}"[^>]*>([\\s\\S]*?)<\\/${tagName}>`
  )
  const match = source.match(pattern)

  assert.ok(match, `Could not extract <${tagName}> content for id="${id}"`)

  return match[1]
}

function assertAttributeValue(tag, attributeName, attributeValue) {
  assert.match(tag, new RegExp(`\\b${escapeRegExp(attributeName)}="${escapeRegExp(attributeValue)}"`))
}

test('hero heading keeps the title lines inside #hero-title without raw line breaks', () => {
  const heroTitleTag = findStartTagById(html, 'h1', 'hero-title')
  const heroTitleContent = extractElementContentById(html, 'h1', 'hero-title')

  assert.match(heroTitleTag, /\bclass="[^"]*\bhero-title\b[^"]*"/)
  assert.doesNotMatch(heroTitleContent, /<br\b/i)
  assert.match(
    heroTitleContent,
    /^\s*<span class="hero-title-line">一个应用，收齐<\/span>\s*<span class="hero-title-line hero-title-line-wide">Windows 日常高频工具<\/span>\s*$/
  )
})

test('hero cards expose stable dock keys on the intended hero card elements', () => {
  const expectedCards = [
    ['hero-flight-card-main', 'matrix'],
    ['hero-flight-card-capture', 'capture'],
    ['hero-flight-card-organize', 'organize'],
    ['hero-flight-card-clipboard', 'clipboard'],
    ['hero-flight-card-utility', 'utility'],
  ]

  for (const [cardClass, cardKey] of expectedCards) {
    const cardTag = findStartTagByClassesAndAttribute(
      html,
      'div',
      ['hero-flight-card', cardClass],
      'data-flight-card',
      cardKey
    )

    assertAttributeValue(cardTag, 'data-flight-card', cardKey)
  }
})

test('landing modules expose stable dock keys on the intended target elements', () => {
  const scenarioTargets = ['capture', 'organize', 'utility']

  for (const target of scenarioTargets) {
    const scenarioTag = findStartTagByClassesAndAttribute(
      html,
      'article',
      ['scenario-card'],
      'data-flight-target',
      target
    )

    assertAttributeValue(scenarioTag, 'data-flight-dock', target)
  }

  const matrixTag = findStartTagByClassesAndAttribute(
    html,
    'article',
    ['tool-group', 'tool-group-primary'],
    'data-flight-target',
    'matrix'
  )

  assertAttributeValue(matrixTag, 'data-flight-dock', 'matrix')
})
