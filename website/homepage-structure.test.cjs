const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
const documentNode = parseHtml(html)

function parseHtml(source) {
  const root = { type: 'root', children: [], parent: null }
  const stack = [root]
  let index = 0

  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      const commentEnd = source.indexOf('-->', index + 4)
      index = commentEnd === -1 ? source.length : commentEnd + 3
      continue
    }

    if (source.startsWith('<?', index)) {
      const instructionEnd = source.indexOf('?>', index + 2)
      index = instructionEnd === -1 ? source.length : instructionEnd + 2
      continue
    }

    if (source[index] !== '<') {
      const nextTagIndex = source.indexOf('<', index)
      const textEnd = nextTagIndex === -1 ? source.length : nextTagIndex
      appendChild(stack[stack.length - 1], {
        type: 'text',
        value: source.slice(index, textEnd),
        parent: null,
      })
      index = textEnd
      continue
    }

    if (source.startsWith('<!', index)) {
      const declarationEnd = findTagEnd(source, index + 1)
      index = declarationEnd === -1 ? source.length : declarationEnd + 1
      continue
    }

    const tagEnd = findTagEnd(source, index + 1)

    if (tagEnd === -1) {
      break
    }

    const tagSource = source.slice(index + 1, tagEnd)

    if (tagSource.startsWith('/')) {
      closeOpenElements(stack, getTagName(tagSource.slice(1)))
      index = tagEnd + 1
      continue
    }

    const trimmedTagSource = tagSource.trim()
    const tagName = getTagName(trimmedTagSource)

    if (!tagName) {
      index = tagEnd + 1
      continue
    }

    const elementNode = {
      type: 'element',
      tagName,
      attributes: parseAttributes(trimmedTagSource.slice(tagName.length)),
      children: [],
      parent: null,
    }

    appendChild(stack[stack.length - 1], elementNode)

    if (!VOID_TAGS.has(tagName) && !/\/\s*$/.test(trimmedTagSource)) {
      stack.push(elementNode)
    }

    index = tagEnd + 1
  }

  return root
}

function findTagEnd(source, startIndex) {
  let quote = null

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index]

    if (quote) {
      if (character === quote) {
        quote = null
      }
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      continue
    }

    if (character === '>') {
      return index
    }
  }

  return -1
}

function getTagName(tagSource) {
  const trimmedTagSource = tagSource.trim().replace(/^\/\s*/, '')
  let endIndex = 0

  while (endIndex < trimmedTagSource.length && !/[\s/]/.test(trimmedTagSource[endIndex])) {
    endIndex += 1
  }

  return trimmedTagSource.slice(0, endIndex).toLowerCase()
}

function parseAttributes(attributeSource) {
  const attributes = {}
  let index = 0

  while (index < attributeSource.length) {
    while (index < attributeSource.length && /[\s/]/.test(attributeSource[index])) {
      index += 1
    }

    if (index >= attributeSource.length) {
      break
    }

    const nameStart = index

    while (index < attributeSource.length && !/[\s=/>]/.test(attributeSource[index])) {
      index += 1
    }

    const attributeName = attributeSource.slice(nameStart, index).toLowerCase()

    while (index < attributeSource.length && /\s/.test(attributeSource[index])) {
      index += 1
    }

    let attributeValue = ''

    if (attributeSource[index] === '=') {
      index += 1

      while (index < attributeSource.length && /\s/.test(attributeSource[index])) {
        index += 1
      }

      const quote = attributeSource[index]

      if (quote === '"' || quote === "'") {
        index += 1
        const valueStart = index
        const valueEnd = attributeSource.indexOf(quote, valueStart)

        if (valueEnd === -1) {
          attributeValue = attributeSource.slice(valueStart)
          index = attributeSource.length
        } else {
          attributeValue = attributeSource.slice(valueStart, valueEnd)
          index = valueEnd + 1
        }
      } else {
        const valueStart = index

        while (index < attributeSource.length && !/[\s>]/.test(attributeSource[index])) {
          index += 1
        }

        attributeValue = attributeSource.slice(valueStart, index)
      }
    }

    if (attributeName) {
      attributes[attributeName] = attributeValue
    }
  }

  return attributes
}

function closeOpenElements(stack, tagName) {
  if (!tagName) {
    return
  }

  for (let index = stack.length - 1; index > 0; index -= 1) {
    if (stack[index].tagName === tagName) {
      stack.length = index
      return
    }
  }
}

function appendChild(parentNode, childNode) {
  childNode.parent = parentNode
  parentNode.children.push(childNode)
}

function getAttribute(node, attributeName) {
  if (!node || node.type !== 'element') {
    return null
  }

  return node.attributes[attributeName.toLowerCase()] ?? null
}

function hasAttribute(node, attributeName) {
  return getAttribute(node, attributeName) !== null
}

function hasClass(node, className) {
  const classValue = getAttribute(node, 'class')

  if (!classValue) {
    return false
  }

  return classValue.split(/\s+/).includes(className)
}

function findAll(node, predicate) {
  const matches = []

  walk(node, (childNode) => {
    if (childNode.type === 'element' && predicate(childNode)) {
      matches.push(childNode)
    }
  })

  return matches
}

function findFirst(node, predicate) {
  let match = null

  walk(node, (childNode) => {
    if (match === null && childNode.type === 'element' && predicate(childNode)) {
      match = childNode
      return false
    }

    return true
  })

  return match
}

function walk(node, visit) {
  for (const childNode of node.children ?? []) {
    if (visit(childNode) === false) {
      return false
    }

    if (walk(childNode, visit) === false) {
      return false
    }
  }

  return true
}

function findAllByTag(node, tagName) {
  return findAll(node, (childNode) => childNode.tagName === tagName)
}

function findById(node, id) {
  return findFirst(node, (childNode) => getAttribute(childNode, 'id') === id)
}

function findByClass(node, className) {
  return findFirst(node, (childNode) => hasClass(childNode, className))
}

function findAllByAttribute(node, attributeName) {
  return findAll(node, (childNode) => hasAttribute(childNode, attributeName))
}

function getTextContent(node) {
  if (!node) {
    return ''
  }

  if (node.type === 'text') {
    return node.value
  }

  return (node.children ?? []).map((childNode) => getTextContent(childNode)).join('')
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim()
}

test('homepage keeps only hero, tools, and download sections', () => {
  assert.equal(findAllByTag(documentNode, 'section').length, 3)
  assert.ok(findById(documentNode, 'hero'))
  assert.ok(findById(documentNode, 'tools'))
  assert.ok(findById(documentNode, 'download'))
  assert.equal(findById(documentNode, 'scenarios'), null)
  assert.equal(findById(documentNode, 'system'), null)
  assert.equal(findByClass(documentNode, 'value-strip'), null)
})

test('top navigation exposes only three in-page anchors', () => {
  const navLinks = findByClass(documentNode, 'nav-links')

  assert.ok(navLinks, 'expected .nav-links container')

  const navAnchors = findAllByTag(navLinks, 'a').map((node) => getAttribute(node, 'href'))

  assert.deepEqual(navAnchors, ['#hero', '#tools', '#download'])
})

test('section body extraction handles nested sections', () => {
  const sampleDocument = parseHtml(`
    <section id="outer">
      <div data-part="before"></div>
      <section id="inner">
        <div data-part="nested"></div>
      </section>
      <div data-part="after"></div>
    </section>
  `)

  const outerSection = findById(sampleDocument, 'outer')

  assert.ok(outerSection, 'expected outer section')
  assert.deepEqual(
    findAllByTag(outerSection, 'div').map((node) => getAttribute(node, 'data-part')),
    ['before', 'nested', 'after']
  )
})

test('navigation lookup does not depend on a div wrapper and tolerates html noise', () => {
  const sampleDocument = parseHtml(`
    <!doctype html>
    <!-- layout comment -->
    <nav>
      <ul class="nav-links">
        <li><a href="#hero">Home</a></li>
        <li><a href="#tools">Tools</a></li>
        <li><a href="#download">Download</a></li>
      </ul>
      <img src="hero.png" alt="" />
    </nav>
    <section id="outer">
      <section id="inner"></section>
    </section>
  `)

  const navLinks = findByClass(sampleDocument, 'nav-links')

  assert.ok(navLinks, 'expected .nav-links container')
  assert.equal(navLinks.tagName, 'ul')
  assert.deepEqual(
    findAllByTag(navLinks, 'a').map((node) => getAttribute(node, 'href')),
    ['#hero', '#tools', '#download']
  )
  assert.ok(findAllByTag(sampleDocument, 'img').length === 1, 'expected img void tag to parse')
  assert.ok(findById(findById(sampleDocument, 'outer'), 'inner'), 'expected nested section')
})

test('hero and tools expose the new flight-card contract', () => {
  const heroSection = findById(documentNode, 'hero')

  assert.ok(heroSection, 'expected hero section')

  const heroFlightCards = findAllByAttribute(heroSection, 'data-flight-card').filter(
    (node) => node.tagName === 'div'
  )

  assert.equal(heroFlightCards.length, 9)
  assert.deepEqual(
    heroFlightCards.map((node) => getAttribute(node, 'data-flight-card')),
    [
      'matrix',
      'capture-stack',
      'capture-record',
      'text-rename',
      'text-clipboard',
      'web-activate',
      'web-qr',
      'utility-float',
      'utility-clicker',
    ]
  )

  const toolsSection = findById(documentNode, 'tools')

  assert.ok(toolsSection, 'expected tools section')

  const toolsLabelId = getAttribute(toolsSection, 'aria-labelledby')

  assert.ok(toolsLabelId, 'expected tools section to have aria-labelledby')

  const toolsHeading = findById(toolsSection, toolsLabelId)

  assert.ok(toolsHeading, `expected tools heading with id="${toolsLabelId}"`)
  assert.equal(toolsHeading.tagName, 'h2')
  assert.ok(findByClass(toolsSection, 'tool-matrix-intro'), 'expected tool intro block')

  const toolGroupNodes = findAll(toolsSection, (node) =>
    node.tagName === 'article' && hasAttribute(node, 'data-flight-target')
  )

  assert.equal(toolGroupNodes.length, 4)

  const toolGroupByTarget = new Map(
    toolGroupNodes.map((node) => [getAttribute(node, 'data-flight-target'), node])
  )

  const captureGroup = toolGroupByTarget.get('capture')
  const textGroup = toolGroupByTarget.get('text')
  const webGroup = toolGroupByTarget.get('web')
  const utilityGroup = toolGroupByTarget.get('utility')

  assert.ok(captureGroup, 'expected capture receiver')
  assert.ok(textGroup, 'expected text receiver')
  assert.ok(webGroup, 'expected web receiver')
  assert.ok(utilityGroup, 'expected utility receiver')

  assert.ok(hasClass(captureGroup, 'tool-group'))
  assert.ok(hasClass(captureGroup, 'tool-group-primary'))
  assert.equal(getAttribute(captureGroup, 'data-flight-dock'), 'capture')
  assert.ok(hasClass(textGroup, 'tool-group'))
  assert.equal(getAttribute(textGroup, 'data-flight-dock'), 'text')
  assert.ok(hasClass(webGroup, 'tool-group'))
  assert.equal(getAttribute(webGroup, 'data-flight-dock'), 'web')
  assert.ok(hasClass(utilityGroup, 'tool-group'))
  assert.equal(getAttribute(utilityGroup, 'data-flight-dock'), 'utility')

  const toolHeadingsByTarget = new Map(
    toolGroupNodes.map((node) => [
      getAttribute(node, 'data-flight-target'),
      normalizeText(getTextContent(findFirst(node, (childNode) => childNode.tagName === 'span'))),
    ])
  )

  assert.equal(toolHeadingsByTarget.get('capture'), '捕获与处理')
  assert.equal(toolHeadingsByTarget.get('text'), '文件与文本')
  assert.equal(toolHeadingsByTarget.get('web'), '网页与内容')
  assert.equal(toolHeadingsByTarget.get('utility'), '更多小工具')
  assert.equal(toolGroupByTarget.get('organize') ?? null, null)
})
