const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const script = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8')
const style = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8')
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')

const getAttrValues = (source, attr) => [...source.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].map((match) => match[1])
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const getRuleBlock = (source, selector) => source.match(new RegExp(`${escapeRegex(selector)}\\s*\\{[\\s\\S]*?\\n\\}`, 'm'))?.[0] ?? ''
const getCustomProperty = (rule, propertyName) => rule.match(new RegExp(`${propertyName}\\s*:\\s*([^;]+);`))?.[1]?.trim() ?? null

const expectAttrValues = (source, attr, expected) => {
  assert.deepStrictEqual(getAttrValues(source, attr), expected)
}

test('index html wires the eight flight cards and four receiver docks', () => {
  expectAttrValues(html, 'data-flight-card', [
    'matrix',
    'capture-stack',
    'capture-record',
    'text-rename',
    'text-clipboard',
    'web-activate',
    'web-qr',
    'utility-float',
    'utility-clicker'
  ])
  expectAttrValues(html, 'data-flight-target', ['capture', 'text', 'web', 'utility'])
  expectAttrValues(html, 'data-flight-dock', ['capture', 'text', 'web', 'utility'])
  assert.equal((html.match(/<article class="tool-group/g) ?? []).length, 4)
  assert.match(html, /<div class="tool-matrix-grid tool-matrix-grid-four">/)
  assert.doesNotMatch(html, /data-flight-target="(?:organize|clipboard)"/)
  assert.doesNotMatch(html, /data-flight-dock="(?:organize|clipboard)"/)
  assert.doesNotMatch(html, /data-flight-card="(?:organize|clipboard)"/)
})

test('hero cards map to tool groups and scroll timing comes only from toolsSection', () => {
  assert.match(script, /const flightTargets = \{/)
  assert.match(script, /const dockTargets = \{/)
  assert.match(script, /const targetMap = \{/)
  assert.match(script, /const heroTargets = \{/)
  assert.match(script, /const scheduleSync = \(\) => \{/)
  assert.match(script, /const syncScrollState = \(\) => \{/)
  assert.match(script, /const syncFlightTargets = \(\) => \{/)
  assert.match(script, /const createZeroMotionState = \(\) => \(\{/)
  assert.match(script, /const smoothMotionState = \(current, target, factor\) => \{/)
  assert.match(script, /const runMotionFrame = \(\) => \{/)
  assert.match(script, /const ensureMotionFrame = \(\) => \{/)
  assert.match(script, /const getViewportProgress = \(element, startRatio, endRatio\) => \{/)

  assert.match(script, /\bcaptureStack:\s*document\.querySelector\('\.hero-flight-card-capture-stack'\)/)
  assert.match(script, /\bcaptureRecord:\s*document\.querySelector\('\.hero-flight-card-capture-record'\)/)
  assert.match(script, /\btextRename:\s*document\.querySelector\('\.hero-flight-card-text-rename'\)/)
  assert.match(script, /\btextClipboard:\s*document\.querySelector\('\.hero-flight-card-text-clipboard'\)/)
  assert.match(script, /\bwebActivate:\s*document\.querySelector\('\.hero-flight-card-web-activate'\)/)
  assert.match(script, /\bwebQr:\s*document\.querySelector\('\.hero-flight-card-web-qr'\)/)
  assert.match(script, /\butilityFloat:\s*document\.querySelector\('\.hero-flight-card-utility-float'\)/)
  assert.match(script, /\butilityClicker:\s*document\.querySelector\('\.hero-flight-card-utility-clicker'\)/)
  assert.match(script, /\bmatrix:\s*document\.querySelector\('\.hero-flight-card-main'\)/)
  assert.match(script, /const receiverSlots = \{/)

  assert.match(script, /\bcapture:\s*document\.querySelector\('\[data-flight-target="capture"\]'\)/)
  assert.match(script, /\btext:\s*document\.querySelector\('\[data-flight-target="text"\]'\)/)
  assert.match(script, /\bweb:\s*document\.querySelector\('\[data-flight-target="web"\]'\)/)
  assert.match(script, /\butility:\s*document\.querySelector\('\[data-flight-target="utility"\]'\)/)
  assert.doesNotMatch(script, /organize:\s*document\.querySelector\('\[data-flight-target="/)
  assert.doesNotMatch(script, /clipboard:\s*document\.querySelector\('\[data-flight-target="/)
  assert.doesNotMatch(script, /matrix:\s*document\.querySelector\('\[data-flight-target="/)

  assert.match(script, /\bcapture:\s*document\.querySelector\('\[data-flight-dock="capture"\]'\)/)
  assert.match(script, /\btext:\s*document\.querySelector\('\[data-flight-dock="text"\]'\)/)
  assert.match(script, /\bweb:\s*document\.querySelector\('\[data-flight-dock="web"\]'\)/)
  assert.match(script, /\butility:\s*document\.querySelector\('\[data-flight-dock="utility"\]'\)/)
  assert.doesNotMatch(script, /organize:\s*document\.querySelector\('\[data-flight-dock="/)
  assert.doesNotMatch(script, /clipboard:\s*document\.querySelector\('\[data-flight-dock="/)
  assert.doesNotMatch(script, /matrix:\s*document\.querySelector\('\[data-flight-dock="/)

  assert.match(script, /captureStack:\s*'capture'/)
  assert.match(script, /captureRecord:\s*'capture'/)
  assert.match(script, /textRename:\s*'text'/)
  assert.match(script, /textClipboard:\s*'text'/)
  assert.match(script, /webActivate:\s*'web'/)
  assert.match(script, /webQr:\s*'web'/)
  assert.match(script, /utilityFloat:\s*'utility'/)
  assert.match(script, /utilityClicker:\s*'utility'/)
  assert.doesNotMatch(script, /matrix:\s*'capture'/)
  assert.match(script, /const flightRect = heroFlight\.getBoundingClientRect\(\)/)
  assert.match(script, /const flightLeft = window\.scrollX \+ flightRect\.left/)
  assert.match(script, /card\.style\.setProperty\('--dock-x-base',/)
  assert.match(script, /card\.style\.setProperty\('--dock-y-base',/)
  assert.match(script, /card\.style\.removeProperty\('--dock-scale'\)/)

  assert.doesNotMatch(script, /document\.querySelector\('#scenarios'\)/)
  assert.doesNotMatch(script, /document\.querySelector\('#system'\)/)
  assert.doesNotMatch(script, /getViewportProgress\(scenariosSection/)
  assert.match(script, /const state = getHeroMotionState\(/)
  assert.match(script, /targetMotionState = state/)
  assert.match(script, /renderMotionState\(renderedMotionState\)/)
  assert.match(script, /window\.requestAnimationFrame\(runMotionFrame\)/)
  assert.match(script, /clusterProgress:\s*getViewportProgress\(toolsSection, 1\.04, 0\.36\)/)
  assert.match(script, /travelProgress:\s*getViewportProgress\(toolsSection, 0\.96, 0\.32\)/)
  assert.match(script, /morphProgress:\s*getViewportProgress\(toolsSection, 0\.82, 0\.24\)/)
  assert.match(script, /dockProgress:\s*getViewportProgress\(toolsSection, 0\.42, 0\.1\)/)
  assert.match(script, /settleProgress:\s*getViewportProgress\(toolsSection, 0\.9, 0\.16\)/)
  assert.match(script, /capture:\s*flightTargets\.capture/)
  assert.match(script, /text:\s*flightTargets\.text/)
  assert.match(script, /web:\s*flightTargets\.web/)
  assert.match(script, /utility:\s*flightTargets\.utility/)
  assert.match(script, /matrix:\s*toolsSection/)
  assert.match(script, /const receiverProgress = \{/)
  assert.match(script, /const receiverPulse = \{/)
  assert.match(script, /capture:\s*easeOutCubic\(getViewportProgress\(heroTargets\.capture, 0\.96, 0\.46\)\)/)
  assert.match(script, /text:\s*easeOutCubic\(getViewportProgress\(heroTargets\.text, 0\.9, 0\.3\)\)/)
  assert.match(script, /web:\s*easeOutCubic\(getViewportProgress\(heroTargets\.web, 0\.94, 0\.4\)\)/)
  assert.match(script, /utility:\s*easeOutCubic\(getViewportProgress\(heroTargets\.utility, 0\.92, 0\.34\)\)/)
  assert.match(script, /matrix:\s*easeOutCubic\(getViewportProgress\(heroTargets\.matrix, 0\.84, 0\.26\)\)/)
  assert.match(script, /capture:\s*easeOutCubic\(getViewportProgress\(dockTargets\.capture, 1\.02, 0\.38\)\)/)
  assert.match(script, /text:\s*easeOutCubic\(getViewportProgress\(dockTargets\.text, 1,\s*0\.36\)\)/)
  assert.match(script, /web:\s*easeOutCubic\(getViewportProgress\(dockTargets\.web, 0\.98, 0\.34\)\)/)
  assert.match(script, /utility:\s*easeOutCubic\(getViewportProgress\(dockTargets\.utility, 0\.96, 0\.32\)\)/)
  assert.match(script, /capture:\s*easeOutCubic\(getViewportProgress\(dockTargets\.capture, 0\.48, 0\.14\)\)/)
  assert.match(script, /boardTravel:\s*0/)
  assert.match(script, /boardDock:\s*0/)
  assert.doesNotMatch(script, /travelLead/)
  assert.doesNotMatch(script, /travelFollow/)

  assert.match(script, /window\.requestAnimationFrame\(\(\) => \{/)
  assert.match(script, /--flight-morph/)
  assert.match(script, /--flight-dock/)
  assert.doesNotMatch(script, /--clipboard-highlight/)
  assert.doesNotMatch(script, /--organize-highlight/)
})

test('local hero motion fallback accepts object context and returns the full state shape', () => {
  assert.match(script, /const getHeroMotionState =/)
  assert.match(script, /typeof progressInput === 'number'/)
  assert.match(script, /progress:\s*context\.progress \?\? 0/)
  assert.match(script, /breakout:\s*context\.breakoutProgress \?\? 0/)
  assert.match(script, /morph:\s*context\.morphProgress \?\? 0/)
  assert.match(script, /dock:\s*context\.dockProgress \?\? 0/)
  assert.match(script, /settle:\s*context\.settleProgress \?\? 0/)
  assert.match(script, /highlight: \{/)
  assert.match(script, /text:\s*highlight\.text \?\?\s*highlight\.clipboard \?\? 0/)
  assert.match(script, /web:\s*highlight\.web \?\?\s*highlight\.organize \?\? 0/)
  assert.match(script, /matrix:\s*highlight\.matrix \?\? 0/)
})

test('hero board no longer declares receiver dock variables', () => {
  const mainRule = style.match(/\.hero-flight-card-main\s*\{[\s\S]*?\n\}/)?.[0] ?? ''

  assert.ok(mainRule, 'expected .hero-flight-card-main rule in style.css')
  assert.doesNotMatch(mainRule, /--receiver-[a-z-]+:/)
  assert.doesNotMatch(mainRule, /--dock-(?:x-base|y-base|scale):/)
})

test('hero flight uses the new eight-card ring and grouped receiver offsets', () => {
  assert.match(style, /\.hero-flight-card-main\s*\{/)
  assert.match(style, /--break-rotate:\s*-2\.5deg/)
  assert.match(style, /--card-tilt-y:\s*-2deg/)
  assert.match(style, /rotate\(calc\(var\(--break-rotate\) \* var\(--flight-breakout-soft\) \* \(1 - var\(--flight-morph-soft\)\)\)\)/)
  assert.match(style, /\.tool-matrix-grid-four\s*\{/)
  assert.match(style, /contain:\s*layout style/)
  assert.match(style, /--dock-y-base/)
  assert.match(style, /--card-highlight:\s*var\(--capture-highlight\)/)
  assert.match(style, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/)
  for (const [firstCard, secondCard] of [
    ['capture-stack', 'capture-record'],
    ['text-rename', 'text-clipboard'],
    ['web-activate', 'web-qr'],
    ['utility-float', 'utility-clicker'],
  ]) {
    const firstRule = getRuleBlock(style, `.hero-flight-card-${firstCard}`)
    const secondRule = getRuleBlock(style, `.hero-flight-card-${secondCard}`)

    assert.ok(firstRule, `expected rule for ${firstCard}`)
    assert.ok(secondRule, `expected rule for ${secondCard}`)
    assert.match(firstRule, /--receiver-slot-x:/)
    assert.match(firstRule, /--receiver-slot-y:/)
    assert.match(secondRule, /--receiver-slot-x:/)
    assert.match(secondRule, /--receiver-slot-y:/)
    assert.notEqual(getCustomProperty(firstRule, '--receiver-slot-x'), getCustomProperty(secondRule, '--receiver-slot-x'))
    assert.notEqual(getCustomProperty(firstRule, '--receiver-slot-y'), getCustomProperty(secondRule, '--receiver-slot-y'))
    assert.doesNotMatch(firstRule, /--receiver-dock-(?:x|y):/)
    assert.doesNotMatch(secondRule, /--receiver-dock-(?:x|y):/)
  }
})

test('tool groups define independent receive halos and pulses', () => {
  const captureRule = getRuleBlock(style, '.tool-group[data-flight-dock="capture"]')
  const textRule = getRuleBlock(style, '.tool-group[data-flight-dock="text"]')
  const webRule = getRuleBlock(style, '.tool-group[data-flight-dock="web"]')
  const utilityRule = getRuleBlock(style, '.tool-group[data-flight-dock="utility"]')

  assert.ok(captureRule, 'expected capture tool-group rule')
  assert.ok(textRule, 'expected text tool-group rule')
  assert.ok(webRule, 'expected web tool-group rule')
  assert.ok(utilityRule, 'expected utility tool-group rule')

  for (const rule of [captureRule, textRule, webRule, utilityRule]) {
    assert.match(rule, /--receiver-halo:/)
    assert.match(rule, /--receiver-pulse:/)
    assert.doesNotMatch(rule, /--receiver-center-(?:x|y):/)
  }
})

test('small cards declare split dock offsets instead of one shared center target', () => {
  assert.doesNotMatch(style, /--receiver-center-(?:x|y):/)
  assert.doesNotMatch(style, /--receiver-center-target:/)
  assert.match(style, /@media \(max-width:\s*1180px\)\s*\{[\s\S]*\.tool-matrix-grid-four\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
})

test('hero title uses launch-page typography instead of the old stacked tower', () => {
  assert.match(style, /\.hero-title\s*{/)
  assert.match(style, /\.hero-title-line-primary\s*{/)
  assert.match(style, /\.hero-title-line-wide\s*{/)
  assert.match(style, /max-width:\s*640px/)
  assert.match(style, /font-family:\s*'Noto Sans SC', 'Manrope', 'PingFang SC', sans-serif/)
  assert.match(style, /\.hero-title-line-primary\s*\{[\s\S]*font-size:\s*clamp\(3\.18rem,\s*5\.8vw,\s*5\.86rem\)/)
  assert.match(style, /\.hero-title-line-primary\s*\{[\s\S]*font-weight:\s*780/)
  assert.match(style, /\.hero-title-line-primary\s*\{[\s\S]*letter-spacing:\s*-0\.092em/)
  assert.match(style, /\.hero-title-line-wide\s*\{[\s\S]*font-size:\s*clamp\(2\.06rem,\s*3\.46vw,\s*3\.28rem\)/)
  assert.match(style, /\.hero-title-line-wide\s*\{[\s\S]*white-space:\s*nowrap/)
})

test('tool section defines a dedicated intro block', () => {
  assert.match(style, /\.tool-matrix-intro\s*\{/)
  assert.match(style, /\.tool-matrix-intro h2\s*\{/)
})

test('tool groups use the lighter dock takeover contract', () => {
  assert.match(style, /\.tool-group\[data-flight-target\]\[data-flight-dock="capture"\]/)
  assert.match(style, /\.tool-group\[data-flight-target\]\[data-flight-dock="text"\]/)
  assert.match(style, /\.tool-group\[data-flight-target\]\[data-flight-dock="web"\]/)
  assert.match(style, /\.tool-group\[data-flight-target\]\[data-flight-dock="utility"\]/)
  assert.match(style, /transform:\s*translate3d\(0,\s*calc\(var\(--dock-lift/)
})

test('contract no longer requires scenario-card takeover rules', () => {
  assert.doesNotMatch(style, /\.scenario-card\[data-flight-dock=/)
})
