---
name: motion-craft
description: Use this skill for animation, motion design, and transition engineering — page-load choreography, scroll-driven reveals, easing curves, spring physics, stagger timing, skeleton-to-content fades, hover micro-interactions, modal transitions, exit animations. Triggers on "animate this", "add transitions", "page-load animation", "make it feel alive", "stagger reveal", "scroll animation", "motion design", "easing", "spring animation", "Framer Motion", "GSAP", "CSS animation". Different from ui-polish (covers motion as part of state coverage) and 3d-web-design (covers Three.js animation). This skill is the discipline of choreography: what moves, when, in what order, with what physics.
---

# Motion Craft

Orchestrate motion so it conveys causation, masks latency, and directs attention. One coordinated page-load sequence beats 20 scattered micro-interactions. Motion is communication — every animation either earns its place or harms.

## Orientation

Motion has three legitimate jobs:
1. **Convey causation** — this appears because that was clicked; this disappears because the session ended
2. **Mask latency** — skeleton pulses while data loads; transition occupies the gap between routes
3. **Direct attention** — the first thing that moves is the thing the user should look at next

Motion that does none of these three is decorative. Decorative motion gets cut. It costs performance, accessibility, and user patience.

The single most common failure: animating everything equally. Everything moving at once is visual noise. Choreography = deliberate sequencing.

---

## Execution Protocol

### Step 1 — Classify the animation type

| Type | Trigger | Example | Tool |
|------|---------|---------|------|
| **Micro-interaction** | User action (hover, press, focus) | Button press, icon flip, toggle | CSS transition |
| **Page-load reveal** | Component mounts | Hero text, card grid entrance | Framer Motion, GSAP |
| **Scroll-driven** | Scroll position | Section reveals, parallax, counters | Framer Motion scroll, GSAP ScrollTrigger |
| **State transition** | Data/UI state change | Modal open/close, tab switch | Framer Motion AnimatePresence |
| **Loading state** | Async pending | Skeleton pulse, spinner, progress | CSS animation |
| **Exit animation** | Unmount / navigation away | Modal close, route change | Framer Motion AnimatePresence |

Choose the right tool per type. Don't use GSAP for hover micro-interactions. Don't use CSS transitions for complex page-load choreography.

### Step 2 — Set duration and easing BEFORE writing keyframes

Duration table by interaction type:

| Interaction | Duration | Why |
|------------|----------|-----|
| Hover (micro) | 100-150ms | Immediate feel — sluggish hover = broken |
| Press / tap feedback | 80-100ms | Faster than hover — physical press feels instant |
| Tooltip appear | 150-200ms | Fast but not jarring |
| Modal open | 200-280ms | Substantial enough to feel intentional |
| Modal close | 160-200ms | Exits faster than enters — clears faster |
| Page transition | 240-320ms | Enough to register, not enough to wait |
| Skeleton → content | 200-320ms | Smooth but not slow |
| Scroll reveal | 400-600ms | Scroll is slower, animation can breathe |
| Hero entrance (first load) | 600-900ms | Single orchestrated sequence — user is watching |
| Background / ambient | 3000-8000ms | Float, drift, breathe — barely perceived |

Rule: if duration feels fast → reduce 20ms. If feels slow → reduce 40ms. Never increase duration to "make it feel fancy" — slowness is the #1 motion complaint.

### Step 3 — Apply correct easing curve

**Cubic-bezier cheat sheet:**

```
ease-in-out (balanced, general purpose):
  cubic-bezier(0.4, 0, 0.2, 1)          — Material standard
  cubic-bezier(0.4, 0, 0.6, 1)          — slightly more pronounced

ease-out (decelerating — use for ENTER animations, elements appearing):
  cubic-bezier(0.16, 1, 0.3, 1)         — confident, energetic enter
  cubic-bezier(0.0, 0.0, 0.2, 1)        — Material decelerate
  cubic-bezier(0.22, 1, 0.36, 1)        — snappy enter

ease-in (accelerating — use for EXIT animations, elements leaving):
  cubic-bezier(0.32, 0.72, 0, 1)        — confident exit
  cubic-bezier(0.4, 0, 1, 1)            — Material accelerate
  cubic-bezier(0.55, 0, 1, 0.45)        — quick exit

anticipation (pulls back before going forward — playful, branded):
  cubic-bezier(0.36, 0, 0.66, -0.56)    — negative y2 = overshoot on start

overshoot / back (bounces past target — energetic, playful):
  cubic-bezier(0.34, 1.56, 0.64, 1)     — subtle overshoot
  cubic-bezier(0.175, 0.885, 0.32, 1.275) — pronounced overshoot

spring (Framer Motion):
  type: "spring", stiffness: 400, damping: 30    — snappy, minimal bounce
  type: "spring", stiffness: 100, damping: 15    — bouncy, playful
  type: "spring", stiffness: 200, damping: 60    — heavy, authoritative
  type: "spring", stiffness: 500, damping: 50    — near-instant, decisive
```

**Matching curve to aesthetic:**
| Aesthetic | Enter | Exit |
|-----------|-------|------|
| Brutalist, Terminal | Linear or step-function (0ms jumps) | Same |
| Swiss, Editorial | `cubic-bezier(0.4, 0, 0.2, 1)` | `cubic-bezier(0.4, 0, 1, 1)` |
| Glassmorphic, Soft | `cubic-bezier(0.16, 1, 0.3, 1)` spring | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Neo-Brutalist | `cubic-bezier(0.34, 1.56, 0.64, 1)` overshoot | Fast linear exit |
| Organic, Natural | `cubic-bezier(0.22, 1, 0.36, 1)` slow | `cubic-bezier(0.4, 0, 1, 1)` |
| Cyber-Noir, Retro-Futurist | Glitch cuts + slow settle | Glitch out |

### Step 4 — Design the choreography sequence

Page-load choreography rule: **leading element → supporting elements → body content**

```
Frame 0ms:    Logo / brand mark (anchors the page)
Frame 100ms:  Hero headline (primary message)
Frame 200ms:  Hero subheading / description
Frame 320ms:  CTAs (action prompt)
Frame 400ms:  Supporting visuals (decoration)
Frame 500ms+: Body content (progressively revealed)
```

Stagger math:
```
Single stagger delay = base_delay + (index * stagger_interval)
Example: base=100ms, interval=80ms
  Item 0: 100ms
  Item 1: 180ms
  Item 2: 260ms
  Item 3: 340ms

For large grids (>12 items): cap stagger at 30-50ms per item
  Uncapped: item 20 enters at 1100ms = user has moved on
  Capped: item 20 enters at 700ms = still feels coordinated
```

### Step 5 — Implement with correct tool

See worked examples below for code patterns.

### Step 6 — Gate with prefers-reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

```jsx
// Framer Motion — respect prefers-reduced-motion
import { useReducedMotion } from 'framer-motion'

function AnimatedCard({ children }) {
  const prefersReducedMotion = useReducedMotion()
  
  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4 }}
    >
      {children}
    </motion.div>
  )
}
```

---

## Domain Reference

### Framer Motion API

```jsx
// Basic animation
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -10 }}
  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
/>

// Spring animation
<motion.div
  animate={{ scale: 1 }}
  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
/>

// Stagger children
const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

<motion.ul variants={containerVariants} initial="hidden" animate="visible">
  {items.map(item => (
    <motion.li key={item.id} variants={itemVariants}>{item.label}</motion.li>
  ))}
</motion.ul>

// AnimatePresence (exit animations)
<AnimatePresence>
  {isOpen && (
    <motion.div
      key="modal"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    />
  )}
</AnimatePresence>

// Scroll-driven (Framer Motion)
import { useScroll, useTransform } from 'framer-motion'

function ParallaxSection() {
  const { scrollYProgress } = useScroll()
  const y = useTransform(scrollYProgress, [0, 1], [0, -200])
  const opacity = useTransform(scrollYProgress, [0, 0.3], [1, 0])
  
  return <motion.div style={{ y, opacity }} />
}

// Scroll-triggered entry (element enters viewport)
import { useInView } from 'framer-motion'

function RevealOnScroll({ children }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px 0px' })
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
```

### GSAP API

```js
// Basic tween
gsap.to(element, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' })
gsap.from(element, { opacity: 0, y: 20, duration: 0.4, ease: 'power3.out' })
gsap.fromTo(element, { opacity: 0 }, { opacity: 1, duration: 0.4 })

// Timeline (coordinated sequence)
const tl = gsap.timeline({ delay: 0.1 })
tl.from('.hero-title',    { opacity: 0, y: 30, duration: 0.6, ease: 'power3.out' })
  .from('.hero-sub',      { opacity: 0, y: 20, duration: 0.5, ease: 'power3.out' }, '-=0.3')
  .from('.hero-cta',      { opacity: 0, y: 20, duration: 0.4, ease: 'power3.out' }, '-=0.2')
  .from('.hero-visual',   { opacity: 0, scale: 0.95, duration: 0.8 },              '-=0.4')

// GSAP easing equivalents
ease: 'power1.out'    // similar to ease-out
ease: 'power3.out'    // confident enter — most used
ease: 'power3.in'     // confident exit
ease: 'expo.out'      // very fast settle
ease: 'back.out(1.7)' // overshoot spring feel
ease: 'elastic.out(1, 0.3)' // pronounced elastic

// ScrollTrigger
import { ScrollTrigger } from 'gsap/ScrollTrigger'
gsap.registerPlugin(ScrollTrigger)

gsap.from('.section-title', {
  scrollTrigger: {
    trigger: '.section',
    start: 'top 80%',   // element top hits 80% of viewport
    end: 'top 20%',
    toggleActions: 'play none none reverse', // on enter, on leave, on enter-back, on leave-back
  },
  opacity: 0,
  y: 50,
  duration: 0.8,
  ease: 'power3.out',
})

// Stagger with GSAP
gsap.from('.card', {
  opacity: 0,
  y: 30,
  duration: 0.5,
  stagger: 0.08,      // 80ms between each card
  ease: 'power3.out',
  scrollTrigger: '.cards-container',
})
```

### CSS animation patterns

```css
/* Hover micro-interaction */
.button {
  transition: transform 120ms ease-out, box-shadow 120ms ease-out;
}

.button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.button:active {
  transform: translateY(0px);
  transition-duration: 80ms;
}

/* Skeleton pulse */
@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.skeleton {
  background: #e0e0e0;
  border-radius: 4px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

/* Spin (loading indicator) */
@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner {
  animation: spin 0.8s linear infinite;
}

/* Fade-in up (scroll reveal) */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.reveal {
  animation: fadeInUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* Stagger via nth-child */
.item:nth-child(1) { animation-delay: 0ms; }
.item:nth-child(2) { animation-delay: 80ms; }
.item:nth-child(3) { animation-delay: 160ms; }
.item:nth-child(4) { animation-delay: 240ms; }
/* JS-set for dynamic lists: el.style.animationDelay = `${index * 80}ms` */
```

### Spring physics parameters

Spring: `stiffness` controls how fast it moves, `damping` controls how much it bounces.

| Stiffness | Damping | Character | Use |
|-----------|---------|-----------|-----|
| 500 | 50 | Snappy, no bounce | Decisive UI actions |
| 400 | 30 | Fast, tiny bounce | Default — most interactions |
| 200 | 20 | Medium, slight bounce | Cards, panels |
| 100 | 15 | Slow, visible bounce | Playful, neo-brutalist |
| 60 | 8 | Slow, elastic | Very playful, gaming |

Critical damping (no oscillation): `damping ≥ 2 * sqrt(stiffness * mass)`. For mass=1:
- stiffness=400: critical damping ≈ 40. Damping < 40 bounces.
- stiffness=100: critical damping ≈ 20. Damping < 20 bounces.

---

## Decision Framework

### When to animate vs. keep static

**Animate:**
- Element entering viewport for the first time (reveal)
- Element appearing in response to user action (modal, tooltip, dropdown)
- Element exiting (modal close, toast dismiss)
- State change that could surprise the user (loading→content, error appearance)
- Primary CTA on page load (draw attention)

**Keep static:**
- Elements already in view on page load (unless hero entrance)
- Navigation links (hover states, not entrance animations)
- Body text, paragraphs
- Most UI chrome (headers, sidebars in use)
- Anything the user is trying to focus on and read

Rule: if animating something takes >200ms, it delays the user. Budget total animation time per screen, not per element.

### Scroll-driven vs. trigger-driven

| Mode | When | Tool |
|------|------|------|
| **Scroll-driven** (animation tied to scroll position) | Parallax, depth, counter increments | `useScroll` + `useTransform`, GSAP ScrollTrigger scrub |
| **Scroll-triggered** (fires once when element enters view) | Section reveals, card entrances | `useInView`, ScrollTrigger `toggleActions` |
| **Trigger-driven** (fires on click/focus/state change) | Modals, accordions, tabs | Framer Motion AnimatePresence, GSAP timeline |

Don't use scroll-driven (scrub) for elements that just need to enter the viewport — that's scroll-triggered. Scroll-driven is for continuous positional binding.

### Stagger strategy

| Content type | Stagger interval | Max stagger |
|--------------|-----------------|------------|
| Hero text lines | 100-150ms | 300ms total |
| Card grid | 60-80ms | 400ms total |
| List items | 40-60ms | 300ms total |
| Navigation items | 50-70ms | 200ms total |
| Large grid (>12) | 30-50ms | 500ms total |

Rule: last item in stagger should appear within 500ms of first item. Users don't wait past ~600ms for content to stop moving before they start reading.

### Exit animation rules

Exit should mirror entry. If something entered:
- From bottom → exits to top (or bottom, not sideways)
- Faded in → fades out
- Scaled up → scales down
- Grew from center → shrinks to center

Exit is slightly faster than entrance:
- Enter: 280ms → Exit: 200ms
- Enter: 400ms → Exit: 280ms
- Enter: 600ms → Exit: 400ms

Inconsistent exit breaks the sense of motion language. An element that slides in but cuts out feels broken.

---

## Quality Gates

Before declaring motion complete:

- [ ] Every animation duration is within the duration table ranges
- [ ] Every enter uses ease-out (or spring), every exit uses ease-in
- [ ] `prefers-reduced-motion` is respected — animations collapse to instant
- [ ] No animation blocks the user from interacting (never `pointer-events: none` for animation duration unless absolutely required)
- [ ] Exit animations are implemented for everything that can disappear (modal, toast, route change)
- [ ] Skeleton states pulse at 1-2s interval (not fast, not slow)
- [ ] Skeleton fades cleanly to real content (opacity crossfade, not jump-cut)
- [ ] No animation loop runs forever unless ambient/decorative
- [ ] Total page-load animation time ≤ 900ms from first frame
- [ ] Last stagger item appears within 500ms of first stagger item
- [ ] `will-change: transform` only on actively animating elements (not permanently)
- [ ] No animation on elements the user is currently typing into / focused on
- [ ] 60fps verified on mid-range mobile (Chrome DevTools → Rendering → FPS meter)

Performance rules:
- Animate only `transform` and `opacity` — these GPU-composite without layout recalc
- Never animate `width`, `height`, `top`, `left`, `margin`, `padding` (triggers layout)
- `will-change: transform` promotes to compositing layer — apply only during animation, remove after
- `filter: blur()` is expensive — limit to static elements or high-end targets only

---

## Worked Examples

### Example 1: Page-load stagger (hero text + CTAs)

```jsx
import { motion } from 'framer-motion'

const container = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
}

const line = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
}

const cta = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
}

export function HeroReveal() {
  return (
    <motion.div variants={container} initial="hidden" animate="visible">
      <motion.h1 variants={line}>Design that surpasses.</motion.h1>
      <motion.p variants={line}>Ship websites that move people.</motion.p>
      <motion.div variants={cta}>
        <button>Get started</button>
      </motion.div>
    </motion.div>
  )
}
```

### Example 2: Modal open/close with AnimatePresence

```jsx
import { motion, AnimatePresence } from 'framer-motion'

const modalVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 4,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
  },
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.16 } },
}

export function Modal({ isOpen, onClose, children }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="overlay"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
          />
          <motion.div
            className="modal"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

### Example 3: Scroll-reveal card grid

```jsx
import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'

function RevealCard({ children, index }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px 0px' })
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.5,
        delay: (index % 3) * 0.08, // stagger by column position
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  )
}

export function CardGrid({ cards }) {
  return (
    <div className="grid grid-cols-3 gap-6">
      {cards.map((card, i) => (
        <RevealCard key={card.id} index={i}>
          <Card {...card} />
        </RevealCard>
      ))}
    </div>
  )
}
```

### Example 4: Skeleton to content fade

```jsx
import { motion, AnimatePresence } from 'framer-motion'

function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-image" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-body" />
    </div>
  )
}

export function AsyncCard({ data, isLoading }) {
  return (
    <div className="card-container">
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SkeletonCard />
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            <RealCard data={data} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

Skeleton CSS:
```css
.skeleton {
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 4px;
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### Example 5: Hover micro-interaction (button + card)

```css
/* Button press */
.btn {
  transform: translateY(0);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transition:
    transform 120ms ease-out,
    box-shadow 120ms ease-out;
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0,0,0,0.15);
}

.btn:active {
  transform: translateY(1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  transition-duration: 80ms;
}

/* Card lift */
.card {
  transform: translateY(0) scale(1);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  transition:
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.card:hover {
  transform: translateY(-4px) scale(1.005);
  box-shadow: 0 12px 32px rgba(0,0,0,0.12);
}
```

### Example 6: GSAP page-load timeline

```js
import { gsap } from 'gsap'

// Run after fonts loaded (document.fonts.ready) and images decoded
document.fonts.ready.then(() => {
  const tl = gsap.timeline()
  
  tl.from('.nav', {
    opacity: 0, y: -20, duration: 0.4, ease: 'power3.out'
  })
  .from('.hero-eyebrow', {
    opacity: 0, y: 16, duration: 0.5, ease: 'power3.out'
  }, '-=0.1')
  .from('.hero-h1 .word', {
    opacity: 0, y: 24, duration: 0.6, stagger: 0.04, ease: 'power3.out'
  }, '-=0.2')
  .from('.hero-sub', {
    opacity: 0, y: 16, duration: 0.5, ease: 'power3.out'
  }, '-=0.3')
  .from('.hero-ctas > *', {
    opacity: 0, y: 12, duration: 0.4, stagger: 0.08, ease: 'power3.out'
  }, '-=0.2')
  .from('.hero-visual', {
    opacity: 0, scale: 0.96, duration: 0.8, ease: 'power3.out'
  }, '-=0.5')
})
```

---

## Anti-Patterns

**1. All elements animate simultaneously**
Everything sliding in at once = no hierarchy, visual chaos. Stagger with purpose. Leading element is what the user should look at first.

**2. Duration creep (making slow = premium)**
500ms modal open is not premium — it's slow. Premium feels fast AND intentional. Duration table exists for a reason. Cut durations when in doubt.

**3. Bouncy springs on everything**
Overshoot feels playful. One or two bouncy interactions = branded. Every interaction bouncy = toylike. Use springs selectively based on aesthetic direction.

**4. Animating layout properties**
`width`, `height`, `top`, `left`, `padding`, `margin` trigger layout recalc every frame = jank. Only animate `transform` and `opacity`. For height animations use `scaleY` with transform-origin top, or `max-height` with `overflow:hidden` (imprecise but OK for many cases).

**5. No exit animation**
Modal appears with a beautiful entrance, then `display: none` snaps it away. Users experience this as broken. AnimatePresence or GSAP reverse timeline on close.

**6. Infinite loop animations on primary content**
Looping wiggle on a CTA button = distracting. Ambient animations (backgrounds, decorative elements) can loop. Primary content interactions must be user-initiated.

**7. Skeleton for <150ms loads**
Flash of skeleton → instant content = worse than no skeleton. Apply `animation-delay: 150ms` or gate skeleton behind a `setTimeout` of 150ms. If content arrives before 150ms, the skeleton never shows.

**8. `will-change: transform` on all elements**
Promotes every element to compositing layer. Too many compositing layers = GPU memory pressure → crash on mobile. Apply only during active animation, remove after:
```js
el.style.willChange = 'transform'
// ...animate...
el.addEventListener('transitionend', () => {
  el.style.willChange = 'auto'
}, { once: true })
```

**9. Animation fighting user intent**
If user clicks while element is animating, the next state must be reachable. Don't lock pointer events during animation unless unavoidable. Use `Framer Motion layout` prop for elements that change size mid-animation.

---

## Weak Model Fallbacks

When targeting environments where animation libraries can't load or device performance is unknown:

```css
/* Pure CSS reveal — no JS, zero library dependency */
.reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.5s ease-out, transform 0.5s ease-out;
}

.reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}
```

```js
// Minimal Intersection Observer reveal — no Framer, no GSAP
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target) // once
      }
    })
  },
  { threshold: 0.1, rootMargin: '-60px 0px' }
)

document.querySelectorAll('.reveal').forEach(el => observer.observe(el))
```

```css
/* Complete animation kill for low-performance */
@media (prefers-reduced-motion: reduce) {
  .reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

---

## Atomic Decision Tree

```
Is this triggered by a user action?
  YES → feedback must appear within 100ms (hover/press: CSS transition)
  NO  → continue

Is this a loading state?
  YES → show skeleton after 150ms delay. Fade to content (AnimatePresence mode="wait")
  NO  → continue

Is this scroll-driven (position-tied)?
  YES → useTransform / ScrollTrigger scrub. NO fixed duration.
  NO  → continue

Is this entering the viewport for the first time?
  YES → scroll-triggered, once=true, ease-out, 400-600ms
  NO  → continue

Is this an element exiting?
  YES → exit uses ease-in, duration 80% of entry duration, same axis as entry
  NO  → continue

Is the system slow / prefers-reduced-motion set?
  YES → duration: 0, instant state change, no animation
```

---

## Output Template

When this skill is active, deliverable structure:

```
Animation type: [micro / page-load / scroll-driven / state transition / loading / exit]
Duration: [Nms — matches duration table]
Easing: [cubic-bezier(...) — matches curve cheat sheet]
Choreography: [stagger? delay? sequence order?]
prefers-reduced-motion: [handled — how]
Performance: [only transform/opacity? will-change applied correctly?]
Tool: [CSS transition / Framer Motion / GSAP — justified]

Code:
  [Full animation implementation]
```
