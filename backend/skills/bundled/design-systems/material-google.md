# Design System Inspired by Google Material Design 3

## 1. Visual Theme & Atmosphere

Material Design 3 is Google's system for expressive, adaptive, accessible UI. Light gray (#f8fafd) default surface with vibrant blue (#1a73e8) primary and a dynamic color token system derived from the user's wallpaper/preferences. Elevation uses tonal surface overlays instead of drop shadows. FABs, navigation rails, and bottom navigation are the signature components.

**Key Characteristics:**
- Light gray (#f8fafd) background, white (#ffffff) surfaces
- Vibrant blue (#1a73e8) as Material You primary (adaptable)
- Tonal elevation: surfaces tinted with primary color at increasing opacity
- Clear elevation hierarchy via color-based surfaces, not shadows
- FABs, navigation rails, chips as signature components
- Roboto / Google Sans for all text - system-first

## 2. Color Palette & Roles

**Primary:** #1a73e8 | On-Primary #ffffff | Primary Container #d3e3fd | On-Primary Container #001d35
**Secondary:** #4a90d9 | Secondary Container #dde3ea
**Surface:** Background #f8fafd | Surface #ffffff | Surface Variant #dde3ea | On-Surface #1f1f1f
**Error:** #b3261e | Error Container #f9dedc
**Outline:** #73777f (standard) | Outline Variant #c4c7c5

## 3. Typography

**All:** Google Sans, Roboto, -apple-system, sans-serif
**Code:** Roboto Mono, monospace

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Display Large | 57px | 400 | Brand/hero |
| Display Medium | 45px | 400 | Section hero |
| Headline Large | 32px | 400 | Page titles |
| Headline Medium | 28px | 400 | Card titles |
| Title Large | 22px | 500 | Section titles |
| Body Large | 16px | 400 | Primary body |
| Body Medium | 14px | 400 | Secondary body |
| Label Large | 14px | 500 | Buttons |
| Label Small | 11px | 500 | Chips, tabs |

## 4. Component Stylings

**FAB (Floating Action Button):**
- Primary container color bg | 16px radius | 56px x 56px | Icon 24px
- Extended FAB: +text label, min-width 80px, 56px height

**Button:**
- Filled: #1a73e8 bg, #ffffff text, 999px radius, 12px 24px, 14px/500
- Tonal: #d3e3fd bg, #001d35 text
- Outlined: transparent, 1px #73777f border
- Text: transparent, no border

**Cards:**
- Elevated: white bg + box-shadow 0 1px 2px rgba(0,0,0,0.12), 12px radius
- Filled: #dde3ea bg, no shadow, 12px radius
- Outlined: white bg, 1px #c4c7c5 border, 12px radius

**Navigation Rail:**
- 72-80px wide fixed left sidebar | Icon + label for each destination
- Active: primary color indicator pill + tonal bg

**Chips:**
- 8px radius | 32px height | 12px 16px padding | 14px/500
- Outlined: 1px #73777f | Filled: tonal container color

## 5. Layout
Spacing: 4dp base grid | Padding: 16dp standard, 24dp comfortable
Max-width: 1440px | Navigation rail: 72-80px | Content: fluid

## 6. Key Rules
DO: Tonal elevation (surface overlays, not shadows) | FABs for primary actions | Dynamic color system
DO NOT: Heavy drop shadows (use tonal surfaces) | Multiple primary colors | Square corners

## 7. Quick Reference
Background: #f8fafd | Surface: #ffffff | Primary: #1a73e8 | Container: #d3e3fd
Ink: #1f1f1f | Body: #44474f | Outline: #73777f
