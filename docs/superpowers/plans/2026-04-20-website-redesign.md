# Website Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the static `website/` homepage into a clearer, more premium software launch page with screenshot-led visuals, lightweight 3D layered scroll breakup, and simpler copy for mainstream Windows users.

**Architecture:** Keep the implementation inside the existing static site (`website/index.html`, `website/style.css`, `website/script.js`) and replace the current concept-heavy hero with a screenshot-led composition. Use CSS-driven layers plus a small scroll controller in vanilla JS for the breakup effect, and add a small set of curated image assets so the page feels complete without depending on video or a heavy runtime.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, existing local preview via `python3 -m http.server`, optional AI-generated background asset, Prettier for formatting.

---

## File Structure

**Create:**
- `/Users/andy/Code/onetool/website/hero-backdrop-premium.png`
- `/Users/andy/Code/onetool/website/hero-shot-main.png`
- `/Users/andy/Code/onetool/website/hero-shot-capture.png`
- `/Users/andy/Code/onetool/website/hero-shot-rename.png`
- `/Users/andy/Code/onetool/website/hero-shot-clipboard.png`
- `/Users/andy/Code/onetool/website/hero-shot-qr.png`

**Modify:**
- `/Users/andy/Code/onetool/website/index.html`
- `/Users/andy/Code/onetool/website/style.css`
- `/Users/andy/Code/onetool/website/script.js`

**Remove or stop referencing:**
- `/Users/andy/Code/onetool/website/hero-ambient.mp4`
- `/Users/andy/Code/onetool/website/hero-poster.jpg`
- `/Users/andy/Code/onetool/website/icon-crystal.png`

## Asset And Content Decisions

- Use real product screenshots as the hero’s main material.
- Use one AI-generated ambient backdrop only as atmosphere, not as fake UI.
- Rewrite all hero and section copy in plain language for non-technical Windows users.
- Keep proxy and WSL content, but move it behind daily-use value sections.

---

### Task 1: Prepare The Website Asset Set

**Files:**
- Create: `/Users/andy/Code/onetool/website/hero-backdrop-premium.png`
- Create: `/Users/andy/Code/onetool/website/hero-shot-main.png`
- Create: `/Users/andy/Code/onetool/website/hero-shot-capture.png`
- Create: `/Users/andy/Code/onetool/website/hero-shot-rename.png`
- Create: `/Users/andy/Code/onetool/website/hero-shot-clipboard.png`
- Create: `/Users/andy/Code/onetool/website/hero-shot-qr.png`

- [ ] **Step 1: Capture the screenshot list before editing**

Run:

```bash
find /Users/andy/Code/onetool/website -maxdepth 1 -type f | sort
```

Expected: confirm the current site only has the old `hero-ambient.mp4`, `hero-poster.jpg`, `icon-crystal.png`, and preview PNGs, so the new hero assets still need to be added.

- [ ] **Step 2: Produce the real UI screenshot set**

Collect or export these frames from the app so the homepage can show concrete tools instead of abstract glass blocks:

- `hero-shot-main.png`: a clean overview/home surface or the most representative tool window
- `hero-shot-capture.png`: screenshot or recorder UI
- `hero-shot-rename.png`: batch rename UI
- `hero-shot-clipboard.png`: clipboard manager UI
- `hero-shot-qr.png`: QR code tool UI

Acceptance checklist:

- each image has a consistent aspect ratio family
- window chrome is either uniformly kept or uniformly removed
- crop focuses on the useful part of the tool, not empty padding
- text remains readable at homepage scale

- [ ] **Step 3: Generate the atmosphere backdrop**

Create `hero-backdrop-premium.png` as a soft premium backdrop that supports the screenshots without replacing them.

Prompt target:

```text
Use case: stylized-concept
Asset type: landing page hero backdrop
Primary request: a premium desktop software launch-page backdrop with soft white-blue glow, glass reflections, subtle volumetric light, and clean negative space for layered product screenshots
Style/medium: polished product-marketing backdrop
Composition/framing: wide horizontal composition with calm center weight and usable negative space
Lighting/mood: cool daylight glow, restrained and premium
Color palette: white, pale blue, silver-gray
Constraints: no text, no fake interface, no logos, no watermark
```

- [ ] **Step 4: Verify the asset pack exists**

Run:

```bash
ls -1 /Users/andy/Code/onetool/website/hero-*.png
```

Expected: list the backdrop plus the screenshot-led hero assets.

- [ ] **Step 5: Commit**

```bash
git -C /Users/andy/Code/onetool add website/hero-*.png
git -C /Users/andy/Code/onetool commit -m "assets: add website redesign hero asset pack"
```

---

### Task 2: Rewrite Homepage Markup And Copy

**Files:**
- Modify: `/Users/andy/Code/onetool/website/index.html`

- [ ] **Step 1: Snapshot the current structure before replacing it**

Run:

```bash
sed -n '1,260p' /Users/andy/Code/onetool/website/index.html
```

Expected: confirm the current page still uses the “控制晶体” concept headline, concept/system/module sections, and a video-backed hero.

- [ ] **Step 2: Replace the hero copy and section order**

Update the page structure so it follows the approved information architecture:

- sticky header with direct anchors
- hero with plain-language headline, short supporting copy, two clear CTAs
- compact value bar
- three daily-use scenario cards
- grouped tool matrix
- advanced/system support strip
- download/trust close

Use copy in this tone:

```html
<h1>一个应用，收齐 Windows 日常高频工具。</h1>
<p class="hero-description">
  截图、录屏、批量重命名、剪贴板、二维码等常用工具集中在一个清爽顺手的桌面工具箱里。
</p>
<div class="hero-actions">
  <a class="button button-primary" href="https://github.com/tomfocker/onetool/releases" target="_blank" rel="noreferrer">下载 Windows 版</a>
  <a class="button button-secondary" href="https://github.com/tomfocker/onetool" target="_blank" rel="noreferrer">查看 GitHub</a>
</div>
```

- [ ] **Step 3: Build the layered hero markup**

Add a hero media shell with:

- one centered main screenshot
- four surrounding tool cards
- a backdrop image layer
- small value chips

Suggested structure:

```html
<div class="hero-media" aria-hidden="true">
  <img class="hero-backdrop" src="hero-backdrop-premium.png" alt="" />
  <div class="hero-layer hero-layer-main"><img src="hero-shot-main.png" alt="" /></div>
  <div class="hero-layer hero-layer-capture"><img src="hero-shot-capture.png" alt="" /></div>
  <div class="hero-layer hero-layer-rename"><img src="hero-shot-rename.png" alt="" /></div>
  <div class="hero-layer hero-layer-clipboard"><img src="hero-shot-clipboard.png" alt="" /></div>
  <div class="hero-layer hero-layer-qr"><img src="hero-shot-qr.png" alt="" /></div>
</div>
```

- [ ] **Step 4: Verify the new copy exists**

Run:

```bash
rg -n "一个应用，收齐 Windows 日常高频工具|控制晶体|hero-ambient.mp4" /Users/andy/Code/onetool/website/index.html
```

Expected:

- the new plain-language headline is present
- `控制晶体` is gone from the visible page copy
- `hero-ambient.mp4` is no longer referenced

- [ ] **Step 5: Commit**

```bash
git -C /Users/andy/Code/onetool add website/index.html
git -C /Users/andy/Code/onetool commit -m "feat: rewrite website homepage structure and copy"
```

---

### Task 3: Rebuild The Visual System In CSS

**Files:**
- Modify: `/Users/andy/Code/onetool/website/style.css`

- [ ] **Step 1: Inspect the current stylesheet boundaries**

Run:

```bash
wc -l /Users/andy/Code/onetool/website/style.css
sed -n '1,220p' /Users/andy/Code/onetool/website/style.css
```

Expected: confirm the stylesheet is currently dominated by the crystal/video hero and can be safely replaced section by section.

- [ ] **Step 2: Define the new visual tokens**

Replace the current concept-heavy palette with a software-launch-page palette based on:

- warm white background
- pale blue glow
- silver glass borders
- dark but not harsh text

Add or revise root tokens such as:

```css
:root {
  --page: #f5f8fd;
  --page-accent: #e7f0ff;
  --ink: #182131;
  --ink-soft: #5f6f8e;
  --line: rgba(125, 149, 196, 0.18);
  --glass: rgba(255, 255, 255, 0.62);
  --glass-shadow: 0 32px 80px rgba(101, 125, 171, 0.16);
}
```

- [ ] **Step 3: Style the new hero as layered product art**

Implement:

- a stable text column that remains readable
- a hero media area with absolute-positioned layered cards
- unified screenshot frames
- restrained hover and reveal motion
- buttons that feel product-grade rather than generic pills

Key requirement: do not reintroduce any full-screen video styling.

- [ ] **Step 4: Restyle the lower sections**

Create a coherent system for:

- value chips / benefit strip
- scenario cards
- tool matrix
- advanced capability strip
- download close

Use the same border radius, shadow logic, and spacing rhythm across all sections so the page feels like one product system.

- [ ] **Step 5: Add responsive and reduced-motion rules**

Include:

- stacked hero layout for narrow screens
- reduced breakup transforms on tablet/mobile
- `@media (prefers-reduced-motion: reduce)` fallback with minimal animation

- [ ] **Step 6: Format and commit**

Run:

```bash
npx prettier --write /Users/andy/Code/onetool/website/style.css
git -C /Users/andy/Code/onetool add website/style.css
git -C /Users/andy/Code/onetool commit -m "feat: rebuild website visual system"
```

---

### Task 4: Implement Lightweight 3D Breakup Scroll Motion

**Files:**
- Modify: `/Users/andy/Code/onetool/website/script.js`
- Modify: `/Users/andy/Code/onetool/website/style.css`

- [ ] **Step 1: Inspect the current scroll controller**

Run:

```bash
sed -n '1,220p' /Users/andy/Code/onetool/website/script.js
```

Expected: confirm the current script only updates a single `--hero-progress` variable and reveal observers, with no per-layer breakup choreography.

- [ ] **Step 2: Add per-layer motion variables**

Extend the script to:

- compute normalized hero scroll progress
- clamp the value between 0 and 1
- expose CSS variables for `--hero-progress`, `--breakout-progress`, and optional eased variants
- preserve header scroll state and reveal observer behavior

Suggested logic:

```js
const eased = progress < 0.25
  ? progress * 2
  : progress < 0.65
    ? 0.5 + (progress - 0.25) / 0.4 * 0.4
    : 0.9 + (progress - 0.65) / 0.35 * 0.1;

root.style.setProperty('--hero-progress', progress.toFixed(4));
root.style.setProperty('--breakout-progress', eased.toFixed(4));
```

- [ ] **Step 3: Bind each hero layer to a different transform recipe**

In CSS, use the scroll variables so the layers separate at different rates. Example pattern:

```css
.hero-layer-main {
  transform:
    translate3d(0, calc(var(--breakout-progress) * 24px), 0)
    rotateX(calc(var(--breakout-progress) * 4deg))
    scale(calc(1 - var(--breakout-progress) * 0.04));
}

.hero-layer-capture {
  transform:
    translate3d(calc(var(--breakout-progress) * -90px), calc(var(--breakout-progress) * -48px), 0)
    rotateY(calc(var(--breakout-progress) * -12deg))
    rotateZ(calc(var(--breakout-progress) * -4deg));
}
```

Acceptance rule: the main card stays recognizable while outer cards separate visibly enough to create the approved 3D breakup illusion.

- [ ] **Step 4: Verify the old heavy media is gone and the new motion hooks exist**

Run:

```bash
rg -n "hero-ambient|playbackRate|hero-progress|breakout-progress" /Users/andy/Code/onetool/website/script.js /Users/andy/Code/onetool/website/style.css
```

Expected:

- no video playback logic remains
- the scroll variables exist in both JS and CSS

- [ ] **Step 5: Commit**

```bash
git -C /Users/andy/Code/onetool add website/script.js website/style.css
git -C /Users/andy/Code/onetool commit -m "feat: add lightweight layered hero breakup motion"
```

---

### Task 5: Finish Supporting Sections And Asset Cleanup

**Files:**
- Modify: `/Users/andy/Code/onetool/website/index.html`
- Modify: `/Users/andy/Code/onetool/website/style.css`
- Remove or stop referencing: `/Users/andy/Code/onetool/website/hero-ambient.mp4`
- Remove or stop referencing: `/Users/andy/Code/onetool/website/hero-poster.jpg`
- Remove or stop referencing: `/Users/andy/Code/onetool/website/icon-crystal.png`

- [ ] **Step 1: Finalize section copy so it matches the approved audience**

Check that:

- the first two content sections talk about daily-use value
- proxy and WSL content move into a lighter “more advanced tools” area
- no section title depends on prior knowledge of the old concept page

- [ ] **Step 2: Remove stale references and simplify the file set**

Run:

```bash
rg -n "hero-ambient.mp4|hero-poster.jpg|icon-crystal.png" /Users/andy/Code/onetool/website
```

Expected: no remaining references after cleanup.

If those files are no longer used anywhere, delete them.

- [ ] **Step 3: Update the tool overview and download close**

Ensure the final sections explicitly show:

- that the product is Windows-focused
- that it runs locally
- that it is open source on GitHub
- a clear download CTA and a secondary source-code CTA

- [ ] **Step 4: Commit**

```bash
git -C /Users/andy/Code/onetool add website/index.html website/style.css website/script.js website/hero-ambient.mp4 website/hero-poster.jpg website/icon-crystal.png
git -C /Users/andy/Code/onetool commit -m "feat: finish website sections and remove stale hero assets"
```

---

### Task 6: Verify The Final Homepage

**Files:**
- Modify if needed: `/Users/andy/Code/onetool/website/index.html`
- Modify if needed: `/Users/andy/Code/onetool/website/style.css`
- Modify if needed: `/Users/andy/Code/onetool/website/script.js`

- [ ] **Step 1: Format the final static site files**

Run:

```bash
npx prettier --write /Users/andy/Code/onetool/website/index.html /Users/andy/Code/onetool/website/style.css /Users/andy/Code/onetool/website/script.js
```

Expected: files are normalized without syntax errors.

- [ ] **Step 2: Launch a local preview**

Run:

```bash
cd /Users/andy/Code/onetool/website && python3 -m http.server 4173 --bind 127.0.0.1
```

Expected: the homepage is reachable at `http://127.0.0.1:4173/`.

- [ ] **Step 3: Perform manual visual verification**

Verify all of the following in the browser:

- the hero explains OneTool within a few seconds
- the layered screenshot composition feels premium and readable
- the breakup effect is visible but not jittery
- no black video bar or unexplained media remains
- section order matches the approved information architecture
- mobile width still reads cleanly

- [ ] **Step 4: Capture an updated preview artifact**

Save a fresh screenshot over:

```text
/Users/andy/Code/onetool/website/website-preview-crystal-latest.png
```

or replace it with a better-named current preview such as:

```text
/Users/andy/Code/onetool/website/website-preview-launchpage-latest.png
```

- [ ] **Step 5: Commit**

```bash
git -C /Users/andy/Code/onetool add website/index.html website/style.css website/script.js website/website-preview-*.png
git -C /Users/andy/Code/onetool commit -m "feat: complete website launch-page redesign"
```

---

## Self-Review

### Spec coverage

- Hero clarity, premium launch-page direction, screenshot-led visuals, and plain-language copy are covered in Tasks 1 through 3.
- Lightweight 3D breakup motion and performance constraints are covered in Task 4.
- Lower-page information architecture, advanced capability demotion, and download close are covered in Task 5.
- Final usability and responsiveness verification are covered in Task 6.

### Placeholder scan

- No `TBD` or `TODO` placeholders remain.
- Every task names exact files and concrete checks.
- Asset generation is constrained to a specific backdrop purpose and screenshot list.

### Type and naming consistency

- The plan uses one consistent hero asset naming family: `hero-backdrop-premium.png` and `hero-shot-*.png`.
- The motion variable names stay consistent across tasks: `--hero-progress` and `--breakout-progress`.

