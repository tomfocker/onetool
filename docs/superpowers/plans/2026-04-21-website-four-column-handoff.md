# Website Four-Column Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add eight concrete hero feature cards, convert the second page to four receiving columns, and make each small card dock into its matching column while the large hero board fades out as a non-target overview card.

**Architecture:** Keep the current three-section static site and extend the existing handoff system rather than rebuilding it. `index.html` becomes the source of truth for the eight hero cards and four-column receivers, `style.css` handles the denser hero composition plus four-column takeover layout, `script.js` expands the geometry cache and card-to-column mapping, and `hero-motion.js` adds only the minimal extra phase support needed for grouped arrival. Tests remain contract-heavy and verify markup, mapping, timing, and cached-geometry behavior.

**Tech Stack:** Static HTML, CSS custom properties, vanilla JavaScript, Node test runner (`node --test`), local browser preview from the worktree HTML file.

---

## File Structure

**Modify:**
- `D:/code/onetool/.worktrees/website-hero-handoff/website/index.html`
- `D:/code/onetool/.worktrees/website-hero-handoff/website/style.css`
- `D:/code/onetool/.worktrees/website-hero-handoff/website/script.js`
- `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-motion.js`
- `D:/code/onetool/.worktrees/website-hero-handoff/website/homepage-structure.test.cjs`
- `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-style-contract.test.cjs`
- `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-motion.test.cjs`

**Responsibilities:**
- `index.html`: add the eight hero feature cards, change the tool grid from three to four columns, and expose the new `data-flight-card`, `data-flight-target`, and `data-flight-dock` relationships.
- `style.css`: place the eight hero cards around the overview board, style the four-column receiving layout, and make per-column dual-card docking readable.
- `script.js`: expand card maps and cached geometry for eight cards into four targets while keeping scroll-time work lightweight.
- `hero-motion.js`: keep the handoff model small and add only the extra grouped-arrival field(s) needed for the four-column version.
- `homepage-structure.test.cjs`: prove the hero has one overview board plus eight feature cards, and the tools section has four labelled receivers.
- `hero-style-contract.test.cjs`: prove the CSS/JS contract for four-column receiving, grouped geometry, and dock-offset handling.
- `hero-motion.test.cjs`: prove the updated motion model still delays docking appropriately and supports grouped arrival.

---

### Task 1: Lock The Eight-Card Hero And Four-Column Markup Contract

**Files:**
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/homepage-structure.test.cjs`
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/index.html`

- [ ] **Step 1: Rewrite the failing structure tests**

Extend `D:/code/onetool/.worktrees/website-hero-handoff/website/homepage-structure.test.cjs` with the new hero/tool structure contract:

```js
test('hero exposes one overview board plus eight feature cards', () => {
  const expectedCards = [
    'capture-stack',
    'capture-record',
    'text-rename',
    'text-clipboard',
    'web-activate',
    'web-qr',
    'utility-float',
    'utility-clicker',
  ]

  assert.match(html, /data-flight-card="matrix"/)

  for (const card of expectedCards) {
    assert.match(html, new RegExp(`data-flight-card="${card}"`))
  }
})

test('tools section exposes four receiving columns', () => {
  const expectedTargets = ['capture', 'text', 'web', 'utility']

  for (const target of expectedTargets) {
    assert.match(html, new RegExp(`data-flight-target="${target}"`))
    assert.match(html, new RegExp(`data-flight-dock="${target}"`))
  }

  assert.doesNotMatch(html, /data-flight-target="organize"/)
})

test('tools section columns use the approved headings', () => {
  assert.match(html, />捕获与处理</)
  assert.match(html, />文件与文本</)
  assert.match(html, />网页与内容</)
  assert.match(html, />更多小工具</)
})
```

- [ ] **Step 2: Run the structure test to verify it fails**

Run:

```powershell
node --test website/homepage-structure.test.cjs
```

Expected: FAIL because the current hero still has the old card set and the tools section still has only three receivers.

- [ ] **Step 3: Implement the hero card and four-column HTML**

Update the hero card block in `D:/code/onetool/.worktrees/website-hero-handoff/website/index.html` so it keeps the overview board and adds the eight feature cards:

```html
<div class="hero-flight" aria-hidden="true">
  <div class="hero-flight-card hero-flight-card-main" data-flight-card="matrix"></div>
  <div class="hero-flight-card hero-flight-card-stack" data-flight-card="capture-stack"></div>
  <div class="hero-flight-card hero-flight-card-record" data-flight-card="capture-record"></div>
  <div class="hero-flight-card hero-flight-card-rename" data-flight-card="text-rename"></div>
  <div class="hero-flight-card hero-flight-card-clipboard" data-flight-card="text-clipboard"></div>
  <div class="hero-flight-card hero-flight-card-activate" data-flight-card="web-activate"></div>
  <div class="hero-flight-card hero-flight-card-qr" data-flight-card="web-qr"></div>
  <div class="hero-flight-card hero-flight-card-float" data-flight-card="utility-float"></div>
  <div class="hero-flight-card hero-flight-card-clicker" data-flight-card="utility-clicker"></div>
</div>
```

Replace the tools grid with four receiver columns:

```html
<div class="tool-matrix-grid tool-matrix-grid-four">
  <article class="tool-group tool-group-primary" data-flight-target="capture" data-flight-dock="capture">
    <span>捕获与处理</span>
    <ul>
      <li>叠加截图</li>
      <li>屏幕录制</li>
    </ul>
  </article>
  <article class="tool-group" data-flight-target="text" data-flight-dock="text">
    <span>文件与文本</span>
    <ul>
      <li>批量重命名</li>
      <li>剪贴板管理</li>
    </ul>
  </article>
  <article class="tool-group" data-flight-target="web" data-flight-dock="web">
    <span>网页与内容</span>
    <ul>
      <li>网页激活</li>
      <li>二维码</li>
    </ul>
  </article>
  <article class="tool-group" data-flight-target="utility" data-flight-dock="utility">
    <span>更多小工具</span>
    <ul>
      <li>文件暂存悬浮球</li>
      <li>连点器</li>
    </ul>
  </article>
</div>
```

- [ ] **Step 4: Run the structure test to verify it passes**

Run:

```powershell
node --test website/homepage-structure.test.cjs
```

Expected: PASS with the eight-card hero and four-column receiver contract locked in.

- [ ] **Step 5: Commit**

```powershell
git add website/index.html website/homepage-structure.test.cjs
git commit -m "feat: add website four-column handoff markup"
```

---

### Task 2: Expand The Hero Layout And Four-Column Receiving Styles

**Files:**
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-style-contract.test.cjs`
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/style.css`

- [ ] **Step 1: Add the failing CSS contract assertions**

Extend `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-style-contract.test.cjs` with:

```js
test('hero defines layout rules for eight feature cards around the overview board', () => {
  assert.match(style, /\.hero-flight-card-stack\s*\{/)
  assert.match(style, /\.hero-flight-card-record\s*\{/)
  assert.match(style, /\.hero-flight-card-rename\s*\{/)
  assert.match(style, /\.hero-flight-card-activate\s*\{/)
  assert.match(style, /\.hero-flight-card-clicker\s*\{/)
})

test('tool grid exposes the four-column receiving layout', () => {
  assert.match(style, /\.tool-matrix-grid-four\s*\{/)
  assert.match(style, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/)
})

test('tool receivers support grouped docking offsets', () => {
  assert.match(style, /--group-shift:/)
  assert.match(style, /\.tool-group\[data-flight-target\]\[data-flight-dock="capture"\]/)
  assert.match(style, /\.tool-group\[data-flight-target\]\[data-flight-dock="web"\]/)
})
```

- [ ] **Step 2: Run the CSS contract test to verify it fails**

Run:

```powershell
node --test website/hero-style-contract.test.cjs
```

Expected: FAIL because the current stylesheet still describes the older card set and three-column tool layout.

- [ ] **Step 3: Implement the eight-card hero layout and four-column receivers**

In `D:/code/onetool/.worktrees/website-hero-handoff/website/style.css`, add one rule per new hero card with fixed placement around the board. Use this shape and fill in each card’s placement:

```css
.hero-flight-card-stack {
  top: 8%;
  left: 6%;
  width: min(12vw, 168px);
  aspect-ratio: 5 / 4;
  background-image: url('hero-shot-stack.png');
  --break-x: -28px;
  --break-y: -22px;
  --break-rotate: -8deg;
}
```

Add the four-column tools grid:

```css
.tool-matrix-grid-four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: start;
}
```

Add grouped receiver offsets so each column can host two cards cleanly:

```css
.tool-group[data-flight-target][data-flight-dock="capture"] {
  --group-shift: 0px;
}

.tool-group[data-flight-target][data-flight-dock="text"] {
  --group-shift: 6px;
}

.tool-group[data-flight-target][data-flight-dock="web"] {
  --group-shift: 10px;
}

.tool-group[data-flight-target][data-flight-dock="utility"] {
  --group-shift: 14px;
}
```

Keep the existing responsive fallbacks and add a breakpoint to collapse four columns to two on narrower widths:

```css
@media (max-width: 1180px) {
  .tool-matrix-grid-four {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 4: Run the CSS contract test to verify it passes**

Run:

```powershell
node --test website/hero-style-contract.test.cjs
```

Expected: PASS with the new hero-card and four-column style contract green.

- [ ] **Step 5: Commit**

```powershell
git add website/style.css website/hero-style-contract.test.cjs
git commit -m "feat: style website four-column handoff layout"
```

---

### Task 3: Expand Mapping And Cached Geometry For Eight Cards Into Four Columns

**Files:**
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-style-contract.test.cjs`
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/script.js`

- [ ] **Step 1: Add the failing JS mapping contract**

Extend `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-style-contract.test.cjs` with:

```js
test('script maps the eight feature cards into the approved four receivers', () => {
  assert.match(script, /capture-stack:\s*'capture'/)
  assert.match(script, /capture-record:\s*'capture'/)
  assert.match(script, /text-rename:\s*'text'/)
  assert.match(script, /text-clipboard:\s*'text'/)
  assert.match(script, /web-activate:\s*'web'/)
  assert.match(script, /web-qr:\s*'web'/)
  assert.match(script, /utility-float:\s*'utility'/)
  assert.match(script, /utility-clicker:\s*'utility'/)
  assert.match(script, /matrix:\s*'capture'/)
})

test('script caches geometry for the four receiver groups and applies dock offsets from state', () => {
  assert.match(script, /const flightGeometry = new Map\(\)/)
  assert.match(script, /function getDockVisualOffset|const getDockVisualOffset =/)
  assert.match(script, /applyFlightGeometry\(state\)/)
})
```

- [ ] **Step 2: Run the JS contract test to verify it fails**

Run:

```powershell
node --test website/hero-style-contract.test.cjs
```

Expected: FAIL because `script.js` still uses the older card map and three-receiver geometry.

- [ ] **Step 3: Implement the expanded card map and grouped geometry**

In `D:/code/onetool/.worktrees/website-hero-handoff/website/script.js`, expand `flightCards` and `targetMap`:

```js
const flightCards = {
  matrix: document.querySelector('.hero-flight-card-main'),
  'capture-stack': document.querySelector('.hero-flight-card-stack'),
  'capture-record': document.querySelector('.hero-flight-card-record'),
  'text-rename': document.querySelector('.hero-flight-card-rename'),
  'text-clipboard': document.querySelector('.hero-flight-card-clipboard'),
  'web-activate': document.querySelector('.hero-flight-card-activate'),
  'web-qr': document.querySelector('.hero-flight-card-qr'),
  'utility-float': document.querySelector('.hero-flight-card-float'),
  'utility-clicker': document.querySelector('.hero-flight-card-clicker'),
}

const targetMap = {
  matrix: 'capture',
  'capture-stack': 'capture',
  'capture-record': 'capture',
  'text-rename': 'text',
  'text-clipboard': 'text',
  'web-activate': 'web',
  'web-qr': 'web',
  'utility-float': 'utility',
  'utility-clicker': 'utility',
}
```

Add per-card dock bias so the two cards landing in one receiver do not overlap:

```js
const dockBiases = {
  'capture-stack': { x: -18, y: -16 },
  'capture-record': { x: 18, y: 10 },
  'text-rename': { x: -16, y: -14 },
  'text-clipboard': { x: 18, y: 12 },
  'web-activate': { x: -14, y: -12 },
  'web-qr': { x: 16, y: 10 },
  'utility-float': { x: -12, y: -14 },
  'utility-clicker': { x: 18, y: 8 },
}
```

When applying geometry, add the grouped dock bias after the receiver offset:

```js
const groupBias = dockBiases[key] ?? { x: 0, y: 0 }
const dockVisualOffset = getDockVisualOffset(targetKey, state)
const dockX = geometry.dockCenterX - flightLeft - geometry.startX + bias.x + groupBias.x
const dockY =
  geometry.dockCenterY - flightTop - geometry.startY + bias.y + groupBias.y + dockVisualOffset.y
```

- [ ] **Step 4: Run the JS contract test to verify it passes**

Run:

```powershell
node --test website/hero-style-contract.test.cjs
```

Expected: PASS with the expanded mapping and grouped geometry contract green.

- [ ] **Step 5: Commit**

```powershell
git add website/script.js website/hero-style-contract.test.cjs
git commit -m "feat: map website feature cards into four columns"
```

---

### Task 4: Retune Motion And Verification For Grouped Arrival

**Files:**
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-motion.js`
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-motion.test.cjs`
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/script.js`

- [ ] **Step 1: Add the failing grouped-arrival motion tests**

Extend `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-motion.test.cjs` with:

```js
test('grouped arrival activates after travel but before final dock', () => {
  const state = getHeroMotionState(0.84)

  assert.ok(state.travel > 0.8)
  assert.ok(state.cluster > 0)
  assert.equal(state.dock, 0)
})

test('object override path can hold cluster back independently of travel', () => {
  const state = getHeroMotionState({
    progress: 0.86,
    breakoutProgress: 1,
    travelProgress: 0.92,
    clusterProgress: 0.1,
    morphProgress: 0.32,
    dockProgress: 0,
  })

  assert.equal(state.travel, 0.92)
  assert.equal(state.cluster, 0.1)
  assert.equal(state.dock, 0)
})
```

- [ ] **Step 2: Run the motion test to verify it fails**

Run:

```powershell
node --test website/hero-motion.test.cjs
```

Expected: FAIL because `cluster` is not part of the motion model yet.

- [ ] **Step 3: Implement the grouped-arrival phase**

In `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-motion.js`, add the minimal new phase:

```js
const cluster = getSafeProgress(context.clusterProgress, getPhase(safeProgress, 0.7, 0.9))

return {
  progress: safeProgress,
  breakout,
  breakoutSoft: easeOutCubic(breakout),
  travel,
  travelSoft: easeInOutSine(travel),
  cluster,
  clusterSoft: easeInOutSine(cluster),
  morph,
  morphSoft: easeInOutSine(morph),
  settle,
  settleSoft: easeOutCubic(settle),
  dock,
  dockSoft: easeOutCubic(dock),
  ...
}
```

Extend the reduced-motion branch with:

```js
cluster: 0,
clusterSoft: 0,
```

Mirror this in `D:/code/onetool/.worktrees/website-hero-handoff/website/script.js` by deriving:

```js
clusterProgress: getViewportProgress(toolsSection, 0.88, 0.46),
```

- [ ] **Step 4: Run the full website test suite and preview**

Run:

```powershell
node --test website/hero-motion.test.cjs website/homepage-structure.test.cjs website/hero-style-contract.test.cjs
```

Expected: PASS with the grouped-arrival motion contract green.

Preview:

```powershell
Start-Process 'D:/code/onetool/.worktrees/website-hero-handoff/website/index.html'
```

Manual check:
- The hero still feels centered around the overview board.
- The eight small cards are identifiable.
- The second page reads as four balanced columns.
- Two cards visibly classify into each column without collapsing into one point.
- The overview board fades out without reading as a fifth receiver.

- [ ] **Step 5: Commit**

```powershell
git add website/hero-motion.js website/hero-motion.test.cjs website/script.js
git commit -m "feat: add grouped four-column website handoff"
```

---

## Self-Review

### Spec coverage

- Hero board plus eight feature cards: covered by Tasks 1 and 2.
- Four receiving columns and approved grouping: covered by Tasks 1 and 2.
- Eight-card to four-column mapping: covered by Task 3.
- Board fading as a non-target overview card: covered by Tasks 2 and 4.
- Grouped arrival / classification feel: covered by Tasks 3 and 4.

### Placeholder scan

- No `TODO` / `TBD`.
- Every code-changing step includes exact file paths, commands, and concrete snippets.

### Type and naming consistency

- Receiver keys are consistently `capture`, `text`, `web`, and `utility`.
- Hero card keys are consistently `matrix`, `capture-stack`, `capture-record`, `text-rename`, `text-clipboard`, `web-activate`, `web-qr`, `utility-float`, and `utility-clicker`.
- The grouped-arrival phase is consistently named `cluster` / `clusterSoft` across `hero-motion.js`, `script.js`, and `hero-motion.test.cjs`.
