# Website Hero Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the website into `首页 Hero + 工具展示 + 下载` and make every hero flight card dock only into the second-page tool groups with a readable, delayed handoff.

**Architecture:** Keep the static `website/` stack and remove the middle layers instead of adding new animation infrastructure. `index.html` becomes the source of truth for the three-section layout and unique dock targets, `script.js` owns the single-target mapping plus section-driven scroll timing, `hero-motion.js` keeps the pure phase math, and `style.css` renders the lighter second-page takeover states.

**Tech Stack:** Static HTML, CSS custom properties, vanilla JavaScript, Node test runner (`node --test`), local file preview in the browser.

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
- `index.html`: remove `日常场景` and `系统支持`, rewrite navigation, expose the second-page intro plus three stable tool-group dock targets.
- `style.css`: delete obsolete section styles, restyle the tool section as the only receiving page, and make group takeover states readable without an extra stage.
- `script.js`: drop `#scenarios` dependencies, remap every hero card to one of three tool groups, and delay `travel/morph/dock` until the tool section is actually entering the viewport.
- `hero-motion.js`: keep reduced-motion-safe phase helpers aligned with the new single-target flow.
- `homepage-structure.test.cjs`: prove the page only has three primary sections and only three navigation anchors.
- `hero-style-contract.test.cjs`: prove the script/CSS contract uses only tool-section targets and publishes the new dock variables.
- `hero-motion.test.cjs`: prove the motion phases remain delayed enough that docking cannot complete before the tool section is readable.

---

### Task 1: Lock The Three-Section Markup Contract

**Files:**
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/homepage-structure.test.cjs`
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/index.html`

- [ ] **Step 1: Rewrite the failing structure tests**

Replace the old section assertions in `D:/code/onetool/.worktrees/website-hero-handoff/website/homepage-structure.test.cjs` with:

```js
test('homepage keeps only hero, tools, and download sections', () => {
  assert.match(html, /<section class="hero-section" id="hero">/)
  assert.match(html, /<section class="tool-matrix" id="tools">/)
  assert.match(html, /<section class="download-close" id="download">/)
  assert.doesNotMatch(html, /id="scenarios"/)
  assert.doesNotMatch(html, /id="system"/)
})

test('top navigation exposes only three in-page anchors', () => {
  assert.match(html, /<a href="#hero">首页<\/a>/)
  assert.match(html, /<a href="#tools">工具展示<\/a>/)
  assert.match(html, /<a href="#download">下载<\/a>/)
  assert.doesNotMatch(html, /href="#scenarios"/)
  assert.doesNotMatch(html, /href="#system"/)
})

test('tool section includes a short intro and three dock groups', () => {
  assert.match(html, /class="tool-matrix-intro"/)
  assert.match(html, /data-flight-target="capture"/)
  assert.match(html, /data-flight-target="organize"/)
  assert.match(html, /data-flight-target="utility"/)
  assert.doesNotMatch(html, /data-flight-target="matrix"/)
  assert.doesNotMatch(html, /data-flight-target="clipboard"/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test website/homepage-structure.test.cjs
```

Expected: FAIL because the current HTML still contains `#scenarios`, `#system`, and five nav/target variants.

- [ ] **Step 3: Implement the three-section HTML**

Update `D:/code/onetool/.worktrees/website-hero-handoff/website/index.html` so the nav becomes:

```html
<nav class="site-nav-links" aria-label="主导航">
  <a href="#hero">首页</a>
  <a href="#tools">工具展示</a>
  <a href="#download">下载</a>
</nav>
```

Remove the whole `#scenarios` section and the whole `#system` section. At the top of `#tools`, insert the short intro block:

```html
<div class="tool-matrix-intro">
  <p class="tool-matrix-eyebrow">TOOLS</p>
  <h2>常用工具已经整理好，滚动到这里就能直接接住。</h2>
  <p>截图、文件处理、剪贴板和零碎小工具不再分散展示，第二页就是唯一落点。</p>
</div>
```

Retarget the three receiving groups:

```html
<article class="tool-group tool-group-primary" data-flight-target="capture" data-flight-dock="capture">
...
<article class="tool-group" data-flight-target="organize" data-flight-dock="organize">
...
<article class="tool-group" data-flight-target="utility" data-flight-dock="utility">
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node --test website/homepage-structure.test.cjs
```

Expected: PASS with the three-section structure locked in.

- [ ] **Step 5: Commit**

```powershell
git add website/index.html website/homepage-structure.test.cjs
git commit -m "feat: simplify website to three-section layout"
```

---

### Task 2: Retarget Hero Cards To The Tool Section Only

**Files:**
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-style-contract.test.cjs`
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/script.js`

- [ ] **Step 1: Rewrite the failing JS contract test**

Update `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-style-contract.test.cjs` with assertions like:

```js
test('script maps every hero card to one of the three tool groups', () => {
  assert.match(script, /capture:\s*'capture'/)
  assert.match(script, /organize:\s*'organize'/)
  assert.match(script, /clipboard:\s*'organize'/)
  assert.match(script, /utility:\s*'utility'/)
  assert.match(script, /matrix:\s*'capture'/)
})

test('script no longer queries scenarios or system sections', () => {
  assert.doesNotMatch(script, /#scenarios/)
  assert.doesNotMatch(script, /#system/)
  assert.match(script, /const toolsSection = document\.querySelector\('#tools'\)/)
})

test('script publishes travel, morph, and dock progress from the tool section', () => {
  assert.match(script, /travelProgress:\s*getViewportProgress\(toolsSection,/)
  assert.match(script, /morphProgress:\s*getViewportProgress\(toolsSection,/)
  assert.match(script, /dockProgress:\s*getViewportProgress\(toolsSection,/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test website/hero-style-contract.test.cjs
```

Expected: FAIL because `script.js` still references `#scenarios` and still maps `clipboard` / `matrix` to separate targets.

- [ ] **Step 3: Implement the single-target mapping and timing**

In `D:/code/onetool/.worktrees/website-hero-handoff/website/script.js`, collapse the receiving map to:

```js
const flightTargets = {
  capture: document.querySelector('[data-flight-target="capture"]'),
  organize: document.querySelector('[data-flight-target="organize"]'),
  utility: document.querySelector('[data-flight-target="utility"]')
}

const dockTargets = {
  capture: document.querySelector('[data-flight-dock="capture"]'),
  organize: document.querySelector('[data-flight-dock="organize"]'),
  utility: document.querySelector('[data-flight-dock="utility"]')
}

const targetMap = {
  capture: 'capture',
  organize: 'organize',
  clipboard: 'organize',
  utility: 'utility',
  matrix: 'capture'
}
```

Replace the old mixed-section timing with tool-only timing:

```js
const travelProgress = getViewportProgress(toolsSection, 1.1, 0.34)
const morphProgress = getViewportProgress(toolsSection, 0.74, 0.2)
const dockProgress = getViewportProgress(toolsSection, 0.46, 0.08)
const settleProgress = getViewportProgress(toolsSection, 0.92, 0.14)
```

Keep `syncFlightTargets()` and the cached measurement flow, but remove any dependency on `scenariosSection`.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node --test website/hero-style-contract.test.cjs
```

Expected: PASS with only tool-section mappings and timing left.

- [ ] **Step 5: Commit**

```powershell
git add website/script.js website/hero-style-contract.test.cjs
git commit -m "feat: retarget website hero handoff to tool groups"
```

---

### Task 3: Restyle The Tool Section As The Only Receiving Page

**Files:**
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-style-contract.test.cjs`
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/style.css`

- [ ] **Step 1: Add the failing CSS contract assertions**

Extend `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-style-contract.test.cjs` with:

```js
test('styles define a dedicated intro block for the tool section', () => {
  assert.match(style, /\.tool-matrix-intro\s*\{/)
  assert.match(style, /\.tool-matrix-intro h2\s*\{/)
})

test('styles expose the lighter dock takeover states on tool groups', () => {
  assert.match(style, /\.tool-group\[data-flight-dock="capture"\]/)
  assert.match(style, /\.tool-group\[data-flight-dock="organize"\]/)
  assert.match(style, /\.tool-group\[data-flight-dock="utility"\]/)
  assert.match(style, /transform:\s*translate3d\(0,\s*calc\(var\(--dock-lift/)
})

test('styles no longer require scenario-card takeover rules', () => {
  assert.doesNotMatch(style, /\.scenario-card\[data-flight-dock=/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test website/hero-style-contract.test.cjs
```

Expected: FAIL because the stylesheet still contains scenario-card takeover selectors and does not yet style `tool-matrix-intro`.

- [ ] **Step 3: Implement the lighter receiving-page styling**

In `D:/code/onetool/.worktrees/website-hero-handoff/website/style.css`, add the intro block:

```css
.tool-matrix-intro {
  max-width: 720px;
  margin: 0 0 2.8rem;
}

.tool-matrix-intro h2 {
  margin: 0.3rem 0 0.8rem;
  font-size: clamp(2rem, 4vw, 3.4rem);
  line-height: 1.02;
}
```

Replace the old scenario takeover rules with tool-group takeover rules:

```css
.tool-group[data-flight-dock] {
  --dock-lift: calc(var(--flight-highlight, 0) * -22px);
  transform: translate3d(0, calc(var(--dock-lift) + var(--group-shift, 0px)), 0)
    scale(calc(1 + var(--flight-highlight, 0) * 0.025));
  border-color: color-mix(in srgb, rgba(130, 164, 255, 0.42) 70%, rgba(209, 221, 255, 0.28));
  box-shadow:
    0 32px 70px rgba(142, 166, 224, calc(0.14 + var(--flight-highlight, 0) * 0.14)),
    inset 0 1px 0 rgba(255, 255, 255, 0.88);
}
```

Delete obsolete `.scenario-section`, `.scenario-grid`, `.scenario-card`, and `.system-strip` takeover rules after the HTML removal.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node --test website/hero-style-contract.test.cjs
```

Expected: PASS with the tool section now acting as the only receiver.

- [ ] **Step 5: Commit**

```powershell
git add website/style.css website/hero-style-contract.test.cjs
git commit -m "feat: style website tool page as hero handoff target"
```

---

### Task 4: Recalibrate Motion Phases For The Shorter Page

**Files:**
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-motion.test.cjs`
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-motion.js`
- Modify: `D:/code/onetool/.worktrees/website-hero-handoff/website/script.js`

- [ ] **Step 1: Add the failing delayed-handoff tests**

Update `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-motion.test.cjs` with:

```js
test('motion keeps dock at zero through the early travel band', () => {
  const state = getHeroMotionState(0.62)

  assert.ok(state.travel > 0)
  assert.equal(state.dock, 0)
  assert.ok(state.morph < 0.5)
})

test('motion enters dock only near the end of the tool-section handoff', () => {
  const state = getHeroMotionState(0.92)

  assert.ok(state.morph > 0.7)
  assert.ok(state.dock > 0)
})

test('reduced motion still zeros travel-adjacent takeover phases', () => {
  const state = getHeroMotionState(0.92, true)

  assert.equal(state.morph, 0)
  assert.equal(state.dock, 0)
  assert.equal(state.highlight.capture, 0)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test website/hero-motion.test.cjs
```

Expected: FAIL because the current phase windows were tuned for a longer page and begin completing too early.

- [ ] **Step 3: Implement the shorter-page phase windows**

In `D:/code/onetool/.worktrees/website-hero-handoff/website/hero-motion.js`, retune the pure helper:

```js
const breakout = getPhase(safeProgress, 0.12, 0.34)
const travel = getPhase(safeProgress, 0.34, 0.84)
const morph = getPhase(safeProgress, 0.7, 0.94)
const dock = getPhase(safeProgress, 0.88, 1)
```

Keep the existing returned shape, but ensure the highlight keys match the three receiving groups:

```js
highlight: {
  capture: easeOutCubic(getPhase(safeProgress, 0.68, 0.94)),
  organize: easeOutCubic(getPhase(safeProgress, 0.72, 0.95)),
  utility: easeOutCubic(getPhase(safeProgress, 0.76, 0.97))
}
```

Mirror the same intent in `D:/code/onetool/.worktrees/website-hero-handoff/website/script.js` by keeping `dockProgress` late enough that it cannot finish before the tool groups sit in the readable center of the viewport.

- [ ] **Step 4: Run the full website test suite**

Run:

```powershell
node --test website/hero-motion.test.cjs website/homepage-structure.test.cjs website/hero-style-contract.test.cjs
```

Expected: PASS with all website contract tests green.

- [ ] **Step 5: Manual preview and commit**

Preview:

```powershell
Start-Process 'D:/code/onetool/.worktrees/website-hero-handoff/website/index.html'
```

Manual check:
- Hero still reads cleanly at the top.
- Second page opens with the short intro plus exactly three tool groups.
- Cards remain visible while the tool page enters and clearly dock into those three groups.
- No `日常场景` or `系统支持` sections remain.

Commit:

```powershell
git add website/index.html website/style.css website/script.js website/hero-motion.js website/homepage-structure.test.cjs website/hero-style-contract.test.cjs website/hero-motion.test.cjs
git commit -m "feat: simplify website hero handoff flow"
```

---

## Self-Review

### Spec coverage

- Three-section structure: covered by Task 1.
- Short tool-page intro plus three groups: covered by Tasks 1 and 3.
- Single-target hero mapping: covered by Task 2.
- Delayed, readable dock timing: covered by Task 4.
- Removal of `日常场景` and `系统支持`: covered by Tasks 1 and 3.

### Placeholder scan

- No `TODO` / `TBD`.
- Every code-changing step includes exact file paths, commands, and concrete snippets.

### Type and naming consistency

- Receiving keys are consistently `capture`, `organize`, and `utility`.
- Hero card keys remain `capture`, `organize`, `clipboard`, `utility`, and `matrix`.
- The remap stays consistent across `index.html`, `script.js`, `style.css`, and the tests.
