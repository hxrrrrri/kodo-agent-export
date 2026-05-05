# Design System Inspired by Netflix

## 1. Visual Theme & Atmosphere

Netflix is cinema-first content discovery. Pure black (#141414) canvas creates the theater experience - every surface disappears so content thumbnail art can dominate. Netflix Red (#e50914) appears only on the primary CTA and brand mark. Horizontal scrolling content rows, gradient-overlay heroes, and hover-expand thumbnails are the signature interactions.

**Key Characteristics:**
- Pure black (#141414) canvas - theatrical darkness
- Netflix Red (#e50914) for brand mark and primary CTA only
- Horizontal scrolling content rows as primary navigation pattern
- Full-bleed hero with gradient overlay and title treatment
- Hover-expand thumbnails with metadata overlay
- Light gray (#e5e5e5) text on dark - not pure white

## 2. Color Palette & Roles

**Surface:** Canvas #141414 | Surface #1f1f1f | Row Hover #2f2f2f | Nav rgba(0,0,0,0.8)
**Brand:** Red #e50914 | Red Hover #b81d24
**Text:** Primary #e5e5e5 | Muted #808080 | On-Red #ffffff
**Rating:** Gold #f5c518 (IMDb-style) | Maturity: #888 badge

## 3. Typography

**All:** Netflix Sans (custom) fallback: Inter, Helvetica, Arial, sans-serif

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Hero Title | 72px | 700 | Featured content title |
| Section Head | 22px | 700 | Row title (My List, Trending) |
| Card Title | 14px | 700 | On hover overlay |
| Body | 14px | 400 | Synopsis, metadata |
| Metadata | 13px | 400 | Year, duration, maturity |
| Nav | 15px | 400 | Navigation items |

## 4. Component Stylings

**Primary Button (Play):**
- #e5e5e5 bg, #000000 text, 4px radius, 12px 28px, 16px/700
- Play icon left | Hover: rgba(229,229,229,0.7)

**More Info Button:**
- rgba(109,109,110,0.7) bg, #ffffff text | Same geometry
- Info icon left

**Content Row:**
- Section title: 22px/700 #e5e5e5 | Browse button: 14px link right
- Horizontal scroll | Thumbnails: 16:9 aspect | 4px gap
- Row: extends full width with fade at edges

**Thumbnail Card:**
- 16:9 image | 4px radius | Hover: scale 1.25, z-index raised
- Hover overlay: gradient fade to black bottom
- Metadata on hover: title 14px/700, year + maturity + duration, action icons

**Hero Banner:**
- Full-width, 56vh height | Background image or video
- Gradient: linear bottom-to-top black overlay
- Title: Netflix Sans 72px/700 white | Synopsis: 16px/400 | CTA buttons bottom-left

**Navigation:**
- rgba(0,0,0,0.0) transparent default, rgba(0,0,0,0.9) on scroll
- Netflix logo left | Nav items: 15px #e5e5e5 | Avatar + account right
- Height: 68px

## 5. Layout
Full-width layout | Padding: 60px horizontal desktop, 24px mobile
Row heights: thumbnails 150-180px | Hero: 56vh | Navigation: 68px

## 6. Key Rules
DO: Black canvas always | Red only on brand/primary CTA | Horizontal scroll rows | Thumbnail-first hierarchy
DO NOT: Light backgrounds | Decorative gradients beyond content treatment | Text-heavy layouts

## 7. Quick Reference
Canvas: #141414 | Surface: #1f1f1f | Red: #e50914 | Primary text: #e5e5e5 | Muted: #808080
