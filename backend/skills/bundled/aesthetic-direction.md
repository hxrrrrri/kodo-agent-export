---
name: aesthetic-direction
description: Use this skill at the START of any frontend or web design task to commit to a specific, named aesthetic direction before writing code. Triggers on "design a website", "build a landing page", "make a portfolio", "create a UI for X", "redesign this", or any visual brief without explicit aesthetic guidance. Provides a catalog of 14 named aesthetic flavors (brutalist, editorial, retro-futurist, glassmorphic, terminal, swiss/grid, organic, art-deco, japandi, vaporwave, maximalist, neumorphic, neo-brutalist, cyber-noir) with concrete typography, color, motion, and layout signatures for each. Use this skill BEFORE craft-color, craft-typography, web-prototype, or saas-landing — those skills execute; this skill decides direction.
---

# Aesthetic Direction

Pick a flavor. Commit. Then execute.

The single biggest predictor of "this looks AI-generated" is *aesthetic indecision*. The model picks a safe middle (Inter font + slate background + indigo accent + 12px radius + soft shadow) and the result is technically fine and immediately forgettable. The fix: pick an extreme aesthetic, name it, and execute its signatures with discipline.

This skill provides a catalog of 14 named aesthetics with concrete signatures. Pick one, then hand off to the execution skills (web-prototype, saas-landing, dashboard, craft-color, craft-typography).

## How to use this skill

1. Read the brief — what's the surface, audience, tone?
2. Scan the catalog. Most briefs have 2-4 aesthetics that fit.
3. Pick **one**. Not "kind of brutalist with some glassmorphism." Pick. One. Direction. The discipline is in the choice.
4. Execute the signatures of that aesthetic (typography, color, layout, motion, ornament).
5. Verify against the "tells" — does this output read as the chosen aesthetic to a stranger?

If the brief gives no tone, ask one question: **"What's the closest reference site or brand?"** That single answer narrows the catalog.

## The 14 aesthetics

Each aesthetic specifies: typography, color, layout, motion, ornament, signature elements, and references.

---

### 1. Brutalist (raw / utilitarian)

System-as-honesty. Visible structure, no skeumorphism, no comfort.

| Dimension | Signature |
|-----------|-----------|
| **Typography** | Mono primary (JetBrains Mono, IBM Plex Mono, Berkeley Mono). Second face: stark grotesk (Druk, Impact, condensed sans). Heavy weight contrast — 900 next to 300. Tight tracking. |
| **Color** | High-contrast: pure black, off-white (#fafafa), one saturated alert color (red #ff0000, lime #00ff00, hot pink #ff00ff). No gradients. |
| **Layout** | Visible grid lines. Asymmetric. Text overflows containers deliberately. No rounded corners. Borders 1-2px solid. |
| **Motion** | Step-function, no ease. 0ms or 100ms hard cuts. No fade. |
| **Ornament** | Underlines, brackets [ ], asterisks. ASCII boxes. Visible HTML. |
| **Signatures** | `border: 2px solid black` on everything. Display font in caps. Numerical labels (01 / 02 / 03). Pre-formatted text blocks. |
| **Avoid** | Drop shadows, soft colors, rounded corners, hover lifts, gradients. |
| **References** | balenciaga.com, are.na, Bloomberg Terminal, Craigslist taken seriously. |

---

### 2. Editorial (magazine / fashion-publishing)

Print-magazine restraint. Type-driven. Designed to be *read*.

| Dimension | Signature |
|-----------|-----------|
| **Typography** | Serif display (GT Sectra, Tiempos, Canela, Recoleta). Sans body (Söhne, Inter Tight, Neue Haas Grotesk). Massive size jumps — 96px display next to 16px body. Italics for emphasis. Drop caps. |
| **Color** | Off-white (#f7f3ee), deep ink (#1a1a1a), one accent — usually deep red, mustard, or forest green. Cream/sepia variants. |
| **Layout** | 12-column grid, often used as 2-3 wide columns. Generous whitespace. Asymmetric. Text wraps around images. Pull quotes. |
| **Motion** | Subtle. 600-800ms reveals on scroll. Letter-by-letter on hero on rare moments. |
| **Ornament** | Hairline rules (0.5px). Numbered lists. Folio-style page numbers. Date/byline meta. |
| **Signatures** | "Issue 04" / "Vol. 12" framing. Hairline borders. Italic kicker above headline. Long-form copy treated as content, not filler. |
| **Avoid** | Stock photos, gradient backgrounds, generic hero stacks, sans-serif display. |
| **References** | Pitchfork (formerly), The New Yorker online, Apple's editorial pages, dvsy.club, ssense.com. |

---

### 3. Retro-Futurist (Y2K / sci-fi / digital nostalgia)

The future as imagined in 1999, redrawn with 2024 fidelity.

| Dimension | Signature |
|-----------|-----------|
| **Typography** | Variable techno-display (Neue Haas Grotesk Display, Söhne Mono, Migra). Wide-set caps. Negative tracking. Optional pixel/bitmap accents. |
| **Color** | Chrome silvers (#c0c0c0), iridescent gradients, deep blue/purple (#0d0d2b), neon accent (cyan, magenta). Holographic surfaces. |
| **Layout** | Centered hero, off-axis decorative elements. 3D objects floating. Glassmorphic panels. |
| **Motion** | 3D rotation, parallax, scrubbing on scroll. Cursor-following highlights. Glitch on load. |
| **Ornament** | Star icons, atomic symbols, version numbers (v.1.0), iridescent foils, blur halos. |
| **Signatures** | Iridescent metal lettering, glassmorphic cards over space backgrounds, scroll-driven 3D, pixel-density displays. |
| **Avoid** | Flat design, conventional B2B SaaS structure, monochrome palettes. |
| **References** | linear.app circa 2023, cursor.so launch site, Figma's Config keynote sites, raw.studio. |

---

### 4. Glassmorphic (depth / luminosity)

Layered translucency over rich backgrounds. Apple Vision Pro / iOS aesthetic.

| Dimension | Signature |
|-----------|-----------|
| **Typography** | SF Pro Display / SF Pro Text feel — clean, optical-size-aware. Inter is fine here despite generic warnings, *if* the rest is committed. Tight letter-spacing on display. |
| **Color** | Vivid, saturated background (gradient mesh, blurred image, video). Glass surfaces: `backdrop-filter: blur(40px)` + `background: rgba(255,255,255,0.08-0.16)` + `border: 1px solid rgba(255,255,255,0.18)`. |
| **Layout** | Floating panels. Layered depth. Generous padding inside cards. Soft, large radii (20-32px). |
| **Motion** | Smooth springs (cubic-bezier(0.16, 1, 0.3, 1)). Parallax. Hover causes subtle highlight migration across the glass. |
| **Ornament** | Inner highlights (top edge ~10% lighter). Specular dots on hover. Soft inner shadow. |
| **Signatures** | Always pair glass with a saturated/textured background. Glass on flat color = sad. Multiple z-layers of glass create the depth illusion. |
| **Avoid** | Flat backgrounds (kills the effect), excessive blur (>60px feels muddy), glass on top of glass on top of glass (decision paralysis). |
| **References** | apple.com/vision-pro, raycast.com, arc.net, the Stripe Sessions site. |

---

### 5. Terminal (developer / monospace / command-line)

Built for developers, performs as documentation. Optimized for technical precision.

| Dimension | Signature |
|-----------|-----------|
| **Typography** | Mono throughout (Berkeley Mono, JetBrains Mono, IBM Plex Mono). Second face only for marketing copy if needed. |
| **Color** | Dark mode default: charcoal (#0a0a0a), surface (#111), text (#e6e6e6), syntax-highlighted accents (cyan #00d4ff, lime #34d399, magenta #f472b6). |
| **Layout** | Code-block-as-design-element. Side-by-side panes. CLI-style prompts. Sharp 90° corners. 2-4px radii max. |
| **Motion** | Cursor blink. Type-on for hero. Step-cut transitions. No fluid motion. |
| **Ornament** | Prompt characters (`$`, `>`, `~`). Syntax highlighting in marketing copy. Diff-style red/green. Status indicators (●/○). |
| **Signatures** | Real, valid code that reads as documentation. ASCII diagrams. Build-log-style status output. |
| **Avoid** | Stock illustrations, sales-y CTAs, soft colors, ornamental fonts. |
| **References** | linear.app docs, vercel.com, neon.tech, clickhouse.com, supabase.com (dev sections). |

---

### 6. Swiss / Grid (modernist / international style)

Helvetica or its descendants, ruthless grid, restrained color.

| Dimension | Signature |
|-----------|-----------|
| **Typography** | Neue Haas Grotesk, Helvetica Now, Söhne, Inter Display (committed). Sentence-case. Restrained weights — usually two: 400 and 700. |
| **Color** | Black/white/gray ramp. One pure accent — pure red (#e3120b), pure blue (#0077ff), or none at all. |
| **Layout** | 12 or 16-column grid, religiously followed. Left-aligned. Information hierarchy via size and weight, not color. |
| **Motion** | Minimal. Elements appear, don't dance. |
| **Ornament** | None. Whitespace is the ornament. |
| **Signatures** | Massive (96px+) headlines. Heavy weight + tight tracking. Captions sized to ~70% of body. Numbered sections. |
| **Avoid** | Decoration of any kind. Color for decoration. Center alignment. Multiple display fonts. |
| **References** | The Grid Magazine, swissted.com, IBM design library, base.com. |

---

### 7. Organic / Natural (warmth / craft / hand-made)

Earthy palette. Tactile feel. Not minimalist — restrained but warm.

| Dimension | Signature |
|-----------|-----------|
| **Typography** | Humanist serif (Tiempos, Lyon, Canela) for display. Humanist sans (Söhne Breit, GT Walsheim, FF Mark) for body. Optical-size variants. |
| **Color** | Cream (#f5f0e8), terracotta (#c75d3b), forest (#3a5b40), clay (#a87c5a), ink (#1a1611). Earth tones throughout. Avoid pure white/black. |
| **Layout** | Generous, irregular. Soft asymmetry. Hand-drawn-feeling decorative elements. Grid present but loose. |
| **Motion** | Slow, soft. 500-800ms eases. Gentle parallax. Subtle. |
| **Ornament** | Hand-drawn lines. Botanical illustrations. Texture overlays (paper, linen, faint grain). |
| **Signatures** | Off-square aspect ratios on imagery. Hand-feel SVG illustrations. Texture noise overlays. Generous breathing room. |
| **Avoid** | Cool pure tones, sharp 90° corners, mechanical motion, gradient meshes. |
| **References** | aesop.com, lecreuset.com, oatly.com, mast.com, doterra.com (the better pages). |

---

### 8. Art Deco (geometric / luxury / 1920s revival)

Symmetric ornament, gold-on-black, geometric ornamentation.

| Dimension | Signature |
|-----------|-----------|
| **Typography** | Geometric display (Bodoni Moda, Playfair Display, Eckmannpsych). Body in classical serif (Garamond, Crimson). High contrast strokes. |
| **Color** | Black (#0d0d0d), cream (#f4ecd8), gold (#c8a951), deep emerald (#0d3525) or burgundy (#54142a). Metallic accents. |
| **Layout** | Symmetric. Centered hero. Vertical rules dividing sections. Frames around content. |
| **Ornament** | Sunburst patterns, chevrons, gold rule lines, geometric corner ornaments, monogram-style logos. |
| **Motion** | Slow, ceremonial. Reveals from center outward. |
| **Signatures** | Symmetric framing. Gold hairlines. Centered hero copy with vertical rules above/below. |
| **Avoid** | Asymmetric layouts, casual lowercase, modern grotesks, soft colors. |
| **References** | Empire State Building branding, classic Vanity Fair print, the Chrysler Building. Bottega Veneta's site has flashes. |

---

### 9. Japandi (minimalist / serene / Japanese-Scandinavian)

Restraint to the point of luxury. Zen-spaced.

| Dimension | Signature |
|-----------|-----------|
| **Typography** | Single typeface, often. Very high optical size variation. Light weights (300-400) preferred. Wide tracking on all caps; tight on display. Often a Japanese typographic detail. |
| **Color** | Near-white (#fafaf7), warm gray (#8b8680), ink black (#15140f). Optional muted accent (sage, terracotta, indigo) used at <2%. |
| **Layout** | Massive whitespace. Single object, generous frame. Vertical rhythm. |
| **Motion** | Very slow. Long fades (800-1200ms). No hover effects beyond opacity shift. |
| **Ornament** | None. Whitespace as protagonist. Hairlines if any. |
| **Signatures** | Hero with one image, one line of text, vast empty space. Typography that whispers. |
| **Avoid** | Color, ornament, decorative motion, density. |
| **References** | muji.com, allbirds.com (the calm sections), arket.com, fonts.adobe.com. |

---

### 10. Vaporwave / Aesthetic-Y2K (pastel / nostalgic / surreal)

Soft pastels, busted pixels, classical statues, palm trees, sunsets. Earnest in its irony.

| Dimension | Signature |
|-----------|-----------|
| **Typography** | Mix of digital-pixel display (Press Start 2P, VCR OSD), faux-Japanese (Kosugi), and 80s grotesk (Avant Garde, Eurostile). Often rotated, layered. |
| **Color** | Hot pink (#ff77ff), cyan (#77eeff), deep purple (#3d1e6d), pastel peach. Gradient skies. CRT-glow palettes. |
| **Layout** | Centered, layered. Floating objects. Rotated text. Distorted cards. |
| **Motion** | Glitch effects, slow rotation, drifting parallax, CRT scanlines. |
| **Ornament** | Greek statue heads, palm silhouettes, grid floors, sunset gradients, VHS noise overlays. |
| **Signatures** | Sunset gradient + grid floor, Japanese characters, classical-statue-as-mascot. |
| **Avoid** | Subtlety, monochrome restraint. |
| **References** | The album art for Floral Shoppe, vaporwave Tumblr, '80s/'90s mall culture filtered through 2014 internet. |

---

### 11. Maximalist (chaos / abundance / pattern overload)

Every surface is decorated. Pattern, color, type everywhere. Coherent through committed extremity.

| Dimension | Signature |
|-----------|-----------|
| **Typography** | Multiple display faces, mixed and rotated. Outlined, shadowed, layered. Decorative scripts beside hard grotesks. |
| **Color** | Six-plus saturated colors. Patterns, gradients, textures. No surface left undecorated. |
| **Layout** | Collage. Overlapping. Scrolling text marquees. No clear grid. |
| **Motion** | Constant movement. Marquees, parallax, hover-warp. |
| **Ornament** | Stickers, tape, doodles, halftone, bursts, rays, exclamation marks. |
| **Signatures** | Scroll-marquees, layered backgrounds, diagonal copy, oversized punctuation. |
| **Avoid** | Restraint. Whitespace. Coherence-by-subtraction. |
| **References** | Studio Yorktown, Pentagram's louder work, contemporary streetwear sites (palace, supreme), late-period MTV. |

---

### 12. Neo-Brutalist (chunky / colorful / playful brutalism)

Brutalism with personality. Bright colors, hard shadows, rounded blockiness.

| Dimension | Signature |
|-----------|-----------|
| **Typography** | Heavy grotesks (Founders Grotesk Bold, Druk, Mona Sans Heavy). Often 700-900 weight. Slight playfulness — arbitrary kerning, bouncy baseline. |
| **Color** | Bold primary palette. Yellow (#ffd62a), pink (#ff6b9d), green (#42d896). Black borders. White or pastel base. |
| **Layout** | Chunky cards. Hard shadows (4-8px solid black, no blur). Rotated elements (-2deg to 2deg). Blocky grids. |
| **Motion** | Bouncy springs. Squash and stretch. 200-300ms with overshoot. |
| **Ornament** | Hand-drawn arrows, stars, asterisks. Bright stickers. |
| **Signatures** | `box-shadow: 6px 6px 0px black`. 4px solid borders. Bright yellow highlights. Playful illustrations alongside heavy type. |
| **Avoid** | Muted palettes, soft shadows, blurred glass, refined editorial type. |
| **References** | gumroad.com (current), framer.com (some pages), v0.dev's promotional site, Memphis design revival sites. |

---

### 13. Cyber-Noir (dark / neon / cinematic)

Blade Runner inspired. Heavy contrast. Engineered atmosphere.

| Dimension | Signature |
|-----------|-----------|
| **Typography** | Wide-set techno display (Druk Wide, Migra, Söhne Breit). Mono for technical labels. Negative tracking, large sizes. |
| **Color** | Deep blue-black (#070b18), neon cyan (#00f0ff), neon magenta (#ff00aa), warm amber (#ffaa00) for warmth. Blacks aren't pure — slight blue cast. |
| **Layout** | Edge-to-edge dark canvas. Narrow content columns. Off-center compositions. Numbered sections. |
| **Motion** | Glow pulses, parallax, scan-line passes, terminal cursor blinks, decoder text effects. |
| **Ornament** | HUD-style brackets, technical readouts, low-percentage opacity grids, faint scanlines, atmospheric particles. |
| **Signatures** | Pulsing neon glow on accents, technical readouts in monospace, atmospheric depth via blurred backgrounds. |
| **Avoid** | Light backgrounds, soft palettes, friendly illustrations, casual tone. |
| **References** | linear.app dark sections, nothing.tech, sxsw 2024 microsites, Tesla site at night. |

---

### 14. Soft / Pastel Card (consumer / friendly / approachable)

Notion-meets-Apple-meets-Pinterest. Gentle pastels, soft shadows, generous space.

| Dimension | Signature |
|-----------|-----------|
| **Typography** | Friendly humanist (Inter, Söhne, GT Eesti). Round-feeling. Medium weights (500-600) on display, 400 on body. |
| **Color** | Pastel pink (#ffe4ec), mint (#d8f5e8), buttery yellow (#fff4c8), lavender (#e8d8ff). Soft, low-saturation. |
| **Layout** | Card-based. Rounded corners (12-20px). Generous padding. Floating slightly above background. |
| **Motion** | Gentle springs. 200-280ms. Slight overshoot on press. |
| **Ornament** | Soft drop shadows. Rounded illustrations. Emoji-adjacent icons. Subtle gradients within cards. |
| **Signatures** | Pastel cards on neutral backgrounds, rounded corners everywhere, slight elevation, friendly illustrations. |
| **Avoid** | High contrast, sharp edges, dark mode by default, technical density. |
| **References** | notion.so, calm.com, headspace.com (recent), basedash.com. |

---

## Decision framework

When choosing an aesthetic, run through these in order:

### 1. Audience match
- **Developers, technical buyers** → Terminal, Swiss/Grid, Cyber-Noir
- **Designers, creative pros** → Editorial, Brutalist, Neo-Brutalist, Maximalist
- **Consumers, prosumers** → Soft Pastel Card, Glassmorphic, Organic
- **Luxury, fashion** → Editorial, Art Deco, Japandi
- **Music, gaming, youth culture** → Vaporwave, Neo-Brutalist, Cyber-Noir, Maximalist

### 2. Brand age
- **2024+ insurgent** → Brutalist, Neo-Brutalist, Terminal, Cyber-Noir
- **Established refinement** → Editorial, Swiss, Japandi, Art Deco
- **Warm legacy** → Organic, Editorial
- **Aspirational future** → Retro-Futurist, Glassmorphic, Cyber-Noir

### 3. Density target
- **Marketing, low-density** → Editorial, Japandi, Soft Pastel, Organic
- **Product, medium-density** → Glassmorphic, Swiss, Soft Pastel
- **Tools, high-density** → Terminal, Brutalist, Swiss, Cyber-Noir

### 4. Avoidances
The brief may say "not corporate," "not generic SaaS," "not minimalist" — those are aesthetic exclusions. Use them to narrow.

## The commitment test

Once chosen, the test is: **does every visible element on the page reinforce this aesthetic?** If a brutalist site has rounded buttons, the buttons are wrong. If an editorial site has sans-serif display, the display is wrong. If a terminal site has a soft drop shadow, the shadow is wrong.

Polish in this skill = ruthless coherence. One aesthetic, every signature.

## Mixing aesthetics

Two aesthetics can sometimes co-exist if they share a structural logic:

- **Editorial + Japandi** — both are restrained, type-driven, generous-whitespace
- **Brutalist + Terminal** — both are mono, hard-edged, system-oriented
- **Glassmorphic + Cyber-Noir** — both depend on saturated dark backgrounds with luminous overlays
- **Neo-Brutalist + Maximalist** — both lean into pattern and saturated color

Mixing aesthetics that don't share structural logic produces incoherent results. Don't mix Japandi with Vaporwave. Don't mix Editorial with Neo-Brutalist.

## Anti-patterns

- **The Default-Avoider**: picking "modern, clean, minimal" — that's not an aesthetic, that's an excuse. It always lands as Inter + slate + indigo + 12px radius.
- **The Buffet**: borrowing one signature from five aesthetics. Brutalist type + glass cards + pastel accents + retro grids. Reads as confused.
- **The Hedged Brutalist**: brutalism with rounded corners, soft shadows, and pastel accents to "make it nicer." Defeats the point. If you can't commit to brutalism, pick a different aesthetic.
- **The Trend Chase**: picking glassmorphism in 2026 because Apple did it in 2023. Pick aesthetics that *match the brief*, not aesthetics that match the moment.
- **The Stock Reference**: "Make it look like Linear." Linear's aesthetic is specific to Linear's product. Use it as a reference for *what they did well*, not as a template to copy.

## Output for the user

When this skill is engaged, the deliverable shape is:

```
## Aesthetic: [Name]

**Why this fits**: [1-2 sentences linking the aesthetic to the brief]

**Type system**: [display + body fonts + weight strategy]

**Color system**: [base, surface, text, accent — with hex]

**Layout posture**: [grid type, alignment, density]

**Motion language**: [duration, easing, when to animate]

**Ornament strategy**: [what visual non-content earns its place]

**Avoidances**: [the 3-5 things this aesthetic must NOT include]

**References**: [2-3 sites that exemplify this for inspiration]
```

Then hand off to the execution skill (web-prototype, saas-landing, dashboard, etc.) to render the page using these signatures.
