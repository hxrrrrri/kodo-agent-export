# Design System: Fintech Dark (Abstract Theme)

## 1. Visual Theme & Atmosphere

Fintech Dark is an abstract design theme for premium financial interfaces. Deep navy canvas (#0b1426) with teal data signals (#00d4aa) creates institutional authority without cold sterility. This is the design language of portfolio dashboards, crypto trading platforms, and wealth management apps that need to communicate security, precision, and trustworthiness.

**Key Characteristics:**
- Deep navy canvas (#0b1426) - premium institutional dark
- Teal data signals (#00d4aa) for positive financial metrics
- Red (#f43f5e) exclusively for losses and danger states
- Monospace numerics throughout - financial data demands tabular alignment
- Dense data layouts: portfolio cards, asset tables, sparklines
- Inter font with tabular-nums feature for all financial values

## 2. Color Palette & Roles

**Surface:** Canvas #0b1426 | Panel #112240 | Card #1a2f50 | Elevated #243a62 | Border #2a3f6e
**Accent Teal:** Signal #00d4aa | Teal Muted rgba(0,212,170,0.15)
**Danger Red:** Loss #f43f5e | Loss Muted rgba(244,63,94,0.1)
**Text:** Primary #e8edf5 | Secondary #94a3c4 | Muted #5a6d8a
**Chart Colors:** Teal #00d4aa | Blue #3b82f6 | Purple #a78bfa | Orange #fb923c | Yellow #fbbf24

## 3. Typography

**All:** Inter, -apple-system, sans-serif (with font-variant-numeric: tabular-nums for all numbers)
**Code/Mono:** JetBrains Mono, SFMono-Regular (for ticker symbols, trade IDs)

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Display | 48px | 700 | Portfolio value hero |
| H1 | 28px | 700 | Section titles |
| H2 | 20px | 600 | Card titles |
| Data Large | 32px | 700 | Portfolio totals, key metrics |
| Data | 18px | 600 | Asset values |
| Body | 14px | 400 | Descriptions |
| Caption | 12px | 400 | Metadata, timestamps |
| Ticker | 13px | 500 | Monospace ticker symbols |

## 4. Component Stylings

**Primary Button:**
- Background: #00d4aa | Text: #0b1426 | Border-radius: 8px | Padding: 10px 22px | Font: 14px/600
- Hover: #00bfa0

**Secondary Button:**
- Background: #1a2f50 | Border: 1px #2a3f6e | Text: #e8edf5

**Portfolio Card:**
- Background: #1a2f50 | Border: 1px #2a3f6e | Border-radius: 12px | Padding: 20px
- Portfolio value: Inter 32px/700 #e8edf5 with tabular-nums
- Change: teal (#00d4aa) for positive with up arrow, red (#f43f5e) for negative with down arrow
- Sparkline: 60px tall, teal line, faded fill

**Asset Table Row:**
- Asset icon (32px) + ticker (13px monospace) + full name (14px muted)
- Price: 15px/600 tabular-nums | Change %: colored (teal/red)
- Allocation bar: thin 4px bar, teal fill, rgba bg
- Hover: #243a62 bg

**Navigation:**
- Background: #0b1426 | Border-right: 1px #2a3f6e (sidebar)
- Logo + brand | Menu items with icons | Active: teal left border, teal icon

**Chart Containers:**
- Background: #112240 | Border: 1px #2a3f6e | Border-radius: 12px
- Chart takes 70% of container | Header with timeframe selector tabs
- Teal primary line, faded area fill

## 5. Layout
Spacing base 8px: xs:4 sm:8 md:16 lg:20 xl:24 2xl:32 3xl:48
Sidebar: 220px fixed | Main: fluid with 24px padding
Grid: 4-col KPI cards top, 2-col charts middle, full-width table bottom

## 6. Elevation
Base #0b1426 > Panel #112240 > Card #1a2f50 > Elevated #243a62
Focus: 2px rgba(0,212,170,0.4) | Critical: 0 0 16px rgba(244,63,94,0.2)

## 7. Key Rules
DO: Teal for positive financial data | Red only for losses | Tabular-nums on all numbers
DO NOT: Use teal/red for decorative purposes | warm colors anywhere | large border-radius

## 8. Responsive
Mobile: sidebar collapses to bottom tab bar | Cards stack | Tables become horizontal-scroll

## 9. Quick Reference
Canvas: #0b1426 | Panel: #112240 | Card: #1a2f50 | Border: #2a3f6e
Signal teal: #00d4aa | Loss red: #f43f5e | Primary: #e8edf5 | Muted: #5a6d8a
