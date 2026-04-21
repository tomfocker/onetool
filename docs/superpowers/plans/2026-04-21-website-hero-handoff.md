# Website Hero Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the website hero so the title reads like a stable launch-page headline and each hero card docks into its matching lower module as a shared-element-style handoff during scroll.

**Architecture:** Keep the static `website/` implementation, but tighten responsibilities. `hero-motion.js` owns the staged progress model, `index.html` exposes stable title and dock targets, `script.js` performs cached target measurement plus `requestAnimationFrame` scroll syncing, and `style.css` renders the typography and dock-state transforms. Verification stays inside lightweight Node tests plus manual preview.

**Tech Stack:** Static HTML, CSS custom properties, vanilla JavaScript, Node test runner (`node --test`), local browser preview via file open or `python -m http.server`.

---

## File Structure

**Create:**
- `D:/code/onetool/website/homepage-structure.test.cjs`
- `D:/code/onetool/website/hero-style-contract.test.cjs`

**Modify:**
- `D:/code/onetool/website/index.html`
- `D:/code/onetool/website/style.css`
- `D:/code/onetool/website/script.js`
- `D:/code/onetool/website/hero-motion.js`
- `D:/code/onetool/website/hero-motion.test.cjs`

**Responsibilities:**
- `index.html`: expose the new two-line headline structure and stable `data-flight-target` / `data-flight-dock` anchors.
- `style.css`: define headline rhythm, per-card dock variables, and lower-module takeover states.
- `script.js`: cache target rectangles, schedule scroll writes through `requestAnimationFrame`, and publish per-card CSS variables.
- `hero-motion.js`: provide pure stage math for `break`, `travel`, `morph`, `dock`, and target highlights.
- `hero-motion.test.cjs`: prove the stage model.
- `homepage-structure.test.cjs`: prove the markup contract for the new headline and dock targets.
- `hero-style-contract.test.cjs`: prove the JS/CSS contract for rAF sync and dock variables exists.

---

### Task 1: Expand The Pure Motion Model

**Files:**
- Modify: `D:/code/onetool/website/hero-motion.js`
- Modify: `D:/code/onetool/website/hero-motion.test.cjs`

- [ ] **Step 1: Write the failing motion-state tests**

Add these cases to `D:/code/onetool/website/hero-motion.test.cjs` below the existing tests:

```js
test('hero motion enters morph before final dock takeover', () => {
  const state = getHeroMotionState(0.86)

  assert.ok(state.travelSoft > 0.9)
  assert.ok(state.morph > 0)
  assert.ok(state.dock === 0)
  assert.ok(state.highlight.capture > 0.95)
  assert.ok(state.highlight.matrix > 0)
})

test('hero motion reaches dock state at the end of the sticky range', () => {
  const state = getHeroMotionState(0.985)

  assert.ok(state.morph > 0.9)
  assert.ok(state.dock > 0)
  assert.ok(state.dockSoft > 0)
  assert.equal(state.breakout <= 1, true)
})

test('reduced motion zeros morph and dock stages too', () => {
  const state = getHeroMotionState(0.95, true)

  assert.equal(state.morph, 0)
  assert.equal(state.dock, 0)
  assert.equal(state.dockSoft, 0)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test website/hero-motion.test.cjs
```

Expected: FAIL because `morph`, `dock`, and `dockSoft` are not defined on the current motion state.

- [ ] **Step 3: Implement the minimal motion-state fields**

Update `D:/code/onetool/website/hero-motion.js` so `getHeroMotionState()` computes the extra phases:

```js
  const morph = getPhase(safeProgress, 0.78, 0.94)
  const dock = getPhase(safeProgress, 0.94, 1)

  return {
    progress: safeProgress,
    breakout,
    breakoutSoft: easeOutCubic(breakout),
    travel,
    travelSoft: easeInQuart(easeInOutSine(travel)),
    morph,
    morphSoft: easeInOutSine(morph),
    settle,
    settleSoft: easeOutCubic(settle),
    dock,
    dockSoft: easeOutCubic(dock),
    highlight: {
      capture: easeOutCubic(getPhase(safeProgress, 0.56, 0.8)),
      organize: easeOutCubic(getPhase(safeProgress, 0.61, 0.84)),
      utility: easeOutCubic(getPhase(safeProgress, 0.66, 0.88)),
      matrix: easeOutCubic(getPhase(safeProgress, 0.82, 0.96))
    }
  }
```

Also extend the reduced-motion branch:

```js
      morph: 0,
      morphSoft: 0,
      dock: 0,
      dockSoft: 0,
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node --test website/hero-motion.test.cjs
```

Expected: PASS with all motion-stage tests green.

- [ ] **Step 5: Commit**

```powershell
git add website/hero-motion.js website/hero-motion.test.cjs
git commit -m "test: expand website hero motion phases"
```

---

### Task 2: Lock The Markup Contract For Headline And Dock Targets

**Files:**
- Create: `D:/code/onetool/website/homepage-structure.test.cjs`
- Modify: `D:/code/onetool/website/index.html`

- [ ] **Step 1: Write the failing structure test**

Create `D:/code/onetool/website/homepage-structure.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')

test('hero heading uses dedicated title lines instead of raw line breaks', () => {
  assert.match(html, /class="hero-title"/)
  assert.match(html, /class="hero-title-line">一个应用，收齐</)
  assert.match(html, /class="hero-title-line hero-title-line-wide">Windows 日常高频工具</)
  assert.doesNotMatch(html, /<h1 id="hero-title">一个应用，<br \/>收齐 Windows<br \/>日常高频工具。<\/h1>/)
})

test('hero cards and landing modules expose stable dock keys', () => {
  assert.match(html, /data-flight-card="capture"/)
  assert.match(html, /data-flight-card="organize"/)
  assert.match(html, /data-flight-card="clipboard"/)
  assert.match(html, /data-flight-card="utility"/)
  assert.match(html, /data-flight-card="matrix"/)
  assert.match(html, /data-flight-dock="capture"/)
  assert.match(html, /data-flight-dock="organize"/)
  assert.match(html, /data-flight-dock="utility"/)
  assert.match(html, /data-flight-dock="matrix"/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test website/homepage-structure.test.cjs
```

Expected: FAIL because the current `h1` still uses `<br />` and the hero cards do not expose `data-flight-card` / `data-flight-dock`.

- [ ] **Step 3: Implement the headline and dock markup**

Update the hero title in `D:/code/onetool/website/index.html`:

```html
<h1 class="hero-title" id="hero-title">
  <span class="hero-title-line">一个应用，收齐</span>
  <span class="hero-title-line hero-title-line-wide">Windows 日常高频工具</span>
</h1>
```

Update the hero cards:

```html
<div class="hero-flight-card hero-flight-card-main" data-flight-card="matrix"></div>
<div class="hero-flight-card hero-flight-card-capture" data-flight-card="capture"></div>
<div class="hero-flight-card hero-flight-card-organize" data-flight-card="organize"></div>
<div class="hero-flight-card hero-flight-card-clipboard" data-flight-card="clipboard"></div>
<div class="hero-flight-card hero-flight-card-utility" data-flight-card="utility"></div>
```

Update the lower targets:

```html
<article class="scenario-card" data-flight-target="capture" data-flight-dock="capture">
...
<article class="scenario-card" data-flight-target="organize" data-flight-dock="organize">
...
<article class="scenario-card" data-flight-target="utility" data-flight-dock="utility">
...
<article class="tool-group tool-group-primary" data-flight-target="matrix" data-flight-dock="matrix">
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node --test website/homepage-structure.test.cjs
```

Expected: PASS with both structure checks green.

- [ ] **Step 5: Commit**

```powershell
git add website/index.html website/homepage-structure.test.cjs
git commit -m "feat: add website hero dock markup contract"
```

---

### Task 3: Wire Shared-Element Handoff Through Cached Targets And rAF

**Files:**
- Create: `D:/code/onetool/website/hero-style-contract.test.cjs`
- Modify: `D:/code/onetool/website/script.js`
- Modify: `D:/code/onetool/website/style.css`

- [ ] **Step 1: Write the failing JS/CSS contract test**

Create `D:/code/onetool/website/hero-style-contract.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const script = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8')
const style = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8')

test('scroll syncing uses requestAnimationFrame and publishes morph and dock variables', () => {
  assert.match(script, /requestAnimationFrame/)
  assert.match(script, /--flight-morph/)
  assert.match(script, /--flight-dock/)
  assert.match(script, /data-flight-dock/)
})

test('hero cards expose dock transforms and target modules expose takeover styling', () => {
  assert.match(style, /--dock-x/)
  assert.match(style, /--dock-y/)
  assert.match(style, /--dock-scale/)
  assert.match(style, /\.hero-flight-card\[data-flight-card=/)
  assert.match(style, /\[data-flight-dock='capture'\]/)
  assert.match(style, /var\(--flight-dock-soft\)/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test website/hero-style-contract.test.cjs
```

Expected: FAIL because the current script does not use `requestAnimationFrame` for scroll syncing and the CSS does not define dock variables.

- [ ] **Step 3: Implement cached target measurement and rAF scroll syncing**

In `D:/code/onetool/website/script.js`, replace direct scroll writes with a scheduled sync:

```js
  const dockTargets = {
    capture: document.querySelector('[data-flight-dock="capture"]'),
    organize: document.querySelector('[data-flight-dock="organize"]'),
    utility: document.querySelector('[data-flight-dock="utility"]'),
    matrix: document.querySelector('[data-flight-dock="matrix"]')
  }

  let frameRequested = false

  const scheduleSync = () => {
    if (frameRequested) {
      return
    }

    frameRequested = true
    window.requestAnimationFrame(() => {
      frameRequested = false
      syncScrollState()
    })
  }
```

Publish the new motion variables inside `syncScrollState()`:

```js
    root.style.setProperty('--flight-morph', state.morph.toFixed(4))
    root.style.setProperty('--flight-morph-soft', state.morphSoft.toFixed(4))
    root.style.setProperty('--flight-dock', state.dock.toFixed(4))
    root.style.setProperty('--flight-dock-soft', state.dockSoft.toFixed(4))
```

Extend target syncing so each card gets dock coordinates and a dock scale:

```js
      const dockTarget = dockTargets[targetKey]
      const dockRect = dockTarget?.getBoundingClientRect()
      const dockX = dockRect ? dockRect.left - flightRect.left + dockRect.width / 2 : targetX
      const dockY = dockRect ? dockRect.top - flightRect.top + dockRect.height / 2 : targetY
      const dockScale = dockRect ? dockRect.width / card.offsetWidth : 1

      card.style.setProperty('--dock-x', `${dockX - startX + bias.x}px`)
      card.style.setProperty('--dock-y', `${dockY - startY + bias.y}px`)
      card.style.setProperty('--dock-scale', dockScale.toFixed(4))
```

Swap the scroll listener to:

```js
  window.addEventListener('scroll', scheduleSync, { passive: true })
```

- [ ] **Step 4: Implement dock transforms and takeover styling**

In `D:/code/onetool/website/style.css`, add the new card variables:

```css
.hero-flight-card {
  --dock-x: 0px;
  --dock-y: 0px;
  --dock-scale: 1;
}
```

Update a representative card transform pattern; apply the same shape to the other cards:

```css
.hero-flight-card-capture {
  transform:
    translate3d(
      calc(
        (var(--break-x) * var(--flight-breakout-soft)) +
        (var(--target-x) * var(--flight-travel-soft)) +
        (var(--dock-x) * var(--flight-dock-soft))
      ),
      calc(
        (var(--break-y) * var(--flight-breakout-soft)) +
        (var(--target-y) * var(--flight-travel-soft)) +
        (var(--dock-y) * var(--flight-dock-soft))
      ),
      0
    )
    scale(
      calc(
        (1 - (var(--travel-scale) * var(--flight-travel-soft))) *
        (1 + ((var(--dock-scale) - 1) * var(--flight-dock-soft)))
      )
    )
    rotate(calc(7deg * (1 - var(--flight-morph-soft))));
  opacity: calc(1 - (0.82 * var(--flight-dock-soft)));
}
```

Add lower-module takeover styling:

```css
[data-flight-dock='capture'],
[data-flight-dock='organize'],
[data-flight-dock='utility'],
[data-flight-dock='matrix'] {
  transform: translateY(calc((1 - var(--flight-dock-soft)) * 16px));
  box-shadow: 0 20px 60px rgba(110, 134, 182, calc(0.04 + (var(--flight-dock-soft) * 0.08)));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:

```powershell
node --test website/hero-style-contract.test.cjs
```

Expected: PASS with both contract checks green.

- [ ] **Step 6: Commit**

```powershell
git add website/script.js website/style.css website/hero-style-contract.test.cjs
git commit -m "feat: add website shared-element hero handoff"
```

---

### Task 4: Polish The Launch-Page Headline And Dock-State Visual Rhythm

**Files:**
- Modify: `D:/code/onetool/website/style.css`

- [ ] **Step 1: Add the failing typography contract**

Append this test to `D:/code/onetool/website/hero-style-contract.test.cjs`:

```js
test('hero title uses launch-page typography instead of the old stacked tower', () => {
  assert.match(style, /\.hero-title\s*{/)
  assert.match(style, /\.hero-title-line-wide\s*{/)
  assert.match(style, /max-width:\s*10ch/)
  assert.match(style, /font-size:\s*clamp\(3\.4rem,\s*6\.2vw,\s*6\.4rem\)/)
  assert.match(style, /letter-spacing:\s*-0\.07em/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test website/hero-style-contract.test.cjs
```

Expected: FAIL because `.hero-title` and `.hero-title-line-wide` rules do not exist yet.

- [ ] **Step 3: Implement the headline typography**

Add these rules to `D:/code/onetool/website/style.css` and remove the old `.hero-copy h1` tower-specific sizing:

```css
.hero-copy {
  gap: 18px;
  max-width: 560px;
}

.hero-title {
  display: grid;
  max-width: 10ch;
  font-size: clamp(3.4rem, 6.2vw, 6.4rem);
  line-height: 0.9;
  letter-spacing: -0.07em;
  text-wrap: balance;
}

.hero-title-line {
  display: block;
}

.hero-title-line-wide {
  font-size: 0.9em;
  letter-spacing: -0.06em;
}

.hero-description {
  max-width: 30ch;
  font-size: 1.02rem;
}
```

Also update responsive overrides:

```css
@media (max-width: 860px) {
  .hero-title {
    max-width: none;
    font-size: clamp(3rem, 10vw, 5rem);
  }
}

@media (max-width: 560px) {
  .hero-title {
    font-size: clamp(2.7rem, 12vw, 4rem);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node --test website/hero-style-contract.test.cjs
```

Expected: PASS with the new typography contract green alongside the handoff contract.

- [ ] **Step 5: Commit**

```powershell
git add website/style.css website/hero-style-contract.test.cjs
git commit -m "feat: refine website hero launch-page typography"
```

---

### Task 5: Verify The Whole Hero Flow

**Files:**
- Modify if needed: `D:/code/onetool/website/index.html`
- Modify if needed: `D:/code/onetool/website/style.css`
- Modify if needed: `D:/code/onetool/website/script.js`
- Modify if needed: `D:/code/onetool/website/hero-motion.js`

- [ ] **Step 1: Run the full website test set**

Run:

```powershell
node --test website/hero-motion.test.cjs website/homepage-structure.test.cjs website/hero-style-contract.test.cjs
```

Expected: PASS with all tests green and zero failing suites.

- [ ] **Step 2: Format the static site files**

Run:

```powershell
npx prettier --write website/index.html website/style.css website/script.js website/hero-motion.js website/hero-motion.test.cjs website/homepage-structure.test.cjs website/hero-style-contract.test.cjs
```

Expected: Prettier rewrites the touched files with no syntax errors.

- [ ] **Step 3: Preview the page locally**

Run:

```powershell
Start-Process 'D:\\code\\onetool\\website\\index.html'
```

Expected: the local browser opens the updated static page.

- [ ] **Step 4: Perform manual verification**

Check all of the following:

- the left headline reads as two launch-page lines instead of a vertical tower
- the hero body copy and buttons sit higher and feel less cramped
- the `capture`, `organize`, `clipboard`, `utility`, and `matrix` cards visibly move toward their real target modules
- near the end of the sticky range, the cards rotate and scale down into the lower modules instead of floating past them
- scrolling feels smoother than before, with no obvious jitter from target recomputation
- mobile width still collapses cleanly and reduced motion remains readable

- [ ] **Step 5: Commit any verification-driven fixups**

If Step 4 required any follow-up polish, commit exactly those changes:

```powershell
git add website/index.html website/style.css website/script.js website/hero-motion.js website/hero-motion.test.cjs website/homepage-structure.test.cjs website/hero-style-contract.test.cjs
git commit -m "fix: polish website hero handoff verification issues"
```

If no polish was needed, skip this step.

---

## Self-Review

### Spec coverage

- The stable launch-page title is covered in Task 2 and Task 4.
- Shared-element-style handoff stages are covered in Task 1 and Task 3.
- Performance constraints (`requestAnimationFrame`, cached measurements, no per-scroll rect churn) are covered in Task 3.
- Validation requirements are covered in Task 5.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every task names exact files and exact commands.
- Every code-changing step includes concrete code to add or modify.

### Type consistency

- Stage property names are consistent across plan tasks: `morph`, `morphSoft`, `dock`, `dockSoft`.
- Markup contract names are consistent across HTML, CSS, and JS: `data-flight-card`, `data-flight-target`, `data-flight-dock`.
- CSS variable names are consistent across script and style steps: `--flight-morph`, `--flight-morph-soft`, `--flight-dock`, `--flight-dock-soft`, `--dock-x`, `--dock-y`, `--dock-scale`.
