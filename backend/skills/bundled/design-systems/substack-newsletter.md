# Design System Inspired by Substack

## 1. Visual Theme & Atmosphere

Substack is the writer-first publishing platform. Clean white canvas, generous reading typography, and the writer relationship at the center of the experience. The design intentionally removes friction between writer and reader. Orange accent (#ff6719) signals the platform brand on key CTAs and subscriber counts.

**Key Characteristics:**
- Clean white canvas (#ffffff) with off-white (#fafaf9) sections
- Orange accent (#ff6719) on CTAs and brand identity
- Reader-friendly serif body text (Georgia/Lora) at comfortable 18-20px
- Minimal navigation - the content is the design
- Article card grid with author avatar and subscriber count
- Paywall and subscribe flows as primary UI patterns

## 2. Color Palette & Roles

**Surface:** Canvas #ffffff | Off-white #fafaf9 | Card #f3f4f6 | Dark #111827
**Text:** Ink #0f172a | Body #1f2937 | Muted #6b7280 | Light #f9fafb
**Brand:** Orange #ff6719 | Orange Dark #ea5f05
**Border:** #e5e7eb (standard) | #d1d5db (emphasized)

## 3. Typography

**Display/Body:** Georgia, Lora, serif (for article body) | Inter, system-ui (for UI elements)
**Code:** SFMono-Regular, monospace

| Role | Size | Weight | Font |
|------|------|--------|------|
| Publication Name | 40px | 700 | Inter |
| Article Title | 36px | 700 | Georgia |
| Section Head | 26px | 700 | Georgia |
| Lead/Standfirst | 20px | 400 | Georgia |
| Body | 18px | 400 | Georgia, 1.75 line-height |
| UI/Nav | 15px | 500 | Inter |
| Caption | 14px | 400 | Inter |
| Metadata | 13px | 400 | Inter muted |

## 4. Component Stylings

**Subscribe Button:** #ff6719 bg, #ffffff text, 8px radius, 12px 24px padding, Inter 15px/600
Hover: #ea5f05

**Post/Article Card:**
- White bg, 1px #e5e7eb border, 8px radius, 20px padding
- Author avatar (36px circle) + author name (14px/600) + date
- Title: Georgia 22px/700 #0f172a | Preview: 15px/400 #4b5563
- Tags: gray pills | Read time: 13px muted

**Publication Header:**
- Centered layout | Publication logo/image | Title 40px/700 | Tagline 18px muted
- Subscriber count: "X subscribers" prominent | Subscribe CTA orange button

**Navigation:**
- Minimal | Publication name left | Archive/About right | Subscribe CTA right
- Height: 56px | White bg | 1px #e5e7eb bottom

**Paywall Widget:**
- Mid-article gradient fade | "Subscribe to read" heading
- Subscriber count social proof | #ff6719 subscribe button

## 5. Layout
Max-width: 680px for article content (reader-optimal) | 1100px for publication home
Section padding: 60px | Post cards: 3-up desktop grid

## 6. Key Rules
DO: Georgia serif for all article content | Orange for subscribe CTAs | Writer-first, minimal chrome
DO NOT: Dense UIs | Dark backgrounds | Multiple accent colors | Small type for articles

## 7. Quick Reference
Canvas: #ffffff | Ink: #0f172a | Body: #1f2937 | Muted: #6b7280 | Border: #e5e7eb
Orange: #ff6719 | Display: Georgia, serif | UI: Inter
